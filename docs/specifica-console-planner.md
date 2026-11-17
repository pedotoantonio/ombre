# Specifica: scheda della postazione, planner e generazione in blocco

Terza iterazione dal confronto col gestionale di mercato (17/11/2026). Nasce da
un'analisi esterna fornita dal committente che confronta Ombrè con spiagge.it PRO.
L'analisi non ha potuto esaminare la demo (il suo client è stato rifiutato dal
tunnel con un 403; la demo risponde regolarmente ai browser) e va quindi letta
come una lista di controllo da verificare sul codice, non come un elenco di
mancanze accertate. La verifica è in §1; ciò che manca davvero ed è coerente col
progetto è in §2–§4.

## 1. Matrice di verifica dell'analisi esterna

| Voce dell'analisi | Stato in Ombrè |
| --- | --- |
| Mappa interattiva a schermo pieno con mare, passerelle, strutture | **C'è**: console «Oggi sulla spiaggia», scena derivata dal disegno (`operations.tsx`) |
| Stato ombrelloni con colori e legenda | **C'è**, con etichette testuali oltre al colore (D20) |
| Barra superiore con ricerca, data, «Nuova prenotazione» | **C'è** |
| Barra di riepilogo con conteggi | **C'è** (pannello sotto la scena); manca la percentuale di occupazione → §2 |
| Editor grafico della spiaggia | **C'è** (a celle, D25); trascinamento libero, rotazione e ridimensionamento sono fuori progetto |
| Generazione automatica di file di ombrelloni | **Manca** → §4 |
| Scheda della postazione con azioni per stato | **Manca** (oggi la tessera rimanda alla riga in tabella) → §2 |
| Spostamento di una prenotazione | **C'è** (`bookings.move`, reception); dalla scheda diventa raggiungibile anche in console → §2 |
| Planner temporale | **Mancava**, registrato in fase successiva nella specifica precedente → §3 |
| Ricerca intelligente della postazione | **C'è** («Consigliata») |
| Preventivi, listini per settore e canale | **C'è** (prezzi per giornata/zona, promozioni, convenzioni) |
| Link di pagamento | **C'è** (richieste `/paga/{token}`, coda «Comunicazioni») |
| Statistiche per postazione e heatmap | **C'è** (`statistics.tsx`) |
| Acconti e saldi | **C'è** (pagamenti multipli, stato saldata/parziale/da incassare) |
| Booking online dalla mappa | **C'è** (planimetria pubblica → prenotazione) |
| Multi-stabilimento, isolamento, ruoli, audit | **C'è** (RLS, permessi, registro azioni) |

Proposte dell'analisi **rifiutate**, con motivo:

- Cambiare pila tecnica (React+Konva/Tailwind/shadcn, WebSocket, TanStack):
  l'architettura del progetto è decisa e collaudata — pagine servite dal server
  che funzionano senza JavaScript, arricchimento JS solo in console (D28). Non
  si riscrive ciò che funziona per somigliare a uno strumento diverso.
- Trascinamento (drag-and-drop) nel planner e nell'editor: richiederebbe JS
  obbligatorio; le stesse operazioni esistono come moduli espliciti con
  conferma, più sicuri al banco.
- Legenda personalizzabile dal gestore: gli stati hanno semantica fissa e
  accessibile (colore + testo); personalizzarli indebolirebbe la lettura.
- Aggiornamento in tempo reale via WebSocket: il bottone «Aggiorna» e il
  ricaricamento a ogni azione bastano al volume d'uso previsto; registrato tra
  le idee future.
- CRM, WhatsApp, prezzi dinamici, ordini dal lettino, gestione del personale,
  manutenzione per postazione: fase successiva (si aggiungono a §7 della
  specifica del confronto).

## 2. Scheda della postazione nella console

Dalla console, la tessera di una postazione (fuori dalla modalità selezione)
apre la **scheda**: `?postazione=CODICE` nella query string, pannello
`<aside>` reso dal server tra la scena e la tabella, con ancora `#scheda` e
link «Chiudi» che rimuove il parametro. La riga in tabella guadagna un link
«Scheda» ; l'ancora `#riga-…` resta per la vista di stampa.

Contenuto (dati del giorno selezionato):

- codice, zona/fila, tipo con segno, dotazione, prezzo del giorno;
- stato operativo con motivo (bloccata / fuori vendita con causale);
- se c'è una prenotazione: codice, ospite, canale, presenza, **totale,
  incassato e residuo** (dal modello dei pagamenti multipli, extra inclusi).

Azioni, mostrate solo se compatibili con stato e permessi dell'attore:

