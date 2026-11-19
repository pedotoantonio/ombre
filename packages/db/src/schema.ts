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
  seaSide: text('sea_side', { enum: ['top', 'bottom'] }).notNull().default('top'),
  /** «Caparra adesso, saldo al lido» (D52): with `deposit`, the online payment is the deposit. */
  paymentMode: text('payment_mode', { enum: ['full', 'deposit'] }).notNull().default('full'),
  depositPercent: integer('deposit_percent').notNull().default(30),
  /** Cancellation terms (D53): hours before midnight of the arrival day, in the club's zone. */
  cancelDeadlineHours: integer('cancel_deadline_hours').notNull().default(48),
  cancelPolicyIt: text('cancel_policy_it'),
  cancelPolicyEn: text('cancel_policy_en'),
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
  // Under maintenance (D56): not bookable while true, stays in the drawing,
  // bookings already taken remain. Distinct from the retirement from sale.
  maintenance: boolean('maintenance').notNull().default(false),
  // Filled by a trigger when left out: the next free column of the row.
  col: smallint('col').notNull(),
  // Filled by a trigger when left out: the builtin type of the zone.
  typeId: uuid('type_id').notNull(),
  // The named zone of the manager (D50); NULL when the spot belongs to none.
  namedZoneId: uuid('named_zone_id'),
});

/** One row per amenity chosen from the fixed catalogue (D49). */
export const beachAmenity = pgTable('beach_amenity', {
  beachId: uuid('beach_id').notNull(),
  amenity: text('amenity').notNull(),
});

/** A named zone of the layout (D50): a proper noun, identical in both languages. */
export const beachZone = pgTable('beach_zone', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const spotType = pgTable('spot_type', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  name: text('name').notNull(),
  mark: text('mark', { enum: ['umbrella', 'sunbed', 'gazebo', 'tent', 'daybed', 'deckchair', 'canopy', 'canoe', 'sup', 'pedalo', 'jetski'] }).notNull(),
  umbrellas: smallint('umbrellas').notNull().default(1),
  sunbeds: smallint('sunbeds').notNull().default(2),
  maxGuests: smallint('max_guests').notNull().default(2),
  defaultPriceCents: integer('default_price_cents'),
  builtin: boolean('builtin').notNull().default(false),
});

export const layoutElement = pgTable('layout_element', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  kind: text('kind', { enum: ['walkway', 'cabin_block', 'structure', 'decoration'] }).notNull(),
  label: text('label'),
  orientation: text('orientation', { enum: ['horizontal', 'vertical'] }),
  zone: text('zone', { enum: ['riva', 'ombrelloni', 'monte'] }),
  rowAfter: smallint('row_after'),
  rowNumber: integer('row_number'),
  colStart: smallint('col_start'),
  colEnd: smallint('col_end'),
  // Only a decoration carries a sign, always, from the fixed repertoire (D35).
  sign: text('sign', {
    enum: ['palma', 'chiosco', 'doccia', 'bandiera', 'salvagente', 'cartello', 'cestino', 'amaca', 'altalena', 'giochi', 'tavolino', 'grill', 'acqua', 'armadietti', 'campo', 'pingpong'],
  }),
});

/**
 * The planner's draft (D57): one per beach club, an ordered list of operations
 * in JSON, with the author and time of the last touch. Applied in ONE
 * transaction by «Salva la spiaggia»; availability, search and the desk never
 * read it.
 */
export const layoutDraft = pgTable('layout_draft', {
  beachId: uuid('beach_id').primaryKey(),
  ops: jsonb('ops').notNull().default([]),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cabin = pgTable('cabin', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  code: text('code').notNull(),
  elementId: uuid('element_id'),
  notes: text('notes'),
});

export const cabinAssignment = pgTable('cabin_assignment', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  cabinId: uuid('cabin_id').notNull(),
  holderAccountId: uuid('holder_account_id'),
  holderName: text('holder_name'),
  holderContact: text('holder_contact'),
  validFrom: date('valid_from', { mode: 'string' }).notNull(),
  validTo: date('valid_to', { mode: 'string' }).notNull(),
  status: text('status', { enum: ['active', 'ended'] }).notNull().default('active'),
});

