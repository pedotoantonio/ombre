import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { cabinCodeMaxLength, cabinNotesMaxLength, holderContactMaxLength, holderNameMaxLength, occupantNameMaxLength } from '@ombre/shared';
import { withActor, withUser, type Database, type Transaction } from './client';
import { DomainError, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, cabin, cabinAssignment, cabinSublet, layoutElement } from './schema';

// Sea cabins: the register, the assignments to holders and the sublets they propose.
// No money in the system: periods, people and approvals, like the season contracts.

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

function audit(tx: Transaction, actor: { beachId: string; userId: string }, action: string, target: string | null, detail: Record<string, unknown>): Promise<unknown> {
  return tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action, target, detail });
}

/** Today in the beach club's own time zone. */
async function localToday(tx: Transaction, beachId: string): Promise<string> {
  const [clock] = await tx.select({ today: sql<string>`(now() at time zone ${beach.timezone})::date::text` }).from(beach).where(eq(beach.id, beachId));
  if (!clock) throw new DomainError('not_found', 'Beach club not found');
  return clock.today;
}

export interface CabinPosition {
  zone: SpotZone;
  rowNumber: number;
  colStart: number;
  colEnd: number;
}

export interface AssignmentView {
  assignmentId: string;
  holderName: string | null;
  holderContact: string | null;
  /** True when the holder signs in with an account; their identity then lives there. */
  hasAccount: boolean;
  validFrom: string;
  validTo: string;
  status: 'active' | 'ended';
}

export interface SubletView {
  subletId: string;
  fromDay: string;
  toDay: string;
  occupantName: string;
  occupantContact: string | null;
  status: 'proposed' | 'approved' | 'rejected' | 'ended';
  decidedAt: string | null;
}

export interface CabinRow {
  cabinId: string;
  code: string;
  notes: string | null;
  /** Where the cabin block is drawn; null when the cabin is not on the drawing. */
  position: CabinPosition | null;
  /** The assignment that covers today, if any. */
  currentAssignment: AssignmentView | null;
  /** Who uses the cabin today: an approved sublet wins over the holder. */
  todayOccupant: { name: string | null; source: 'sublet' | 'holder' } | null;
}

function toAssignment(row: typeof cabinAssignment.$inferSelect): AssignmentView {
  return {
    assignmentId: row.id,
    holderName: row.holderName,
    holderContact: row.holderContact,
    hasAccount: row.holderAccountId !== null,
    validFrom: row.validFrom,
    validTo: row.validTo,
    status: row.status,
  };
}

function toSublet(row: typeof cabinSublet.$inferSelect): SubletView {
  return {
    subletId: row.id,
    fromDay: row.fromDay,
    toDay: row.toDay,
    occupantName: row.occupantName,
    occupantContact: row.occupantContact,
    status: row.status,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

function elementPosition(element: { zone: SpotZone | null; rowNumber: number | null; colStart: number | null; colEnd: number | null } | null): CabinPosition | null {
  if (!element || element.zone === null || element.rowNumber === null || element.colStart === null || element.colEnd === null) return null;
  return { zone: element.zone, rowNumber: element.rowNumber, colStart: element.colStart, colEnd: element.colEnd };
}

/** Every cabin with its position, the assignment covering today and today's occupant. */
export function listCabins(db: Database, actor: Actor): Promise<CabinRow[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const today = await localToday(tx, actor.beachId);
    const cabins = await tx
      .select({ cabin, element: { zone: layoutElement.zone, rowNumber: layoutElement.rowNumber, colStart: layoutElement.colStart, colEnd: layoutElement.colEnd } })
      .from(cabin)
      .leftJoin(layoutElement, eq(layoutElement.id, cabin.elementId))
      .orderBy(asc(cabin.code));
    const assignments = await tx
      .select()
      .from(cabinAssignment)
      .where(and(eq(cabinAssignment.status, 'active'), sql`${cabinAssignment.validFrom} <= ${today} and ${cabinAssignment.validTo} >= ${today}`));
    const covering = new Map(assignments.map((row) => [row.cabinId, row]));
    const sublets = assignments.length
      ? await tx
          .select()
          .from(cabinSublet)
          .where(and(eq(cabinSublet.status, 'approved'), inArray(cabinSublet.assignmentId, assignments.map((row) => row.id)), sql`${cabinSublet.fromDay} <= ${today} and ${cabinSublet.toDay} >= ${today}`))
      : [];
    const occupying = new Map(sublets.map((row) => [row.assignmentId, row]));
    return cabins.map(({ cabin: row, element }) => {
      const assignment = covering.get(row.id) ?? null;
      const sublet = assignment ? (occupying.get(assignment.id) ?? null) : null;
      return {
        cabinId: row.id,
        code: row.code,
        notes: row.notes,
        position: elementPosition(element),
        currentAssignment: assignment ? toAssignment(assignment) : null,
        todayOccupant: sublet
          ? { name: sublet.occupantName, source: 'sublet' as const }
          : assignment
            ? { name: assignment.holderName, source: 'holder' as const }
            : null,
      };
    });
  });
}

