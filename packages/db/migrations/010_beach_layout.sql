-- The manager draws the beach layout: spots belong to a zone (shore sunbeds, the
-- umbrella grid, the land side), carry an optional rental label with free notes,
-- and can be retired from sale instead of deleted once they have been used.
-- The beach keeps the width of the empty corridors between the zones.

ALTER TABLE spot
  -- Row numbers count inside the zone; row 1 is always the closest to the sea.
  ADD COLUMN zone text NOT NULL DEFAULT 'ombrelloni' CHECK (zone IN ('riva', 'ombrelloni', 'monte')),
  -- Management annotations, never shown to the public. The label is free text:
  -- "Stagionale" and "Albergo" are suggestions, not an enumeration.
  ADD COLUMN rental_type text CHECK (rental_type IS NULL OR length(rental_type) BETWEEN 1 AND 40),
  ADD COLUMN rental_notes text CHECK (rental_notes IS NULL OR length(rental_notes) BETWEEN 1 AND 500),
  -- A retired spot keeps its history but enters no new published day and is hidden
  -- from the public. Retirement is reversible.
  ADD COLUMN retired boolean NOT NULL DEFAULT false;

ALTER TABLE beach
  -- Empty rows between the shore zone and the first umbrella row, and between the
  -- last umbrella row and the land zone. 0 means the zones touch.
  ADD COLUMN shore_gap_rows smallint NOT NULL DEFAULT 1 CHECK (shore_gap_rows BETWEEN 0 AND 10),
  ADD COLUMN land_gap_rows smallint NOT NULL DEFAULT 1 CHECK (land_gap_rows BETWEEN 0 AND 10);

-- The manager edits the layout of their own club. The spot_tenant policy (001)
-- covers every command, so writes stay inside the current beach club; the
-- beach_settings policy (004) does the same for the two new beach columns.
GRANT INSERT, UPDATE, DELETE ON spot TO ombre_app;
GRANT UPDATE (shore_gap_rows, land_gap_rows) ON beach TO ombre_app;
