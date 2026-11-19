-- The spot type card (D61): the custom card a beach club writes over the platform
-- default of its type. One row per type; the content is validated in shared
-- (parseTypeCardContent) before every write. No row means: the default card.

CREATE TABLE spot_type_card (
  type_id uuid PRIMARY KEY,
  beach_id uuid NOT NULL REFERENCES beach (id),
  content jsonb NOT NULL,
  updated_by uuid REFERENCES app_user (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The composite key of spot_type (012) ties the card to a type OF THIS beach club:
  -- a card can never point at another club's type. Deleting the type takes its card.
  FOREIGN KEY (type_id, beach_id) REFERENCES spot_type (id, beach_id) ON DELETE CASCADE
);

-- Row level security on the model of the site tables: the public reads the cards
-- of active beach clubs (the card is the public story of the type, like the
-- published website); writes stay inside the beach context of the manager.
ALTER TABLE spot_type_card ENABLE ROW LEVEL SECURITY;

CREATE POLICY spot_type_card_tenant ON spot_type_card TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY spot_type_card_public ON spot_type_card FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM beach b WHERE b.id = spot_type_card.beach_id AND b.status = 'active'));

-- A card is written whole and reset by deletion: the default card is the absence of a row.
GRANT SELECT, INSERT, UPDATE, DELETE ON spot_type_card TO ombre_app;
