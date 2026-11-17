-- Repertorio ampliato dalle tavole del committente (D35, specifica §4bis).
-- Il disegno guadagna le decorazioni: elementi a una cella con un segno dal
-- repertorio ed etichetta facoltativa, senza numerazione, stato né vendita.
-- Il repertorio dei tipi di postazione si estende ai soggetti a noleggio.

-- Il segno di una decorazione, da un repertorio fisso come quello dei tipi.
ALTER TABLE layout_element ADD COLUMN sign text
  CHECK (sign IN ('palma', 'chiosco', 'doccia', 'bandiera', 'salvagente', 'cartello', 'cestino',
                  'amaca', 'altalena', 'giochi', 'tavolino', 'grill', 'acqua', 'armadietti', 'campo', 'pingpong'));

-- Il genere nuovo accanto a passerelle, strutture e blocchi cabine.
ALTER TABLE layout_element DROP CONSTRAINT layout_element_kind_check;
ALTER TABLE layout_element ADD CONSTRAINT layout_element_kind_check
  CHECK (kind IN ('walkway', 'cabin_block', 'structure', 'decoration'));

-- La forma di ogni genere: ai tre casi di 011 si aggiunge la decorazione, una
-- cella sola (zona, fila, colonna, senza col_end) col suo segno obbligatorio.
-- Il vincolo combinato di 011 porta il nome generato layout_element_check1.
ALTER TABLE layout_element DROP CONSTRAINT layout_element_check1;
ALTER TABLE layout_element ADD CONSTRAINT layout_element_shape
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
    OR (kind = 'decoration' AND orientation IS NULL
      AND zone IS NOT NULL AND row_after IS NULL AND row_number IS NOT NULL
      AND col_start IS NOT NULL AND col_end IS NULL)
  );

-- Il segno appartiene solo alle decorazioni, che lo portano sempre.
ALTER TABLE layout_element ADD CONSTRAINT layout_element_decoration_sign
  CHECK ((kind = 'decoration') = (sign IS NOT NULL));

-- Segni nuovi per i tipi di postazione: sdraio, gazebo a telo, canoa, SUP,
-- pedalò, moto d'acqua (identificativi inglesi come il repertorio esistente).
ALTER TABLE spot_type DROP CONSTRAINT spot_type_mark_check;
ALTER TABLE spot_type ADD CONSTRAINT spot_type_mark_check
  CHECK (mark IN ('umbrella', 'sunbed', 'gazebo', 'tent', 'daybed', 'deckchair', 'canopy', 'canoe', 'sup', 'pedalo', 'jetski'));

-- GRANT e RLS restano quelli di 011: la politica layout_element_tenant copre il
-- genere nuovo e la colonna del segno rientra nei privilegi già concessi sulla
-- tabella (SELECT, INSERT, DELETE a ombre_app); nessun oggetto nuovo.
