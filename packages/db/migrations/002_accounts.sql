-- Accounts, sessions, memberships and the audit trail.
-- Passwords are checked inside the database: the application role can open a session
-- only by presenting the right password, and never reads a password hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE platform_role AS ENUM ('none', 'admin');
CREATE TYPE membership_role AS ENUM ('manager', 'reception', 'accounting');

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND position('@' IN email) > 1),
  name text NOT NULL,
  password_hash text NOT NULL,
  platform_role platform_role NOT NULL DEFAULT 'none',
  disabled boolean NOT NULL DEFAULT false,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE membership (
  user_id uuid NOT NULL REFERENCES app_user (id),
  beach_id uuid NOT NULL REFERENCES beach (id),
  role membership_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, beach_id)
);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  actor_user_id uuid NOT NULL REFERENCES app_user (id),
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_beach ON audit_event (beach_id, created_at DESC);

-- No policy and no grant on app_user and session: the application role reaches them
-- only through the functions below.
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_visible ON membership FOR SELECT TO ombre_app
  USING (user_id = app_user_id() OR beach_id = app_beach_id());
CREATE POLICY beach_member ON beach FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM membership m WHERE m.beach_id = beach.id AND m.user_id = app_user_id()));
CREATE POLICY audit_read ON audit_event FOR SELECT TO ombre_app
  USING (beach_id = app_beach_id());
CREATE POLICY audit_write ON audit_event FOR INSERT TO ombre_app
  WITH CHECK (beach_id = app_beach_id() AND actor_user_id = app_user_id());

GRANT SELECT ON membership TO ombre_app;
GRANT SELECT, INSERT ON audit_event TO ombre_app;
GRANT INSERT ON inventory_day TO ombre_app;

CREATE FUNCTION auth_login(p_email text, p_password text, p_token_hash text, p_ttl_seconds integer)
  RETURNS TABLE (o_outcome text, o_user_id uuid, o_expires_at timestamptz)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  u app_user%ROWTYPE;
  v_expires timestamptz;
BEGIN
  SELECT * INTO u FROM app_user WHERE email = lower(p_email) FOR UPDATE;
  IF NOT FOUND OR u.disabled THEN
    -- Same work as a real check, so the answer time does not reveal which addresses exist.
    PERFORM crypt(p_password, gen_salt('bf', 12));
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF u.locked_until IS NOT NULL AND u.locked_until > now() THEN
    RETURN QUERY SELECT 'locked'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF crypt(p_password, u.password_hash) <> u.password_hash THEN
    UPDATE app_user
      SET failed_logins = failed_logins + 1,
          locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' END
      WHERE id = u.id;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  UPDATE app_user SET failed_logins = 0, locked_until = NULL WHERE id = u.id;
  INSERT INTO session (user_id, token_hash, expires_at)
    VALUES (u.id, p_token_hash, now() + make_interval(secs => p_ttl_seconds))
    RETURNING session.expires_at INTO v_expires;
  RETURN QUERY SELECT 'ok'::text, u.id, v_expires;
END
$$;

CREATE FUNCTION auth_session(p_token_hash text)
  RETURNS TABLE (o_user_id uuid, o_email text, o_name text, o_platform_role platform_role)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email, u.name, u.platform_role
  FROM session s JOIN app_user u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now() AND NOT u.disabled
$$;

CREATE FUNCTION auth_logout(p_token_hash text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  UPDATE session SET revoked_at = now() WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;

REVOKE ALL ON FUNCTION auth_login(text, text, text, integer), auth_session(text), auth_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login(text, text, text, integer), auth_session(text), auth_logout(text) TO ombre_app;
