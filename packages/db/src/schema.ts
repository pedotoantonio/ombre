import { boolean, date, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
