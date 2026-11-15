import { boolean, date, doublePrecision, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Typed view of the tables created by the SQL files in ../migrations, which stay the source of truth.

export const beachStatus = pgEnum('beach_status', ['draft', 'active', 'suspended']);
export const inventoryState = pgEnum('inventory_state', ['unpublishable', 'available', 'held', 'occupied', 'blocked']);
export const holdStatus = pgEnum('hold_status', ['active', 'released', 'expired', 'converted']);

export const beach = pgTable('beach', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  locality: text('locality').notNull(),
  timezone: text('timezone').notNull().default('Europe/Rome'),
  status: beachStatus('status').notNull().default('draft'),
  demo: boolean('demo').notNull().default(false),
  dailySharedCap: integer('daily_shared_cap'),
  sharedPriceCents: integer('shared_price_cents'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  shoreGapRows: smallint('shore_gap_rows').notNull().default(1),
  landGapRows: smallint('land_gap_rows').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const spot = pgTable('spot', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  code: text('code').notNull(),
  rowNumber: integer('row_number').notNull(),
  umbrellas: smallint('umbrellas').notNull().default(1),
  sunbeds: smallint('sunbeds').notNull().default(2),
  maxGuests: smallint('max_guests').notNull().default(2),
  zone: text('zone', { enum: ['riva', 'ombrelloni', 'monte'] }).notNull().default('ombrelloni'),
  rentalType: text('rental_type'),
  rentalNotes: text('rental_notes'),
  retired: boolean('retired').notNull().default(false),
});

export const promotion = pgTable('promotion', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  code: text('code').notNull(),
  percentBps: integer('percent_bps').notNull(),
  active: boolean('active').notNull().default(true),
  maxUses: integer('max_uses'),
  committedUses: integer('committed_uses').notNull().default(0),
});

export const inventoryDay = pgTable('inventory_day', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  spotId: uuid('spot_id').notNull(),
  day: date('day', { mode: 'string' }).notNull(),
  state: inventoryState('state').notNull().default('unpublishable'),
  priceCents: integer('price_cents').notNull(),
  shared: boolean('shared').notNull().default(false),
  activeHoldId: uuid('active_hold_id'),
  contractId: uuid('contract_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hold = pgTable('hold', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  inventoryDayId: uuid('inventory_day_id').notNull(),
  promotionId: uuid('promotion_id'),
  status: holdStatus('status').notNull().default('active'),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  listPriceCents: integer('list_price_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  promoCode: text('promo_code'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const membershipRole = pgEnum('membership_role', ['manager', 'reception', 'accounting']);

export const membership = pgTable('membership', {
  userId: uuid('user_id').notNull(),
  beachId: uuid('beach_id').notNull(),
  role: membershipRole('role').notNull(),
});

export const auditEvent = pgTable('audit_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookingStatus = pgEnum('booking_status', ['draft', 'under_review', 'confirmed', 'cancelled', 'completed']);
export const paymentStatus = pgEnum('payment_status', ['not_started', 'in_progress', 'succeeded', 'failed', 'under_review']);
export const refundStatus = pgEnum('refund_status', ['requested', 'in_progress', 'completed', 'failed']);
export const presenceStatus = pgEnum('presence_status', ['expected', 'inside', 'outside_reentry_allowed', 'ended']);
export const accessKind = pgEnum('access_kind', ['entry', 'exit']);

export const booking = pgTable('booking', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  inventoryDayId: uuid('inventory_day_id').notNull(),
  holdId: uuid('hold_id').notNull(),
  promotionId: uuid('promotion_id'),
  code: text('code').notNull(),
  status: bookingStatus('status').notNull().default('draft'),
  presence: presenceStatus('presence').notNull().default('expected'),
  guestName: text('guest_name').notNull(),
  guestEmail: text('guest_email'),
  source: text('source').notNull().default('online'),
  listPriceCents: integer('list_price_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  promoCode: text('promo_code'),
  locale: text('locale').notNull().default('it'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  status: paymentStatus('status').notNull().default('not_started'),
  amountCents: integer('amount_cents').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refund = pgTable('refund', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  paymentId: uuid('payment_id').notNull(),
  status: refundStatus('status').notNull().default('requested'),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull(),
});

export const providerEvent = pgTable('provider_event', {
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
});

export const pass = pgTable('pass', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  revoked: boolean('revoked').notNull().default(false),
});

export const accessEvent = pgTable('access_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  kind: accessKind('kind').notNull(),
  operatorUserId: uuid('operator_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contractStatus = pgEnum('contract_status', ['active', 'suspended', 'ended']);
export const sharingMode = pgEnum('sharing_mode', ['per_day', 'automatic']);
export const proposalStatus = pgEnum('proposal_status', ['proposed', 'approved', 'rejected', 'withdrawn']);
export const partyKind = pgEnum('party', ['season_holder', 'beach_club', 'platform']);
export const allocationState = pgEnum('allocation_state', ['expected', 'accrued', 'suspended', 'settling', 'settled', 'adjusted']);

export const seasonContract = pgTable('season_contract', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  holderUserId: uuid('holder_user_id').notNull(),
  spotId: uuid('spot_id').notNull(),
  validFrom: date('valid_from', { mode: 'string' }).notNull(),
  validTo: date('valid_to', { mode: 'string' }).notNull(),
  status: contractStatus('status').notNull().default('active'),
  sharingMode: sharingMode('sharing_mode').notNull().default('per_day'),
});

export const availabilityProposal = pgTable('availability_proposal', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  contractId: uuid('contract_id').notNull(),
  day: date('day', { mode: 'string' }).notNull(),
  status: proposalStatus('status').notNull().default('proposed'),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const splitRule = pgTable('split_rule', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  seasonHolderBps: integer('season_holder_bps').notNull(),
  beachClubBps: integer('beach_club_bps').notNull(),
  platformBps: integer('platform_bps').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const allocation = pgTable('allocation', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  party: partyKind('party').notNull(),
  beneficiaryUserId: uuid('beneficiary_user_id'),
  bps: integer('bps').notNull(),
  amountCents: integer('amount_cents').notNull(),
  state: allocationState('state').notNull().default('expected'),
  splitRuleId: uuid('split_rule_id'),
});

export const ledgerEntry = pgTable('ledger_entry', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  kind: text('kind').notNull(),
  party: partyKind('party'),
  amountCents: integer('amount_cents').notNull(),
});

export const outbox = pgTable('outbox', {
  beachId: uuid('beach_id').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
});

export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id'),
  template: text('template').notNull(),
  locale: text('locale').notNull(),
  recipient: text('recipient').notNull(),
  status: text('status').notNull(),
  provider: text('provider').notNull(),
});

export const siteTemplate = pgEnum('site_template', ['riviera', 'boutique', 'essential']);
export const revisionStatus = pgEnum('revision_status', ['draft', 'published', 'archived']);

export const siteRevision = pgTable('site_revision', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  number: integer('number').notNull(),
  status: revisionStatus('status').notNull().default('draft'),
  template: siteTemplate('template').notNull(),
  content: jsonb('content').notNull(),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});
