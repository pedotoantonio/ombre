# Specifica: la vetrina del Gestore e il modulo «Ti chiamiamo noi»

Iterazione del 21 novembre 2026 dal prompt del committente
([prompt-vetrina-gestore.md](prompt-vetrina-gestore.md)). La pagina
`/gestore-stabilimento` (e `/en/beach-manager`) diventa la vetrina
commerciale del gestionale, sul modello studiato di spiagge.it ma col
carattere di Ombrè; unica novità funzionale: il modulo di richiamata.
Decisione D71. Niente numeri, testimonianze o loghi inventati.

## 1. La pagina, dall'alto in basso (D71)

1. **Eroe da vetrina**: claim sul beneficio (sito, prenotazione diretta
   e reception sullo stesso inventario) e due azioni: la primaria
   **«Ti chiamiamo noi»** porta all'àncora `#richiamata`; la secondaria
   **«Guarda il gestionale»** porta all'àncora `#funzionalita` (la via
   delle schermate: è ciò che abbiamo di vero da mostrare). Sotto le
   azioni, la riga discreta di chi è già cliente: «Sei già un cliente?
   **Entra nel gestionale**» verso l'accesso — la via dei due tocchi di
   D41 resta (menu → pagina → accesso); il pannello `RoleAccess` di
   oggi sparisce da questa pagina.
2. **Il modulo di richiamata** (`#richiamata`), subito sotto l'eroe:
   nome, telefono, nome dello stabilimento (facoltativo), consenso
   esplicito; conferma chiara dopo l'invio. Compare una volta sola: la
   chiusura vi rimanda con l'àncora (la via ammessa dal prompt — niente
   doppioni di campi e di etichette nella stessa pagina).
3. **Cinque schede-funzionalità** (`#funzionalita`), con le schermate
   vere e titoli da beneficio: console del giorno, planner, scheda
   della postazione, riepilogo economico, più la **condivisione delle
   giornate degli stagionali** (il distintivo) con una schermata nuova
   presa dal gestionale dimostrativo
   (`condivisione-it-desktop.png`, stessa cartella delle altre).
4. **«Perché Ombrè»**: quattro vantaggi reali — resti tu a decidere;
   un solo inventario per sito, portale e reception; la condivisione
   degli stagionali; nessuna profilazione dei tuoi clienti.
5. **La trasparenza, compattata verso il fondo**: «Cosa comprende il
   primo rilascio», «Cosa non comprende, per ora», «Come si attiva»
   si conservano; Costi e Contatti restano con la formula «saranno
   pubblicati con la fase pilota».
6. **Chiusura con le stesse azioni dell'eroe** («Ti chiamiamo noi» →
   `#richiamata`, «Entra nel gestionale» discreto).

Indirizzo, voce di menu e gemella inglese non cambiano. Nessun'altra
pagina cambia (home D70, Ricerca ombrellone, guide, area riservata).

## 2. Il modulo «Ti chiamiamo noi» (D71)

- **Campi**: `name` (obbligatorio, 1–80), `phone` (obbligatorio, 6–20,
  cifre spazi e `+ ( ) . / -`), `beach` (facoltativo, fino a 80),
  `consent` (casella obbligatoria). Testo del consenso onesto: il
  recapito serve solo a richiamare per l'adesione alla fase pilota,
  nessuna profilazione, cancellazione su richiesta.
- **Campo trappola**: `sito`, visivamente nascosto e `tabindex="-1"`
  con `autocomplete="off"` e `aria-hidden` sul contenitore; se arriva
  compilato, l'azione risponde come un invio riuscito **senza
  registrare nulla** (il bot non impara niente).
- **Senza JavaScript**: `POST /azioni/richiamata` (il canale di tutti i
  moduli); convalida nel server; sul rifiuto si torna alla pagina con
  gli errori leggibili accanto ai campi e i valori ricompilati
  (query + `#richiamata`); sull'esito buono `?inviata=1#richiamata`
  con la conferma al posto del modulo.
- **Limite di invii**: la rotta API entra nella tabella dei limiti
  esistente (5 al minuto per indirizzo, come le rotte di acquisto);
  il 429 torna come errore leggibile accanto al modulo.

## 3. Archivio e consultazione (D71)

- **Migrazione `026_callback_requests.sql`**: tabella
  `callback_request` (id, created_at, name, phone, beach_name
  facoltativo, locale it/en, status `new`/`called` con default `new`,
  called_at), con le politiche di sicurezza nello stile delle altre
  tabelle. Nessun dato del modulo finisce altrove (niente outbox,
  niente e-mail).
- **Rotte API** (contratto OpenAPI esteso, 135 → 138):
  - `POST /v1/callback-requests` — pubblica; corpo
    `{name, phone, beachName?, locale}`; 201 `{requestId}`; 400 sulla
    convalida; 429 dal limite.
  - `GET /v1/platform/callback-requests` — sessione con
    `platformRole: 'admin'` (il ruolo esiste da sempre, finora senza
    rotte); 200 `{requests: [{requestId, createdAt, name, phone,
    beachName, locale, status, calledAt}]}`, più recenti in testa,
    al massimo 200; 401/403 altrimenti.
  - `POST /v1/platform/callback-requests/:requestId/called` — solo
    amministratore; segna «richiamato» (idempotente); 204.
- **Pagina riservata di consultazione**: `/area/richieste`
  (`/en/account/callback-requests`): elenco con data, nome, telefono,
  stabilimento, stato, e per le righe nuove il pulsante «Segna come
  richiamato» (`POST /azioni/richiamata-fatta`). Senza sessione si va
  all'accesso; senza ruolo di piattaforma la pagina risponde con il
  messaggio neutro di pagina non disponibile. Nessun CRM: niente
  ricerca, niente esportazione, niente modifica.
- **L'amministratore di piattaforma** nasce dal meccanismo già
  previsto (`OMBRE_ADMIN_EMAIL` / `OMBRE_ADMIN_PASSWORD` del servizio
  di migrazione, già nel compose): negli ambienti di collaudo e demo
  si usa `amministrazione@ombre.example` con la parola d'ordine
  dimostrativa. Nessun segreto nel codice.

## 4. Squadra e ordine dei lavori

1. **Analista**: questa specifica e D71 (nessun codice).
2. **Backend** (in parallelo col frontend, file disgiunti):
   `packages/db` (migrazione, modulo di accesso ai dati, test) e
   `apps/api` (tre rotte, limiti, contratto e test — il conteggio
   atteso del contratto passa a 138).
3. **Frontend**: `apps/web` (pagina vetrina, modulo, azioni
   `richiamata` e `richiamata-fatta`, pagina riservata), dizionari
   it/en, `packages/ui` (stili della vetrina coi gettoni esistenti).
4. **Coordinatore**: schermata nuova della condivisione dal gestionale
   dimostrativo; integrazione; ambienti.
5. **Collaudatore**: fumo della vecchia pagina aggiornato alla vetrina;
   collaudi propri del modulo (convalida, registrazione, limite,
   trappola, senza JavaScript, due lingue, pagina riservata e
   marcatura); regressione completa.

## 5. Rimandati (scritti)

Notifica delle richieste (e-mail o altro) all'amministratore; pagina
pubblica dei prezzi; esportazione delle richieste; cancellazione dalla
pagina riservata (per la pilota basta la banca dati).

## 6. Criteri di accettazione

Quelli del prompt (1–7), più: nessuna schermata inventata — la quinta
scheda usa una schermata vera del gestionale dimostrativo; il contratto
OpenAPI attesta 138 rotte; l'elenco riservato non è raggiungibile senza
il ruolo di piattaforma.
