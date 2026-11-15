# Specifica: mappa in evidenza e gestione della spiaggia

Sviluppo dei due suggerimenti del committente del 15/11/2026. Il prompt operativo che
applica questa specifica è in [prompt-mappa-gestore.md](prompt-mappa-gestore.md); le
decisioni di fondo sono registrate in [decisioni.md](decisioni.md) (D23, D24).

Parole del committente, conservate così come sono arrivate:

> nella modalità di ricerca del lido sulla home inserirei come principale la navigazione
> su mappa per identificare i lidi; account gestore lidi: il gestore deve poter
> configurare il suo lido (file e colonna), graficamente va bene come hai fatto, ma da
> aggiungere il posizionamento di un lettino singolo sulla zona riva (x numero di file
> dopo gli ombrelloni configurabile da bagnino), stesso vale per lato monte. Questo è un
> gestionale che tiene traccia di tutti gli ombrelloni gestiti dal lido in tutta la
> stagione quindi deve poter selezionare su ombrelloni tipo di affitto (stagionale,
> albergo, o personalizzare quello che vuole come note, ecc.)

## Stato di partenza (rilevato sul codice il 15/11/2026)

- Nessuna mappa e nessuna coordinata: la tabella `beach` ha solo `locality` testuale;
  la mappa interattiva era stata rimandata ([progetto-grafico.md](progetto-grafico.md) §limiti)
  perché mancavano fornitore e coordinate.
- La ricerca dalla home è un modulo GET (`place`, `day`, `guests`, `shared`) che porta a
  «Esplora»; i risultati sono schede renderizzate dal server (`apps/web/components/pages.tsx`,
  `GET /v1/beaches`).
- Il layout della spiaggia è la sola tabella `spot` (`code`, `row_number`, `umbrellas`,
  `sunbeds`, `max_guests`): niente zone, niente colonna esplicita, niente tipo di
  affitto, niente note. Le postazioni nascono solo dai seed: **il gestore oggi non può
  creare né modificare il layout**.
- La planimetria pubblica (`apps/web/components/beach.tsx`) raggruppa per fila e ordina
  per codice; il mare è disegnato sopra la fila 1 («dal lato della fila 1»).

## Funzione 1 — La mappa come modalità principale di ricerca

### Obiettivo

Chi apre la pagina iniziale identifica i lidi prima di tutto **navigando una mappa**
con un segnaposto per stabilimento; la ricerca per località/giorno/ospiti resta come
alternativa equivalente. In «Esplora», mappa e lista mostrano **la stessa selezione**
(requisito già scritto in [schede-moduli.md](schede-moduli.md) e
[qualita-web.md](qualita-web.md) §3).

### Dati

- Migrazione `009`: su `beach` le colonne `latitude double precision` e
  `longitude double precision`, entrambe facoltative, con CHECK sugli intervalli
  (−90…90, −180…180) e vincolo «o entrambe o nessuna».
- Uno stabilimento **senza coordinate non compare sulla mappa** ma resta in lista
  (coerente con D21: solo dati veri, niente posizioni inventate).
- Il gestore imposta la posizione del proprio lido da «Gestione»: due campi numerici
  (latitudine, longitudine) con aiuto testuale, azione `PUT
  /v1/manage/beaches/:slug/position` (autorizzazione: le stesse impostazioni di
  configurazione dello stabilimento già riservate al gestore). Servono GRANT di UPDATE
  sulle due colonne e la relativa policy RLS.
- Seed dimostrativi: coordinate di fantasia ma plausibili per «Lido Aurora» (Marina
  Azzurra) e «Bagno delle Dune» (Lido di Pomposa), dichiarate dimostrative in
  [demo.md](demo.md).

### Fornitore e libreria (decisione D23)

- **Leaflet** installato da npm e servito dal dominio di Ombrè (nessuno script esterno,
  come da [qualita-web.md](qualita-web.md) §4); tasselli raster di **OpenStreetMap**
  con attribuzione obbligatoria visibile.
- La Content-Security-Policy e la `Permissions-Policy` restano come sono, tranne
  l'aggiunta dei domini dei tasselli a `img-src`. Nessuna geolocalizzazione del
  visitatore (la `Permissions-Policy` continua a negarla).
- La mappa **si carica solo quando serve** (componente client caricato pigramente),
  mai in modo bloccante; se i tasselli non arrivano o lo script non è pronto, il
  riquadro mostra il collegamento a «Esplora» e la lista resta la via completa.

### Pagina iniziale

