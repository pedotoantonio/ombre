import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Transaction } from './client';
import { booking, bookingGroup, hold, payment } from './schema';

// ---- The payment aggregate (D31 at group level, D38, D46, D52) ----
// The residual is defined once: total of the group's days that are not cancelled
// minus the payments of the group that really succeeded. The shown payment state
// is derived from it, never stored. Shared here so that the mail worker (jobs.ts)
// and the booking paths read the same numbers without an import cycle.

export type PaymentState = 'paid' | 'partial' | 'to_collect';

export function paymentStateOf(totalCents: number, paidCents: number): PaymentState {
  if (paidCents >= totalCents) return 'paid';
  return paidCents > 0 ? 'partial' : 'to_collect';
}

/**
 * Splits an amount really paid across parts, proportionally to their totals:
 * whole floors first, then the leftover cents to the largest remainders (ties by
 * key). When the amount covers everything, each part gets exactly its total —
 * which keeps every pre-deposit number unchanged. With the deposit (D52) the
 * order payment is the sum of per-item deposits, and this hands each group its
 * own share back.
 */
export function apportionPaid(paidCents: number, parts: { key: string; totalCents: number }[]): Map<string, number> {
  const quotas = new Map<string, number>();
  const total = parts.reduce((sum, part) => sum + part.totalCents, 0);
  if (paidCents >= total) {
    for (const part of parts) quotas.set(part.key, part.totalCents);
    return quotas;
  }
  if (paidCents <= 0 || total === 0) {
    for (const part of parts) quotas.set(part.key, 0);
    return quotas;
  }
  let assigned = 0;
  const remainders: { key: string; remainder: number }[] = [];
  for (const part of parts) {
    const exact = (part.totalCents * paidCents) / total;
    const floor = Math.floor(exact);
    quotas.set(part.key, floor);
    assigned += floor;
    remainders.push({ key: part.key, remainder: exact - floor });
  }
  remainders.sort((left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key));
  for (let index = 0; index < paidCents - assigned; index += 1) {
    const target = remainders[index % remainders.length]!;
    quotas.set(target.key, quotas.get(target.key)! + 1);
  }
  return quotas;
}

/** The totals frozen in each group's holds: exactly what the order priced per item (D46). */
async function orderHoldTotals(tx: Transaction, orderIds: string[]): Promise<Map<string, { orderId: string; totalCents: number }>> {
  if (orderIds.length === 0) return new Map();
  const rows = await tx
    .select({ groupId: booking.groupId, orderId: bookingGroup.orderId, totalCents: sql<number>`coalesce(sum(${hold.totalCents}), 0)::int` })
    .from(booking)
    .innerJoin(hold, eq(hold.id, booking.holdId))
    .innerJoin(bookingGroup, eq(bookingGroup.id, booking.groupId))
    .where(inArray(bookingGroup.orderId, orderIds))
    .groupBy(booking.groupId, bookingGroup.orderId);
  return new Map(rows.map((row) => [row.groupId, { orderId: row.orderId!, totalCents: row.totalCents }]));
}

/**
 * The slice of a succeeded ORDER payment that belongs to each group (D46): the
 * payment amount apportioned over the totals frozen in the groups' holds. A full
 * payment hands each group exactly its hold total, as before the deposit (D52);
 * a deposit payment hands each group its own share of what was PAID, never of
 * the total. Extras added later never enter the quota, so they stay in the
 * residual. Empty for groups born outside an order.
 */
export async function orderQuotaByGroup(tx: Transaction, groupIds: string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const owners = await tx
    .select({ orderId: bookingGroup.orderId })
    .from(bookingGroup)
    .where(and(inArray(bookingGroup.id, groupIds), isNotNull(bookingGroup.orderId)))
    .groupBy(bookingGroup.orderId);
  const orderIds = owners.map((row) => row.orderId!);
  if (orderIds.length === 0) return new Map();
  const paidRows = await tx
    .select({ orderId: payment.orderId, paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(inArray(payment.orderId, orderIds), eq(payment.status, 'succeeded')))
    .groupBy(payment.orderId);
  const paidOf = new Map(paidRows.map((row) => [row.orderId!, row.paid]));
  const holdTotals = await orderHoldTotals(tx, orderIds);

  const partsOf = new Map<string, { key: string; totalCents: number }[]>();
  for (const [groupId, entry] of holdTotals) {
    const list = partsOf.get(entry.orderId) ?? [];
    list.push({ key: groupId, totalCents: entry.totalCents });
    partsOf.set(entry.orderId, list);
  }
  const quotas = new Map<string, number>();
  const asked = new Set(groupIds);
  for (const [orderId, parts] of partsOf) {
    const paid = paidOf.get(orderId) ?? 0;
    if (paid === 0) continue;
    // Deterministic order, so the leftover cents always land on the same groups.
    parts.sort((left, right) => left.key.localeCompare(right.key));
    for (const [groupId, quota] of apportionPaid(paid, parts)) {
      if (asked.has(groupId) && quota > 0) quotas.set(groupId, quota);
    }
  }
  return quotas;
}

/** Sum of the succeeded payments of one booking group, order quota included (D46), inside the current transaction. */
export async function paidCentsOfGroup(tx: Transaction, groupId: string): Promise<number> {
  const [row] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(eq(payment.groupId, groupId), eq(payment.status, 'succeeded')));
  const quota = (await orderQuotaByGroup(tx, [groupId])).get(groupId) ?? 0;
  return (row?.paid ?? 0) + quota;
}

/** Succeeded cents per group, for day lists: one query, a map back. */
export async function paidCentsByGroup(tx: Transaction, groupIds: string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await tx
    .select({ groupId: payment.groupId, paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(inArray(payment.groupId, groupIds), eq(payment.status, 'succeeded')))
    .groupBy(payment.groupId);
  const paid = new Map(rows.map((row) => [row.groupId!, row.paid]));
  for (const [groupId, quota] of await orderQuotaByGroup(tx, groupIds)) {
    paid.set(groupId, (paid.get(groupId) ?? 0) + quota);
  }
  return paid;
}
