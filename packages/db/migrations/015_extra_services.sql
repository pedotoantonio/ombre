-- Extra services in the purchase flow (spec §4.2): the beach club sells towels,
-- safes, lessons… together with the spot, online and at the front desk. Extras
-- enter at the quote and hold level: the hold freezes the unit prices in its own
-- snapshot (hold_extra), copied to booking_extra at conversion. Money-wise the
-- extras belong entirely to the beach club: no platform fee, no seasonal share —
-- on a shared day the split starts from the spot price alone.

CREATE TABLE extra_service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  -- Italian name is required; English is optional and falls back to Italian,
  -- like the website contents.
  name_it text NOT NULL CHECK (length(name_it) BETWEEN 1 AND 80),
  name_en text CHECK (name_en IS NULL OR length(name_en) BETWEEN 1 AND 80),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  -- A used service is retired (active = false), never deleted: the snapshots
  -- keep pointing at it and the statements keep adding up.
  active boolean NOT NULL DEFAULT true,
  -- Display order chosen by the manager.
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, beach_id)
);

-- hold_extra needs a composite foreign key to hold; the unique pair did not exist yet.
ALTER TABLE hold ADD CONSTRAINT hold_id_beach_unique UNIQUE (id, beach_id);

-- Snapshot taken at the hold: quantity and unit price frozen at reservation time.
-- When a hold row is deleted the snapshot dies with it (ON DELETE CASCADE); an
-- expired hold keeps its rows, which commit nothing, exactly like the hold itself.
CREATE TABLE hold_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  hold_id uuid NOT NULL,
  service_id uuid NOT NULL,
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  FOREIGN KEY (hold_id, beach_id) REFERENCES hold (id, beach_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, beach_id) REFERENCES extra_service (id, beach_id),
  UNIQUE (hold_id, service_id)
);

-- Snapshot copied from hold_extra when the hold converts into a booking.
CREATE TABLE booking_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL,
  service_id uuid NOT NULL,
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, beach_id) REFERENCES extra_service (id, beach_id),
  UNIQUE (booking_id, service_id)
);

-- The totals grow a separate extras amount: list price and discount keep meaning
-- the spot alone (a convention or promotion never discounts the extras), while
-- total_cents becomes comprehensive: spot discounted price + extras.
ALTER TABLE hold ADD COLUMN extras_cents integer NOT NULL DEFAULT 0 CHECK (extras_cents >= 0);
ALTER TABLE booking ADD COLUMN extras_cents integer NOT NULL DEFAULT 0 CHECK (extras_cents >= 0);

DO $$
DECLARE
  old_check text;
BEGIN
  SELECT conname INTO old_check
  FROM pg_constraint
  WHERE conrelid = 'hold'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%total_cents = (list_price_cents - discount_cents)%';
  IF old_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hold DROP CONSTRAINT %I', old_check);
  END IF;
  SELECT conname INTO old_check
  FROM pg_constraint
  WHERE conrelid = 'booking'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%total_cents = (list_price_cents - discount_cents)%';
  IF old_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE booking DROP CONSTRAINT %I', old_check);
  END IF;
END;
$$;
ALTER TABLE hold ADD CONSTRAINT hold_total_includes_extras
  CHECK (total_cents = list_price_cents - discount_cents + extras_cents);
ALTER TABLE booking ADD CONSTRAINT booking_total_includes_extras
  CHECK (total_cents = list_price_cents - discount_cents + extras_cents);

-- A dedicated movement in the economic ledger: the extras of a sale, entirely of
-- the beach club, written in the same transaction as the sale.
DO $$
DECLARE
  old_check text;
BEGIN
  SELECT conname INTO old_check
  FROM pg_constraint
  WHERE conrelid = 'ledger_entry'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_received%';
  IF old_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ledger_entry DROP CONSTRAINT %I', old_check);
  END IF;
END;
$$;
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_kind_check
  CHECK (kind IN ('payment_received', 'allocation_expected', 'allocation_accrued', 'refund_due', 'adjustment', 'extras_revenue'));

-- The front desk day list and the pass verification read the extras per booking.
CREATE INDEX booking_extra_by_booking ON booking_extra (booking_id);

-- The catalogue is readable inside the public booking flow of the beach club
-- (the tenant policy already scopes it); writes come from the management routes.
ALTER TABLE extra_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE hold_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_extra ENABLE ROW LEVEL SECURITY;
CREATE POLICY extra_service_tenant ON extra_service TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY hold_extra_tenant ON hold_extra TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY booking_extra_tenant ON booking_extra TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
-- DELETE on extra_service only ever succeeds for a never-used service: the
-- foreign keys of the snapshots restrict it, and the application refuses first.
GRANT SELECT, INSERT, UPDATE, DELETE ON extra_service TO ombre_app;
GRANT SELECT, INSERT ON hold_extra, booking_extra TO ombre_app;
