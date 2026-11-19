import { asc, eq } from 'drizzle-orm';
import { beachAmenities, isBeachAmenity, type BeachAmenity } from '@ombre/shared';
import { withActor, withBeach, type Database } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beachAmenity } from './schema';

// The amenities of a beach club (D49): a subset of the fixed catalogue in
// @ombre/shared, chosen by the manager in the settings panel. The labels live in
// the dictionaries; here and in the database only the stable identifiers travel.

/** Returns the amenities in the catalogue's own order, whatever the storage order. */
function inCatalogueOrder(chosen: readonly string[]): BeachAmenity[] {
  const set = new Set(chosen);
  return beachAmenities.filter((amenity) => set.has(amenity));
}

/** The amenities of one beach club, in catalogue order. Public for active clubs. */
export function listAmenities(db: Database, beachId: string): Promise<BeachAmenity[]> {
  return withBeach(db, beachId, async (tx) => {
    const rows = await tx.select({ amenity: beachAmenity.amenity }).from(beachAmenity).where(eq(beachAmenity.beachId, beachId)).orderBy(asc(beachAmenity.amenity));
    return inCatalogueOrder(rows.map((row) => row.amenity));
  });
}

/**
 * Replaces the WHOLE amenity set of the beach club (D49): the checkbox form
 * sends everything that is ticked, so absence means removal. Every value must
 * come from the fixed catalogue; duplicates are refused.
 */
export function setAmenities(db: Database, actor: Actor, input: { amenities: string[] }): Promise<{ amenities: BeachAmenity[] }> {
  for (const amenity of input.amenities) {
    if (!isBeachAmenity(amenity)) throw new DomainError('invalid_state', `Unknown amenity: ${amenity}`);
  }
  if (new Set(input.amenities).size !== input.amenities.length) throw new DomainError('invalid_state', 'Each amenity may appear at most once');
  const amenities = inCatalogueOrder(input.amenities);
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx.delete(beachAmenity).where(eq(beachAmenity.beachId, actor.beachId));
    if (amenities.length > 0) {
      await tx.insert(beachAmenity).values(amenities.map((amenity) => ({ beachId: actor.beachId, amenity })));
    }
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'beach.amenities', target: null, detail: { amenities } });
    return { amenities };
  });
}
