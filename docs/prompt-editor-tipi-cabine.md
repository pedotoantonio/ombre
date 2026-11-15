# Prompt di modifica e miglioramento: editor, tipi di postazione, cabine

Prompt operativo scritto il 15/11/2026 per applicare la
[specifica](specifica-editor-tipi-cabine.md) con una squadra di agenti dai ruoli
distinti. Si esegue dalla cartella `ombre/` del repository. Ogni incremento compiuto e
verificato si chiude con un commit in italiano, nello stile dei commit esistenti.

---

Agisci come una squadra senior composta da quattro ruoli: **product/UX**, **sviluppo
backend e dati**, **sviluppo frontend**, **collaudo**. Il contratto di lavoro è la
specifica in `docs/specifica-editor-tipi-cabine.md`: leggila per intera prima di
toccare il codice, insieme a `docs/specifica-mappa-gestore.md` (che estende),
`docs/stato.md`, `docs/qualita-web.md` e `docs/progetto-grafico.md`.

REGOLE COMUNI

- Convenzioni del repository: identificatori e commenti in inglese; testi it/en in
  `packages/shared/src/i18n` (l'inglese ricalca la forma dell'italiano); migrazioni
  SQL numerate in `packages/db/migrations` come fonte autorevole; specchio Drizzle,
  GRANT e policy RLS aggiornati a mano; scritture con `withActor`/`withBeach` e
  registro `audit_event`; rifiuti di dominio con `DomainError`.
- Tutta l'area riservata funziona **senza JavaScript**: l'editor del disegno usa
  celle-pulsante (submit con coordinate), mai trascinamento; le azioni passano da
  `apps/web/app/azioni/[action]/route.ts`.
- Mai solo colore: ogni elemento del disegno ha forma ed etichetta; contrasto e aree
  di tocco come da progetto grafico.
- Niente push. Un commit per ogni incremento compiuto.

RUOLO 1 — PRODUCT/UX

Prima: rileggi la specifica contro i vincoli dei documenti di qualità; risolvi i
conflitti nel senso più prudente e annotali. Dopo: percorri editor, tipi e cabine come
gestore, titolare di cabina, reception e ospite; verifica etichette, ordine di
lettura, messaggi d'errore vicini ai campi, coerenza tra anteprima e planimetria
pubblica.

RUOLO 2 — SVILUPPO BACKEND E DATI

1. Migrazione `011_layout_canvas.sql`: `col` su `spot` (riempimento dall'ordine dei
   codici, unicità stabilimento/zona/fila/colonna), `sea_side` su `beach`,
   tabella `layout_element` con i vincoli della specifica; GRANT e RLS.
2. Migrazione `012_spot_types.sql`: tabella `spot_type`, tre tipi di base per ogni
   stabilimento esistente e futuro, `spot.type_id` NOT NULL dopo riempimento; GRANT e
   RLS.
3. Migrazione `013_cabins.sql`: `cabin`, `cabin_assignment` (EXCLUDE sulle
   sovrapposizioni), `cabin_sublet`; nuovo ruolo `cabin_holder` e permesso
   `cabins.manage`; GRANT e RLS (il titolare vede solo le proprie cabine).
4. Funzioni in `packages/db`: disegno (lato mare, elementi con controllo di
   sovrapposizione, gomma), tipi (CRUD guardato, predefiniti), `publishDay` con il
   prezzo predefinito del tipo, cabine (censimento, affidamenti, proposte e decisioni
   di subaffitto, occupante del giorno, storia).
5. Rotte API sotto `/v1/manage/beaches/:slug/…` per disegno, tipi e cabine; rotte del
   titolare (`/v1/cabins/…` o simile, scegli tu con criterio); la planimetria
   pubblica (`availability`) espone `seaSide`, elementi del disegno, `col` e il nome
   del tipo per postazione — mai cabine/affidamenti/subaffitti nel pubblico.
   OpenAPI e test di contratto aggiornati.
6. Seed come da specifica (passerelle, «Bar», blocco cabine, gazebo, «Tenda araba»,
   affidamenti e subaffitti dimostrativi, accesso cabina@lidoaurora.example).
7. Test vitest: successi e rifiuti (sovrapposizioni di elementi, affidamenti e
   subaffitti; tipo usato non eliminabile; permessi di titolare e reception; prezzo
   del tipo in pubblicazione).

RUOLO 3 — SVILUPPO FRONTEND

1. «Spiaggia»: sezione «Disegno» (lato del mare; strumento scelto da modulo; griglia
   di celle-pulsante; elenco elementi con «Rimuovi»); sezione «Tipi di postazione»
   (elenco, crea/modifica/elimina, tendina del tipo in «Aggiungi fila/postazione» con
   predefiniti precompilati).
2. Planimetria (`PlanCanvas`): lato del mare, colonne esplicite con buchi disegnati
   come sabbia, passerelle, strutture etichettate, blocchi cabine, segni nuovi
   (gazebo, tenda, daybed) nel repertorio e nella legenda; identica al pubblico e
   nell'anteprima.
3. Nuova pagina «Cabine» del gestore e pagina essenziale del titolare, come da
   specifica; «cabine di oggi» per la reception dentro la sua vista esistente.
4. Testi it/en completi; stili in `packages/ui` coerenti; etichette pubbliche delle
   postazioni con il nome del tipo.

RUOLO 4 — COLLAUDO

1. `pnpm check` e `pnpm test:db` verdi; collaudi fumo esistenti verdi.
2. Ambiente di prova in Docker: verifica da HTTP degli otto criteri di accettazione
   della specifica, nei panni di gestore, titolare, reception e ospite.
3. Schermate desktop e telefono di: sezione «Disegno» con passerelle e strutture,
   «Tipi di postazione», pagina «Cabine», planimetria pubblica con gli elementi e un
   gazebo. Aggiorna `docs/demo.md` e `docs/collaudo.md`.

ORDINE DI LAVORO

Backend e dati (commit), poi frontend (commit), poi collaudo con le correzioni che
emergono (commit). Product/UX rilegge all'inizio e alla fine. Se un vincolo della
specifica è impraticabile, si sceglie la soluzione più vicina che non violi i
documenti di qualità e la si annota in `docs/decisioni.md`.