/** The reception's operational list: who uses each cabin today. Nothing to decide here. */
export async function cabinsToday(db: Database, actor: Actor): Promise<{ code: string; occupant: { name: string | null; source: 'sublet' | 'holder' } | null }[]> {
  const rows = await listCabins(db, actor);
  return rows.map((row) => ({ code: row.code, occupant: row.todayOccupant }));
}

function assertNotes(notes: string | null | undefined): void {
  if (notes != null && (notes.length === 0 || notes.length > cabinNotesMaxLength)) throw new RangeError(`notes must have 1 to ${cabinNotesMaxLength} characters`);
}

async function cabinBlock(tx: Transaction, elementId: string): Promise<void> {
  const [element] = await tx.select({ kind: layoutElement.kind }).from(layoutElement).where(eq(layoutElement.id, elementId));
  if (!element) throw new DomainError('not_found', 'Element not found');
  if (element.kind !== 'cabin_block') throw new DomainError('invalid_state', 'A cabin hangs from a cabin block, not from this element');
}

function duplicateCabin(error: unknown): never {
  if (pgCode(error) === '23505') throw new DomainError('invalid_state', 'A cabin with this code already exists');
  throw error;
}

export interface NewCabin {
  code: string;
  /** The cabin block it is drawn in, when already drawn. */
  elementId?: string | null;
  notes?: string | null;
}

export async function createCabin(db: Database, actor: Actor, input: NewCabin): Promise<{ cabinId: string }> {
  if (input.code.length === 0 || input.code.length > cabinCodeMaxLength) throw new RangeError(`code must have 1 to ${cabinCodeMaxLength} characters`);
  assertNotes(input.notes);
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      if (input.elementId) await cabinBlock(tx, input.elementId);
      const [created] = await tx
        .insert(cabin)
        .values({ beachId: actor.beachId, code: input.code, elementId: input.elementId ?? null, notes: input.notes ?? null })
        .returning({ id: cabin.id });
      if (!created) throw new Error('cabin was not created');
      await audit(tx, actor, 'cabins.create', created.id, { code: input.code, elementId: input.elementId ?? null });
      return { cabinId: created.id };
    });
  } catch (error) {
    duplicateCabin(error);
  }
}

export interface CabinChange {
  cabinId: string;
  code?: string;
  /** Undefined leaves the block as it is; null detaches the cabin from the drawing. */
  elementId?: string | null;
  notes?: string | null;
}

export async function updateCabin(db: Database, actor: Actor, input: CabinChange): Promise<void> {
  if (input.code !== undefined && (input.code.length === 0 || input.code.length > cabinCodeMaxLength)) throw new RangeError(`code must have 1 to ${cabinCodeMaxLength} characters`);
  assertNotes(input.notes);
  const changes: Partial<typeof cabin.$inferInsert> = {};
  if (input.code !== undefined) changes.code = input.code;
  if (input.elementId !== undefined) changes.elementId = input.elementId;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (Object.keys(changes).length === 0) throw new RangeError('nothing to change');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [current] = await tx.select({ code: cabin.code }).from(cabin).where(eq(cabin.id, input.cabinId));
      if (!current) throw new DomainError('not_found', 'Cabin not found');
      if (input.elementId) await cabinBlock(tx, input.elementId);
      await tx.update(cabin).set(changes).where(eq(cabin.id, input.cabinId));
      await audit(tx, actor, 'cabins.update', input.cabinId, { code: current.code, ...changes });
    });
  } catch (error) {
    duplicateCabin(error);
  }
}

/** Deletes a cabin that was never assigned. One with a history keeps it. */
export async function deleteCabin(db: Database, actor: Actor, input: { cabinId: string }): Promise<void> {
  const used = new DomainError('invalid_state', 'This cabin has assignments in its history: it cannot be deleted');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [current] = await tx.select({ code: cabin.code }).from(cabin).where(eq(cabin.id, input.cabinId));
      if (!current) throw new DomainError('not_found', 'Cabin not found');
      const [assigned] = await tx.select({ id: cabinAssignment.id }).from(cabinAssignment).where(eq(cabinAssignment.cabinId, input.cabinId)).limit(1);
      if (assigned) throw used;
      await tx.delete(cabin).where(eq(cabin.id, input.cabinId));
      await audit(tx, actor, 'cabins.delete', input.cabinId, { code: current.code });
    });
  } catch (error) {
    if (pgCode(error) === '23503') throw used;
    throw error;
  }
}