export const cabinSublet = pgTable('cabin_sublet', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  fromDay: date('from_day', { mode: 'string' }).notNull(),
  toDay: date('to_day', { mode: 'string' }).notNull(),
  occupantName: text('occupant_name').notNull(),
  occupantContact: text('occupant_contact'),
  status: text('status', { enum: ['proposed', 'approved', 'rejected', 'ended'] }).notNull().default('proposed'),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
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

export const hotelConvention = pgTable('hotel_convention', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  partnerName: text('partner_name').notNull(),
  code: text('code').notNull(),
  // Exactly one of the two pricings, enforced by a database CHECK.
  percentBps: integer('percent_bps'),
  fixedPriceCents: integer('fixed_price_cents'),
  // Compared with the booked day, not with the purchase date.
  validFrom: date('valid_from', { mode: 'string' }),
  validTo: date('valid_to', { mode: 'string' }),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
});

// Extra services sold with the spot (spec §4.2). English name is optional and
// falls back to the Italian one; a used service is retired, never deleted.
export const extraService = pgTable('extra_service', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  nameIt: text('name_it').notNull(),
  nameEn: text('name_en'),
  unitPriceCents: integer('unit_price_cents').notNull(),
  active: boolean('active').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Snapshot frozen at the hold: dies with the hold (FK ON DELETE CASCADE). */
export const holdExtra = pgTable('hold_extra', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  holdId: uuid('hold_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  quantity: smallint('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
});

/**
 * Snapshot copied from hold_extra when the hold converts into a booking group.
 * Extras are chosen once per period and belong to the group (D38); bookingId
 * points at the first day, with which they accrue in the ledger.
 */
export const bookingExtra = pgTable('booking_extra', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  groupId: uuid('group_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  quantity: smallint('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
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
  /** A period reserve (D39) is a family of holds with one expiry: the first day leads, the others name it. */
  parentHoldId: uuid('parent_hold_id'),
  promotionId: uuid('promotion_id'),
  conventionId: uuid('convention_id'),
  status: holdStatus('status').notNull().default('active'),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  listPriceCents: integer('list_price_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  // Sum of the hold_extra snapshot; total_cents = list - discount + extras.
  extrasCents: integer('extras_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  promoCode: text('promo_code'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const membershipRole = pgEnum('membership_role', ['manager', 'reception', 'accounting', 'cabin_holder']);

export const membership = pgTable('membership', {
  userId: uuid('user_id').notNull(),
  beachId: uuid('beach_id').notNull(),
  role: membershipRole('role').notNull(),
});

export const auditEvent = pgTable('audit_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** NULL for platform events (D45): account actions belong to no beach club. */
  beachId: uuid('beach_id'),
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

/**
 * A booking group (D38): one spot over consecutive days, with one code, one
 * pass and one total. Every booking belongs to a group; the single day is a
 * group of one. The code lives here, unique per beach club.
 */
export const bookingGroup = pgTable('booking_group', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  code: text('code').notNull(),
  /** The account that owns the stay (D47); filled by account_relink or at a signed-in purchase. */
  userId: uuid('user_id'),
  /** The order this group was born from (D46); NULL for the quick purchase and the desk. */
  orderId: uuid('order_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A server-side cart (D46): one beach club, at most ten items, no reserve. */
export const cart = pgTable('cart', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  /** NULL while the cart lives behind the signed ticket alone; set at the claim. */
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItem = pgTable('cart_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  cartId: uuid('cart_id').notNull(),
  spotId: uuid('spot_id').notNull(),
  dayFrom: date('day_from', { mode: 'string' }).notNull(),
  dayTo: date('day_to', { mode: 'string' }).notNull(),
  /** «Per chi è»: free text, empty means the orderer (D46). */
  guestName: text('guest_name').notNull().default(''),
  promoCode: text('promo_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItemExtra = pgTable('cart_item_extra', {
  id: uuid('id').primaryKey().defaultRandom(),
  cartItemId: uuid('cart_item_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  quantity: smallint('quantity').notNull(),
});

/** The order (D46): one booking group per cart item, one payment on the whole. */
export const orderGroup = pgTable('order_group', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  code: text('code').notNull(),
  guestName: text('guest_name').notNull(),
  guestEmail: text('guest_email').notNull(),
  userId: uuid('user_id'),
  locale: text('locale').notNull().default('it'),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const booking = pgTable('booking', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  inventoryDayId: uuid('inventory_day_id').notNull(),
  holdId: uuid('hold_id').notNull(),
  /** The group this one-day booking belongs to (D38). */
  groupId: uuid('group_id').notNull(),
  promotionId: uuid('promotion_id'),
  conventionId: uuid('convention_id'),
  code: text('code').notNull(),
  status: bookingStatus('status').notNull().default('draft'),
  presence: presenceStatus('presence').notNull().default('expected'),
  guestName: text('guest_name').notNull(),
  guestEmail: text('guest_email'),
  guestPhone: text('guest_phone'),
  source: text('source').notNull().default('online'),
  listPriceCents: integer('list_price_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  // Sum of the booking_extra snapshot; total_cents = list - discount + extras.
  extrasCents: integer('extras_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  promoCode: text('promo_code'),
  locale: text('locale').notNull().default('it'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  /** First day of the group, for the ledger; NULL only for an order payment (D46). */
  bookingId: uuid('booking_id'),
  /** The payment belongs to the group (D31 at group level, D38) or to the order (D46). */
  groupId: uuid('group_id'),
  /** Set exactly for an order payment: the order it settles (D46). */
  orderId: uuid('order_id'),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  status: paymentStatus('status').notNull().default('not_started'),
  amountCents: integer('amount_cents').notNull(),
  /** Routes the provider outcome (D31): a `request` payment never confirms or cancels. */
  purpose: text('purpose', { enum: ['checkout', 'desk', 'request'] }).notNull(),
  /** Set exactly when purpose is `request`: the payment request it settles. */
  requestId: uuid('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A payment request (deposit or balance, spec §4.3). The public token is never
 * stored: it is derived from the identifier with the signing secret, like passes.
 */
export const paymentRequest = pgTable('payment_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  /** The request asks for (part of) the residual of the group (D31, D38). */
  groupId: uuid('group_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status', { enum: ['pending', 'paid', 'expired', 'cancelled'] }).notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  note: text('note'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
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
  /** First day of the group; the pass itself is the group's (D38). */
  bookingId: uuid('booking_id').notNull(),
  groupId: uuid('group_id').notNull(),
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
  /** NULL for platform work (D45): the account mails belong to no beach club. */
  beachId: uuid('beach_id'),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
});

export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** NULL for platform notifications (D45), invisible to every beach-scoped listing. */
  beachId: uuid('beach_id'),
  bookingId: uuid('booking_id'),
  template: text('template').notNull(),
  locale: text('locale').notNull(),
  recipient: text('recipient').notNull(),
  /** `queued` is a composed message waiting for a real provider (spec §4.3). */
  status: text('status', { enum: ['queued', 'sent', 'skipped'] }).notNull(),
  provider: text('provider').notNull(),
  /** Full text of the message, to copy by hand until a provider exists. */
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A verified review (D51): one per stay (booking_group_id UNIQUE), written by
 * the account that owns the group. Flagged ones stay visible, with the reply.
 */
export const review = pgTable('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  beachId: uuid('beach_id').notNull(),
  bookingGroupId: uuid('booking_group_id').notNull(),
  userId: uuid('user_id').notNull(),
  rating: integer('rating').notNull(),
  body: text('body'),
  status: text('status', { enum: ['published', 'flagged'] }).notNull().default('published'),
  flagReason: text('flag_reason'),
  flaggedAt: timestamp('flagged_at', { withTimezone: true }),
  reply: text('reply'),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
