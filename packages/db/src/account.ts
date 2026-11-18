import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { withUser, type Database } from './client';
import { hashToken } from './auth';
import { extraLinesByGroup } from './extras';
import { DomainError, type ExtraRequest } from './inventory';
import { enqueue } from './jobs';
import { addExtrasToBooking, groupTotalsByGroup, paidCentsByGroup, passCredential, paymentStateOf, type PaymentState } from './bookings';
import type { Actor } from './manage';
import { createPaymentRequest, type CreatedPaymentRequest, type PayRequestMessageData } from './payment-requests';
import { beach, booking, bookingGroup, inventoryDay, pass, spot } from './schema';

// The guest's account (D44, D47, D48): registration with a generated password,
// the forced first change, external identities and the history across beach clubs.

/** No ambiguous characters: the password travels in an email and may be typed by hand. */
const passwordAlphabet = 'abcdefghijkmnpqrstuvwxyzACDEFHJKLMNPQRSTUVWXYZ2345679';

function generatedPassword(length = 16): string {
  const bytes = randomBytes(length);
  let password = '';
  for (let index = 0; index < length; index += 1) password += passwordAlphabet[bytes[index]! % passwordAlphabet.length];
  return password;
}

export type RegisterOutcome = 'created' | 'exists';

/**
 * Public registration (D44). The password is generated here and handed only to
 * the mail queue, in the same transaction: it never reaches an API response.
 * Both outcomes queue their mail, so the caller can answer identically (no
 * account enumeration); the password rides only the `account.created` payload.
 */
export async function registerAccount(db: Database, input: { email: string; name: string; locale: 'it' | 'en' }): Promise<RegisterOutcome> {
  const password = generatedPassword();
  return db.transaction(async (tx) => {
    const result = await tx.execute<{ outcome: RegisterOutcome }>(
      sql`select account_register(${input.email}, ${input.name}, ${password}) as outcome`,
    );
    const outcome = result.rows[0]!.outcome;
    const payload = { email: input.email.toLowerCase(), name: input.name, locale: input.locale };
    if (outcome === 'created') await enqueue(tx, null, 'account.created', { ...payload, password });
    else await enqueue(tx, null, 'account.exists', payload);
    return outcome;
  });
}

/** Minimum length of a chosen password (D44); the generated one is longer anyway. */
export const passwordMinLength = 12;

export async function changePassword(db: Database, userId: string, oldPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < passwordMinLength) throw new RangeError(`the new password must be at least ${passwordMinLength} characters long`);
  const result = await db.execute<{ outcome: string }>(
    sql`select account_change_password(${userId}::uuid, ${oldPassword}, ${newPassword}) as outcome`,
  );
  if (result.rows[0]?.outcome !== 'ok') throw new DomainError('invalid_credentials', 'The current password is not valid');
}

export interface IdentityLoginResult {
  /** Shown once to the client. Only its hash is stored. */
  token: string;
  expiresAt: Date;
  user: {
    userId: string;
    email: string;
    name: string;
    platformRole: 'none' | 'admin';
    twoFactor: boolean;
    mustChangePassword: boolean;
  };
}

/**
 * Sign-in with a verified external identity (D48). The caller has already
 * verified the provider's answer: here the identity finds, links or creates
 * the account and opens a session.
 */
export async function identityLogin(
  db: Database,
  identity: { provider: string; subject: string; email: string; name: string },
  ttlSeconds: number,
): Promise<IdentityLoginResult> {
  const token = randomBytes(32).toString('base64url');
  const result = await db.execute<{
    o_outcome: string;
    o_user_id: string | null;
    o_email: string | null;
    o_name: string | null;
    o_platform_role: 'none' | 'admin' | null;
    o_totp_enabled: boolean | null;
    o_must_change_password: boolean | null;
    o_expires_at: Date | string | null;
  }>(
    sql`select * from account_identity_login(${identity.provider}, ${identity.subject}, ${identity.email}, ${identity.name}, ${hashToken(token)}, ${ttlSeconds})`,
  );
  const row = result.rows[0];
  if (row?.o_outcome !== 'ok' || !row.o_user_id || !row.o_expires_at) {
    throw new DomainError('invalid_credentials', 'This account cannot sign in');
  }
  return {
    token,
    expiresAt: new Date(row.o_expires_at),
    user: {
      userId: row.o_user_id,
      email: row.o_email!,
      name: row.o_name!,
      platformRole: row.o_platform_role!,
      twoFactor: row.o_totp_enabled!,
      mustChangePassword: row.o_must_change_password!,
    },
  };
}

