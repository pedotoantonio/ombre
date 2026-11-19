-- «La spiaggia illustrata» (D58): il repertorio della scenografia si amplia con
-- i soggetti nuovi delle tavole — torretta del bagnino, duna, vegetazione bassa,
-- campo da beach volley, campo da bocce, pedalò, canoa e SUP — accanto alle
-- chiavi D35 di 017, che restano identiche: i disegni salvati non cambiano.
-- Il vincolo in colonna di 017 porta il nome generato layout_element_sign_check.
ALTER TABLE layout_element DROP CONSTRAINT layout_element_sign_check;
ALTER TABLE layout_element ADD CONSTRAINT layout_element_sign_check
  CHECK (sign IN ('palma', 'chiosco', 'doccia', 'bandiera', 'salvagente', 'cartello', 'cestino',
                  'amaca', 'altalena', 'giochi', 'tavolino', 'grill', 'acqua', 'armadietti', 'campo', 'pingpong',
                  'torretta', 'duna', 'vegetazione', 'beachvolley', 'bocce', 'pedalo', 'canoa', 'sup'));
