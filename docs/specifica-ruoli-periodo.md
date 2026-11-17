# Specifica: tre ruoli chiari e ricerca per periodo

Iterazione del 17/11/2026 dal prompt del committente
([prompt-ruoli-periodo.md](prompt-ruoli-periodo.md), consigli suoi e del
figlio). Un solo ampliamento funzionale (il periodo dal–al, §2); il resto
riordina prima pagina, menu e nomi (§3–§5). Decisioni D38–D42.

## 1. I tre nomi

Ovunque — pagine pubbliche, area riservata, email in coda, pass, sito dello
stabilimento, OpenAPI dove espone testi — solo: **Ospite**, **Stagionale**,
**Gestore stabilimento** (inglese: **Guest**, **Season holder**, **Beach
manager**, già in uso dove c'è). Spariscono «Per gli stabilimenti», «Per gli
stagionali», «condividi giornate» come etichetta di ruolo e ogni variante.
Il titolare di cabina e la contabilità non sono ruoli pubblici e mantengono
i loro nomi nell'area riservata.

## 2. Da giorno a periodo (D38–D40)

### Modello (D38)

Nel dato una prenotazione resta **una postazione per una giornata** (niente
si rompe: statistiche, registro economico, maturazione a fine giornata,
giornate condivise, convenzioni e promozioni restano per giornata). Nasce il
**gruppo di prenotazione** (`booking_group`): una postazione per un
intervallo di giornate consecutive, con **un codice, un pass, un totale**.

- Ogni prenotazione appartiene a un gruppo (migrazione con riempimento: ogni
  prenotazione esistente diventa un gruppo di un giorno col suo stesso
  codice). Il codice vive sul gruppo (unico per spiaggia); la colonna della
  prenotazione riporta il codice del gruppo, senza più unicità propria.
- Un gruppo copre **una sola postazione** su giorni **consecutivi**, al
  massimo **31 giornate** (oltre ci sono gli abbonamenti). Il carrello multi
  postazione è rimandato.
- Pagamenti (D31) e richieste di pagamento passano al gruppo: totale del
  gruppo = somma delle giornate (sconti e convenzioni applicati per giornata
  come oggi) + extra; residuo e stato saldata/parziale/da incassare derivati
  sul gruppo. Le righe esistenti si riagganciano al gruppo della loro
  prenotazione.
- Gli **extra** si scelgono una volta per il periodo e valgono per il
  periodo (congelati alla riserva, agganciati al gruppo); nel registro
  economico restano interamente dello stabilimento e maturano con la prima
  giornata del gruppo.
- Il **pass** è del gruppo: stesso QR e codice breve per tutti i giorni; la
  verifica in reception risolve la giornata corrente (presenza, ingressi e
  uscite per giornata come oggi; `closeDay` invariato).

### Ricerca e prenotazione (D39)

- La ricerca pubblica (prima pagina e «Ricerca ombrellone») chiede **dal** e
  **al** («al» predefinito e caso minimo = «dal»); i risultati mostrano le
  postazioni libere **per tutte le giornate** del periodo e il prezzo totale
  «da» (minimo tra le postazioni della somma delle giornate); la planimetria
  della scheda lido mostra la disponibilità sull'intero periodo (libera solo
  se libera ogni giorno).