/** Hands orphan groups with this guest email to the account (D47). Returns how many joined. */
export async function relinkBookings(db: Database, userId: string, email: string): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`select account_relink(${userId}::uuid, ${email}) as count`);
  return result.rows[0]?.count ?? 0;
}

export interface MyBookingGroup {
  /** Identifier of the group, for the owner's own actions («Aggiungi servizi», D46). */
  groupId: string;
  code: string;
  beachSlug: string;
  beachName: string;
  spotCode: string;
  from: string;
  to: string;
  days: number;
  guestName: string;
  /** confirmed = confermata, cancelled = annullata, completed = conclusa (last day before today in the beach club's zone). */
  status: 'confirmed' | 'cancelled' | 'completed';
  totalCents: number;
  paidCents: number;
  paymentState: PaymentState;
  extras: { name: { it: string; en: string | null }; quantity: number }[];
  /** Only while a day is today or later and the pass is not revoked. */
  passCredential: string | null;
}

export interface MyBookings {
  /** Upcoming groups whose first day is still to come. */
  nextArrivals: number;
  /** Sum of the succeeded payments of the owned groups, across beach clubs. */
  totalSpentCents: number;
  upcoming: MyBookingGroup[];
  past: MyBookingGroup[];
}

/**
 * «Le mie prenotazioni» (D47): the owned groups across beach clubs, read with
 * the owner RLS path and then, beach by beach, inside that beach's context for
 * days, spots and extras — the same pattern as listMyContracts.
 */
export async function listMyBookings(db: Database, userId: string, secret: string): Promise<MyBookings> {
  return withUser(db, userId, async (tx) => {
    const owned = await tx
      .select({ groupId: bookingGroup.id, beachId: bookingGroup.beachId, code: bookingGroup.code })
      .from(bookingGroup)
      .where(eq(bookingGroup.userId, userId));
    const byBeach = new Map<string, { groupId: string; code: string }[]>();
    for (const group of owned) {
      const list = byBeach.get(group.beachId) ?? [];
      list.push({ groupId: group.groupId, code: group.code });
      byBeach.set(group.beachId, list);
    }

    const upcoming: (MyBookingGroup & { sortKey: string })[] = [];
    const past: (MyBookingGroup & { sortKey: string })[] = [];
    let totalSpentCents = 0;
    let nextArrivals = 0;

    for (const [beachId, groups] of byBeach) {
      await tx.execute(sql`select set_config('app.beach_id', ${beachId}, true)`);
      const [club] = await tx.select({ slug: beach.slug, name: beach.name, timezone: beach.timezone }).from(beach).where(eq(beach.id, beachId));
      if (!club) continue;
      const todayRow = await tx.execute<{ today: string }>(sql`select (now() at time zone ${club.timezone})::date::text as today`);
      const today = todayRow.rows[0]!.today;

      const groupIds = groups.map((group) => group.groupId);
      const totals = await groupTotalsByGroup(tx, groupIds);
      const paidOf = await paidCentsByGroup(tx, groupIds);
      const lines = await extraLinesByGroup(tx, groupIds);
      const passes = await tx.select({ groupId: pass.groupId, passId: pass.id, revoked: pass.revoked }).from(pass).where(inArray(pass.groupId, groupIds));
      const passOf = new Map(passes.map((row) => [row.groupId, row]));
      const dayRows = await tx
        .select({ groupId: booking.groupId, status: booking.status, guestName: booking.guestName, day: inventoryDay.day, spotCode: spot.code })
        .from(booking)
        .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
        .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
        .where(inArray(booking.groupId, groupIds))
        .orderBy(asc(inventoryDay.day));
      const daysOf = new Map<string, typeof dayRows>();
      for (const row of dayRows) {
        const list = daysOf.get(row.groupId) ?? [];
        list.push(row);
        daysOf.set(row.groupId, list);
      }

      for (const group of groups) {
        const members = daysOf.get(group.groupId) ?? [];
        if (members.length === 0) continue;
        const live = members.filter((member) => member.status !== 'cancelled');
        const lastLiveDay = live.at(-1)?.day ?? null;
        const status: MyBookingGroup['status'] = live.length === 0 ? 'cancelled' : lastLiveDay! < today ? 'completed' : 'confirmed';
        const total = totals.get(group.groupId);
        const totalCents = total?.totalCents ?? 0;
        const paidCents = paidOf.get(group.groupId) ?? 0;
        totalSpentCents += paidCents;
        const issued = passOf.get(group.groupId);
        const first = live[0] ?? members[0]!;
        const view: MyBookingGroup & { sortKey: string } = {
          groupId: group.groupId,
          code: group.code,
          beachSlug: club.slug,
          beachName: club.name,
          spotCode: first.spotCode,
          from: total?.from ?? first.day,
          to: total?.to ?? first.day,
          days: total?.days ?? members.length,
          guestName: first.guestName,
          status,
          totalCents,
          paidCents,
          paymentState: paymentStateOf(totalCents, paidCents),
          extras: (lines.get(group.groupId) ?? []).map((line) => ({ name: line.name, quantity: line.quantity })),
          passCredential: issued && !issued.revoked && lastLiveDay !== null && lastLiveDay >= today ? passCredential(secret, issued.passId) : null,
          sortKey: total?.from ?? first.day,
        };
        if (status === 'confirmed') {
          upcoming.push(view);
          if ((live[0]?.day ?? '') >= today) nextArrivals += 1;
        } else {
          past.push(view);
        }
      }
    }

    upcoming.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    past.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const strip = (entry: MyBookingGroup & { sortKey: string }): MyBookingGroup => {
      const { sortKey, ...view } = entry;
      void sortKey;
      return view;
    };
    return { nextArrivals, totalSpentCents, upcoming: upcoming.map(strip), past: past.map(strip) };
  });
}