- Nel blocco di apertura la **mappa è la modalità principale**: riquadro grande con i
  segnaposti di tutti gli stabilimenti attivi con coordinate; il modulo di ricerca
  attuale resta accanto/sotto come alternativa, con gli stessi campi di oggi.
- La pagina iniziale è prerenderizzata e non legge dati: i dati dei segnaposti arrivano
  **dopo, via script**, da una rotta interna del sito (per esempio `GET /dati/mappa`,
  gestita da `apps/web` che interroga l'API dal server), così il browser non deve
  raggiungere l'API direttamente. Questo rispetta la regola «contenuto nell'HTML
  servito» perché la mappa è un arricchimento: il contenuto statico e i collegamenti
  restano nell'HTML.
- Ogni segnaposto apre una scheda essenziale: nome, località, prezzo «da» se
  disponibile, collegamento alla pagina dello stabilimento. Senza JavaScript il
  riquadro è un invito a «Esplora» (nessun contenuto perso).

### Esplora

- Sopra i risultati, la **stessa selezione** su mappa: i segnaposti sono i soli
  stabilimenti filtrati (il server passa le coordinate al componente come proprietà,
  senza seconda chiamata). Lista e mappa non divergono mai.
- `GET /v1/beaches` espone `latitude`/`longitude` (nulli se assenti) in ogni risultato;
  il documento OpenAPI e il test di contratto vanno aggiornati.

### Accessibilità e prestazioni

- La mappa è utilizzabile da tastiera (Leaflet lo prevede); ogni segnaposto ha
  un'etichetta testuale; l'alternativa a elenco è sempre presente e raggiungibile
  prima della mappa nell'ordine di lettura.
- Nessun salto di layout: il riquadro riserva la sua altezza; LCP resta l'immagine o il
  titolo di apertura, non la mappa.

## Funzione 2 — Gestione della spiaggia da parte del gestore

### Obiettivo

Il gestore configura da sé il layout del lido: file e colonne di ombrelloni (la resa
grafica attuale va bene), **lettini singoli in zona riva e lato monte** a distanza
configurabile dagli ombrelloni, e per ogni ombrellone il **tipo di affitto** con note,
perché il gestionale segue tutti gli ombrelloni per l'intera stagione.

### Modello dei dati (migrazione `010`, decisione D24)

Su `spot`:

- `zone text NOT NULL DEFAULT 'ombrelloni' CHECK (zone IN ('riva','ombrelloni','monte'))`.
  La fila (`row_number`) resta ≥ 1 e si conta **dentro la zona**; l'ordine di
  disegno e di elenco diventa: riva (dal mare), poi ombrelloni, poi monte.
- `rental_type text` facoltativo (massimo 40 caratteri): etichetta del tipo di
  affitto. Valori suggeriti «Stagionale» e «Albergo», ma il gestore scrive ciò che
  vuole (personalizzato).
- `rental_notes text` facoltativo (massimo 500 caratteri): note libere del gestore.
- Tipo e note sono **gestionali e mai pubblici**: non escono dalle rotte pubbliche.
  L'etichetta «Stagionale» è una classificazione del gestore e non crea né richiede un
  `season_contract`: i contratti restano il meccanismo operativo; dove esiste un
  contratto attivo l'interfaccia lo mostra accanto all'etichetta.

Su `beach`:

- `shore_gap_rows smallint NOT NULL DEFAULT 1 CHECK (shore_gap_rows BETWEEN 0 AND 10)`:
  numero di file di distanza tra la prima fila di ombrelloni e i lettini della riva.
- `land_gap_rows smallint NOT NULL DEFAULT 1` (stesso CHECK): distanza tra l'ultima
  fila di ombrelloni e i lettini del lato monte.

Permessi e sicurezza: nuovo permesso `layout.edit` in
`packages/shared/src/domain/permissions.ts`. La **struttura** (file, postazioni,
tipo di affitto) la modifica il solo gestore; le **distanze riva/monte** anche la
reception (il «bagnino» del committente). GRANT di INSERT/UPDATE/DELETE su `spot` (e
UPDATE sulle nuove colonne di `beach`) a `ombre_app`, con policy RLS di scrittura
vincolate allo stabilimento corrente.

### API (sotto `/v1/manage/beaches/:slug`)

Capacità richieste (l'accorpamento esatto delle rotte è a discrezione di chi
implementa, purché documentate in OpenAPI e coperte dal test di contratto):

- leggere il layout completo (zone, distanze, postazioni con dotazione, tipo, note,
  eventuale contratto stagionale attivo);
- impostare le distanze riva/monte;
- aggiungere una fila di postazioni in una zona (prefisso del codice, quante
  postazioni, dotazione; in riva e monte la dotazione predefinita è un lettino
  singolo: 0 ombrelloni, 1 lettino, 1 ospite);
- aggiungere una singola postazione (il «lettino singolo» del committente);
- modificare una postazione (dotazione, capienza, tipo di affitto, note);
- eliminare una postazione **solo se mai usata** (nessun `inventory_day`, nessuna
  prenotazione, nessun contratto): altrimenti rifiuto con `DomainError` spiegato.

Le scritture passano dalle funzioni in `packages/db` con `withActor`/`withBeach` e
finiscono nel registro (`audit_event`) come le altre azioni del gestore.

### Interfaccia del gestore

- Nuova pagina «Spiaggia» in area gestione (`/area/gestione/{slug}/spiaggia`, slug
  inglese `beach-layout`), raggiunta da «Gestione»: in alto l'anteprima della
  planimetria **con le zone** (stessa resa grafica del pubblico: va bene com'è), sotto
  i moduli, tutti funzionanti senza JavaScript come il resto dell'area:
  - distanze riva e monte (due campi numerici, «file di distanza dagli ombrelloni»);
  - aggiungi fila / aggiungi postazione per zona;
  - per ogni postazione: dotazione, capienza, **tipo di affitto** (scelta rapida
    «Stagionale», «Albergo» o testo personalizzato) e **note**; accanto, se c'è, il
    contratto stagionale attivo.
- Le azioni passano da `apps/web/app/azioni/[action]/route.ts` come le esistenti.
- Testi it/en in `packages/shared/src/i18n` (l'inglese ricalca la forma dell'italiano).

### Planimetria (pubblico e gestore)

- `BeachMap` disegna tre fasce: **riva** subito sotto il mare, separata dagli
  ombrelloni da uno spazio proporzionale a `shore_gap_rows`; **ombrelloni** come oggi;
  **monte** in fondo, separata da `land_gap_rows`. Ogni fascia ha un'etichetta
  testuale (mai solo colore, come da progetto grafico).
- I lettini singoli sono postazioni a tutti gli effetti: prenotabili, bloccabili,
  con prezzo per giornata come le altre; il segno grafico li distingue (lettino,
  non ombrellone) e l'etichetta ne dichiara la dotazione.

### Seed dimostrativi

«Lido Aurora» guadagna 6 lettini in riva (`R01`–`R06`, distanza 1) e 4 sul lato monte
(`M01`–`M04`, distanza 2), con giornate pubblicate come le altre postazioni; alcuni
ombrelloni ricevono tipo di affitto e note d'esempio (almeno uno «Stagionale», uno
«Albergo», uno personalizzato). [demo.md](demo.md) va aggiornata.

## Fuori ambito (esplicito)

- Geolocalizzazione del visitatore e «vicino a me»; ricerca per raggio o per area
  visibile sulla mappa; raggruppamento dei segnaposti.
- Trascinamento grafico delle postazioni: la configurazione è per moduli, la
  planimetria è l'anteprima.
- Colonne con numerazione separata dal codice: la «colonna» resta la posizione nel
  codice della fila (A01, A02, …), come oggi.
- Tipo di affitto nelle pagine pubbliche o nei prezzi: è un dato gestionale.

## Criteri di accettazione

1. La pagina iniziale presenta la mappa come modalità principale; segnaposti per i due
   lidi dimostrativi; senza JavaScript la pagina resta completa e porta a «Esplora».
2. In «Esplora» mappa e lista mostrano la stessa selezione per ogni combinazione di
   filtri; uno stabilimento senza coordinate appare in lista e non sulla mappa.
3. Il gestore imposta le coordinate del lido da «Gestione» e le vede sulla mappa.
4. Il gestore crea file e postazioni nelle tre zone; le distanze riva/monte cambiano
   il disegno; la reception può cambiare le sole distanze.
5. Un lettino singolo in riva si prenota dal pubblico come ogni altra postazione.
6. Tipo di affitto e note si impostano per postazione, restano per tutta la stagione,
   compaiono solo nell'area riservata e sono registrate in `audit_event`.
7. Una postazione mai usata si elimina; una usata no, con messaggio chiaro.
8. `pnpm check` e i test con database passano; il test di contratto OpenAPI è
   aggiornato; i collaudi fumo esistenti restano verdi.
