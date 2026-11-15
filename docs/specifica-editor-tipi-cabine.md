# Specifica: editor della planimetria, tipi di postazione, cabine del mare

Sviluppo dei tre suggerimenti del committente del 15/11/2026, arrivati dopo le
schermate di mappa e gestione della spiaggia. Il prompt operativo è in
[prompt-editor-tipi-cabine.md](prompt-editor-tipi-cabine.md); le decisioni di fondo in
[decisioni.md](decisioni.md) (D25, D26, D27). Questa specifica **estende** quella di
[specifica-mappa-gestore.md](specifica-mappa-gestore.md): zone, distanze e permessi di
layout restano come sono.

Parole del committente, conservate così come sono arrivate:

> Aggiungi anche la possibilità di poter personalizzare il disegno della propria
> struttura balneare disegnando la posizione del mare, le passarelle, gli ombrelloni,
> ecc… In modo da poter fare personalizzare la spiaggia ad ogni lido. Aggiungi anche
> tutti gli altri tipi di ombrelloni presenti tipo gazebi ecc… Ed anche la possibilità
> di poter affidare e subaffittare la propria cabina del mare.

Ha allegato tre mock-up concettuali fatti con un altro strumento: sono ispirazione,
non schermate da riprodurre (testi in parte inventati). Le loro idee compatibili sono
raccolte in fondo, nella sezione «Fase successiva».

## Stato di partenza

- La planimetria è una griglia per zone (riva, ombrelloni, monte) e file; la colonna è
  la posizione nel codice; il mare è sempre disegnato in alto; i corridoi sono le
  distanze riva/monte. Non esistono passerelle, cabine né altri elementi.
- Ogni postazione ha dotazione numerica (ombrelloni, lettini) ma non un **tipo** con
  nome, resa grafica e valori predefiniti propri.
- La pagina «Spiaggia» del gestore configura file, postazioni, distanze, tipo di
  affitto e note; i permessi sono `layout.edit` (gestore) e `layout.gaps` (anche
  reception).

## Funzione 1 — Editor della planimetria («disegno» della spiaggia)

### Obiettivo

Ogni lido personalizza il disegno della propria spiaggia: da che parte sta il mare,
dove passano le passerelle, dove stanno cabine e altri elementi. Il disegno **integra**
il configuratore esistente (zone, file, distanze) e la planimetria pubblica lo
rispecchia esattamente: ciò che il gestore disegna è ciò che l'ospite vede.

### Modello: il disegno resta una griglia

Niente canvas a pixel né trascinamento: il «disegno» è la composizione della griglia
esistente, che diventa esplicita.

Su `spot` (migrazione):

- `col smallint NOT NULL CHECK (col >= 1)`: colonna esplicita dentro la fila, con
  riempimento automatico: per ogni fila, ordine per codice e `col` = 1..n senza
  buchi. Vincolo di unicità (stabilimento, zona, fila, colonna). Da qui in poi
  **`col` è l'unica fonte del disegno e il codice è solo un'etichetta** (questo
  supera il «fuori ambito» della specifica precedente, registrato in D25); dopo il
  riempimento la colonna permette buchi (1, 2, 5, 6): il disegno può essere
  irregolare. Un test verifica che il venduto e le postazioni esistenti escono dalla
  migrazione invariati (nessuna postazione senza `col`, prezzi e prenotazioni
  intatti).

Su `beach`:

