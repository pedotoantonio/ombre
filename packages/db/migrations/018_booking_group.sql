-- Gruppo di prenotazione (D38, specifica ruoli-periodo §2): una postazione per
-- un intervallo di giornate consecutive, con un codice, un pass e un totale.
-- Nel dato la prenotazione resta una postazione per una giornata; il codice
-- passa al gruppo (unico per spiaggia) e la colonna della prenotazione lo
-- riporta, senza più unicità propria. Pagamenti e richieste di pagamento (D31)
-- e lo snapshot degli extra si riagganciano al gruppo. Riempimento: ogni
-- prenotazione esistente diventa un gruppo di un giorno col suo stesso codice.

CREATE TABLE booking_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id)
);

-- Riempimento: il gruppo di un giorno riusa l'id della sua prenotazione, così
-- ogni colonna nuova si riempie con un solo UPDATE per tabella.
INSERT INTO booking_group (id, beach_id, code, created_at)
  SELECT id, beach_id, code, created_at FROM booking;

ALTER TABLE booking ADD COLUMN group_id uuid;
UPDATE booking SET group_id = id;
ALTER TABLE booking ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE booking ADD CONSTRAINT booking_group_fk
  FOREIGN KEY (group_id, beach_id) REFERENCES booking_group (id, beach_id);
CREATE INDEX booking_by_group ON booking (group_id);

-- Il codice vive sul gruppo: la prenotazione lo riporta soltanto. L'indice
-- sostiene le ricerche del banco e della reception.
ALTER TABLE booking DROP CONSTRAINT booking_beach_id_code_key;
CREATE INDEX booking_code ON booking (beach_id, code);

-- Pagamenti e richieste di pagamento passano al gruppo (D31 a livello gruppo):
-- il residuo è il totale del gruppo meno i pagamenti riusciti del gruppo.
-- booking_id resta e punta alla prima giornata, per il registro economico.
ALTER TABLE payment ADD COLUMN group_id uuid;
UPDATE payment SET group_id = (SELECT b.group_id FROM booking b WHERE b.id = payment.booking_id);
ALTER TABLE payment ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE payment ADD CONSTRAINT payment_group_fk
  FOREIGN KEY (group_id, beach_id) REFERENCES booking_group (id, beach_id);
CREATE INDEX payment_by_group ON payment (group_id);

ALTER TABLE payment_request ADD COLUMN group_id uuid;
UPDATE payment_request SET group_id = (SELECT b.group_id FROM booking b WHERE b.id = payment_request.booking_id);
ALTER TABLE payment_request ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE payment_request ADD CONSTRAINT payment_request_group_fk
  FOREIGN KEY (group_id, beach_id) REFERENCES booking_group (id, beach_id);
CREATE INDEX payment_request_by_group ON payment_request (group_id);

-- Gli extra si scelgono una volta per il periodo e valgono per il periodo:
-- lo snapshot si aggancia al gruppo; booking_id resta e punta alla prima
-- giornata, con la quale gli extra maturano nel registro economico.
ALTER TABLE booking_extra ADD COLUMN group_id uuid;
UPDATE booking_extra SET group_id = (SELECT b.group_id FROM booking b WHERE b.id = booking_extra.booking_id);
ALTER TABLE booking_extra ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE booking_extra ADD CONSTRAINT booking_extra_group_fk
  FOREIGN KEY (group_id, beach_id) REFERENCES booking_group (id, beach_id);
CREATE INDEX booking_extra_by_group ON booking_extra (group_id);

-- Il pass è del gruppo: stesso QR e codice breve per tutti i giorni; la
-- verifica in reception risolve la giornata corrente. booking_id resta e
-- punta alla prima giornata.
ALTER TABLE pass ADD COLUMN group_id uuid;
UPDATE pass SET group_id = (SELECT b.group_id FROM booking b WHERE b.id = pass.booking_id);
ALTER TABLE pass ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE pass ADD CONSTRAINT pass_group_fk
  FOREIGN KEY (group_id, beach_id) REFERENCES booking_group (id, beach_id);
ALTER TABLE pass ADD CONSTRAINT pass_one_per_group UNIQUE (group_id);

-- La riserva per periodo (D39) è una famiglia di fermi con un'unica scadenza:
-- il fermo della prima giornata fa da capofila, i successivi lo nominano.
-- Conversione e rilascio trattano la famiglia intera, tutta o niente.
ALTER TABLE hold ADD COLUMN parent_hold_id uuid REFERENCES hold (id);
CREATE INDEX hold_children ON hold (parent_hold_id) WHERE parent_hold_id IS NOT NULL;

-- Stessa politica di tenant delle tabelle sorelle. Il gruppo non si aggiorna
-- mai dall'applicazione (id, codice e nascita sono immutabili): niente UPDATE.
ALTER TABLE booking_group ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_group_tenant ON booking_group TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
GRANT SELECT, INSERT ON booking_group TO ombre_app;
