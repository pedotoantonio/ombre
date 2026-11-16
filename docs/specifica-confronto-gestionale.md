# Specifica — Miglioramenti dal confronto con un gestionale di mercato

Scritta il 16/11/2026 su richiesta del committente: «studia i miglioramenti e poi
crealo con l'ausilio di agenti». Il confronto è con il gestionale di spiagge.it
(gruppo Zucchetti), pagine «gestionale spiaggia» e «funzionalità», messo accanto a
[stato.md](stato.md). Questa specifica prima classifica le tredici mancanze emerse,
poi sceglie e sviluppa in requisiti quelle di questa iterazione. Il metodo è quello
delle iterazioni precedenti: revisione product/UX della specifica, poi agenti per
ruolo (backend, frontend, collaudo), un commit per incremento verificato.

## 1. Classificazione delle tredici voci

Tre classi: **fattibile ora** (si costruisce in questa iterazione), **dipende**
(da decisioni del committente o da fornitori esterni: si modella la parte
indipendente o si registra), **fuori perimetro** (si registra e basta).

| # | Voce | Classe | Destino |
|---|------|--------|---------|
| 1 | Pagamenti reali e richiesta di acconto con link temporaneo | dipende (fornitore reale: D6) | la parte modellabile — acconti e link di pagamento col fornitore di prova — **in questa iterazione** (§4.3) |
| 2 | Cassa fiscale (stampanti fiscali, scontrino) | dipende (hardware e fornitori RT) | studio in §7.1, niente da costruire ora |
| 3 | Bar/ristorante (conto unico, ordinazione dall'ombrellone) | fuori perimetro (serve un POS o una sua integrazione) | fase successiva §7.2 |
| 4 | Planner a linea temporale per postazione | fattibile ma rinviato | fase successiva §7.3, con abbozzo; il valore pieno arriva con le prenotazioni multi-giorno, oggi la vendita è per giornata |
| 5 | «Ricerca Smart»: postazione migliore suggerita | fattibile ora (euristica, niente AI) | **in questa iterazione** (§3.3) |
| 6 | Statistiche avanzate | fattibile ora | **in questa iterazione** (§3.2) |
| 7 | Mappa operativa del gestore | fattibile ora | **in questa iterazione** (§3.1) |
| 8 | Convenzioni hotel con prezzo automatico | fattibile ora | **in questa iterazione** (§4.1) |
| 9 | Servizi extra in prenotazione e al banco | fattibile ora | **in questa iterazione** (§4.2); realizza anche l'idea «extra nell'acquisto» dei mock-up del committente |
| 10 | App mobile dedicata | fuori portata ora | registrata in §7.4 |
| 11 | Comunicazioni reali WhatsApp/email | dipende (fornitore d'invio) | la parte modellabile — coda e testi pronti, pagina «Comunicazioni» — **in questa iterazione** (§4.3); l'invio reale resta nei «non fatto» |
| 12 | Marketplace di esperienze | fuori perimetro | registrata in §7.4 |
| 13 | Gestionale piscina | fuori perimetro | registrata in §7.4 |

Dove Ombrè è già pari o avanti non si rifà nulla: condivisione stagionale, portale
«Esplora» con mappa, pass con QR e reception, cabine con subaffitto, sito dello
stabilimento, editor del disegno della spiaggia.

## 2. Perimetro dell'iterazione: due ondate, ciascuna intera

Sei voci sono tante; meglio due consegne complete che nove a metà. L'iterazione è
divisa in **due ondate indipendenti**, ognuna con il proprio giro
backend → frontend → collaudo e i propri criteri. Se la seconda non si chiude, la
prima resta consegnata e collaudata.

- **Ondata A — operativa** (quasi sola lettura, rischio basso): console operativa
  del giorno (§3.1), statistiche (§3.2), postazione consigliata (§3.3).
- **Ondata B — commerciale** (tocca denaro e flusso d'acquisto), a sua volta in
  **tre incrementi interni**, ciascuno committato e consegnabile da solo:
  **B1** convenzioni hotel (§4.1), **B2** servizi extra nel flusso d'acquisto
  (§4.2), **B3** pagamenti multipli, incasso rinviato, acconti e comunicazioni
  (§4.3, che assorbe anche gli extra aggiunti a vendita già fatta). B3 è
  l'incremento che tocca gli invarianti più delicati e viene per ultimo: se non
  si chiude, B1 e B2 restano consegnati.

Motivazione delle scelte: 7, 6 e 5 danno valore immediato al gestore sui dati che
Ombrè già possiede; 8 e 9 chiudono le due mancanze commerciali più citate dal
confronto; di 1 e 11 si costruisce tutta la parte che non dipende dal fornitore,
così la scelta del fornitore reale troverà il modello pronto. Il planner (4) è
l'unica voce «fattibile» esclusa: è la più rischiosa sull'interfaccia senza
JavaScript e rende davvero con le prenotazioni multi-giorno, che oggi non ci sono.

## 3. Ondata A — operativa

### 3.1 Console operativa del giorno («Oggi sulla spiaggia»)

Nuova pagina riservata per gestore e reception, slug `oggi` / `today`, giorno
scelto con navigazione per data (frecce avanti/indietro e pulsante «Oggi»;
predefinito: oggi).

Il committente ha indicato come riferimento la pagina operativa di
spiagge.it PRO
([riferimento](grafica/riferimento-console-operativa.png), schermata fornita il
16/11/2026): se ne riprende **l'impostazione**, mai i loro disegni, colori di
marca o icone. Tutto è reso nella grafica «Solar & Fresh» di Ombrè.

- **Scena a tutto schermo**: la spiaggia occupa la pagina come scena illustrata
  — fascia del mare dal lato scelto nel disegno (`sea_side`), sabbia come
  fondo, passerelle e strutture etichettate dove il gestore le ha disegnate.
  La scena deriva **dallo stesso disegno** dell'editor (D25): nessun secondo
  layout da mantenere. **La scena è la griglia del disegno, non una
  ricostruzione libera**: niente dune curve, strade, rocce o vegetazione come
  nel riferimento — decorazioni sobrie coi token della palette, nessuna
  illustrazione estranea ai dati. Questa differenza va detta al committente
  alla consegna.
- **Una tessera per postazione**, compatta, posta nella cella del disegno:
  icona del tipo (dal repertorio di segni, D26) **riempita col colore dello
  stato**, codice postazione (es. «B2-5»), cognome dell'ospite quando la
  giornata è venduta, dotazione in forma breve (es. «1O+2L»), e per i casi
  particolari un **distintivo testuale**: `R` riservata (hold attivo), `C`
  convenzione (ondata B), `S` condivisione stagionale, `B` bloccata. Stati:
  `libera`, `riservata`, `attesa` (venduta, ospite non arrivato), `presente`,
  `uscita` (rientro consentito), `bloccata`, `non in vendita`. Ogni stato è
  dato da colore **e** distintivo/testo (mai solo colore, D20), con legenda
  sempre visibile. «Non in vendita» copre sia la giornata mai pubblicata (riga
  assente) sia quella ritirata dalla vendita: stessa tessera, ma la tabella
  equivalente le distingue. Ogni distintivo-lettera ha il termine per esteso
  in testo nascosto per il lettore di schermo; il distintivo `C` arriva con
  l'ondata B. Nella vista «Completa» la tessera misura **almeno 88×56 px**,
  il cognome si tronca con il testo completo nel `title` e per intero nella
  tabella; la scena scorre **localmente nei due assi** (mai scorrimento
  orizzontale dell'intera pagina, qualità web §2) e barra, legenda e
  riepilogo restano raggiungibili senza attraversare la scena. A larghezza
  telefono la vista predefinita è «Numeri», con passaggio esplicito a
  «Completa».
- **Barra superiore**: ricerca del giorno (cognome, codice prenotazione, codice
  postazione — modulo GET che evidenzia i risultati nella scena e nella
  tabella; il cognome in query string è una scelta consapevole dell'area
  riservata, prezzo dei collegamenti senza script), pulsante «Nuova
  prenotazione» verso il banco, nome dello stabilimento, collegamento alle
  pagine collegate (giornate, statistiche). L'«oggi» della navigazione per
  data è ancorato a `beach.timezone`.
- **Viste commutabili** (collegamenti GET, non script): «Completa» (tessere
  piene), «Numeri» (solo codici postazione), «Dotazioni» (tipo e dotazione,
  senza nomi — adatta alla stampa per gli allestimenti). La vista è un
  parametro della query string. La **stampa predefinita è la vista
  «Dotazioni»**, senza nomi degli ospiti (il foglio gira per lo stabilimento);
  stampare la vista «Completa» è una scelta esplicita.
- **Strumenti sulla scena**: la selezione multipla è una **modalità** attivata
  da un collegamento GET (`?selezione=1`, pattern dello strumento in query
  string dell'editor): dentro la modalità **l'intera tessera** è il controllo
  di selezione (bersaglio ≥ 44×44 px garantito) e i collegamenti alla
  prenotazione vivono nella tabella; fuori dalla modalità la tessera torna
  collegamento. Più: collegamento allo spostamento prenotazione esistente
  della reception e stampa (foglio di stile dedicato, senza colori pieni).
- **Riepilogo del giorno**: conteggi per stato e ospiti attesi/presenti per
  tutti; l'**incasso del giorno** (ancorato a `beach.timezone`) solo a chi ha il
  permesso `reports.read`, in un riquadro condizionale: la reception non lo
  vede, come oggi per il riepilogo economico.
- **Operazioni in blocco**: con le postazioni selezionate, azioni **blocca**
  (con nota) e **sblocca** (modulo POST). Valgono le regole esistenti dei
  blocchi (non si blocca una giornata occupata); l'esito torna in forma
  aggregata nella query string del redirect (quante bloccate, quante rifiutate
  perché occupate o riservate), come i flag d'esito già in uso. Ogni azione è
  nel registro (`audit_event`).
- **JavaScript**: per questa console è ammesso JavaScript **di arricchimento**
  (zoom della scena, selezione rapida, evidenza della ricerca senza ricarica),
  purché ogni funzione resti disponibile senza script: tessere leggibili,
  modalità selezione, moduli GET/POST, tabella equivalente sotto la scena.
  Lo script è **in linea e di prima parte** (CSP invariata), nessuna libreria
  esterna nuova, e la «selezione rapida» produce **lo stesso POST** del
  modulo: nessuna informazione o azione vive solo nello strato con script.
- **Rinunce ammesse** per tenere l'ondata collaudabile: lo zoom con script e
  il foglio di stampa dedicato possono slittare; viste, ricerca, modalità
  selezione e blocchi in blocco no.
- **Aggiornamento**: pulsante «Aggiorna» (ricarica). Niente push in tempo reale:
  il database resta l'unica fonte (D3) e la pagina è già coerente a ogni carico.
- Permessi: si usano quelli **esistenti** — `bookings.read` e `inventory.read`
  per vedere la console, `inventory.block` per i blocchi in blocco (la
  reception li ha già), `reports.read` per il riquadro dell'incasso. Nessun
  permesso nuovo.
- API: una rotta di lettura (stato operativo del giorno, tutte le postazioni,
  con cognome e dotazione) e una di scrittura (blocco/sblocco in blocco). Dati
  mai esposti al pubblico: il cognome dell'ospite appare solo qui e al banco.

### 3.2 Statistiche

Nuova pagina riservata al gestore (e contabilità), permesso `reports.read`,
slug `statistiche` / `statistics`, periodo da–a con modulo (predefinito:
ultimi 30 giorni; massimo 366 giorni; confini ancorati a `beach.timezone`,
come già fa la verifica del pass).

Indicatori sul periodo, tutti calcolati dal database e resi lato server:

- giornate vendute, incasso totale (prenotazioni confermate/completate; le
  annullate contate a parte), **carrello medio** = incasso / numero di
  prenotazioni confermate+completate;
- **tasso di occupazione**: giornate vendute / giornate pubblicate (le
  bloccate restano nel denominatore, dichiarato in pagina; le ritirate dalla
  vendita e le mai pubblicate ne stanno fuori);
- suddivisione per **canale** (`booking.source`: online, banco), per **stato
  del pagamento** e per **arrivi** — gli arrivi si derivano da `access_event`
  (una prenotazione con almeno un ingresso è «arrivata»), **non** da
  `booking.presence`, che a fine giornata vale `ended` per tutte; la
  convenzione (ondata B) è una **dimensione** a parte, mai un valore di
  `source`;
- per **tipo di postazione** (giornate e incasso per tipo);
- **produttività per postazione**: incasso e giornate per postazione, le prime e
  le ultime cinque;
- **heatmap della spiaggia**: la planimetria con l'intensità del tasso di
  occupazione per postazione nel periodo; l'intensità è sempre accompagnata dal
  numero (percentuale) nella tabella accanto e da una legenda con soglie
  testuali — mai solo colore.

Grafici solo con CSS/HTML (barre), nessuna libreria esterna; ogni grafico ha la
tabella con gli stessi numeri. Una rotta API di lettura con gli aggregati;
nessun dato dell'ospite nelle statistiche (solo numeri). Quando nel periodo non
c'è nulla, la pagina lo dice chiaramente.

### 3.3 Postazione consigliata («Ricerca Smart», senza AI)

Euristica **deterministica e documentata**, nel dominio condiviso
(`packages/shared`), per suggerire la postazione migliore per una richiesta
giorno+ospiti tra quelle libere e adeguate (capienza ≥ ospiti), con un
**ordine totale** così da essere stabile e riproducibile:

1. surplus di capienza minimo (non sprecare una postazione grande);
2. a parità, prezzo minore per l'ospite;
3. a parità, zona nell'ordine riva, ombrelloni, monte;
4. a parità, fila più vicina al mare (numero minore);
5. a parità, ordine di colonna.

- **Pubblico**: nella scheda dello stabilimento con giorno e ospiti scelti, la
  postazione consigliata ha l'etichetta «Consigliata» in lista e un'evidenza
  nella planimetria (forma/etichetta, non solo colore). Nessun obbligo: tutte le
  postazioni restano scelte dall'ospite.
- **Banco**: la stessa etichetta nell'elenco delle postazioni libere della
  prenotazione al banco. L'elenco gestionale dell'inventario oggi non porta
  capienza, colonna e prezzo: si **estende quella risposta** (non si chiama la
  rotta pubblica dal banco), così la funzione condivisa riceve gli stessi dati
  nei due punti.
- API: l'identificativo della consigliata viaggia nella risposta di
  disponibilità quando la richiesta porta gli ospiti (`suggestedSpotId`), così
  pubblico e banco usano la stessa logica. L'euristica non tocca i dati.
- L'ottimizzazione degli incastri delle prenotazioni lunghe è rimandata con il
  planner (§7.3).

## 4. Ondata B — commerciale

### 4.1 Convenzioni hotel (incremento B1)

Le strutture convenzionate (hotel, campeggi) mandano ospiti con un codice e un
prezzo concordato. Diverso da una promozione (sconto di marketing, già
esistente) perché è un **rapporto continuativo con rendiconto**.

**Semantica economica (decisa qui, revisionabile dal committente): l'ospite
paga il prezzo convenzionato**, online o al banco, come un normale acquisto
scontato; il rendiconto per struttura è **informativo**, per la riconciliazione
mensile tra gestore e hotel (chi ha mandato chi, per quanto). La ripartizione
economica (`recordSale`, quote in bps) resta invariata e si applica al totale
scontato: su una giornata condivisa lo stagionale incassa la sua quota del
prezzo convenzionato, e il rendiconto lo rende visibile. L'alternativa — ospite
che non paga e fattura mensile all'hotel — richiede l'incasso rinviato anche
online e va in fase successiva (§7).

- Tabella `hotel_convention`: stabilimento, nome della struttura, **codice**
  (univoco per stabilimento, normalizzato come i codici promozionali:
  maiuscole, senza spazi), prezzo: **o** sconto percentuale **o** prezzo fisso
  a giornata (uno dei due, vincolato a database), validità da–a facoltativa
  (confrontata col **giorno prenotato**, non con la data d'acquisto),
  attiva/sospesa, note. Mai pubblica. Alla creazione il codice è rifiutato se
  già esiste come promozione dello stesso stabilimento, **e viceversa**: un
  testo, un solo significato.
- Il prezzo fisso convenzionato si applica come `min(listino del giorno,
  prezzo convenzionato)`: lo sconto (`discountCents`) non è mai negativo,
  com'è assunto in tutta la catena preventivo→riserva→prenotazione.
- **Ospite online**: il campo codice esistente nel riepilogo accetta anche i
  codici convenzione (un solo campo; il sistema riconosce il tipo con la
  stessa normalizzazione). Prezzo applicato in automatico; convenzione e
  promozione **non cumulabili**. La prenotazione registra la convenzione
  (`booking.convention_id`); `booking.source` **non cambia**: la convenzione è
  una dimensione, non un canale.
- **Banco**: la reception sceglie la convenzione da un elenco (senza digitare
  il codice).
- **Gestione**: pagina del gestore (slug `convenzioni` / `partner-deals`), col
  permesso di gestione commerciale esistente (quello delle promozioni); ogni
  scrittura nel registro.
- **Rendiconto**: per ogni convenzione, prenotazioni e totale su un periodo.
  Le statistiche (§3.2) mostrano la convenzione come dimensione.
- Il tipo di affitto «Albergo» (D24) resta un'etichetta della postazione e non
  si fonde con le convenzioni.

### 4.2 Servizi extra nel flusso d'acquisto (incremento B2)

Il gestore vende servizi aggiuntivi (teli, cassaforte, lezione, aperitivo…)
insieme alla postazione, online e al banco **al momento della prenotazione**.
(Aggiungerli a una vendita già fatta richiede un secondo incasso: sta in B3.)

- Tabella `extra_service`: stabilimento, nome in italiano (inglese
  **facoltativo**, con ripiego sull'italiano, come i contenuti del sito),
  prezzo a unità, attivo/ritirato, ordine. Pagina di gestione per il gestore
  (slug `extra` / `extras`).
- **Gli extra entrano al livello del preventivo e della riserva**, non solo
  della prenotazione: la richiesta di preventivo e di riserva porta le
  quantità per servizio; la riserva **congela** i prezzi unitari in uno
  snapshot proprio (`hold_extra`), copiati poi su `booking_extra` alla
  conversione; l'impronta d'idempotenza della riserva comprende le quantità
  (stessa richiesta → stessa riserva; quantità diverse → richiesta diversa);
  alla scadenza della riserva lo snapshot muore con lei, nulla resta
  impegnato.
- **Online**: nel passo del riepilogo l'ospite sceglie le quantità (modulo
  senza JavaScript); preventivo per voce; totale di riserva e prenotazione
  comprensivo.
- **Banco**: la reception sceglie gli extra nella prenotazione al banco
  (stesso percorso di riserva).
- **Economia**: gli extra sono **interamente dello stabilimento** (nessuna
  commissione di piattaforma, nessuna quota stagionale): movimento dedicato
  nel registro economico, nella stessa transazione della vendita.
  L'annullamento con rimborso comprende gli extra.
- **Operatività**: il pass e l'elenco del giorno della reception mostrano gli
  extra da consegnare. I prezzi degli extra compaiono al pubblico solo dentro
  il flusso di prenotazione dello stabilimento.

### 4.3 Pagamenti multipli, incasso rinviato, acconti e «Comunicazioni» (incremento B3)

Modella la parte indipendente dal fornitore delle voci 1 e 11, sul fornitore
di prova esistente (D6). È l'incremento più delicato: oggi **tutto il codice
assume un solo pagamento per prenotazione** e la conferma avviene solo
nell'esito del pagamento. B3 inizia dal modello, poi costruisce sopra.

**Fondamenta — più pagamenti per prenotazione:**

- Ogni riga `payment` acquisisce uno **scopo**: `checkout` (il saldo online di
  oggi), `desk` (incasso al banco), `request` (da richiesta di pagamento, con
  collegamento alla richiesta).
- **Residuo** definito formalmente: `booking.totalCents − Σ payment riusciti`.
- Il gestore del webhook instrada per scopo: l'esito di un pagamento
  `request` **non passa mai** dal percorso conferma/annulla del checkout
  (che oggi, davanti a una prenotazione già confermata, la annullerebbe);
  riduce il residuo e chiude la propria richiesta. L'esito che arriva quando
  la prenotazione è stata **annullata** nel frattempo non incassa: registra il
  rimborso da eseguire, come per il checkout perdente.
- La vista della prenotazione e l'annullamento del gestore passano
  all'**aggregato dei pagamenti** (oggi leggono l'unica riga): il rimborso
  registrato all'annullamento è la somma di ciò che è stato davvero pagato.
- Lo stato di pagamento mostrato (banco, gestione, statistiche §3.2) diventa
  derivato dal residuo: **saldata / parziale / da incassare**.

**Prenotazione al banco con incasso rinviato:**

- Al banco si può confermare una prenotazione «da incassare» (tipico:
  telefonica): confermata subito, pass emesso subito (D5: pagare non è
  entrare — l'incasso è un credito del gestore verso l'ospite), vendita
  registrata nel registro economico alla conferma come oggi (la maturazione
  non cambia), residuo pari al totale.
- Il modulo del banco acquisisce **email e telefono facoltativi**: senza
  recapito niente riga di notifica, ma il testo resta copiabile dalla pagina
  «Comunicazioni» e dal dettaglio della richiesta.

**Richieste di pagamento (acconto o saldo):**

- Tabella `payment_request`: stabilimento, prenotazione, importo (≤ residuo
  alla creazione), scadenza (predefinita 72 ore, mai oltre la fine del giorno
  prenotato nel fuso dello stabilimento), stato
  (`pending`/`paid`/`expired`/`cancelled`), token **firmato** con
  `OMBRE_SIGNING_SECRET` (come i pass), confronto in tempo costante.
- **Al pagamento** la richiesta verifica di nuovo il residuo: se nel frattempo
  altri incassi l'hanno ridotto sotto l'importo, il pagamento è rifiutato con
  messaggio chiaro (due richieste pendenti non possono incassare più del
  dovuto).
- **Link pubblico temporaneo** `/paga/{token}` (slug `paga` / `pay`, nuova
  sezione di primo livello negli indirizzi): riepilogo essenziale
  (stabilimento, giorno, postazione, importo) e pagamento col fornitore di
  prova; scaduto, annullato o token non valido → messaggio cortese identico,
  che non rivela nulla; `noindex` e esclusione in robots.txt; limite di
  richieste come le rotte pubbliche di acquisto.
- Creazione e annullamento della richiesta dal banco e dalla gestione, sempre
  nel registro (`audit_event`).

**Comunicazioni:**

- La tabella `notification` oggi è un registro di esiti (`sent`/`skipped`,
  senza testo): si **estende** con lo stato «in coda» e con il corpo del
  messaggio (o il suo re-rendering dal modello), più i GRANT necessari.
- Alla creazione di una richiesta con recapito: riga `notification` (modello
  `payment_request`, destinatario, testo completo con il link, stato «in
  coda», fornitore «nessuno»). L'invio reale resta nei «non fatto»: quando ci
  sarà il fornitore, la coda è piena di messaggi pronti.
- **Pagina «Comunicazioni»** del gestore (slug `comunicazioni` /
  `communications`): elenco con modello, destinatario, stato e testo da
  copiare (WhatsApp/email a mano, già oggi). Modella la voce 11 senza fingere
  invii.

**Extra a vendita già fatta (chiude §4.2):** la reception aggiunge extra a una
prenotazione del giorno; il totale cresce, il movimento economico dedicato è
registrato e l'incasso avviene al banco (pagamento `desk`) o con una richiesta
di pagamento.

## 5. Vincoli trasversali (come le iterazioni precedenti)

- Tutte le pagine funzionano **senza JavaScript** (moduli GET/POST); nella sola
  console operativa (§3.1) è ammesso JavaScript di arricchimento con la via
  senza script sempre completa; obiettivi touch ≥ 44×44 px; mai informazione
  dal solo colore.
- i18n: ogni testo nei dizionari di `packages/shared`, inglese allo stesso
  numero di chiavi; slug localizzati in `routes.ts`.
- Dati gestionali (statistiche, convenzioni, richieste, comunicazioni) **mai**
  nelle risposte pubbliche; la pagina `/paga/{token}` espone solo il necessario.
- Migrazioni SQL a mano, GRANT e RLS per tabella, ruolo `ombre_app`; ogni
  scrittura da gestore/reception in `audit_event`; `DomainError` → HTTP.
- Il test di contratto aggiorna il conteggio esatto delle rotte; i dizionari
  restano allineati; CSP invariata (nessuno script o origine esterna nuova).
- Indirizzi: gli slug gestionali nuovi (`oggi`, `statistiche`, `convenzioni`,
  `extra`, `comunicazioni`) entrano nella whitelist di profondità della
  sezione `manage` di `routes.ts` (come oggi `spiaggia` e `cabine`); `paga` è
  una sezione di primo livello nuova in `readAddress`. La tabella degli
  indirizzi in qualita-web §5 si aggiorna.
- Identificatori e messaggi d'API in inglese; interfaccia, documenti e commit in
  italiano.

## 6. Criteri di accettazione (verificabili)

**Criterio 0 — non regressione**: tutto ciò che il collaudo precedente dava verde
resta verde (test, controlli fumo, planimetria pubblica identica a parità di
dati, nessun campo gestionale nuovo nelle risposte pubbliche).

Ondata A:
1. La console «Oggi sulla spiaggia» mostra per ogni postazione una tessera con
   lo stato operativo giusto (verificato creando hold, prenotazione, ingresso,
   blocco), cognome, codice e dotazione; le tre viste, la ricerca del giorno e
   la modalità selezione funzionano da query string; la navigazione per data
   (nel fuso dello stabilimento) e il riepilogo tornano; l'incasso compare
   solo con `reports.read`; il blocco in blocco di N postazioni ne blocca N e
   rifiuta quelle occupate con esito aggregato; **l'intero giro è ripetuto a
   script spenti** con lo stesso risultato; ogni azione è nel registro.
2. Le statistiche su un periodo noto di dati dimostrativi tornano con i conti
   fatti a mano (giornate, incasso, carrello medio, occupazione, canali,
   arrivi da `access_event`); heatmap e tabella dicono gli stessi numeri; i
   confini del periodo rispettano `beach.timezone`.
3. Con giorno e ospiti scelti, la consigliata è quella attesa dall'euristica
   (casi: surplus minimo batte prezzo, prezzo batte zona e fila, stabilità);
   compare in scheda pubblica e al banco; senza ospiti nessun suggerimento.

Ondata B:
4. (B1) Una convenzione a prezzo fisso e una a sconto percentuale applicano il
   prezzo giusto online (stesso campo codice) e al banco; prezzo fisso sopra
   il listino → vale il listino; codice scaduto, sospeso o fuori validità
   (rispetto al giorno prenotato) rifiutato con messaggio chiaro; convenzione
   e promozione non cumulabili; creare una convenzione col codice di una
   promozione esistente (e viceversa) è rifiutato; su giornata condivisa la
   quota dello stagionale esce dal prezzo convenzionato ed è visibile nel
   rendiconto; il rendiconto conta le prenotazioni giuste.
5. (B2) Un acquisto online con 2 extra ha preventivo per voce, riserva,
   totale, pass ed elenco del giorno coerenti; due riserve uguali salvo le
   quantità sono riserve diverse; alla scadenza della riserva nulla resta
   impegnato; l'economia registra gli extra interamente allo stabilimento;
   l'annullamento rimborsa anche gli extra.
6. (B3) Una prenotazione al banco «da incassare» è confermata con pass e
   residuo pari al totale; la richiesta di acconto genera link e, se c'è il
   recapito, notifica in coda col testo completo; il link paga col fornitore
   di prova e riduce il residuo; lo stato derivato passa da «da incassare» a
   «parziale» a «saldata»; il link scaduto o annullato risponde con lo stesso
   messaggio cortese; due richieste pendenti non incassano più del residuo;
   l'esito che arriva dopo l'annullamento della prenotazione registra un
   rimborso, non un incasso; la scadenza non supera la fine del giorno
   prenotato nel fuso dello stabilimento; la pagina «Comunicazioni» mostra la
   notifica; un extra aggiunto a vendita fatta genera movimento e incasso
   coerenti.
7. Le rotte pubbliche non espongono convenzioni, richieste, statistiche o
   comunicazioni; `/paga/{token}` con token non valido risponde senza
   rivelare nulla, è `noindex`, escluso da robots.txt e sotto limite di
   richieste; il checkout online esistente (un pagamento, scopo `checkout`)
   si comporta esattamente come prima.

## 7. Fase successiva (registrata, non in questa iterazione)

1. **Cassa fiscale**: lo scontrino richiede una stampante fiscale/RT o un
   fornitore di fiscalizzazione via API; dipende dal soggetto venditore e dalla
   fiscalità delle quote (dipendenze aperte in [stato.md](stato.md)). Da
   riesaminare con il fornitore di pagamento reale.
2. **Bar/ristorante**: conto unico ombrellone+tavolo e ordinazione
   dall'ombrellone richiedono un POS/menu digitale (spiagge.it integra prodotti
   Zucchetti); eventuale integrazione da valutare col committente.
3. **Planner a linea temporale**: vista per postazione×giorni con allungamento,
   accorciamento e spostamento; ha senso pieno con prenotazioni multi-giorno e
   con l'ottimizzazione degli incastri; abbozzo: tabella postazioni×giorni con
   azioni per modulo, coerente con i vincoli senza JavaScript.
4. **Convenzioni con fattura mensile alla struttura**: la variante in cui
   l'ospite non paga e il gestore fattura l'hotel a fine mese richiede
   l'incasso rinviato anche online e una ripartizione su un incasso futuro;
   si valuta col committente dopo B3, che ne costruisce le fondamenta.
5. **Registrate**: app mobile dedicata, marketplace di esperienze, gestionale
   piscina, invio reale delle comunicazioni (fornitore), più le idee dei mock-up
   non ancora fatte (categorie in evidenza nella home, Wallet; gli «extra
   nell'acquisto» sono realizzati da §4.2).
