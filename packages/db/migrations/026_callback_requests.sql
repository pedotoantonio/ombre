-- The «Ti chiamiamo noi» form of the manager showcase (D71): a public callback
-- request the platform administrator reads and marks as called. A platform
-- table: it belongs to no beach club, like the platform rows of 019. No data
-- of the form goes anywhere else (no outbox, no e-mail — spec §3).

CREATE TABLE callback_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 20),
  beach_name text CHECK (char_length(beach_name) BETWEEN 1 AND 80),
  locale text NOT NULL CHECK (locale IN ('it', 'en')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'called')),
  called_at timestamptz,
  -- «richiamato» and its moment move together: one never exists without the other.
  CHECK ((status = 'called') = (called_at IS NOT NULL))
);

-- The reserved list reads the most recent first (spec §3).
CREATE INDEX callback_request_by_created ON callback_request (created_at DESC, id DESC);

ALTER TABLE callback_request ENABLE ROW LEVEL SECURITY;

-- Platform rows on the model of 019: reachable only outside any beach context,
-- so no beach-scoped query can ever touch them. Who may read and mark (the
-- platform administrator) is the API's check, on the role of the session.
CREATE POLICY callback_request_platform ON callback_request TO ombre_app
  USING (app_beach_id() IS NULL) WITH CHECK (app_beach_id() IS NULL);

-- Created by the public form, read and marked by the administrator; nothing
-- deletes a request (the cancellation is deferred in writing — spec §5).
GRANT SELECT, INSERT, UPDATE ON callback_request TO ombre_app;
