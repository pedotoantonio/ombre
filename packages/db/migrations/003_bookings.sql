-- Bookings, payments, refunds, passes and access events.
-- Booking, payment and presence are separate states: paying is not entering.

CREATE TYPE booking_status AS ENUM ('draft', 'under_review', 'confirmed', 'cancelled', 'completed');
CREATE TYPE payment_status AS ENUM ('not_started', 'in_progress', 'succeeded', 'failed', 'under_review');
CREATE TYPE refund_status AS ENUM ('requested', 'in_progress', 'completed', 'failed');
CREATE TYPE presence_status AS ENUM ('expected', 'inside', 'outside_reentry_allowed', 'ended');
CREATE TYPE access_kind AS ENUM ('entry', 'exit');

CREATE TABLE booking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  inventory_day_id uuid NOT NULL,
  hold_id uuid NOT NULL UNIQUE REFERENCES hold (id),
  promotion_id uuid,
  code text NOT NULL,
  status booking_status NOT NULL DEFAULT 'draft',
  presence presence_status NOT NULL DEFAULT 'expected',
  guest_name text NOT NULL CHECK (length(guest_name) BETWEEN 1 AND 120),
  guest_email text NOT NULL CHECK (position('@' IN guest_email) > 1),
  list_price_cents integer NOT NULL CHECK (list_price_cents >= 0),
  discount_cents integer NOT NULL CHECK (discount_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  promo_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  FOREIGN KEY (inventory_day_id, beach_id) REFERENCES inventory_day (id, beach_id),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id),
  CHECK (total_cents = list_price_cents - discount_cents)
);
-- A day can carry at most one booking that is still alive.
CREATE UNIQUE INDEX booking_one_live_per_day ON booking (inventory_day_id) WHERE status IN ('under_review', 'confirmed', 'completed');

CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL,
  provider text NOT NULL,
  provider_ref text NOT NULL,
  status payment_status NOT NULL DEFAULT 'not_started',
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id),
  UNIQUE (provider, provider_ref),
  UNIQUE (id, beach_id)
);

CREATE TABLE refund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  payment_id uuid NOT NULL,
  status refund_status NOT NULL DEFAULT 'requested',
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (payment_id, beach_id) REFERENCES payment (id, beach_id)
);

-- Events received from payment providers, kept to recognise repeats.
CREATE TABLE provider_event (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE pass (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL UNIQUE,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id),
  UNIQUE (id, beach_id)
);

CREATE TABLE access_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL,
  kind access_kind NOT NULL,
  operator_user_id uuid NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id)
);

ALTER TABLE booking ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_tenant ON booking TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY payment_tenant ON payment TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY refund_tenant ON refund TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY pass_tenant ON pass TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY access_event_tenant ON access_event TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
-- Event identifiers carry no customer data and arrive before the beach club is known.
CREATE POLICY provider_event_all ON provider_event TO ombre_app USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON booking, payment, refund, pass TO ombre_app;
GRANT SELECT, INSERT ON access_event, provider_event TO ombre_app;

-- A provider notification names a payment, not a beach club: this finds the beach club.
CREATE FUNCTION payment_beach(p_provider text, p_reference text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT beach_id FROM payment WHERE provider = p_provider AND provider_ref = p_reference $$;
REVOKE ALL ON FUNCTION payment_beach(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_beach(text, text) TO ombre_app;
