-- «Al passo con il mercato» (D51, D52, D53): verified guest reviews, the deposit
-- («caparra adesso, saldo al lido») and the cancellation terms of the beach club.

-- One review per stay (D51): the booking group is UNIQUE, the author is the
-- account that owns the group. The manager may flag it once, with a written
-- reason, and reply; a flagged review stays visible until the platform decides
-- (platform console deferred).
CREATE TABLE review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_group_id uuid NOT NULL UNIQUE REFERENCES booking_group (id),
  user_id uuid NOT NULL REFERENCES app_user (id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text CHECK (length(body) <= 600),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'flagged')),
  flag_reason text CHECK (length(flag_reason) <= 200),
  flagged_at timestamptz,
  reply text CHECK (length(reply) <= 600),
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_by_beach ON review (beach_id, created_at DESC);

-- The deposit (D52) and the cancellation terms (D53), per beach club. The
-- percent only matters with payment_mode = 'deposit'; the policy texts are
-- optional, empty means the platform default of the dictionaries.
ALTER TABLE beach
  ADD COLUMN payment_mode text NOT NULL DEFAULT 'full' CHECK (payment_mode IN ('full', 'deposit')),
  ADD COLUMN deposit_percent integer NOT NULL DEFAULT 30 CHECK (deposit_percent BETWEEN 10 AND 90),
  ADD COLUMN cancel_deadline_hours integer NOT NULL DEFAULT 48 CHECK (cancel_deadline_hours BETWEEN 0 AND 336),
  ADD COLUMN cancel_policy_it text CHECK (length(cancel_policy_it) <= 600),
  ADD COLUMN cancel_policy_en text CHECK (length(cancel_policy_en) <= 600);

-- Row level security. Reading is public for active beach clubs (the cards show
-- the average, the scheda the list, flagged ones stay visible) and tenant inside
-- the beach context. Writing: the INSERT belongs to the owner of the group alone
-- (app.user_id, like the owner policies of 019/020); flag and reply are an
-- UPDATE inside the beach context, limited to the moderation columns.
ALTER TABLE review ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_public ON review FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM beach b WHERE b.id = review.beach_id AND b.status = 'active'));
CREATE POLICY review_tenant_read ON review FOR SELECT TO ombre_app
  USING (beach_id = app_beach_id());
CREATE POLICY review_owner_insert ON review FOR INSERT TO ombre_app
  WITH CHECK (user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM booking_group g
    WHERE g.id = review.booking_group_id AND g.user_id = app_user_id() AND g.beach_id = review.beach_id));
CREATE POLICY review_tenant_update ON review FOR UPDATE TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

GRANT SELECT, INSERT ON review TO ombre_app;
GRANT UPDATE (status, flag_reason, flagged_at, reply, replied_at) ON review TO ombre_app;

-- The settings panel of the manager writes the new beach columns (like 004/009/011).
GRANT UPDATE (payment_mode, deposit_percent, cancel_deadline_hours, cancel_policy_it, cancel_policy_en) ON beach TO ombre_app;

-- Platform audit rows written by the application role (the review of the owner,
-- D51): until now only the SECURITY DEFINER functions of 019 wrote them.
CREATE POLICY audit_platform_write ON audit_event FOR INSERT TO ombre_app
  WITH CHECK (beach_id IS NULL AND actor_user_id = app_user_id());

-- The public review list shows the name of the account, never the email (D51).
-- app_user has no grant: this hands out exactly one author name per review.
CREATE FUNCTION review_author_name(p_review uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT u.name FROM review r JOIN app_user u ON u.id = r.user_id WHERE r.id = p_review $$;
REVOKE ALL ON FUNCTION review_author_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_author_name(uuid) TO ombre_app;
