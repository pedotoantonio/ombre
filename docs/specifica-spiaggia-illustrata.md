# Specifica: la spiaggia illustrata e il pianificatore del Gestore

Iterazione del 19/11/2026 dal prompt del committente
([prompt-spiaggia-illustrata.md](prompt-spiaggia-illustrata.md)), con
quattro immagini di riferimento in
`~/craft-anything-projects/riferimenti-spiaggia/` — **solo ispirazione di
stile e d'impianto**: nessun asset copiato o ricalcato da Spiagge.it,
niente raster generati, solo SVG originali scritti in codice. Decisioni
D55–D60. Prerequisito già consegnato: le zone con nome (D50).

## 1. Il linguaggio grafico della spiaggia (D55)

- **Una famiglia sola di SVG originali** («beach-art»): modulo
  presentazionale nuovo `apps/web/components/beach-art.tsx` (più il suo
  foglio `beach-art.css` nel pacchetto ui), reso dal server, senza
  JavaScript. Vista dall'alto, stile piano con contorni morbidi, palette
  pastello derivata dai gettoni Solar & Fresh esistenti.
- **Simboli delle postazioni**: ombrellone con la tela a spicchi, lettino,
  sdraio, gazebo, cabina, tavolo, tenda; la **dotazione è visibile** nel
  simbolo (i lettini accostati all'ombrellone, fino a 2+2; oltre, un
  numero). I tipi personalizzati scelgono il segno dal repertorio nuovo
  come oggi dal vecchio.
- **Scenografia**: fascia del mare con onde e riva, sabbia con grana
  leggera, passerelle, palme e vegetazione, dune, chiosco/bar, docce,
  torretta del bagnino, bandiera, cestini, campo da beach volley, campo
  da bocce, area giochi, pedalò, canoa, SUP. I 16+6 segni del repertorio
  D35 vengono **ridisegnati** nel linguaggio nuovo mantenendo le chiavi,
  così i disegni salvati non cambiano forma.
- **Griglia coerente**: ogni simbolo vive in una cella quadrata (viewBox
  comune), con due densità (normale e compatta); la planimetria resta
  leggibile a 390 px — al telefono celle più piccole, etichette essenziali,
  scorrimento orizzontale dove inevitabile, mai sotto i 24 px utili.
- **Dove si usa, dappertutto**: planimetria pubblica della scheda,
  anteprima dell'editor, console «Oggi», planner, banco della reception e
  pass (dove compare la postazione). Un contratto unico:
  `SpotSymbol(type, state, equipment, …)`, `ElementSymbol(kind)`,
  `SeaBand`, `StateBadge`, `Legend`.

## 2. Stati con colore e glifo, legenda (D56)

- **Cinque stati del gestionale**: disponibile (verde salvia, spunta),
  prenotato (azzurro, calendario), occupato (corallo, persona),
  Stagionale (indaco, tessera — mai «abbonamento»), manutenzione (ambra,
  chiave inglese). Ogni stato è **colore + glifo** in un distintivo
  d'angolo: mai il colore da solo.
- Il **pubblico** conserva i suoi stati (Libera; Libera, giornata
  condivisa; Non disponibile; Scelta da te; proposta) ridisegnati con lo
  stesso principio colore+glifo.
- **Legenda compatta identica nelle due lingue** e coerente tra pubblico
  e gestionale (ciascuno elenca i propri stati con gli stessi simboli);
  al telefono si apre da un tasto `<details>`/`<summary>` (niente
  JavaScript). Componente unico `Legend` in beach-art.
- **Manutenzione** è una proprietà nuova della postazione (migrazione
  023, `spot.maintenance boolean`): finché è vera la postazione non è
  prenotabile né online né al banco (come il ritiro), resta nel disegno
  con la chiave inglese, e le prenotazioni future già prese restano (le
  tratta la reception). Distinta dal ritiro dalla vendita, che la toglie
  dalla vendita per sempre.