- Una giornata condivisa dello Stagionale conta come libera solo se la
  condivisione copre la giornata; un periodo può mescolare giornate
  ordinarie e condivise (l'economia resta per giornata).
- La **riserva** prende tutte le giornate in una transazione: se una sola
  non è più libera, nessuna riserva (messaggio chiaro). Scadenza unica del
  gruppo di riserva, come oggi per la singola.
- Il percorso ospite resta: scelta, riepilogo (periodo, giornate elencate,
  extra, codici), dati, pagamento unico di prova, pass. **Anche al banco**
  si prenota per periodo (dal–al, «da incassare» compresa, D31).

### Annullamento e rimborso (D40)

L'annullamento del gestore tratta **il periodo intero**: annulla tutte le
giornate non ancora mature del gruppo con gli storni compensativi di oggi,
più il rimborso degli extra se nessuna giornata è maturata. L'annullamento
di singole giornate di un gruppo è rimandato (scritto in §7). L'annullamento
dell'ospite resta non costruito (aspetta le condizioni di cancellazione).

## 3. Sito pubblico (D41)

1. **Prima pagina a tre tasti**, pari peso, sopra la ricerca:
   «Cerco un ombrellone» → Ricerca ombrellone; «Affitto il mio ombrellone» →
   Stagionale: come funziona (con l'accesso); «Gestisco uno stabilimento» →
   Gestore: come funziona (con l'accesso). Ricerca e mappa restano in prima
   pagina sotto i tasti.
2. **Barra del sito fissa** durante lo scorrimento, computer e telefono,
   senza coprire contenuti né focus (`position: sticky`; l'area di gestione
   ha già la sua barra D36 e non cambia).
3. **Menu a bottoni**, nell'ordine: Ricerca ombrellone ⛱️ · Ospite: come
   funziona · Stagionale: come funziona · Gestore: come funziona ·
   Assistenza (+ lingua e accesso). Voci compatte e uguali tra loro, voce
   attiva evidenziata non solo dal colore. Nessuna voce mappa.
4. **«Esplora» diventa «Ricerca ombrellone»**: slug it `ricerca-ombrellone`,
   en `umbrella-search`; la mappa vive lì come modalità principale insieme
   alla lista. I vecchi indirizzi (`/esplora`, `/en/explore`) rimandano con
   301; nessun percorso si perde.
5. **«Come funziona» si sdoppia in tre** (Ospite / Stagionale / Gestore
   stabilimento), coi contenuti attuali redistribuiti; le pagine «Per gli
   stabilimenti» e «Per gli stagionali» confluiscono nelle nuove con 301.
   La pagina del Gestore spiega il gestionale **con le schermate vere**
   (da docs/schermate, copiate tra gli asset del sito) e porta all'accesso
   in evidenza: dal sito **due tocchi al massimo** per l'ingresso al
   gestionale (tasto in prima pagina → pagina Gestore → accesso è due; la
   voce di menu «Gestore: come funziona» → accesso pure).

## 4. Area di gestione

- **Banco**: dal–al nel modulo (predefinito un giorno); conferma «da
  incassare» sul totale del gruppo.
- **Scheda della postazione** (D32): per una giornata di un gruppo mostra
  prezzo della giornata e, del gruppo: codice, periodo, totale, incassato,
  residuo, stato. «Sposta» resta per giornata (rimandato lo spostamento
  dell'intero periodo).
- **Planner** (D33): le celle dello stesso gruppo condividono il codice —
  su giorni adiacenti il periodo si legge da sé; il `title` riporta il
  periodo.
- **Incassi e richieste di pagamento**: sul gruppo (una richiesta per il
  residuo del gruppo); «Comunicazioni» coi testi aggiornati al periodo.
- **Statistiche**: restano per giornata (nessun cambio; il canale e gli
  stati di pagamento si leggono dal gruppo dove serve il testo).

## 5. Controllo automatico dei nomi (D42)

- Test unitario in packages/shared che passa al setaccio i dizionari it/en e
  fallisce se compaiono le formule vietate: «Per gli stabilimenti», «Per gli
  stagionali», «condividi giornate» (come etichetta), «for beach clubs»,
  «share days» e varianti censite durante il lavoro.
- Controllo fumo sulle pagine principali rese (home, ricerca, le tre «come
  funziona», accesso, un pass): nessuna formula vietata nell'HTML.

## 6. Vincoli di sempre

Tutto senza JavaScript (la mappa resta arricchimento con lista equivalente;
deroga D28 confinata alla console); i18n it/en speculare; RLS e permessi
invariati; migrazioni SQL a mano con GRANT/RLS; contratto delle rotte
aggiornato a ogni passo con l'OpenAPI; test con database per ogni funzione
nuova; commit a ogni incremento; mai push.

## 7. Rimandati (scritti)

- Carrello con più postazioni in un gruppo; spostamento dell'intero periodo;
  annullamento di singole giornate di un gruppo; sconti soggiorno (prezzo a
  periodo diverso dalla somma); statistiche per gruppo; richieste di
  pagamento per singola giornata; ricerca su periodi non consecutivi.

## 8. Criteri di accettazione (numerazione del committente)

1. Prima pagina coi tre tasti, pari peso, sopra la ricerca (it e en).
2. La ricerca accetta un periodo; una prenotazione di 3 giornate produce un
   gruppo con un codice, un pass valido ogni giorno e un riepilogo con un
   totale; il caso minimo di un giorno resta identico a oggi; una giornata
   occupata nel mezzo esclude la postazione dai risultati; le condivise
   compaiono solo se coprono il periodo; riserva tutta-o-niente; al banco
   come online; incassi, residuo e richieste sul gruppo; annullamento del
   periodo intero con storni; il gruppo appare giusto in scheda e planner.
3. Barra pubblica fissa allo scorrimento, nulla di coperto.
4. Menu a bottoni con le cinque voci nell'ordine, voce attiva, niente mappa;
   `/esplora` e `/en/explore` rimandano con 301.
5. Controllo automatico dei nomi verde (dizionari e pagine rese); i tre
   nomi anche su email in coda, pass e OpenAPI.
6. Dall'ingresso del sito all'accesso del gestionale in due tocchi, su
   computer e telefono.
7. Criterio 0 di sempre: lint, tipi, tutti i test, suite fumo, collaudo in
   italiano e inglese, tutto anche senza JavaScript.
