# Prompt di modifica e miglioramento: mappa in evidenza e gestione della spiaggia

Prompt operativo scritto il 15/11/2026 per applicare la
[specifica](specifica-mappa-gestore.md) con una squadra di agenti dai ruoli distinti.
Si esegue dalla cartella `ombre/` del repository. Ogni incremento compiuto e verificato
si chiude con un commit in italiano, nello stile dei commit esistenti.

---

Agisci come una squadra senior composta da quattro ruoli: **product/UX**, **sviluppo
backend e dati**, **sviluppo frontend**, **collaudo**. Il contratto di lavoro della
squadra è la specifica in `docs/specifica-mappa-gestore.md`: leggila per intera prima
di toccare il codice, insieme a `docs/stato.md`, `docs/qualita-web.md` (accessibilità,
prestazioni, terze parti) e `docs/progetto-grafico.md` (resa grafica, mai solo colore).

REGOLE COMUNI

- Rispetta le convenzioni rilevabili dal codice: identificatori e commenti in inglese,
  testi dell'interfaccia in italiano e inglese in `packages/shared/src/i18n` (l'inglese
  deve ricalcare la forma dell'italiano), migrazioni SQL numerate in
  `packages/db/migrations` come fonte autorevole dello schema, specchio Drizzle in
  `schema.ts` aggiornato a mano insieme a GRANT e policy RLS.
- Le pagine pubbliche e l'area riservata funzionano **senza JavaScript**: ogni nuova
  azione è un modulo HTML che passa da `apps/web/app/azioni/[action]/route.ts`; la
  mappa è un arricchimento progressivo, mai un requisito.
- Nessuno script da domini esterni: Leaflet arriva da npm e viene servito dal sito;
  solo i tasselli immagine vengono da OpenStreetMap, con attribuzione visibile e
  `img-src` aggiornata nella Content-Security-Policy.
- Niente push verso repository remoti. Un commit per ogni incremento compiuto.

RUOLO 1 — PRODUCT/UX (verifica di coerenza, prima e dopo)

Prima dell'implementazione: rileggi la specifica contro i vincoli di
`docs/qualita-web.md` §3–4 e i «limiti onesti» di `docs/progetto-grafico.md`; se trovi
un conflitto, risolvilo nel senso più prudente e annotalo. Dopo l'implementazione:
percorri le pagine toccate come farebbe un ospite e come farebbe un gestore, verifica
ordine di lettura, etichette, messaggi d'errore vicini ai campi, aree di tocco, zoom al
200%, e che mappa e lista non divergano mai.

RUOLO 2 — SVILUPPO BACKEND E DATI

1. Migrazione `009_beach_position.sql`: coordinate facoltative su `beach` con CHECK
   di intervallo e vincolo «o entrambe o nessuna»; GRANT e policy RLS per
   l'aggiornamento da parte del gestore.
2. Migrazione `010_beach_layout.sql`: `zone`, `rental_type`, `rental_notes`, `retired`
   su `spot`; `shore_gap_rows` e `land_gap_rows` su `beach`; GRANT e policy RLS di
   scrittura su `spot` vincolate allo stabilimento.
3. Funzioni in `packages/db` (`withActor`/`withBeach`, scritture nel registro
   `audit_event`): lettura del layout, distanze, aggiunta di fila e di postazione,
   modifica (dotazione, capienza, tipo, note; anche per fila intera), ritiro e rimessa
   in vendita, eliminazione guardata con `DomainError`; la pubblicazione delle giornate
   salta le postazioni ritirate.
4. Rotte API: `PUT /v1/manage/beaches/:slug/position`; le capacità di layout della
   specifica sotto `/v1/manage/beaches/:slug/layout…`; `latitude`/`longitude` esposte
   da `GET /v1/beaches`. Due permessi: `layout.edit` (gestore) e `layout.gaps`
   (gestore e reception). OpenAPI e test di contratto aggiornati (conta delle rotte).
5. Seed: coordinate dimostrative per i due lidi; lettini riva/monte e tipi di affitto
   d'esempio su «Lido Aurora» come da specifica.
6. Test vitest per le nuove funzioni e rotte (successi e rifiuti: permessi, postazione
   usata, coordinate fuori intervallo).

RUOLO 3 — SVILUPPO FRONTEND

1. Componente mappa client caricato pigramente (Leaflet da npm, CSS compreso),
   con altezza riservata, tastiera, etichette testuali sui segnaposti, attribuzione.
2. Pagina iniziale: la mappa come modalità principale di identificazione dei lidi, con
   i dati da una rotta interna del sito (il server interroga l'API); il modulo di
   ricerca attuale resta come alternativa; senza JavaScript nessun contenuto perso.
3. «Esplora»: mappa sopra i risultati con la stessa selezione della lista, coordinate
   passate dal server come proprietà.
4. «Gestione»: campi latitudine/longitudine con l'avviso finché mancano; nuova pagina
   «Spiaggia» con anteprima della planimetria a zone e i moduli della specifica
   (distanze, file, postazioni, tipo di affitto con scelta rapida, valori già usati e
   testo personalizzato, note, azione per fila intera, ritiro e rimessa in vendita,
   avviso di incoerenza con i contratti stagionali).
   Aggiorna anche la voce «Mappa interattiva» nei «limiti onesti» di
   `docs/progetto-grafico.md`.
5. `BeachMap` a tre fasce (riva, ombrelloni, monte) con etichette e spazi
   proporzionali alle distanze; segno grafico distinto per il lettino singolo.
6. Testi it/en; stili in `packages/ui` coerenti con il progetto grafico.

RUOLO 4 — COLLAUDO

1. `pnpm check` e test con database (`pnpm test:db`) verdi.
2. Ambiente dimostrativo su Docker (progetto `ombre-demo`): verifica da HTTP dei
   criteri di accettazione della specifica, compresa la prenotazione pubblica di un
   lettino di riva e i rifiuti attesi (eliminazione di postazione usata, permessi
   della reception limitati alle distanze).
3. Collaudi fumo esistenti ancora verdi; aggiorna `docs/demo.md`, `docs/collaudo.md`
   e `docs/stato.md` con l'esito.

ORDINE DI LAVORO

Backend e dati per primo (schema, funzioni, API, seed, test; commit). Poi frontend
(commit). Poi collaudo con le correzioni che emergono (commit). Product/UX rilegge
all'inizio e alla fine. Se un vincolo della specifica risulta impraticabile, si sceglie
la soluzione più vicina che non violi `docs/qualita-web.md` e la si annota in
`docs/decisioni.md`.