- Sulla mappa del gestionale ogni postazione mostra **numero e zona**
  (quando c'è).

## 3. Il pianificatore del Gestore (D57)

Il committente revoca l'esclusione passata di creare/spostare dalla
mappa. La pagina «Spiaggia» diventa il **pianificatore**, costruito sulla
griglia esistente (fasce riva/ombrelloni/monte, file, colonne): niente
coordinate libere, niente Konva; SVG + moduli + il poco JavaScript
progressivo del trascinamento.

- **Bozza con salvataggio esplicito** (migrazione 023, tabella
  `layout_draft`: una per stabilimento, elenco ordinato di operazioni in
  JSON, autore e data dell'ultimo tocco). Ogni gesto del pianificatore
  (modulo POST) **accoda un'operazione alla bozza**, non tocca la
  spiaggia: creare postazione singola, creare file/griglia (riusa la
  generazione in blocco D34, numerazione automatica A1… B1…), spostare,
  modificare (tipo, dotazione, nome/codice, zona, manutenzione),
  eliminare, aggiungere/spostare/togliere scenografia, assegnare zone.
  L'anteprima del pianificatore rende **la spiaggia con la bozza
  applicata**; le pagine pubbliche mostrano solo la spiaggia **salvata**.
- **«Annulla l'ultima operazione»** toglie l'ultima della bozza;
  «Scarta la bozza» la svuota. **«Salva la spiaggia»** mostra prima il
  **riepilogo delle modifiche** in parole (una riga per operazione) e,
  alla conferma, applica tutto **in una transazione** con le funzioni di
  dominio esistenti; se un'operazione non è più valida (cella occupata,
  prenotazioni future comparse), **niente si applica** e il riepilogo
  segna l'operazione colpevole. Ogni salvataggio scrive **una voce del
  registro delle azioni** (`layout.saved`, con il conto delle operazioni).
- **Spostare**: senza JavaScript, si seleziona la postazione e un modulo
  chiede fascia, fila e colonna di destinazione; con JavaScript, il
  **trascinamento con aggancio alla griglia** compila e invia lo stesso
  modulo (scorciatoia, mai l'unica via). **La postazione spostata resta
  la stessa**: stesso `spot.id`, stesso codice, stesse prenotazioni,
  stesso pass (D60 in breve: l'identità sta nell'id, mai nella cella).
- **Eliminare** solo postazioni senza prenotazioni future né giornate
  pubblicate a venire; altrimenti il pianificatore spiega perché no
  (conteggio alla mano) e propone ritiro o manutenzione.
- **Scenografia**: gli elementi (`layout_element`) si aggiungono, si
  spostano e si tolgono dalla bozza; non sono prenotabili e non toccano
  prenotazioni né registro economico.
- **Zone sul pianificatore** (D59): le postazioni si colorano con un velo
  pastello per zona (coerente col distintivo); un gesto «pennello di
  zona» senza JavaScript: scelta la zona, ogni clic su una postazione
  accoda l'operazione di assegnazione; restano i gesti per fila e per
  postazione della commessa precedente.
- I cataloghi restano **fuori dalla bozza** e immediati come oggi: tipi
  di postazione (`tipo-*`), creazione/rinomina/eliminazione delle zone
  (`zona-*`), lato del mare e distanze.

## 4. API e modello (D57, D58)

- Migrazione 023: `spot.maintenance boolean NOT NULL DEFAULT false` (con
  GRANT UPDATE); `layout_draft (beach_id PK/FK, ops jsonb NOT NULL
  DEFAULT '[]', updated_by, updated_at)` con GRANT e RLS nel contesto
  dello stabilimento (permesso `layout.edit`).
- Rotte nuove (contratto da 126): `GET /v1/manage/beaches/{slug}/layout/draft`
  (bozza + anteprima calcolata), `POST …/layout/draft/ops` (accoda,
  convalida leggera), `POST …/layout/draft/undo`, `POST …/layout/draft/discard`,
  `POST …/layout/draft/apply` (transazione, audit). Lo spostamento, la
  manutenzione e lo spostamento degli elementi esistono **solo come
  operazioni di bozza**: nessuna rotta immediata nuova.
- La disponibilità, la ricerca e il banco **ignorano la bozza** per
  definizione: leggono le tabelle vere.

## 5. Vincoli di sempre

Tutto funziona senza JavaScript (il pianificatore per intero, via
moduli; il trascinamento è una scorciatoia progressiva); it/en speculari;
i tre nomi di ruolo; lessico unico («Stagionale», mai «abbonamento»);
RLS e GRANT per tutto il nuovo; migrazione SQL a mano; contratto e
OpenAPI aggiornati; test con database per ogni funzione nuova; nessuna
funzione esistente si rompe (prenotazione rapida, carrello, conto,
Google di prova, pass, reception, Stagionale, registro, recensioni,
caparra); commit a ogni incremento; **mai push**.

## 6. Rimandati (scritti)

Coordinate libere e rotazioni dei simboli (la griglia è l'architettura);
trascinamento multiplo e selezione ad area nel pianificatore; bozze
multiple o per utente (una bozza per stabilimento); storico delle bozze
salvate con ripristino; animazioni del mare; stampa illustrata della
planimetria; Konva e ogni libreria canvas (esclusione confermata).

## 7. Criteri di accettazione (numerazione del committente)

1. Tutta la spiaggia — pubblico, gestionale, reception — usa la nuova
   grafica SVG originale, con mare, sabbia e scenografia.
2. Ogni stato di postazione ha colore + glifo e la legenda è identica
   nelle due lingue.
3. Il Gestore crea postazioni singole e in file/griglia con numerazione
   automatica.
4. Il Gestore sposta una postazione sia col trascinamento (JS) sia col
   modulo (senza JS), e codice/prenotazioni della postazione restano gli
   stessi.
5. Il Gestore modifica tipo, dotazione, nome, zona e manutenzione;
   elimina solo postazioni senza prenotazioni future.
6. La scenografia si aggiunge, si sposta e si toglie senza toccare
   prenotazioni e registro.
7. Il salvataggio mostra il riepilogo, finisce nel registro delle azioni
   e l'anteprima pubblica si aggiorna.
8. Planimetria leggibile e usabile a 390 px; tutto collaudato nelle due
   lingue, anche senza JavaScript, con i collaudi precedenti ancora verdi.
