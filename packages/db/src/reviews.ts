import { and, desc, eq, sql } from 'drizzle-orm';
import { withActor, withUser, type Database } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, bookingGroup, review } from './schema';

// Verified reviews (D51): one per stay, written only by the account that owns a
// concluded, not cancelled booking group. The manager flags once, with a written
// reason, and replies; a flagged review stays visible until the platform decides.

export const reviewBodyMaxLength = 600;
export const reviewReplyMaxLength = 600;
export const flagReasonMinLength = 3;
export const flagReasonMaxLength = 200;

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

export interface CreatedReview {
  reviewId: string;
  rating: number;
  body: string | null;
  createdAt: Date;
}

/**
 * The owner of a booking group reviews the stay (D51): only a confirmed group
 * whose last live day has passed in the beach club's zone, never cancelled, one
 * review per group. The platform audit names the author, like account.ts does.
 */
export async function createReview(db: Database, input: { userId: string; groupId: string; rating: number; body: string | null }): Promise<CreatedReview> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new RangeError('the rating must be a whole number between 1 and 5');
  }
  const body = input.body?.trim() || null;
  if (body !== null && body.length > reviewBodyMaxLength) {
    throw new RangeError(`the review must stay within ${reviewBodyMaxLength} characters`);
  }
  return withUser(db, input.userId, async (tx) => {
    // Ownership through the owner RLS path (D47): someone else's group is simply absent.
    const [owned] = await tx
      .select({ beachId: bookingGroup.beachId, code: bookingGroup.code })
      .from(bookingGroup)
      .where(and(eq(bookingGroup.id, input.groupId), eq(bookingGroup.userId, input.userId)));
    if (!owned) throw new DomainError('not_found', 'Booking not found');

    // The days live behind the beach boundary, like in listMyBookings (D47).
    await tx.execute(sql`select set_config('app.beach_id', ${owned.beachId}, true)`);
    const [stay] = await tx.execute<{ live_days: number; pending_days: number; last_live_day: string | null; today: string }>(sql`
      select
        count(*) filter (where b.status <> 'cancelled')::int as live_days,
        count(*) filter (where b.status = 'under_review')::int as pending_days,
        max(d.day) filter (where b.status <> 'cancelled')::text as last_live_day,
        (now() at time zone (select timezone from beach where id = ${owned.beachId}))::date::text as today
      from booking b join inventory_day d on d.id = b.inventory_day_id
      where b.group_id = ${input.groupId}
    `).then((result) => result.rows);
    if (!stay || stay.live_days === 0) throw new DomainError('review_not_allowed', 'A cancelled stay cannot be reviewed');
    if (stay.pending_days > 0 || !stay.last_live_day || stay.last_live_day >= stay.today) {
      throw new DomainError('review_not_allowed', 'Only a concluded stay can be reviewed');
    }

    let created: { id: string; createdAt: Date } | undefined;
    try {
      [created] = await tx
        .insert(review)
        .values({ beachId: owned.beachId, bookingGroupId: input.groupId, userId: input.userId, rating: input.rating, body })
        .returning({ id: review.id, createdAt: review.createdAt });
    } catch (error) {
      if (pgCode(error) === '23505') throw new DomainError('review_exists', 'This stay has already been reviewed');
      throw error;
    }
    if (!created) throw new Error('review was not created');
    // Platform audit (D45), like the account actions: the author is the actor.
    await tx.insert(auditEvent).values({ beachId: null, actorUserId: input.userId, action: 'review.create', target: owned.code, detail: { rating: input.rating } });
    return { reviewId: created.id, rating: input.rating, body, createdAt: created.createdAt };
  });
}

export interface PublicReview {
  rating: number;
  body: string | null;
  /** Name of the account, never the email (D51). */
  authorName: string;
  /** The dal–al period of the stay. */
  from: string;
  to: string;
  reply: string | null;
  /** A flagged review stays visible, with its state said out loud. */
  status: 'published' | 'flagged';
  createdAt: Date;
}