- postazione libera → «Prenota al banco» (link alla pagina di gestione col
  modulo del banco, postazione preselezionata via query string) e modulo
  «Blocca» (riusa l'azione `console-blocco` con una sola postazione);
- bloccata → modulo «Sblocca» (stessa azione);
- prenotata/attesa/presente → link «Incassa» alla pagina degli incassi
  ancorata alla prenotazione (se residuo > 0 e permesso `payments.collect`),
  modulo «Sposta» (tendina delle postazioni libere del giorno, già nel dato
  della console, POST all'azione `banco-sposta`, permesso `bookings.move`),
  link «Reception» per pass/ingressi.

Lato dati: nuova funzione `spotCard(db, actor, { day, code })` in
`packages/db/src/operations.ts` che restituisce la scheda completa (postazione,
stato, prenotazione con totali e presenza); API
`GET /v1/manage/beaches/:slug/operations/spot` (query `day`, `code`), permesso
come la console. Le postazioni libere per la tendina vengono dal dato già
caricato di `listDayOperations`, nessuna query in più.

Nel pannello di riepilogo si aggiunge la **percentuale di occupazione**:
`occupate / vendibili`, dove occupate = prenotata+attesa+presente+uscita e
vendibili = totale − bloccate − fuori vendita (0 vendibili → percentuale
omessa). Calcolo nel web dai conteggi esistenti.

Lo «storico della postazione» (prenotazioni dei giorni passati) è rinviato:
va in §7 della specifica del confronto.

## 3. Planner a linea temporale

Nuova pagina «Planner» nell'area di gestione dello stabilimento
(`/area/gestione/:slug/planner`, inglese `/en/account/manage/:slug/planner`),
raggiungibile dalla pagina di gestione e dalla console. Permesso: chi vede la
console (manager e reception).

- **Righe**: le postazioni del disegno, ordinate per zona e fila, col codice e
  il segno del tipo. Filtro per zona e ricerca per codice/ospite via GET.
- **Colonne**: i giorni di una finestra scelta — 7, 14 o 31 giorni
  (`?giorni=`), inizio con `?da=AAAA-MM-GG` (predefinito oggi), frecce
  avanti/indietro della finestra. Mai più di 31 giorni per richiesta.
- **Celle**: lo stato della coppia postazione-giorno. Nel modello una
  prenotazione è una postazione per un giorno, quindi il planner è una griglia
  giorno-per-giorno: non pubblicato (neutro), libera, bloccata, fuori vendita,
  prenotata (con le iniziali dell'ospite o il codice; title completo). Mai solo
  colore: ogni cella occupata porta testo. Una cella prenotata è un link alla
  console di quel giorno con la scheda della postazione aperta; una cella
  libera è un link alla console di quel giorno.
- Tabella servita dal server, scorrevole in orizzontale, prima colonna fissa
  (CSS `position: sticky`), senza JavaScript. Stampa: foglio di stile che
  mostra la griglia per intero.

Lato dati: `plannerGrid(db, actor, { from, to, zone? })` in un nuovo
`packages/db/src/planner.ts` — una query su `inventory_day` + `booking` (join
come in `ledger.ts:107`), con tetto a 31 giorni (DomainError oltre). API
`GET /v1/manage/beaches/:slug/planner` (query `from`, `to`, `zone`).
Niente trascinamento: le modifiche si fanno dove già esistono (banco,
reception, console).

## 4. Generazione in blocco delle file

Nell'editor della spiaggia («Spiaggia»), accanto ad «Aggiungi fila», il modulo
**«Aggiungi più file»**: zona, prefisso (1–4 lettere), numero di file (1–10),
postazioni per fila (1–50), tipo, dotazione; tetto complessivo di
200 postazioni per operazione. Numerazione **progressiva con un solo
prefisso** attraverso le file: 3 file × 10 con prefisso A → A01–A10,
A11–A20, A21–A30 (zeri in testa secondo il totale, come oggi). Le file si
accodano alla zona, come «Aggiungi fila».

Il modulo dichiara accanto al bottone cosa produrrà («Creerà N file per un
totale di M postazioni, codici …–…»; testo statico calcolabile solo a
posteriori → la conferma mostra l'esito preciso nel messaggio di ritorno,
come per le altre azioni). In caso di collisione di codici con postazioni
esistenti l'operazione fallisce intera con errore chiaro (transazione unica).

Lato dati: `addRows(db, actor, { slug, zone, prefix, rows, perRow, typeId,
kit })` in `packages/db/src/layout.ts`, transazionale, riusa la logica di
`addRow`; API `POST /v1/manage/beaches/:slug/layout/rows/bulk` (permesso come
`addRow`); azione web `spiaggia-file` nel route delle azioni.

## 4bis. Repertorio ampliato del disegno (C4)

Il committente ha fornito tre tavole di soggetti per la scena
([1](grafica/riferimento-repertorio-1.jpg),
[2](grafica/riferimento-repertorio-2.jpg),
[3](grafica/riferimento-repertorio-3.jpg)). Come per la console: si prendono
**i soggetti, mai i disegni** — ogni segno è ridisegnato in vettoriale nello
stile Solar & Fresh, coerente col repertorio esistente dei tipi di
postazione, nei colori dei gettoni di `portal.css`.

- **Decorazioni del disegno**: nuovo genere di elemento accanto a passerelle,
  strutture e blocchi cabine — una cella con segno dal repertorio ed
  etichetta facoltativa, senza numerazione né vendita. Soggetti da coprire:
  palma, chiosco/bar, doccia, bandiera, salvagente, cartello, cestino,
  amaca, altalena, giochi/gonfiabile, tavolino, grill, distributore
  d'acqua, armadietti, campo (volley/bocce), tavolo da ping pong.
- **Segni per i tipi di postazione**: al repertorio esistente si aggiungono
  sdraio, gazebo a telo, canoa, SUP (tavola), pedalò, moto d'acqua — utili
  come tipi personalizzati a noleggio.
- Le decorazioni compaiono nell'editor, nella planimetria pubblica e nella
  scena della console, sempre distinguibili dalle postazioni (nessuno stato,
  non cliccabili, esposte con `aria-hidden` o etichetta descrittiva).
- La legenda degli stati resta quella di Ombrè (D20): la tavola degli
  «stati postazione» è già coperta dagli stati operativi esistenti; nella
  scheda della postazione (§2) compare anche il tipo di affitto
  («Stagionale», «Albergo», personalizzato) già presente sul modello.
- Se serve una migrazione (genere `decoration` e segno sugli elementi), si
  scrive come le altre: SQL a mano, GRANT/RLS invariati sugli oggetti nuovi.

Criterio di accettazione aggiuntivo:

5. **Repertorio**: una decorazione per ciascun soggetto collocabile
   dall'editor senza JavaScript, resa coerente nelle tre viste (editor,
   planimetria pubblica, console), mai confondibile con una postazione;
   i segni nuovi selezionabili per i tipi personalizzati; `pnpm check`,
   test e fumo verdi.

## 5. Vincoli di sempre

- Tutte le pagine funzionano senza JavaScript; in console l'arricchimento
  resta quello di D28 (script in linea di prima parte, percorso completo senza
  script). Nessuna nuova dipendenza.
- i18n: chiavi it/en speculari (`t.ops` per la scheda, nuovo blocco
  `t.planner`, `t.layout` per la generazione); slug localizzati in
  `routes.ts` per la pagina del planner.
- RLS e permessi come il resto dell'area riservata; ogni scrittura nel
  registro delle azioni (la generazione in blocco registra un evento con i
  conteggi).
- Contratto delle rotte: da 93 a **96** (`operations/spot`, `planner`,
  `layout/rows/bulk`); aggiornare `contract.test.ts` e l'OpenAPI.
- Test con database per ogni funzione nuova (scheda con e senza prenotazione,
  permessi; planner con finestra, filtro zona, tetto 31 giorni, isolamento tra
  spiagge; generazione con collisioni, tetti, numerazione).

## 6. Criteri di accettazione

0. Nessuna regressione: lint, tipi, tutti i test esistenti, suite fumo verdi.
1. **Scheda**: dalla console, clic su una tessera → scheda col dato giusto per
   libera, bloccata, fuori vendita, prenotata (totale/incassato/residuo
   coerenti con gli incassi); azioni visibili solo per stato e permesso;
   sposta e blocca/sblocca funzionano dalla scheda; percentuale di occupazione
   nel riepilogo; tutto senza JavaScript.
2. **Planner**: griglia corretta su una finestra con prenotazioni, blocchi e
   giorni non pubblicati; filtro zona; navigazione avanti/indietro; 7/14/31;
   oltre 31 giorni → errore gestito; celle leggibili senza colore; link alle
   console dei giorni; reception la vede, lo stagionale no.
3. **Generazione**: 3×10 crea 30 postazioni coi codici attesi; collisione →
   nessuna fila creata; tetti rispettati; evento nel registro; le postazioni
   generate compaiono in console e planner.
4. Doppio controllo in inglese delle tre schermate nuove.