export interface OwnerExtrasResult {
  addedCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  /** Payable at /paga/{token} with the sandbox provider, whoever pays. Null when nothing is owed. */
  paymentRequest: CreatedPaymentRequest | null;
}

/**
 * «Aggiungi servizi» from the guest's own history (spec §5): the signed-in
 * owner adds extras to an own confirmed, not-yet-matured booking group. The
 * snapshot grows through the desk's addExtrasToBooking inside the right beach
 * context, authorised by group.user_id alone; the residual becomes a payment
 * request so the balance is payable at /paga/{token}.
 */
export async function addExtrasAsOwner(
  db: Database,
  userId: string,
  input: { groupId: string; extras: ExtraRequest[] },
  secret: string,
  compose: (data: PayRequestMessageData) => string,
): Promise<OwnerExtrasResult> {
  // Ownership through the owner RLS path (D47): someone else's group is simply absent.
  const owned = await withUser(db, userId, async (tx) => {
    const [row] = await tx
      .select({ beachId: bookingGroup.beachId, code: bookingGroup.code })
      .from(bookingGroup)
      .where(and(eq(bookingGroup.id, input.groupId), eq(bookingGroup.userId, userId)));
    return row ?? null;
  });
  if (!owned) throw new DomainError('not_found', 'Booking not found');
  // The role is never read by these two functions: the owner is authorised by
  // group.user_id alone, and the audit trail records the user, not the role.
  const actor: Actor = { beachId: owned.beachId, userId, role: 'reception' };
  const added = await addExtrasToBooking(db, actor, { code: owned.code, extras: input.extras, collect: 'later' });
  const paymentRequest = added.remainingCents > 0 ? await createPaymentRequest(db, actor, { code: owned.code, amountCents: added.remainingCents }, secret, compose) : null;
  return {
    addedCents: added.addedCents,
    totalCents: added.totalCents,
    paidCents: added.paidCents,
    remainingCents: added.remainingCents,
    paymentState: added.paymentState,
    paymentRequest,
  };
}
