-- «La spiaggia illustrata e il pianificatore» (D56, D57, D58): la manutenzione
-- della postazione e la bozza del pianificatore, una per stabilimento.

-- Manutenzione (D56): finché è vera la postazione non è prenotabile (né online,
-- né al banco, né dal carrello), resta nel disegno con il suo stato e le
-- prenotazioni già prese restano valide. Distinta dal ritiro dalla vendita,
-- che la toglie dalla vendita per sempre.
ALTER TABLE spot ADD COLUMN maintenance boolean NOT NULL DEFAULT false;
-- spot.maintenance viaggia sul GRANT UPDATE già concesso sull'intera tabella
-- spot (010), come named_zone_id (021): nessun privilegio nuovo da concedere.

-- La bozza del pianificatore (D57): un elenco ordinato di operazioni in JSON,
-- una bozza per stabilimento, autore e data dell'ultimo tocco. Le pagine
-- pubbliche e la vendita leggono solo le tabelle vere: la bozza vive qui
-- finché «Salva la spiaggia» non la applica in una transazione.
CREATE TABLE layout_draft (
  beach_id uuid PRIMARY KEY REFERENCES beach (id),
  ops jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES app_user (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS nel contesto dello stabilimento, come ogni tabella gestionale (001).
ALTER TABLE layout_draft ENABLE ROW LEVEL SECURITY;
CREATE POLICY layout_draft_tenant ON layout_draft TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

-- La bozza si legge, si crea, si accoda (UPDATE di ops) e si scarta.
GRANT SELECT, INSERT, UPDATE, DELETE ON layout_draft TO ombre_app;

-- D58: gli elementi del disegno ora si SPOSTANO dal pianificatore conservando
-- l'identità (le cabine agganciate a un blocco non si staccano). Il «mai
-- modificati sul posto» di 011 decade per decisione scritta.
GRANT UPDATE ON layout_element TO ombre_app;
