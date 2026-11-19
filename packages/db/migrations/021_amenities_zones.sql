-- «Al passo con il mercato» (D49, D50): the fixed amenity catalogue chosen per
-- beach club and the named zones of the layout. Amenity labels live in the
-- dictionaries, never here; a zone name is a proper noun written by the manager,
-- identical in both languages, distinct from the physical band (riva|ombrelloni|monte).

-- One row per chosen amenity, from the fixed catalogue (D49). The CHECK mirrors
-- `beachAmenities` in @ombre/shared: the two lists must change together.
CREATE TABLE beach_amenity (
  beach_id uuid NOT NULL REFERENCES beach (id),
  amenity text NOT NULL CHECK (amenity IN (
    'bar', 'restaurant', 'parking', 'hot_showers', 'playground', 'accessible',
    'pets', 'wifi', 'lifeguard', 'cabins', 'sunset_bar', 'card_payments'
  )),
  PRIMARY KEY (beach_id, amenity)
);

-- A named zone of the layout (D50): free name of 2–40 characters, unique per
-- beach club. The ceiling of 20 zones per club is applied in the code.
CREATE TABLE beach_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beach_id, name),
  UNIQUE (id, beach_id)
);

-- A spot may belong to one named zone. The composite reference keeps the zone
-- inside the same beach club; deleting the zone detaches its spots, nothing else.
ALTER TABLE spot
  ADD COLUMN named_zone_id uuid,
  ADD CONSTRAINT spot_named_zone_fk FOREIGN KEY (named_zone_id, beach_id)
    REFERENCES beach_zone (id, beach_id) ON DELETE SET NULL (named_zone_id);

-- Row level security, following beach (001): the public reads both tables for
-- active beach clubs even outside any beach context (the search list shows the
-- amenities of every club); writes stay inside the beach context of the manager.
ALTER TABLE beach_amenity ENABLE ROW LEVEL SECURITY;
ALTER TABLE beach_zone ENABLE ROW LEVEL SECURITY;

CREATE POLICY beach_amenity_tenant ON beach_amenity TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY beach_amenity_public ON beach_amenity FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM beach b WHERE b.id = beach_amenity.beach_id AND b.status = 'active'));
CREATE POLICY beach_zone_tenant ON beach_zone TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY beach_zone_public ON beach_zone FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM beach b WHERE b.id = beach_zone.beach_id AND b.status = 'active'));

-- The amenity set is replaced whole (delete + insert), a zone is created, renamed
-- or deleted; spot.named_zone_id rides on the existing UPDATE grant of spot (010).
GRANT SELECT, INSERT, DELETE ON beach_amenity TO ombre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON beach_zone TO ombre_app;