- `sea_side text NOT NULL DEFAULT 'top' CHECK (sea_side IN ('top','bottom'))`: da che
  parte si disegna il mare. Con `bottom` si inverte **solo la disposizione dei
  blocchi** (fascia del mare in basso, riva subito sopra, poi ombrelloni, poi monte
  in alto): il testo resta leggibile, mai specchiato; `row_after`, le distanze e la
  **fila 1 restano riferiti al mare** in ogni caso. L'ordine del documento (DOM) e la
  vista a elenco **non cambiano mai**: riva, ombrelloni, monte, fila 1 per prima
  (qualità web §3: l'elenco equivalente è stabile). Mare a sinistra/destra: fuori
  ambito.

Nuova tabella `layout_element`:

- `id`, `beach_id`, `kind text CHECK (kind IN ('walkway','cabin_block','structure'))`,
  `label text` (obbligatoria per `structure`, per esempio «Bar», «Docce»; facoltativa
  altrove), `orientation text CHECK (orientation IN ('horizontal','vertical'))`,
  `zone`/`row_after` e `col_start`/`col_end` secondo l'orientamento:
  - **passerella orizzontale**: corre lungo un intervallo di colonne ed è uno
    **strato a parte**: aggiunge una propria riga di disegno dopo la fila
    `row_after` di una zona (0 = prima della fila 1), senza entrare nel conteggio di
    `row_number`;
  - **passerella verticale**: corre tra due colonne (occupa l'interstizio dopo
    `col_start`); `zone` indica la zona attraversata, nulla = tutte;
  - **`structure`** (elemento generico con etichetta): occupa un rettangolo di celle
    libere (zona, fila, colonne da-a);
  - **`cabin_block`** è riservato alla Funzione 3: un blocco di cabine disegnato come
    una `structure`.
- I **corridoi delle distanze** (`shore_gap_rows`, `land_gap_rows`) restano un'altra
  cosa: nessun elemento vi si colloca dentro; le passerelle hanno le proprie righe e
  si sommano visivamente ai corridoi.
- Un elemento non può sovrapporsi a una postazione (nemmeno ritirata: la cella resta
  occupata nell'editor) né a un altro elemento: rifiuto con `DomainError` spiegato.

### Interfaccia del gestore («Spiaggia», sezione nuova «Disegno»)

- Scelta del lato del mare (alto/basso).
- Anteprima della griglia dove **ogni cella libera è un pulsante**: lo strumento
  scelto (passerella orizzontale/verticale, struttura con etichetta, blocco cabine,
  gomma) vive **nella query string** (`?strumento=…`), così sopravvive tra un invio
  e l'altro senza JavaScript; gli elementi che coprono più celle si disegnano in
  **due passi espliciti** («scegli l'inizio», poi «scegli la fine», con il passo
  annunciato sopra la griglia e un «Annulla») oppure con il modulo equivalente a
  coordinate (zona, fila, colonne da–a) sempre presente sotto la griglia.
- Dopo ogni invio si torna alla griglia con l'ancora (`#disegno`) e il messaggio di
  esito accanto alla griglia; il server applica e ridisegna. Niente trascinamento;
  con JavaScript non serve nulla di più.
- Accessibilità dell'editor: ogni cella ha un'etichetta con coordinate e stato
  («Riva, fila 1, colonna 3: libera»), bersagli di almeno 44×44 px con 8 px di
  distacco anche nell'anteprima, lettura per fila con le passerelle annunciate
  («Passerella»); una griglia larga scorre localmente, senza scorrimento orizzontale
  dell'intera pagina.
- Gli elementi esistenti si eliminano con lo strumento gomma o da un elenco sotto la
  griglia (etichetta, posizione, pulsante «Rimuovi»).
- Permesso: `layout.edit` (solo gestore).

### Resa pubblica

- La planimetria pubblica e l'anteprima del gestore disegnano: fascia del mare dal
  lato scelto, passerelle come corsie chiare con etichetta accessibile («Passerella»),
  strutture come riquadri con la loro etichetta, cabine come la Funzione 3. Mai solo
  colore: **ogni segno (anche gazebo, tenda, daybed) ha forma propria, etichetta e
  testo alternativo, e compare in legenda con la stessa forma**.
- Le celle vuote (buchi di colonna) si disegnano come sabbia, senza segnaposto e non
  selezionabili; non sono uno stato di disponibilità e non compaiono in legenda come
  tale. Le postazioni ritirate non si disegnano al pubblico, ma nell'editor occupano
  ancora la loro cella.

## Funzione 2 — Tipi di postazione (gazebo e altri)

### Obiettivo

Oltre all'ombrellone classico e al lettino singolo esistono gazebo e altri tipi, con
capienza, prezzo e resa grafica propri; il gestore può definire tipi personalizzati.

### Modello

Nuova tabella `spot_type`:

- `id`, `beach_id`, `name text` (≤40, unico per stabilimento), `mark text CHECK (mark
  IN ('umbrella','sunbed','gazebo','tent','daybed'))` (la resa grafica si sceglie da
  un repertorio fisso di segni, anche per i tipi personalizzati), `umbrellas`,
  `sunbeds`, `max_guests` (dotazione e capienza predefinite), `default_price_cents
  integer` facoltativo, `builtin boolean` (i tre tipi di base non si eliminano).
- Ogni stabilimento nasce (migrazione e creazione) con tre tipi di base: Ombrellone
  (mark umbrella), Lettino singolo (mark sunbed), Gazebo (mark gazebo). Le postazioni
  esistenti vengono agganciate: `spot.type_id` NOT NULL dopo il riempimento
  (ombrelloni → Ombrellone, lettini riva/monte → Lettino singolo).
- I predefiniti del tipo si **copiano alla creazione** della postazione e non si
  propagano mai: modificare un tipo tocca solo le postazioni create dopo. Il cambio
  di tipo di una postazione esistente è un'azione esplicita che **non** tocca la sua
  dotazione. L'etichetta pubblica mostra il nome del tipo e la **dotazione propria
  della postazione** («Gazebo G01 … la sua dotazione reale»).

### Prezzo

- `publishDay` continua a prendere il prezzo base della giornata; se il tipo della
  postazione ha `default_price_cents`, per quella postazione vale il suo prezzo.
  Il prezzo del tipo agisce **solo alla pubblicazione di giornate nuove**: non
  riscrive mai `inventory_day` esistenti né prenotazioni; cambiare
  `default_price_cents` non tocca le giornate già pubblicate. `setPrice` per
  giornata e postazione resta sovrano. Un test verifica che venduto e prezzi già
  fissati restano invariati dopo le migrazioni.

### Interfaccia

- «Spiaggia», sezione nuova «Tipi di postazione»: elenco dei tipi (nome, segno,
  dotazione, capienza, prezzo predefinito), creazione di un tipo personalizzato,
  modifica, eliminazione solo se nessuna postazione lo usa. Permesso `layout.edit`.
- «Aggiungi fila» e «Aggiungi postazione» scelgono il tipo da una tendina; i campi di
  dotazione mostrano i predefiniti del tipo e restano modificabili.
- La legenda della planimetria (pubblica e gestore) elenca i segni presenti.

## Funzione 3 — Cabine del mare: affidamento e subaffitto

### Obiettivo

Le cabine sono censite nel disegno della spiaggia. Il gestore **affida** una cabina a
un titolare per un periodo; il titolare può **subaffidarla** per sottoperiodi a
persone che indica, con **approvazione del gestore**; resta traccia di chi la usa in
ogni momento. Niente denaro nel sistema: periodi, persone e approvazioni (i canoni si
regolano fuori, come per i contratti stagionali il cui flusso economico reale non è
ancora attivo).

### Modello

- Nuova tabella `cabin`: `id`, `beach_id`, `code text` (unico per stabilimento),
  `element_id` verso il blocco cabine nel disegno (facoltativo: una cabina può non
  essere ancora disegnata), `notes text`.
- `cabin_assignment` (affidamento): `id`, `cabin_id`, `holder_account_id` facoltativo
  **oppure** `holder_name`/`holder_contact` testuali (il titolare può non avere un
  accesso), `valid_from`, `valid_to`, `status ('active','ended')`; vietata la
  sovrapposizione di affidamenti sulla stessa cabina (EXCLUDE, come i contratti
  stagionali).
- `cabin_sublet` (subaffitto): `id`, `assignment_id`, `from_day`, `to_day`,
  `occupant_name` (obbligatorio), `occupant_contact`, `status
  ('proposed','approved','rejected','ended')`, `decided_by`/`decided_at`; il periodo
  deve stare dentro l'affidamento; vietata la sovrapposizione tra subaffitti
  approvati dello stesso affidamento.
- Tutte le scritture nel registro (`audit_event`).

### Ruoli e flussi

- Ripartizione esatta dei permessi: il **blocco cabine nel disegno** si crea e si
  rimuove con `layout.edit`; **cabina, affidamenti e decisioni** con il nuovo
  permesso `cabins.manage` (entrambi del solo gestore). Rimuovere con la gomma un
  blocco a cui sono agganciate cabine è permesso: le cabine restano, con `element_id`
  a NULL (non più disegnate), e l'elenco lo segnala.
- **Gestore**: crea le cabine (dal disegno o dall'elenco), affida, chiude un
  affidamento, approva o rifiuta i subaffitti, vede il quadro completo («chi usa
  cosa», per giorno). Chiudere un affidamento prima della scadenza **tronca o chiude
  i subaffitti** oltre la nuova data (riga in `audit_event`), e il titolare lo vede
  segnalato nella sua pagina.
- **Titolare della cabina**: se ha un accesso (nuovo ruolo `cabin_holder`, per
  stabilimento, creato dall'amministratore come gli altri accessi; RLS su
  `holder_account_id`), vede **esattamente**: le proprie cabine (codice, posizione),
  i propri periodi di affidamento, le proprie proposte con stato ed eventuale esito
  del gestore, e gli occupanti da lui stesso indicati. Propone un subaffitto
  (periodo + nome e contatto dell'occupante) dentro il proprio periodo. Non vede
  nulla d'altro dello stabilimento. Un titolare senza accesso non vede nulla: esiste
  solo nei registri del gestore. Il flusso ricalca le proposte degli stagionali.
- **Reception**: vede l'elenco «cabine di oggi» (occupante corrente per cabina) per
  l'operatività; non decide nulla.
- La scheda pubblica dello stabilimento non mostra le cabine: sono gestionali, come
  il tipo di affitto.

### Interfaccia

- Nuova pagina «Cabine» in area gestione (`/area/gestione/{slug}/cabine`, slug
  inglese `cabins`): elenco cabine con affidamento corrente e occupante di oggi;
  creazione/modifica; affidamento con periodo e titolare; proposte di subaffitto in
  attesa con Approva/Rifiuta; storia per cabina (tracciamento stagionale).
- Area del titolare: pagina essenziale con le sue cabine, i periodi, il modulo di
  proposta e lo stato delle proposte.
- Tutto senza JavaScript, moduli come il resto dell'area.

## Seed dimostrativi

Lido Aurora: mare in alto (com'è), una passerella verticale centrale e una
orizzontale dopo la fila C, una struttura «Bar» a monte, un blocco di 4 cabine
(`CAB1`–`CAB4`) sul lato monte; due gazebo (`G01`, `G02`) con il tipo Gazebo (4
ospiti, prezzo predefinito maggiore); un tipo personalizzato «Tenda araba» (mark
tent) con una postazione; `CAB1` affidata a un titolare con accesso dimostrativo
(`cabina@lidoaurora.example`), con un subaffitto approvato in corso e una proposta in
attesa; `CAB2` affidata a un titolare senza accesso. [demo.md](demo.md) aggiornata.

## Fuori ambito (esplicito)

- Trascinamento libero e canvas a pixel: il disegno è la griglia.
- Mare a sinistra/destra; rotazione della planimetria.
- Pagamenti e canoni di affidamento/subaffitto; prenotazione pubblica delle cabine.
- Foto o icone caricate per i tipi personalizzati: il repertorio dei segni è fisso.
- Le idee dei mock-up elencate sotto come «Fase successiva».

## Fase successiva (dai mock-up del committente, non in questa consegna)

1. **Categorie in evidenza** nella home (Famiglia, Relax, Sport) come filtri: oggi i
   servizi sono testo libero; arriverà con i servizi strutturati (già tra i limiti).
2. **Extra nel percorso d'acquisto** (lezione di SUP, pranzo al lettino…): richiede un
   catalogo di servizi aggiuntivi per stabilimento e la loro ripartizione economica.
3. **«Aggiungi al Wallet»** sul pass: file Apple/Google Wallet accanto al QR esistente.
4. Cruscotto ospite con punti e preferiti: richiede account degli ospiti, oggi
   inesistenti per scelta (dati minimi).

## Criteri di accettazione

0. Dopo le migrazioni: nessuna postazione senza `col` né senza `type_id`; prezzi
   delle giornate pubblicate, prenotazioni e contratti invariati (confronto prima/
   dopo); le rotte pubbliche non contengono nessun campo gestionale nuovo
   (`rental_*`, `retired`, cabine, affidamenti, subaffitti), verificato da un test
   sul JSON.
1. Il gestore sposta il mare in basso: nell'HTML la fascia del mare e l'ordine
   visivo dei blocchi si invertono, mentre l'ordine del DOM e la vista a elenco
   restano identici; riportato in alto, l'HTML torna uguale a prima (confronto).
2. Il gestore disegna una passerella orizzontale e una verticale, una struttura con
   etichetta e un blocco cabine cliccando le celle, senza JavaScript (strumento
   nella query string, due passi per gli elementi estesi); la struttura della
   planimetria risultante è la stessa nell'anteprima e nella pagina pubblica
   (stesse righe, stessi elementi, stesse etichette); la gomma li toglie; una
   sovrapposizione è rifiutata con messaggio chiaro.
3. Esistono i tre tipi di base; il gestore crea un tipo personalizzato con segno dal
   repertorio, dotazione, capienza e prezzo predefinito; una fila nuova nasce con quel
   tipo; l'etichetta pubblica dice il nome del tipo; un tipo usato non si elimina.
4. Una giornata pubblicata applica il prezzo predefinito del tipo dove c'è e il
   prezzo base altrove; un gazebo si prenota dal pubblico fino al pass.
5. Il gestore affida una cabina per un periodo (con o senza accesso del titolare);
   gli affidamenti sovrapposti sono rifiutati.
6. Il titolare con accesso vede solo le sue cabine, propone un subaffitto nel proprio
   periodo; il gestore approva o rifiuta; i periodi sovrapposti o fuori affidamento
   sono rifiutati; la reception vede l'occupante di oggi; tutto è in `audit_event`.
7. Le cabine e i subaffitti non compaiono in nessuna pagina né rotta pubblica.
8. `pnpm check`, test con database e collaudi fumo verdi; contratto OpenAPI
   aggiornato; schermate nuove (desktop e telefono) di disegno, tipi e cabine.
