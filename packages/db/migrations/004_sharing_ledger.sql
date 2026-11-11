-- Season passes, shared days proposed by their holders, and the money trail:
-- split rules, allocations per booking and an append-only ledger.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE contract_status AS ENUM ('active', 'suspended', 'ended');
CREATE TYPE sharing_mode AS ENUM ('per_day', 'automatic');
CREATE TYPE proposal_status AS ENUM ('proposed', 'approved', 'rejected', 'withdrawn');
CREATE TYPE party AS ENUM ('season_holder', 'beach_club', 'platform');
CREATE TYPE allocation_state AS ENUM ('expected', 'accrued', 'suspended', 'settling', 'settled', 'adjusted');

ALTER TABLE beach
  ADD COLUMN daily_shared_cap integer CHECK (daily_shared_cap IS NULL OR daily_shared_cap >= 0),
  ADD COLUMN shared_price_cents integer CHECK (shared_price_cents IS NULL OR shared_price_cents >= 0);

CREATE TABLE season_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  holder_user_id uuid NOT NULL REFERENCES app_user (id),
  spot_id uuid NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  status contract_status NOT NULL DEFAULT 'active',
  sharing_mode sharing_mode NOT NULL DEFAULT 'per_day',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (spot_id, beach_id) REFERENCES spot (id, beach_id),
  UNIQUE (id, beach_id),
  CHECK (valid_from <= valid_to),
  -- A spot cannot belong to two season passes on the same day.
  EXCLUDE USING gist (spot_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&) WHERE (status <> 'ended')
);

CREATE TABLE availability_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  contract_id uuid NOT NULL,
  day date NOT NULL,
  status proposal_status NOT NULL DEFAULT 'proposed',
  decided_by uuid REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  FOREIGN KEY (contract_id, beach_id) REFERENCES season_contract (id, beach_id),
  UNIQUE (contract_id, day)
);
CREATE INDEX availability_proposal_day ON availability_proposal (beach_id, day, status);

ALTER TABLE inventory_day ADD COLUMN contract_id uuid REFERENCES season_contract (id);
ALTER TABLE inventory_day ADD CONSTRAINT inventory_day_shared_has_contract CHECK (shared = (contract_id IS NOT NULL));

-- Percentages applied to new bookings. A new row replaces the previous one; none is edited.
CREATE TABLE split_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  season_holder_bps integer NOT NULL CHECK (season_holder_bps BETWEEN 0 AND 10000),
  beach_club_bps integer NOT NULL CHECK (beach_club_bps BETWEEN 0 AND 10000),
  platform_bps integer NOT NULL CHECK (platform_bps BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (season_holder_bps + beach_club_bps + platform_bps = 10000)
);

CREATE TABLE allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL,
  party party NOT NULL,
  beneficiary_user_id uuid REFERENCES app_user (id),
  bps integer NOT NULL CHECK (bps BETWEEN 0 AND 10000),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  state allocation_state NOT NULL DEFAULT 'expected',
  split_rule_id uuid REFERENCES split_rule (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id),
  UNIQUE (booking_id, party),
  CHECK ((party = 'season_holder') = (beneficiary_user_id IS NOT NULL))
);

CREATE TABLE ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('payment_received', 'allocation_expected', 'allocation_accrued', 'refund_due', 'adjustment')),
  party party,
  amount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id)
);
CREATE INDEX ledger_entry_booking ON ledger_entry (booking_id);

-- The ledger only grows: a mistake is corrected with a new entry, never by editing an old one.
CREATE FUNCTION ledger_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries cannot be changed or deleted';
END
$$;
CREATE TRIGGER ledger_entry_append_only BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION ledger_is_append_only();

ALTER TABLE season_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_tenant ON season_contract TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
-- A holder finds their own season passes before any beach club is chosen.
CREATE POLICY contract_holder ON season_contract FOR SELECT TO ombre_app USING (holder_user_id = app_user_id());
CREATE POLICY beach_holder ON beach FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM season_contract c WHERE c.beach_id = beach.id AND c.holder_user_id = app_user_id()));
CREATE POLICY proposal_tenant ON availability_proposal TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY split_rule_tenant ON split_rule FOR SELECT TO ombre_app USING (beach_id = app_beach_id());
CREATE POLICY allocation_tenant ON allocation TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY ledger_tenant ON ledger_entry TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

GRANT SELECT, INSERT, UPDATE ON season_contract, availability_proposal, allocation TO ombre_app;
GRANT SELECT ON split_rule TO ombre_app;
GRANT SELECT, INSERT ON ledger_entry TO ombre_app;
GRANT UPDATE (daily_shared_cap, shared_price_cents) ON beach TO ombre_app;
CREATE POLICY beach_settings ON beach FOR UPDATE TO ombre_app USING (id = app_beach_id()) WITH CHECK (id = app_beach_id());

-- Lets a manager add a season pass for a person who already has an account.
CREATE FUNCTION user_id_by_email(p_email text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT id FROM app_user WHERE email = lower(p_email) AND NOT disabled $$;
REVOKE ALL ON FUNCTION user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_id_by_email(text) TO ombre_app;