// ---- Assignments ----

export interface NewAssignment {
  cabinId: string;
  /** Email of an existing account; the holder then sees their own cabins when signed in. */
  holderEmail?: string;
  /** Written name and contact, for a holder with or without an account. */
  holderName?: string;
  holderContact?: string;
  validFrom: string;
  validTo: string;
}

/** Assigns a cabin to a holder for a period. Overlapping assignments are refused by the schema. */
export async function assignCabin(db: Database, actor: Actor, input: NewAssignment): Promise<{ assignmentId: string }> {
  if (!input.holderEmail && !input.holderName) throw new RangeError('the holder needs an account email or a written name');
  if (input.holderName !== undefined && (input.holderName.length === 0 || input.holderName.length > holderNameMaxLength)) throw new RangeError(`holderName must have 1 to ${holderNameMaxLength} characters`);
  if (input.holderContact !== undefined && (input.holderContact.length === 0 || input.holderContact.length > holderContactMaxLength)) throw new RangeError(`holderContact must have 1 to ${holderContactMaxLength} characters`);
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [place] = await tx.select({ code: cabin.code }).from(cabin).where(eq(cabin.id, input.cabinId));
      if (!place) throw new DomainError('not_found', 'Cabin not found');
      let holderAccountId: string | null = null;
      if (input.holderEmail) {
        const found = await tx.execute<{ id: string | null }>(sql`select user_id_by_email(${input.holderEmail}) as id`);
        holderAccountId = found.rows[0]?.id ?? null;
        if (!holderAccountId) throw new DomainError('not_found', 'No account with this email');
      }
      const [created] = await tx
        .insert(cabinAssignment)
        .values({
          beachId: actor.beachId,
          cabinId: input.cabinId,
          holderAccountId,
          holderName: input.holderName ?? null,
          holderContact: input.holderContact ?? null,
          validFrom: input.validFrom,
          validTo: input.validTo,
        })
        .returning({ id: cabinAssignment.id });
      if (!created) throw new Error('assignment was not created');
      await audit(tx, actor, 'cabins.assign', created.id, { cabinCode: place.code, hasAccount: holderAccountId !== null, validFrom: input.validFrom, validTo: input.validTo });
      return { assignmentId: created.id };
    });
  } catch (error) {
    if (pgCode(error) === '23P01') throw new DomainError('invalid_state', 'This cabin already has a holder in that period');
    if (pgCode(error) === '23514') throw new DomainError('invalid_state', 'The period ends before it starts');
    throw error;
  }
}

/**
 * Ends an assignment on a given day, early or at its natural end. Sublets beyond
 * the new end are truncated or closed, each with its own audit line; the holder
 * sees the change on their page.
 */
export function endAssignment(db: Database, actor: Actor, input: { assignmentId: string; endOn: string }): Promise<{ truncatedSublets: number; closedSublets: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [assignment] = await tx.select().from(cabinAssignment).where(eq(cabinAssignment.id, input.assignmentId)).for('update');
    if (!assignment) throw new DomainError('not_found', 'Assignment not found');
    if (assignment.status === 'ended') throw new DomainError('invalid_state', 'This assignment has already ended');
    if (input.endOn < assignment.validFrom) throw new DomainError('invalid_state', 'The assignment cannot end before it starts');
    const endOn = input.endOn < assignment.validTo ? input.endOn : assignment.validTo;

    let truncated = 0;
    let closed = 0;
    const open = await tx
      .select()
      .from(cabinSublet)
      .where(and(eq(cabinSublet.assignmentId, assignment.id), inArray(cabinSublet.status, ['proposed', 'approved'])))
      .for('update');
    for (const sublet of open) {
      if (sublet.fromDay > endOn) {
        // Entirely beyond the new end: an approved stay is closed, a pending proposal refused.
        const status = sublet.status === 'approved' ? ('ended' as const) : ('rejected' as const);
        await tx.update(cabinSublet).set({ status, decidedBy: actor.userId, decidedAt: sql`now()` }).where(eq(cabinSublet.id, sublet.id));
        await audit(tx, actor, 'cabins.sublet-end', sublet.id, { occupantName: sublet.occupantName, reason: 'assignment ended', endOn });
        closed += 1;
      } else if (sublet.toDay > endOn) {
        await tx.update(cabinSublet).set({ toDay: endOn }).where(eq(cabinSublet.id, sublet.id));
        await audit(tx, actor, 'cabins.sublet-truncate', sublet.id, { occupantName: sublet.occupantName, from: sublet.toDay, to: endOn });
        truncated += 1;
      }
    }
    await tx.update(cabinAssignment).set({ validTo: endOn, status: 'ended' }).where(eq(cabinAssignment.id, assignment.id));
    await audit(tx, actor, 'cabins.assignment-end', assignment.id, { cabinId: assignment.cabinId, endOn, truncatedSublets: truncated, closedSublets: closed });
    return { truncatedSublets: truncated, closedSublets: closed };
  });
}

