-- Ombrè, first migration: beach clubs, spots, the authoritative inventory row,
-- holds and promotions, with row level security per beach club.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ombre_app') THEN
    CREATE ROLE ombre_app NOLOGIN;
  END IF;
END
$$;

CREATE TYPE beach_status AS ENUM ('draft', 'active', 'suspended');
CREATE TYPE inventory_state AS ENUM ('unpublishable', 'available', 'held', 'occupied', 'blocked');
CREATE TYPE hold_status AS ENUM ('active', 'released', 'expired', 'converted');

-- The beach club the current transaction works for. Empty or missing means none.
CREATE FUNCTION app_beach_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.beach_id', true), '')::uuid $$;

CREATE TABLE beach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  locality text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Rome',
  status beach_status NOT NULL DEFAULT 'draft',
  demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  code text NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  umbrellas smallint NOT NULL DEFAULT 1 CHECK (umbrellas >= 0),
  sunbeds smallint NOT NULL DEFAULT 2 CHECK (sunbeds >= 0),
  max_guests smallint NOT NULL DEFAULT 2 CHECK (max_guests > 0),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id)
);

CREATE TABLE promotion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  code text NOT NULL CHECK (code = upper(code)),
  percent_bps integer NOT NULL CHECK (percent_bps BETWEEN 1 AND 10000),
  active boolean NOT NULL DEFAULT true,
  max_uses integer CHECK (max_uses IS NULL OR max_uses >= 0),
  -- Uses committed by active holds and confirmed bookings together.
  committed_uses integer NOT NULL DEFAULT 0 CHECK (committed_uses >= 0),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id),
  CHECK (max_uses IS NULL OR committed_uses <= max_uses)
);

-- One row per beach club, spot and day: the only source of truth for occupancy.
CREATE TABLE inventory_day (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  spot_id uuid NOT NULL,
  day date NOT NULL,
  state inventory_state NOT NULL DEFAULT 'unpublishable',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  shared boolean NOT NULL DEFAULT false,
  active_hold_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (spot_id, beach_id) REFERENCES spot (id, beach_id),
  UNIQUE (beach_id, spot_id, day),
  UNIQUE (id, beach_id),
  CHECK ((state = 'held') = (active_hold_id IS NOT NULL))
);

CREATE TABLE hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  inventory_day_id uuid NOT NULL,
  promotion_id uuid,
  status hold_status NOT NULL DEFAULT 'active',
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL,
  list_price_cents integer NOT NULL CHECK (list_price_cents >= 0),
  discount_cents integer NOT NULL CHECK (discount_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  promo_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (inventory_day_id, beach_id) REFERENCES inventory_day (id, beach_id),
  FOREIGN KEY (promotion_id, beach_id) REFERENCES promotion (id, beach_id),
  UNIQUE (beach_id, idempotency_key),
  CHECK (total_cents = list_price_cents - discount_cents),
  CHECK ((promotion_id IS NULL) = (promo_code IS NULL))
);

ALTER TABLE inventory_day
  ADD CONSTRAINT inventory_day_active_hold_fk FOREIGN KEY (active_hold_id) REFERENCES hold (id);

CREATE INDEX inventory_day_lookup ON inventory_day (beach_id, day, state);
CREATE INDEX hold_expiry ON hold (beach_id, expires_at) WHERE status = 'active';

-- Row level security: the application role only sees the beach club set for the transaction.
ALTER TABLE beach ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE hold ENABLE ROW LEVEL SECURITY;

CREATE POLICY beach_visible ON beach FOR SELECT TO ombre_app
  USING (status = 'active' OR id = app_beach_id());
CREATE POLICY spot_tenant ON spot TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY promotion_tenant ON promotion TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY inventory_day_tenant ON inventory_day TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY hold_tenant ON hold TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

GRANT USAGE ON SCHEMA public TO ombre_app;
GRANT SELECT ON beach, spot TO ombre_app;
GRANT SELECT, UPDATE ON promotion, inventory_day TO ombre_app;
GRANT SELECT, INSERT, UPDATE ON hold TO ombre_app;
