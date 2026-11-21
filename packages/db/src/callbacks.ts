import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { DomainError } from './inventory';
import { callbackRequest } from './schema';

// The «Ti chiamiamo noi» requests of the manager showcase (D71): written by the
// public form, read and marked «called» by the platform administrator. Platform
// rows: no beach context ever sees them; who may read and mark is the API's
// check, on the platformRole of the session.

export interface NewCallbackRequest {
  name: string;
  phone: string;
  /** The beach club as the caller wrote it, free text; null when left out. */
  beachName?: string | null;
  locale: 'it' | 'en';
}

export interface CallbackRequestView {
  requestId: string;
  createdAt: Date;
  name: string;
  phone: string;
  beachName: string | null;
  locale: 'it' | 'en';
  status: 'new' | 'called';
  calledAt: Date | null;
}

const viewColumns = {
  requestId: callbackRequest.id,
  createdAt: callbackRequest.createdAt,
  name: callbackRequest.name,
  phone: callbackRequest.phone,
  beachName: callbackRequest.beachName,
  locale: callbackRequest.locale,
  status: callbackRequest.status,
  calledAt: callbackRequest.calledAt,
};

/** Records one request of the public form. The caller validates; the table checks the same limits. */
export async function createCallbackRequest(db: Database, request: NewCallbackRequest): Promise<{ requestId: string }> {
  const [created] = await db
    .insert(callbackRequest)
    .values({ name: request.name, phone: request.phone, beachName: request.beachName ?? null, locale: request.locale })
    .returning({ requestId: callbackRequest.id });
  return { requestId: created!.requestId };
}

/** The requests for the reserved list: the most recent first, at most 200 (spec §3). */
export function listCallbackRequests(db: Database): Promise<CallbackRequestView[]> {
  return db.select(viewColumns).from(callbackRequest).orderBy(desc(callbackRequest.createdAt), desc(callbackRequest.id)).limit(200);
}

/**
 * Marks a request «called». Idempotent: one already marked stays as it was,
 * called_at keeps the moment of the first marking.
 */
export async function markCallbackRequestCalled(db: Database, requestId: string): Promise<void> {
  const marked = await db
    .update(callbackRequest)
    .set({ status: 'called', calledAt: sql`coalesce(${callbackRequest.calledAt}, now())` })
    .where(eq(callbackRequest.id, requestId))
    .returning({ requestId: callbackRequest.id });
  if (marked.length === 0) throw new DomainError('not_found', 'Callback request not found');
}