export interface CabinHistory {
  cabinId: string;
  code: string;
  notes: string | null;
  assignments: (AssignmentView & { sublets: SubletView[] })[];
}

/** The seasonal trace of one cabin: every assignment with its sublets. */
export function cabinHistory(db: Database, actor: Actor, cabinId: string): Promise<CabinHistory> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [place] = await tx.select().from(cabin).where(eq(cabin.id, cabinId));
    if (!place) throw new DomainError('not_found', 'Cabin not found');
    const assignments = await tx.select().from(cabinAssignment).where(eq(cabinAssignment.cabinId, cabinId)).orderBy(desc(cabinAssignment.validFrom));
    const sublets = assignments.length
      ? await tx
          .select()
          .from(cabinSublet)
          .where(inArray(cabinSublet.assignmentId, assignments.map((row) => row.id)))
          .orderBy(asc(cabinSublet.fromDay))
      : [];
    return {
      cabinId: place.id,
      code: place.code,
      notes: place.notes,
      assignments: assignments.map((row) => ({ ...toAssignment(row), sublets: sublets.filter((sublet) => sublet.assignmentId === row.id).map(toSublet) })),
    };
  });
}

// ---- Sublets ----

export interface PendingSublet extends SubletView {
  assignmentId: string;
  cabinCode: string;
  holderName: string | null;
}

/** Proposals waiting for the manager, oldest first. */
export function listPendingSublets(db: Database, actor: Actor): Promise<PendingSublet[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({ sublet: cabinSublet, cabinCode: cabin.code, holderName: cabinAssignment.holderName })
      .from(cabinSublet)
      .innerJoin(cabinAssignment, eq(cabinAssignment.id, cabinSublet.assignmentId))
      .innerJoin(cabin, eq(cabin.id, cabinAssignment.cabinId))
      .where(eq(cabinSublet.status, 'proposed'))
      .orderBy(asc(cabinSublet.fromDay), asc(cabin.code));
    return rows.map(({ sublet, cabinCode, holderName }) => ({ ...toSublet(sublet), assignmentId: sublet.assignmentId, cabinCode, holderName }));
  });
}

export interface NewSublet {
  assignmentId: string;
  fromDay: string;
  toDay: string;
  occupantName: string;
  occupantContact?: string;
}

/** The holder proposes a sublet inside their own assignment. The manager decides. */
export async function proposeSublet(db: Database, userId: string, input: NewSublet): Promise<{ subletId: string }> {
  if (input.occupantName.length === 0 || input.occupantName.length > occupantNameMaxLength) throw new RangeError(`occupantName must have 1 to ${occupantNameMaxLength} characters`);
  if (input.occupantContact !== undefined && (input.occupantContact.length === 0 || input.occupantContact.length > holderContactMaxLength)) throw new RangeError(`occupantContact must have 1 to ${holderContactMaxLength} characters`);
  const [assignment] = await withUser(db, userId, (tx) =>
    tx.select().from(cabinAssignment).where(and(eq(cabinAssignment.id, input.assignmentId), eq(cabinAssignment.holderAccountId, userId))),
  );
  if (!assignment) throw new DomainError('not_found', 'Assignment not found');
  if (assignment.status !== 'active') throw new DomainError('invalid_state', 'This assignment has ended');
  if (input.fromDay > input.toDay) throw new DomainError('invalid_state', 'The period ends before it starts');
  if (input.fromDay < assignment.validFrom || input.toDay > assignment.validTo) {
    throw new DomainError('invalid_state', 'The sublet must stay inside the assignment period');
  }
  return withActor(db, assignment.beachId, userId, async (tx) => {
    const [taken] = await tx
      .select({ id: cabinSublet.id })
      .from(cabinSublet)
      .where(and(eq(cabinSublet.assignmentId, assignment.id), eq(cabinSublet.status, 'approved'), sql`${cabinSublet.fromDay} <= ${input.toDay} and ${cabinSublet.toDay} >= ${input.fromDay}`))
      .limit(1);
    if (taken) throw new DomainError('invalid_state', 'An approved sublet already covers part of that period');
    const [created] = await tx
      .insert(cabinSublet)
      .values({
        beachId: assignment.beachId,
        assignmentId: assignment.id,
        fromDay: input.fromDay,
        toDay: input.toDay,
        occupantName: input.occupantName,
        occupantContact: input.occupantContact ?? null,
      })
      .returning({ id: cabinSublet.id });
    if (!created) throw new Error('sublet was not created');
    await audit(tx, { beachId: assignment.beachId, userId }, 'cabins.sublet-propose', created.id, { assignmentId: assignment.id, fromDay: input.fromDay, toDay: input.toDay });
    return { subletId: created.id };
  });
}

