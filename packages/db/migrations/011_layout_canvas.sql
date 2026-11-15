-- The drawing of the beach becomes explicit: every spot gets a column inside its
-- row, the beach chooses on which side the sea is drawn, and a new table holds the
-- elements drawn besides the spots (walkways, cabin blocks, labelled structures).

-- The column inside the row. Backfill: for every row, code order gives 1..n with no
-- holes. From here on the column is the only source of the drawing and the code is
-- just a label; after the backfill the manager may leave holes (1, 2, 5, 6).
ALTER TABLE spot ADD COLUMN col smallint CHECK (col >= 1);

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY beach_id, zone, row_number ORDER BY code) AS position
  FROM spot
)
UPDATE spot SET col = numbered.position FROM numbered WHERE spot.id = numbered.id;

ALTER TABLE spot ALTER COLUMN col SET NOT NULL;
ALTER TABLE spot ADD CONSTRAINT spot_cell UNIQUE (beach_id, zone, row_number, col);

-- A spot inserted without a column lands after the last one of its row, exactly as
-- the backfill would have placed it. The unique constraint settles any race.
CREATE FUNCTION spot_fill_col() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.col IS NULL THEN
    SELECT coalesce(max(col), 0) + 1 INTO NEW.col
    FROM spot WHERE beach_id = NEW.beach_id AND zone = NEW.zone AND row_number = NEW.row_number;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER spot_fill_col BEFORE INSERT ON spot FOR EACH ROW EXECUTE FUNCTION spot_fill_col();

-- Which side the sea band is drawn on. With 'bottom' only the visual order of the
-- blocks flips; row 1, row_after and the distances stay counted from the sea, and
-- the DOM and list order never change.
ALTER TABLE beach
  ADD COLUMN sea_side text NOT NULL DEFAULT 'top' CHECK (sea_side IN ('top', 'bottom'));

-- Elements drawn on the grid besides the spots.
-- - walkway + horizontal: its own lane after row `row_after` of a zone (0 = before
--   row 1), over the columns col_start..col_end; it never enters the row count.
-- - walkway + vertical: runs in the gap after column col_start; zone NULL = through
--   every zone.
-- - structure / cabin_block: a rectangle of free cells (zone, row, col_start..col_end);
--   a structure always carries its label ("Bar", "Docce"), a cabin block is reserved
--   for the sea cabins. The distance corridors are a different thing: no element sits
--   inside them. Overlaps with spots (retired ones included) and between elements are
--   refused by the application with an explained DomainError.
CREATE TABLE layout_element (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  kind text NOT NULL CHECK (kind IN ('walkway', 'cabin_block', 'structure')),
  label text CHECK (label IS NULL OR length(label) BETWEEN 1 AND 40),
  orientation text CHECK (orientation IN ('horizontal', 'vertical')),
  zone text CHECK (zone IN ('riva', 'ombrelloni', 'monte')),
  row_after smallint CHECK (row_after >= 0),
  row_number integer CHECK (row_number >= 1),
  col_start smallint CHECK (col_start >= 1),
  col_end smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, beach_id),
  CHECK (col_end IS NULL OR col_end >= col_start),
  CHECK (
    (kind = 'walkway' AND orientation = 'horizontal'
      AND zone IS NOT NULL AND row_after IS NOT NULL AND row_number IS NULL
      AND col_start IS NOT NULL AND col_end IS NOT NULL)
    OR (kind = 'walkway' AND orientation = 'vertical'
      AND row_after IS NULL AND row_number IS NULL
      AND col_start IS NOT NULL AND col_end IS NULL)
    OR (kind IN ('structure', 'cabin_block') AND orientation IS NULL
      AND zone IS NOT NULL AND row_after IS NULL AND row_number IS NOT NULL
      AND col_start IS NOT NULL AND col_end IS NOT NULL)
  ),
  CHECK (kind <> 'structure' OR label IS NOT NULL)
);

ALTER TABLE layout_element ENABLE ROW LEVEL SECURITY;
CREATE POLICY layout_element_tenant ON layout_element TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

-- The manager draws and erases; elements are added and removed, never edited in place.
-- The beach_settings policy (004) covers the new beach column.
GRANT SELECT, INSERT, DELETE ON layout_element TO ombre_app;
GRANT UPDATE (sea_side) ON beach TO ombre_app;
