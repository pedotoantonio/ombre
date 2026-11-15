-- Spot types: name, graphic mark from a fixed repertoire, default equipment,
-- capacity and an optional default price. Every beach club, existing and future,
-- carries three builtin types; every spot points to a type of its own club.
-- Type defaults are copied when a spot is created and never propagate afterwards.

CREATE TABLE spot_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  -- The graphic mark comes from a fixed repertoire, custom types included.
  mark text NOT NULL CHECK (mark IN ('umbrella', 'sunbed', 'gazebo', 'tent', 'daybed')),
  umbrellas smallint NOT NULL DEFAULT 1 CHECK (umbrellas >= 0),
  sunbeds smallint NOT NULL DEFAULT 2 CHECK (sunbeds >= 0),
  max_guests smallint NOT NULL DEFAULT 2 CHECK (max_guests > 0),
  -- When set, a new published day of a spot of this type starts at this price
  -- instead of the day's base price. Days already published are never rewritten.
  default_price_cents integer CHECK (default_price_cents IS NULL OR default_price_cents >= 0),
  builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beach_id, name),
  UNIQUE (id, beach_id)
);

-- The three base types of every beach club. One per mark among the builtins, so the
-- default type of a new spot can always be found by its mark.
CREATE FUNCTION beach_builtin_spot_types() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO spot_type (beach_id, name, mark, umbrellas, sunbeds, max_guests, builtin) VALUES
    (NEW.id, 'Ombrellone', 'umbrella', 1, 2, 2, true),
    (NEW.id, 'Lettino singolo', 'sunbed', 0, 1, 1, true),
    (NEW.id, 'Gazebo', 'gazebo', 0, 2, 4, true);
  RETURN NEW;
END
$$;
CREATE TRIGGER beach_builtin_spot_types AFTER INSERT ON beach FOR EACH ROW EXECUTE FUNCTION beach_builtin_spot_types();

-- Existing beach clubs receive the same three types.
INSERT INTO spot_type (beach_id, name, mark, umbrellas, sunbeds, max_guests, builtin)
SELECT b.id, t.name, t.mark, t.umbrellas, t.sunbeds, t.max_guests, true
FROM beach b
CROSS JOIN (VALUES
  ('Ombrellone', 'umbrella', 1, 2, 2),
  ('Lettino singolo', 'sunbed', 0, 1, 1),
  ('Gazebo', 'gazebo', 0, 2, 4)
) AS t (name, mark, umbrellas, sunbeds, max_guests);

-- Every spot gets its type: umbrella spots become "Ombrellone", the shore and land
-- sunbeds "Lettino singolo". Equipment stays exactly as it is: the type is a label
-- with defaults for the future, never a rewrite of the past.
ALTER TABLE spot ADD COLUMN type_id uuid;

UPDATE spot SET type_id = st.id
FROM spot_type st
WHERE st.beach_id = spot.beach_id AND st.builtin
  AND st.mark = CASE WHEN spot.zone = 'ombrelloni' THEN 'umbrella' ELSE 'sunbed' END;

ALTER TABLE spot ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE spot ADD CONSTRAINT spot_type_fk FOREIGN KEY (type_id, beach_id) REFERENCES spot_type (id, beach_id);

-- A spot inserted without a type gets the builtin of its zone, like the backfill.
CREATE FUNCTION spot_fill_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type_id IS NULL THEN
    SELECT id INTO NEW.type_id FROM spot_type
    WHERE beach_id = NEW.beach_id AND builtin
      AND mark = CASE WHEN NEW.zone = 'ombrelloni' THEN 'umbrella' ELSE 'sunbed' END;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER spot_fill_type BEFORE INSERT ON spot FOR EACH ROW EXECUTE FUNCTION spot_fill_type();

-- The three base types are never deleted; the foreign key from spot already stops
-- the deletion of any type in use.
CREATE FUNCTION spot_type_keep_builtin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.builtin THEN
    RAISE EXCEPTION 'builtin spot types cannot be deleted';
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER spot_type_keep_builtin BEFORE DELETE ON spot_type FOR EACH ROW EXECUTE FUNCTION spot_type_keep_builtin();

ALTER TABLE spot_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY spot_type_tenant ON spot_type TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON spot_type TO ombre_app;