const stayFrom = sql<string>`(select min(d.day)::text from booking b join inventory_day d on d.id = b.inventory_day_id where b.group_id = ${review.bookingGroupId} and b.status <> 'cancelled')`;
const stayTo = sql<string>`(select max(d.day)::text from booking b join inventory_day d on d.id = b.inventory_day_id where b.group_id = ${review.bookingGroupId} and b.status <> 'cancelled')`;
const authorName = sql<string>`review_author_name(${review.id})`;

/** The public list of a beach club's reviews: the most recent first, at most 50. */
export async function listPublicReviews(db: Database, slug: string): Promise<PublicReview[]> {
  const [club] = await db.select({ id: beach.id }).from(beach).where(and(eq(beach.slug, slug), eq(beach.status, 'active')));
  if (!club) throw new DomainError('not_found', 'Beach club not found');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.beach_id', ${club.id}, true)`);
    const rows = await tx
      .select({ rating: review.rating, body: review.body, authorName, from: stayFrom, to: stayTo, reply: review.reply, status: review.status, createdAt: review.createdAt })
      .from(review)
      .where(eq(review.beachId, club.id))
      .orderBy(desc(review.createdAt), desc(review.id))
      .limit(50);
    return rows;
  });
}

export interface ManagerReview extends PublicReview {
  reviewId: string;
  groupCode: string;
  flagReason: string | null;
  flaggedAt: Date | null;
  repliedAt: Date | null;
}

/** The moderation list (D51): every review, newest first, with group code and flag details. */
export function listReviewsForManager(db: Database, actor: Actor): Promise<ManagerReview[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      .select({
        reviewId: review.id,
        rating: review.rating,
        body: review.body,
        authorName,
        from: stayFrom,
        to: stayTo,
        reply: review.reply,
        status: review.status,
        createdAt: review.createdAt,
        groupCode: sql<string>`(select g.code from booking_group g where g.id = ${review.bookingGroupId})`,
        flagReason: review.flagReason,
        flaggedAt: review.flaggedAt,
        repliedAt: review.repliedAt,
      })
      .from(review)
      .where(eq(review.beachId, actor.beachId))
      .orderBy(desc(review.createdAt), desc(review.id)),
  );
}

/** Flags a review to the platform, once, with a written reason (D51). It stays visible. */
export function flagReview(db: Database, actor: Actor, input: { reviewId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim();
  if (reason.length < flagReasonMinLength || reason.length > flagReasonMaxLength) {
    throw new RangeError(`the flag reason must have ${flagReasonMinLength} to ${flagReasonMaxLength} characters`);
  }
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [found] = await tx.select({ id: review.id, status: review.status }).from(review).where(and(eq(review.id, input.reviewId), eq(review.beachId, actor.beachId))).for('update');
    if (!found) throw new DomainError('not_found', 'Review not found');
    if (found.status === 'flagged') throw new DomainError('invalid_state', 'This review has already been flagged');
    await tx.update(review).set({ status: 'flagged', flagReason: reason, flaggedAt: sql`now()` }).where(eq(review.id, found.id));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'review.flag', target: found.id, detail: { reason } });
  });
}

/** The manager's public reply (D51): one text, overwritable. */
export function replyToReview(db: Database, actor: Actor, input: { reviewId: string; reply: string }): Promise<void> {
  const reply = input.reply.trim();
  if (reply.length === 0 || reply.length > reviewReplyMaxLength) {
    throw new RangeError(`the reply must have 1 to ${reviewReplyMaxLength} characters`);
  }
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [found] = await tx.select({ id: review.id }).from(review).where(and(eq(review.id, input.reviewId), eq(review.beachId, actor.beachId))).for('update');
    if (!found) throw new DomainError('not_found', 'Review not found');
    await tx.update(review).set({ reply, repliedAt: sql`now()` }).where(eq(review.id, found.id));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'review.reply', target: found.id, detail: {} });
  });
}
