import { and, asc, desc, eq, exists, sql } from 'drizzle-orm';
import { demoMedia, parseTypeCardContent, type SpotMark, type TypeCardContent } from '@ombre/shared';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, spot, spotType, spotTypeCard } from './schema';

// The spot type cards (D61): the custom content a beach club writes over the
// platform default of packages/shared/src/domain/type-cards.ts. The resolution
// field by field is done by the site with resolveTypeCard; these functions only
// carry the type data and the custom content, or its absence.

function audit(tx: Transaction, actor: Actor, action: string, target: string, detail: Record<string, unknown>): Promise<unknown> {
  return tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action, target, detail });
}

export interface PublicTypeCard {
  typeId: string;
  name: string;
  mark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** The club's custom content, or null for the platform default. */
  content: TypeCardContent | null;
  customized: boolean;
}

const cardColumns = {
  typeId: spotType.id,
  name: spotType.name,
  mark: spotType.mark,
  umbrellas: spotType.umbrellas,
  sunbeds: spotType.sunbeds,
  maxGuests: spotType.maxGuests,
  content: spotTypeCard.content,
};

type CardRow = Omit<PublicTypeCard, 'content' | 'customized'> & { content: unknown };

const toCard = ({ content, ...type }: CardRow): PublicTypeCard => ({ ...type, content: (content as TypeCardContent | null) ?? null, customized: content != null });

async function activeBeachId(db: Database, slug: string): Promise<string> {
  const [club] = await db.select({ id: beach.id }).from(beach).where(and(eq(beach.slug, slug), eq(beach.status, 'active')));
  if (!club) throw new DomainError('not_found', 'Beach club not found');
  return club.id;
}

/** True for the types with at least one spot that is not retired: the types the club actually offers. */
const inUse = (tx: Transaction) => exists(tx.select({ one: sql`1` }).from(spot).where(and(eq(spot.typeId, spotType.id), eq(spot.retired, false))));

/**
 * The types USED by an active beach club (at least one non-retired spot, the
 * declared choice: a defined but unused type is not offered to anyone), each
 * with the custom content or null, builtins first like the manager's list.
 */
export function listTypeCardsPublic(db: Database, slug: string): Promise<PublicTypeCard[]> {
  return activeBeachId(db, slug).then((beachId) =>
    withBeach(db, beachId, async (tx) => {
      const rows = await tx
        .select(cardColumns)
        .from(spotType)
        .leftJoin(spotTypeCard, eq(spotTypeCard.typeId, spotType.id))
        .where(inUse(tx))
        .orderBy(desc(spotType.builtin), asc(spotType.name));
      return rows.map(toCard);
    }),
  );
}

/**
 * One type of an active beach club with its card content, by identifier. Any
 * type of the club answers, even one without active spots: a saved link to a
 * card keeps working while the type exists.
 */
export function getTypeCardPublic(db: Database, slug: string, typeId: string): Promise<PublicTypeCard> {
  return activeBeachId(db, slug).then((beachId) =>
    withBeach(db, beachId, async (tx) => {
      const [row] = await tx.select(cardColumns).from(spotType).leftJoin(spotTypeCard, eq(spotTypeCard.typeId, spotType.id)).where(eq(spotType.id, typeId));
      if (!row) throw new DomainError('not_found', 'Spot type not found');
      return toCard(row);
    }),
  );
}

export interface ManagerTypeCard extends PublicTypeCard {
  builtin: boolean;
  /** Spots currently of this type; zero means the public list leaves the type out. */
  spots: number;
  updatedAt: Date | null;
}

/** EVERY type of the beach club, even without spots, with the card state custom/default. */
export function listTypeCardsForManager(db: Database, actor: Actor): Promise<ManagerTypeCard[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({
        ...cardColumns,
        builtin: spotType.builtin,
        // Spelled out like listSpotTypes: interpolated columns render unqualified.
        spots: sql<number>`(select count(*) from ${spot} where ${spot}."type_id" = ${spotType}."id" and not ${spot}."retired")::int`,
        updatedAt: spotTypeCard.updatedAt,
      })
      .from(spotType)
      .leftJoin(spotTypeCard, eq(spotTypeCard.typeId, spotType.id))
      .orderBy(desc(spotType.builtin), asc(spotType.name));
    return rows.map(({ builtin, spots, updatedAt, ...row }) => ({ ...toCard(row), builtin, spots, updatedAt: updatedAt ?? null }));
  });
}

/**
 * Saves the custom card of a type, whole. The content is validated with the
 * shared module; the photos must be keys of the sample library (demoMedia),
 * the same library of the site: never outside addresses (D62).
 */
export async function setTypeCard(db: Database, actor: Actor, input: { typeId: string; content: TypeCardContent }): Promise<{ typeId: string; content: TypeCardContent }> {
  const content = parseTypeCardContent(input.content);
  for (const photo of content.photos ?? []) {
    if (!(photo.id in demoMedia)) throw new DomainError('invalid_state', `The picture «${photo.id}» is not in the sample library`);
  }
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [type] = await tx.select({ name: spotType.name }).from(spotType).where(eq(spotType.id, input.typeId));
    if (!type) throw new DomainError('not_found', 'Spot type not found');
    await tx
      .insert(spotTypeCard)
      .values({ typeId: input.typeId, beachId: actor.beachId, content, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: spotTypeCard.typeId, set: { content, updatedBy: actor.userId, updatedAt: sql`now()` } });
    await audit(tx, actor, 'type_card.saved', input.typeId, { name: type.name, fields: Object.keys(content) });
    return { typeId: input.typeId, content };
  });
}

/** Back to the platform default: the row is deleted. Already default: nothing happens, nothing is audited. */
export function resetTypeCard(db: Database, actor: Actor, input: { typeId: string }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [type] = await tx.select({ name: spotType.name }).from(spotType).where(eq(spotType.id, input.typeId));
    if (!type) throw new DomainError('not_found', 'Spot type not found');
    const deleted = await tx.delete(spotTypeCard).where(eq(spotTypeCard.typeId, input.typeId)).returning({ typeId: spotTypeCard.typeId });
    if (deleted.length > 0) await audit(tx, actor, 'type_card.reset', input.typeId, { name: type.name });
  });
}
