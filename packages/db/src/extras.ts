import { asc, eq, inArray } from 'drizzle-orm';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { DomainError, type ExtraLine } from './inventory';
import type { Actor } from './manage';
import { auditEvent, bookingExtra, extraService, holdExtra } from './schema';

// Extra services sold with the spot (spec §4.2): towels, safes, lessons… Management
// uses the same permission as the other commercial codes (promotions.manage, like the
// hotel conventions): who shapes the commercial offer also shapes the extras. The
// unit prices are public only inside the booking flow of the beach club; a used
// service is retired instead of deleted, so the snapshots keep adding up. Every
// write lands in the audit trail.

export interface ExtraServiceInput {
  /** Italian name, required; the English one is optional and falls back to it. */
  nameIt: string;
  nameEn: string | null;
  unitPriceCents: number;
  /** Display order chosen by the manager. */
  position: number;
}

export interface ExtraServiceView extends ExtraServiceInput {
  serviceId: string;
  active: boolean;
}

const viewColumns = {
  serviceId: extraService.id,
  nameIt: extraService.nameIt,
  nameEn: extraService.nameEn,
  unitPriceCents: extraService.unitPriceCents,
  active: extraService.active,
  position: extraService.position,
};

const byDisplayOrder = [asc(extraService.position), asc(extraService.nameIt), asc(extraService.id)];

function assertInput(input: ExtraServiceInput): void {
  if (input.nameIt.trim().length === 0) throw new DomainError('invalid_state', 'The Italian name is required');
  if (input.unitPriceCents < 0 || !Number.isInteger(input.unitPriceCents)) throw new DomainError('invalid_state', 'The unit price must be a non-negative amount of cents');
}

/** Every extra service of the beach club, retired ones included, for the management page. */
export function listExtraServices(db: Database, actor: Actor): Promise<ExtraServiceView[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) => tx.select(viewColumns).from(extraService).orderBy(...byDisplayOrder));
}

export interface PublicExtraService {
  serviceId: string;
  /** `en` is null when the manager gave none: callers fall back to the Italian name. */
  name: { it: string; en: string | null };
  unitPriceCents: number;
}

/** Active extras for the public booking flow of one beach club. Nothing else is ever public. */
export function listActiveExtras(db: Database, beachId: string): Promise<PublicExtraService[]> {
  return withBeach(db, beachId, async (tx) => {
    const rows = await tx.select(viewColumns).from(extraService).where(eq(extraService.active, true)).orderBy(...byDisplayOrder);
    return rows.map((row) => ({ serviceId: row.serviceId, name: { it: row.nameIt, en: row.nameEn }, unitPriceCents: row.unitPriceCents }));
  });
}

export function createExtraService(db: Database, actor: Actor, input: ExtraServiceInput): Promise<ExtraServiceView> {
  assertInput(input);
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [created] = await tx
      .insert(extraService)
      .values({ ...input, beachId: actor.beachId })
      .returning(viewColumns);
    if (!created) throw new Error('extra service was not created');
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'extra.create', target: created.serviceId, detail: { ...input } });
    return created;
  });
}

/** Full replacement of the writable fields; `active` has its own route. Snapshots keep the prices they froze. */
export function updateExtraService(db: Database, actor: Actor, serviceId: string, input: ExtraServiceInput): Promise<ExtraServiceView> {
  assertInput(input);
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [updated] = await tx.update(extraService).set({ ...input }).where(eq(extraService.id, serviceId)).returning(viewColumns);
    if (!updated) throw new DomainError('not_found', 'Extra service not found');
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'extra.update', target: serviceId, detail: { ...input } });
    return updated;
  });
}

/** Retires a service from sale, or puts it back. A retired service is refused in quotes and holds. */
export function setExtraServiceStatus(db: Database, actor: Actor, serviceId: string, active: boolean): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [updated] = await tx.update(extraService).set({ active }).where(eq(extraService.id, serviceId)).returning({ serviceId: extraService.id });
    if (!updated) throw new DomainError('not_found', 'Extra service not found');
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'extra.status', target: serviceId, detail: { active } });
  });
}

function errorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

/**
 * Deletes a service that was never sold or reserved. One that any snapshot names
 * stays, retired if need be: the foreign keys would restrict the delete anyway.
 */
export function deleteExtraService(db: Database, actor: Actor, serviceId: string): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [found] = await tx.select({ serviceId: extraService.id }).from(extraService).where(eq(extraService.id, serviceId));
    if (!found) throw new DomainError('not_found', 'Extra service not found');
    const [used] = await tx.select({ id: holdExtra.id }).from(holdExtra).where(eq(holdExtra.serviceId, serviceId)).limit(1);
    if (used) throw new DomainError('invalid_state', 'This extra service has been used: retire it instead of deleting it');
    try {
      await tx.delete(extraService).where(eq(extraService.id, serviceId));
    } catch (error) {
      if (errorCode(error) === '23503') throw new DomainError('invalid_state', 'This extra service has been used: retire it instead of deleting it');
      throw error;
    }
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'extra.delete', target: serviceId, detail: {} });
  });
}

/** The snapshot of a booking as quote lines: frozen prices, live names, display order. */
export async function bookingExtraLines(tx: Transaction, bookingId: string): Promise<ExtraLine[]> {
  const grouped = await bookingExtraLinesByBooking(tx, [bookingId]);
  return grouped.get(bookingId) ?? [];
}

/** Like `bookingExtraLines`, for many bookings in one query (the day list of the front desk). */
export async function bookingExtraLinesByBooking(tx: Transaction, bookingIds: string[]): Promise<Map<string, ExtraLine[]>> {
  const grouped = new Map<string, ExtraLine[]>();
  if (bookingIds.length === 0) return grouped;
  const rows = await tx
    .select({
      bookingId: bookingExtra.bookingId,
      serviceId: bookingExtra.serviceId,
      nameIt: extraService.nameIt,
      nameEn: extraService.nameEn,
      quantity: bookingExtra.quantity,
      unitPriceCents: bookingExtra.unitPriceCents,
    })
    .from(bookingExtra)
    .innerJoin(extraService, eq(extraService.id, bookingExtra.serviceId))
    .where(inArray(bookingExtra.bookingId, bookingIds))
    .orderBy(...byDisplayOrder);
  for (const row of rows) {
    const line: ExtraLine = {
      serviceId: row.serviceId,
      name: { it: row.nameIt, en: row.nameEn },
      quantity: row.quantity,
      unitPriceCents: row.unitPriceCents,
      subtotalCents: row.unitPriceCents * row.quantity,
    };
    const lines = grouped.get(row.bookingId);
    if (lines) lines.push(line);
    else grouped.set(row.bookingId, [line]);
  }
  return grouped;
}
