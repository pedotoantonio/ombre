import { and, desc, eq, sql } from 'drizzle-orm';
import type { SiteContent, SiteTemplate } from '@ombre/shared';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, siteRevision } from './schema';

export interface SiteView {
  template: SiteTemplate;
  content: SiteContent;
}

/** What visitors see: only the published revision. */
export function getPublishedSite(db: Database, beachId: string): Promise<SiteView | null> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx.select().from(siteRevision).where(eq(siteRevision.status, 'published'));
    return row ? { template: row.template, content: row.content as SiteContent } : null;
  });
}

export interface RevisionView extends SiteView {
  revisionId: string;
  number: number;
  version: number;
}

export interface SiteState {
  draft: RevisionView | null;
  published: RevisionView | null;
  history: { revisionId: string; number: number; status: 'draft' | 'published' | 'archived'; publishedAt: string | null }[];
}

const view = (row: typeof siteRevision.$inferSelect): RevisionView => ({
  revisionId: row.id,
  number: row.number,
  version: row.version,
  template: row.template,
  content: row.content as SiteContent,
});

export function getSiteState(db: Database, actor: Actor): Promise<SiteState> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx.select().from(siteRevision).orderBy(desc(siteRevision.number));
    const draft = rows.find((row) => row.status === 'draft');
    const published = rows.find((row) => row.status === 'published');
    return {
      draft: draft ? view(draft) : null,
      published: published ? view(published) : null,
      history: rows.map((row) => ({ revisionId: row.id, number: row.number, status: row.status, publishedAt: row.publishedAt?.toISOString() ?? null })),
    };
  });
}

async function lockSite(tx: Transaction, beachId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`site/${beachId}`}, 0))`);
}

async function writeDraft(tx: Transaction, actor: Actor, expectedVersion: number | null, next: SiteView): Promise<{ version: number; number: number }> {
  const [draft] = await tx.select().from(siteRevision).where(eq(siteRevision.status, 'draft'));
  if (draft) {
    if (expectedVersion !== draft.version) throw new DomainError('version_conflict', 'Someone else has changed the draft: reload it before saving');
    const [saved] = await tx
      .update(siteRevision)
      .set({ template: next.template, content: next.content, version: draft.version + 1 })
      .where(eq(siteRevision.id, draft.id))
      .returning({ version: siteRevision.version, number: siteRevision.number });
    return saved!;
  }
  if (expectedVersion !== null) throw new DomainError('version_conflict', 'The draft you were editing no longer exists');
  const [last] = await tx.select({ number: sql<number>`coalesce(max(${siteRevision.number}), 0)::int` }).from(siteRevision);
  const [created] = await tx
    .insert(siteRevision)
    .values({ beachId: actor.beachId, number: (last?.number ?? 0) + 1, template: next.template, content: next.content, createdBy: actor.userId })
    .returning({ version: siteRevision.version, number: siteRevision.number });
  return created!;
}

/** Saves the draft. `expectedVersion` is the version the editor loaded, or null for a new draft. */
export function saveDraft(db: Database, actor: Actor, expectedVersion: number | null, next: SiteView): Promise<{ version: number; number: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await lockSite(tx, actor.beachId);
    return writeDraft(tx, actor, expectedVersion, next);
  });
}

/** Makes the draft public. The revision that was public is archived, not deleted. */
export function publishDraft(db: Database, actor: Actor, expectedVersion: number): Promise<{ number: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await lockSite(tx, actor.beachId);
    const [draft] = await tx.select().from(siteRevision).where(eq(siteRevision.status, 'draft'));
    if (!draft) throw new DomainError('not_found', 'There is no draft to publish');
    if (draft.version !== expectedVersion) throw new DomainError('version_conflict', 'The draft has changed: reload it before publishing');
    await tx.update(siteRevision).set({ status: 'archived' }).where(eq(siteRevision.status, 'published'));
    await tx.update(siteRevision).set({ status: 'published', publishedAt: sql`now()` }).where(eq(siteRevision.id, draft.id));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'site.publish', target: String(draft.number), detail: { template: draft.template } });
    return { number: draft.number };
  });
}

/** Brings an old revision back as the draft. History is kept: nothing is rewritten. */
export function restoreRevision(db: Database, actor: Actor, revisionId: string): Promise<{ version: number; number: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await lockSite(tx, actor.beachId);
    const [source] = await tx.select().from(siteRevision).where(and(eq(siteRevision.id, revisionId), sql`${siteRevision.status} <> 'draft'`));
    if (!source) throw new DomainError('not_found', 'Revision not found');
    const [draft] = await tx.select({ version: siteRevision.version }).from(siteRevision).where(eq(siteRevision.status, 'draft'));
    const saved = await writeDraft(tx, actor, draft?.version ?? null, { template: source.template, content: source.content as SiteContent });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'site.restore', target: String(source.number), detail: {} });
    return saved;
  });
}
