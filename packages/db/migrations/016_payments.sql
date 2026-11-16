-- Più pagamenti per prenotazione, incasso rinviato e richieste di pagamento
-- (spec §4.3, decisione D31). Ogni pagamento acquisisce uno scopo; il residuo è
-- totale meno pagamenti riusciti e lo stato «da incassare» è DERIVATO dal
-- residuo: nessuna colonna nuova su booking per questo. La tabella notification
-- diventa una coda di messaggi pronti (stato «queued» e corpo del testo).

-- Lo scopo instrada l'esito del fornitore: un pagamento `request` non passa mai
-- dal percorso conferma/annulla del checkout. Le righe esistenti sono o il saldo
-- online («checkout», fornitore sandbox) o l'incasso al banco («desk»).
ALTER TABLE payment ADD COLUMN purpose text;
UPDATE payment SET purpose = CASE WHEN provider = 'desk' THEN 'desk' ELSE 'checkout' END;
ALTER TABLE payment ALTER COLUMN purpose SET NOT NULL;
ALTER TABLE payment ADD CONSTRAINT payment_purpose_check CHECK (purpose IN ('checkout', 'desk', 'request'));
-- Il residuo si calcola per prenotazione: la somma dei pagamenti riusciti.
CREATE INDEX payment_by_booking ON payment (booking_id);

-- Il banco acquisisce anche un telefono facoltativo (per WhatsApp a mano).
ALTER TABLE booking ADD COLUMN guest_phone text
  CHECK (guest_phone IS NULL OR (length(guest_phone) BETWEEN 3 AND 40 AND guest_phone ~ '^[+0-9 ()./-]+$'));

-- Richiesta di pagamento (acconto o saldo). Il token pubblico NON è salvato:
-- è derivato dall'identificatore con OMBRE_SIGNING_SECRET, come i pass, e
-- verificato in tempo costante. La scadenza non supera mai la fine del giorno
-- prenotato nel fuso dello stabilimento (imposto dall'applicazione alla
-- creazione). Una richiesta pendente oltre la scadenza diventa «expired» in
-- modo pigro, alla prima lettura che la incontra: nessun lavoro del worker.
CREATE TABLE payment_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  booking_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  note text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 200),
  created_by uuid NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  FOREIGN KEY (booking_id, beach_id) REFERENCES booking (id, beach_id),
  UNIQUE (id, beach_id)
);
CREATE INDEX payment_request_by_booking ON payment_request (booking_id);

-- Un pagamento nato da una richiesta la nomina; gli altri scopi mai.
ALTER TABLE payment ADD COLUMN request_id uuid;
ALTER TABLE payment ADD CONSTRAINT payment_request_fk
  FOREIGN KEY (request_id, beach_id) REFERENCES payment_request (id, beach_id);
ALTER TABLE payment ADD CONSTRAINT payment_request_link
  CHECK ((purpose = 'request') = (request_id IS NOT NULL));

ALTER TABLE payment_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_request_tenant ON payment_request TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
-- UPDATE serve per chiudere la richiesta (paid/expired/cancelled); mai DELETE.
GRANT SELECT, INSERT, UPDATE ON payment_request TO ombre_app;

-- La pagina pubblica /paga/{token} nomina una richiesta, non uno stabilimento:
-- questa funzione trova lo stabilimento, come payment_beach per i webhook.
CREATE FUNCTION payment_request_beach(p_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT beach_id FROM payment_request WHERE id = p_id $$;
REVOKE ALL ON FUNCTION payment_request_beach(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_request_beach(uuid) TO ombre_app;

-- La tabella notification era un registro di esiti (sent/skipped, senza testo):
-- si estende a coda di messaggi pronti. «queued» = composto e in attesa del
-- fornitore vero; il corpo resta leggibile dalla pagina «Comunicazioni».
DO $$
DECLARE
  old_check text;
BEGIN
  SELECT conname INTO old_check
  FROM pg_constraint
  WHERE conrelid = 'notification'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%skipped%';
  IF old_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notification DROP CONSTRAINT %I', old_check);
  END IF;
END;
$$;
ALTER TABLE notification ADD CONSTRAINT notification_status_check
  CHECK (status IN ('queued', 'sent', 'skipped'));
ALTER TABLE notification ADD COLUMN body text;
-- Il worker (e domani il fornitore vero) aggiorna lo stato da «queued» in poi;
-- la politica di tenant già esistente copre anche l'UPDATE.
GRANT UPDATE ON notification TO ombre_app;

-- Gli extra aggiunti a vendita già fatta (spec §4.3, chiusura di §4.2)
-- accrescono la quantità di una riga snapshot esistente.
GRANT UPDATE ON booking_extra TO ombre_app;
