-- Hotel conventions (spec §4.1, decision D30): partner structures send guests with a
-- code and an agreed price. The guest pays the agreed price (a percent discount or a
-- fixed price per day, never above the list price); the statement per structure is
-- informative only and the ordinary split applies to the discounted total.

CREATE TABLE hotel_convention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  partner_name text NOT NULL CHECK (length(partner_name) BETWEEN 1 AND 120),
  -- Normalized like promotion codes: upper case, no spaces.
  code text NOT NULL CHECK (code = upper(code) AND code !~ '\s' AND length(code) BETWEEN 1 AND 40),
  -- Exactly one of the two pricings: a percent discount or a fixed price per day.
  percent_bps integer CHECK (percent_bps BETWEEN 1 AND 10000),
  fixed_price_cents integer CHECK (fixed_price_cents >= 0),
  -- Optional validity window, compared with the BOOKED day, not the purchase date.
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  notes text CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id),
  CHECK ((percent_bps IS NULL) <> (fixed_price_cents IS NULL)),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

-- One text, one meaning: a code lives in a single registry per beach club. A new
-- convention must not reuse a promotion code and vice versa, whoever writes the row.
-- Both triggers take the same advisory lock, so two concurrent inserts of the same
-- code on the two tables are serialized and one of them fails.
CREATE FUNCTION convention_code_is_free() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.beach_id::text || '/' || NEW.code, 14));
  IF EXISTS (SELECT 1 FROM promotion p WHERE p.beach_id = NEW.beach_id AND p.code = NEW.code) THEN
    RAISE EXCEPTION 'code % already names a promotion of this beach club', NEW.code USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION promotion_code_is_free() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.beach_id::text || '/' || NEW.code, 14));
  IF EXISTS (SELECT 1 FROM hotel_convention h WHERE h.beach_id = NEW.beach_id AND h.code = NEW.code) THEN
    RAISE EXCEPTION 'code % already names a convention of this beach club', NEW.code USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER convention_code_single_registry
  BEFORE INSERT OR UPDATE OF code, beach_id ON hotel_convention
  FOR EACH ROW EXECUTE FUNCTION convention_code_is_free();
CREATE TRIGGER promotion_code_single_registry
  BEFORE INSERT OR UPDATE OF code, beach_id ON promotion
  FOR EACH ROW EXECUTE FUNCTION promotion_code_is_free();

-- The hold freezes the convention like it freezes a promotion, and the booking copies
-- it at conversion. A purchase carries one code: promotion and convention never mix.
ALTER TABLE hold ADD COLUMN convention_id uuid;
ALTER TABLE hold ADD CONSTRAINT hold_convention_fk FOREIGN KEY (convention_id, beach_id) REFERENCES hotel_convention (id, beach_id);
ALTER TABLE hold ADD CONSTRAINT hold_single_code CHECK (promotion_id IS NULL OR convention_id IS NULL);
-- The old rule tied promo_code to the promotion alone; now it names either registry.
DO $$
DECLARE
  old_check text;
BEGIN
  SELECT conname INTO old_check
  FROM pg_constraint
  WHERE conrelid = 'hold'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%promotion_id IS NULL%promo_code IS NULL%';
  IF old_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hold DROP CONSTRAINT %I', old_check);
  END IF;
END;
$$;
ALTER TABLE hold ADD CONSTRAINT hold_code_names_registry
  CHECK ((promotion_id IS NOT NULL OR convention_id IS NOT NULL) = (promo_code IS NOT NULL));

ALTER TABLE booking ADD COLUMN convention_id uuid;
ALTER TABLE booking ADD CONSTRAINT booking_convention_fk FOREIGN KEY (convention_id, beach_id) REFERENCES hotel_convention (id, beach_id);
ALTER TABLE booking ADD CONSTRAINT booking_single_code CHECK (promotion_id IS NULL OR convention_id IS NULL);
-- The statement per structure reads bookings by convention and period.
CREATE INDEX booking_convention ON booking (convention_id) WHERE convention_id IS NOT NULL;

-- Management data, never public: same RLS and grants as the other management tables.
-- DELETE is granted but a used convention cannot go away: the foreign keys above
-- restrict it, and the application refuses with a clear message first.
ALTER TABLE hotel_convention ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_convention_tenant ON hotel_convention TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_convention TO ombre_app;
