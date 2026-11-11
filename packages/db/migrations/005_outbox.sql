-- Work that must happen after a change is saved: the change and its outbox row are
-- written in the same transaction, so a notification is never lost nor sent for nothing.

ALTER TABLE booking ADD COLUMN locale text NOT NULL DEFAULT 'it' CHECK (locale IN ('it', 'en'));

CREATE TABLE outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  beach_id uuid NOT NULL REFERENCES beach (id),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text
);
CREATE INDEX outbox_pending ON outbox (available_at) WHERE processed_at IS NULL AND failed_at IS NULL;

CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid,
  template text NOT NULL,
  locale text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'skipped')),
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id)
);

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
-- The application can only add work for the beach club it is serving; reading the queue
-- goes through the worker functions below.
CREATE POLICY outbox_write ON outbox FOR INSERT TO ombre_app WITH CHECK (beach_id = app_beach_id());
CREATE POLICY notification_tenant ON notification TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
GRANT INSERT ON outbox TO ombre_app;
GRANT SELECT, INSERT ON notification TO ombre_app;

-- Takes a batch of pending work. A taken row comes back by itself after a while if the
-- worker dies before finishing it: the wait grows with each attempt.
CREATE FUNCTION worker_claim_outbox(p_limit integer)
  RETURNS TABLE (o_id bigint, o_beach_id uuid, o_kind text, o_payload jsonb, o_attempts integer)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  UPDATE outbox o
    SET attempts = o.attempts + 1, available_at = now() + make_interval(mins => o.attempts + 1)
  WHERE o.id IN (
    SELECT id FROM outbox
    WHERE processed_at IS NULL AND failed_at IS NULL AND available_at <= now()
    ORDER BY id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  RETURNING o.id, o.beach_id, o.kind, o.payload, o.attempts
$$;

-- Closes a piece of work: done, to retry later, or given up after five attempts.
CREATE FUNCTION worker_finish_outbox(p_id bigint, p_error text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  UPDATE outbox
    SET processed_at = CASE WHEN p_error IS NULL THEN now() END,
        failed_at = CASE WHEN p_error IS NOT NULL AND attempts >= 5 THEN now() END,
        last_error = p_error
  WHERE id = p_id AND processed_at IS NULL
$$;

CREATE FUNCTION worker_beaches_with_expired_holds() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT DISTINCT beach_id FROM hold WHERE status = 'active' AND expires_at <= now() $$;

CREATE FUNCTION worker_days_to_close() RETURNS TABLE (o_beach_id uuid, o_day date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT d.beach_id, d.day
  FROM booking b
  JOIN inventory_day d ON d.id = b.inventory_day_id
  JOIN beach be ON be.id = d.beach_id
  WHERE b.status = 'confirmed' AND d.day < (now() AT TIME ZONE be.timezone)::date
$$;

REVOKE ALL ON FUNCTION worker_claim_outbox(integer), worker_finish_outbox(bigint, text), worker_beaches_with_expired_holds(), worker_days_to_close() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION worker_claim_outbox(integer), worker_finish_outbox(bigint, text), worker_beaches_with_expired_holds(), worker_days_to_close() TO ombre_app;
