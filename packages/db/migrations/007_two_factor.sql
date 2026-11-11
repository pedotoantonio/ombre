-- Two-step verification with time-based codes (TOTP, RFC 6238: SHA-1, 6 digits, 30 seconds).
-- Like passwords, codes are checked inside the database.

ALTER TABLE app_user
  ADD COLUMN totp_secret bytea,
  ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false,
  -- Last time step accepted: the same code cannot be used twice.
  ADD COLUMN totp_last_step bigint;

CREATE FUNCTION totp_code(p_secret bytea, p_step bigint) RETURNS text
  LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  h bytea := hmac(int8send(p_step), p_secret, 'sha1');
  o integer := get_byte(h, 19) & 15;
  n bigint;
BEGIN
  n := ((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1)::bigint << 16) | (get_byte(h, o + 2)::bigint << 8) | get_byte(h, o + 3)::bigint;
  RETURN lpad((n % 1000000)::text, 6, '0');
END
$$;

-- Accepts the code of the current step or of the one just before or after it.
CREATE FUNCTION totp_matches(p_user_id uuid, p_code text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  u app_user%ROWTYPE;
  v_now bigint := floor(extract(epoch FROM now()) / 30);
  s bigint;
BEGIN
  SELECT * INTO u FROM app_user WHERE id = p_user_id FOR UPDATE;
  IF u.totp_secret IS NULL OR p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RETURN false;
  END IF;
  FOR s IN v_now - 1 .. v_now + 1 LOOP
    IF totp_code(u.totp_secret, s) = p_code AND (u.totp_last_step IS NULL OR s > u.totp_last_step) THEN
      UPDATE app_user SET totp_last_step = s WHERE id = u.id;
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END
$$;
REVOKE ALL ON FUNCTION totp_matches(uuid, text) FROM PUBLIC;

DROP FUNCTION auth_login(text, text, text, integer);
CREATE FUNCTION auth_login(p_email text, p_password text, p_totp text, p_token_hash text, p_ttl_seconds integer)
  RETURNS TABLE (o_outcome text, o_user_id uuid, o_expires_at timestamptz)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  u app_user%ROWTYPE;
  v_expires timestamptz;
  v_ok boolean;
BEGIN
  SELECT * INTO u FROM app_user WHERE email = lower(p_email) FOR UPDATE;
  IF NOT FOUND OR u.disabled THEN
    PERFORM crypt(p_password, gen_salt('bf', 12));
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF u.locked_until IS NOT NULL AND u.locked_until > now() THEN
    RETURN QUERY SELECT 'locked'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  v_ok := crypt(p_password, u.password_hash) = u.password_hash;
  IF v_ok AND u.totp_enabled THEN
    IF p_totp IS NULL OR p_totp = '' THEN
      RETURN QUERY SELECT 'totp_required'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    v_ok := totp_matches(u.id, p_totp);
  END IF;

  IF NOT v_ok THEN
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

DROP FUNCTION auth_session(text);
CREATE FUNCTION auth_session(p_token_hash text)
  RETURNS TABLE (o_user_id uuid, o_email text, o_name text, o_platform_role platform_role, o_totp_enabled boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email, u.name, u.platform_role, u.totp_enabled
  FROM session s JOIN app_user u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now() AND NOT u.disabled
$$;

-- Starts the setup for the signed-in person: a new secret, not yet active.
CREATE FUNCTION auth_totp_begin(p_token_hash text) RETURNS bytea
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_enabled boolean;
  v_secret bytea := gen_random_bytes(20);
BEGIN
  SELECT o_user_id, o_totp_enabled INTO v_user, v_enabled FROM auth_session(p_token_hash);
  IF v_user IS NULL OR v_enabled THEN
    RETURN NULL;
  END IF;
  UPDATE app_user SET totp_secret = v_secret, totp_last_step = NULL WHERE id = v_user;
  RETURN v_secret;
END
$$;

-- Switches two-step verification on once the person proves the authenticator app works.
CREATE FUNCTION auth_totp_confirm(p_token_hash text, p_code text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_enabled boolean;
BEGIN
  SELECT o_user_id, o_totp_enabled INTO v_user, v_enabled FROM auth_session(p_token_hash);
  IF v_user IS NULL OR v_enabled OR NOT totp_matches(v_user, p_code) THEN
    RETURN false;
  END IF;
  UPDATE app_user SET totp_enabled = true WHERE id = v_user;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION auth_login(text, text, text, text, integer), auth_session(text), auth_totp_begin(text), auth_totp_confirm(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login(text, text, text, text, integer), auth_session(text), auth_totp_begin(text), auth_totp_confirm(text, text) TO ombre_app;