/** The manager approves or rejects a proposal. Overlaps among approved sublets are refused by the schema. */
export async function decideSublet(db: Database, actor: Actor, subletId: string, decision: { approve: boolean }): Promise<void> {
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [row] = await tx
        .select({ sublet: cabinSublet, assignmentStatus: cabinAssignment.status, validFrom: cabinAssignment.validFrom, validTo: cabinAssignment.validTo })
        .from(cabinSublet)
        .innerJoin(cabinAssignment, eq(cabinAssignment.id, cabinSublet.assignmentId))
        .where(eq(cabinSublet.id, subletId))
        .for('update', { of: cabinSublet });
      if (!row) throw new DomainError('not_found', 'Sublet not found');
      if (row.sublet.status !== 'proposed') throw new DomainError('invalid_state', 'This proposal has already been decided');
      if (decision.approve) {
        if (row.assignmentStatus !== 'active') throw new DomainError('invalid_state', 'This assignment has ended');
        if (row.sublet.fromDay < row.validFrom || row.sublet.toDay > row.validTo) {
          throw new DomainError('invalid_state', 'The sublet no longer fits inside the assignment period');
        }
      }
      await tx
        .update(cabinSublet)
        .set({ status: decision.approve ? 'approved' : 'rejected', decidedBy: actor.userId, decidedAt: sql`now()` })
        .where(eq(cabinSublet.id, subletId));
      await audit(tx, actor, decision.approve ? 'cabins.sublet-approve' : 'cabins.sublet-reject', subletId, { occupantName: row.sublet.occupantName });
    });
  } catch (error) {
    if (pgCode(error) === '23P01') throw new DomainError('invalid_state', 'An approved sublet already covers part of that period');
    throw error;
  }
}

// ---- The holder's own view ----

export interface MyCabinAssignment {
  assignmentId: string;
  beachSlug: string;
  beachName: string;
  cabinCode: string;
  position: CabinPosition | null;
  validFrom: string;
  validTo: string;
  status: 'active' | 'ended';
  sublets: SubletView[];
}

/**
 * Exactly what a signed-in holder may see: their own assignments, the cabins and
 * the occupants they proposed themselves. Row level security enforces the same
 * boundary underneath.
 */
export function listMyCabins(db: Database, userId: string): Promise<MyCabinAssignment[]> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({
        assignment: cabinAssignment,
        cabinCode: cabin.code,
        beachSlug: beach.slug,
        beachName: beach.name,
        element: { zone: layoutElement.zone, rowNumber: layoutElement.rowNumber, colStart: layoutElement.colStart, colEnd: layoutElement.colEnd },
      })
      .from(cabinAssignment)
      .innerJoin(cabin, eq(cabin.id, cabinAssignment.cabinId))
      .innerJoin(beach, eq(beach.id, cabinAssignment.beachId))
      .leftJoin(layoutElement, eq(layoutElement.id, cabin.elementId))
      .where(eq(cabinAssignment.holderAccountId, userId))
      .orderBy(desc(cabinAssignment.validFrom), asc(cabin.code));
    const sublets = rows.length
      ? await tx
          .select()
          .from(cabinSublet)
          .where(inArray(cabinSublet.assignmentId, rows.map((row) => row.assignment.id)))
          .orderBy(asc(cabinSublet.fromDay))
      : [];
    return rows.map(({ assignment, cabinCode, beachSlug, beachName, element }) => ({
      assignmentId: assignment.id,
      beachSlug,
      beachName,
      cabinCode,
      position: elementPosition(element),
      validFrom: assignment.validFrom,
      validTo: assignment.validTo,
      status: assignment.status,
      sublets: sublets.filter((sublet) => sublet.assignmentId === assignment.id).map(toSublet),
    }));
  });
}
