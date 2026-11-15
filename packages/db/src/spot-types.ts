import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { spotTypeNameMaxLength, type SpotMark } from '@ombre/shared';
import { withActor, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, spot, spotType } from './schema';

// Spot types of a beach club: the three builtins plus the custom ones the manager
// defines. Defaults are copied when a spot is created and never propagate: editing
// a type only touches the spots created afterwards.

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

function audit(tx: Transaction, actor: Actor, action: string, target: string | null, detail: Record<string, unknown>): Promise<unknown> {
  return tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action, target, detail });
}

export interface SpotTypeView {
  typeId: string;
  name: string;
  mark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  defaultPriceCents: number | null;
  builtin: boolean;
  /** Spots currently of this type; a used type cannot be deleted. */
  spots: number;
}

const typeColumns = {
  typeId: spotType.id,
  name: spotType.name,
  mark: spotType.mark,
  umbrellas: spotType.umbrellas,
  sunbeds: spotType.sunbeds,
  maxGuests: spotType.maxGuests,
  defaultPriceCents: spotType.defaultPriceCents,
  builtin: spotType.builtin,
};

/** Every type of the beach club, builtins first. */
export function listSpotTypes(db: Database, actor: Actor): Promise<SpotTypeView[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      // Columns interpolated in the field list render unqualified, so the correlated
      // pair is spelled out: the bare names would both resolve inside the subquery.
      .select({ ...typeColumns, spots: sql<number>`(select count(*) from ${spot} where ${spot}."type_id" = ${spotType}."id")::int` })
      .from(spotType)
      .orderBy(desc(spotType.builtin), asc(spotType.name)),
  );
}

export interface NewSpotType {
  name: string;
  mark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  defaultPriceCents?: number | null;
}

function assertTypeFields(input: { name?: string; umbrellas?: number; sunbeds?: number; maxGuests?: number; defaultPriceCents?: number | null }): void {
  if (input.name !== undefined && (input.name.length === 0 || input.name.length > spotTypeNameMaxLength)) throw new RangeError(`name must have 1 to ${spotTypeNameMaxLength} characters`);
  for (const field of ['umbrellas', 'sunbeds'] as const) {
    const value = input[field];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new RangeError(`${field} must be a whole number`);
  }
  if (input.maxGuests !== undefined && (!Number.isInteger(input.maxGuests) || input.maxGuests < 1)) throw new RangeError('maxGuests must be at least 1');
  if (input.defaultPriceCents != null && (!Number.isInteger(input.defaultPriceCents) || input.defaultPriceCents < 0)) throw new RangeError('defaultPriceCents must be a whole number of cents');
}

function duplicateName(error: unknown): never {
  if (pgCode(error) === '23505') throw new DomainError('invalid_state', 'A type with this name already exists');
  throw error;
}

/** A custom type, with its mark from the fixed repertoire. */
export async function createSpotType(db: Database, actor: Actor, input: NewSpotType): Promise<{ typeId: string }> {
  const name = input.name.trim();
  assertTypeFields({ ...input, name });
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [created] = await tx
        .insert(spotType)
        .values({
          beachId: actor.beachId,
          name,
          mark: input.mark,
          umbrellas: input.umbrellas,
          sunbeds: input.sunbeds,
          maxGuests: input.maxGuests,
          defaultPriceCents: input.defaultPriceCents ?? null,
        })
        .returning({ id: spotType.id });
      if (!created) throw new Error('spot type was not created');
      await audit(tx, actor, 'types.create', created.id, { name, mark: input.mark });
      return { typeId: created.id };
    });
  } catch (error) {
    duplicateName(error);
  }
}

export interface SpotTypeChange {
  typeId: string;
  name?: string;
  mark?: SpotMark;
  umbrellas?: number;
  sunbeds?: number;
  maxGuests?: number;
  /** Undefined leaves the price as it is; null clears it. Days already published never change. */
  defaultPriceCents?: number | null;
}

/** Edits a type. Builtins keep name and mark; existing spots are never touched. */
export async function updateSpotType(db: Database, actor: Actor, input: SpotTypeChange): Promise<void> {
  const name = input.name?.trim();
  assertTypeFields({ ...input, name });
  const changes: Partial<typeof spotType.$inferInsert> = {};
  if (name !== undefined) changes.name = name;
  if (input.mark !== undefined) changes.mark = input.mark;
  if (input.umbrellas !== undefined) changes.umbrellas = input.umbrellas;
  if (input.sunbeds !== undefined) changes.sunbeds = input.sunbeds;
  if (input.maxGuests !== undefined) changes.maxGuests = input.maxGuests;
  if (input.defaultPriceCents !== undefined) changes.defaultPriceCents = input.defaultPriceCents;
  if (Object.keys(changes).length === 0) throw new RangeError('nothing to change');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [current] = await tx.select().from(spotType).where(eq(spotType.id, input.typeId));
      if (!current) throw new DomainError('not_found', 'Spot type not found');
      if (current.builtin && (changes.name !== undefined || changes.mark !== undefined)) {
        throw new DomainError('invalid_state', 'The base types keep their name and mark; equipment, capacity and default price can change');
      }
      await tx.update(spotType).set(changes).where(eq(spotType.id, input.typeId));
      await audit(tx, actor, 'types.update', input.typeId, { name: current.name, ...changes });
    });
  } catch (error) {
    duplicateName(error);
  }
}

/** Deletes a custom type nobody uses. Builtins and used types stay. */
export async function deleteSpotType(db: Database, actor: Actor, input: { typeId: string }): Promise<void> {
  const used = new DomainError('invalid_state', 'Spots of this type exist: change their type before deleting it');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [current] = await tx.select({ name: spotType.name, builtin: spotType.builtin }).from(spotType).where(eq(spotType.id, input.typeId));
      if (!current) throw new DomainError('not_found', 'Spot type not found');
      if (current.builtin) throw new DomainError('invalid_state', 'The three base types cannot be deleted');
      const [taken] = await tx.select({ id: spot.id }).from(spot).where(eq(spot.typeId, input.typeId)).limit(1);
      if (taken) throw used;
      await tx.delete(spotType).where(and(eq(spotType.id, input.typeId), eq(spotType.builtin, false)));
      await audit(tx, actor, 'types.delete', input.typeId, { name: current.name });
    });
  } catch (error) {
    // A spot created in the meantime: the foreign key is the last guard.
    if (pgCode(error) === '23503') throw used;
    throw error;
  }
}
