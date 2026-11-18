# Collaudo

## Collaudo del 18/11/2026 — carrello, conto dell'Ospite, accesso Google e perizia d'usabilità

Collaudo delle due commesse del 18/11: l'ampliamento della
[specifica carrello e conto](specifica-carrello-conto.md) (D44–D48; commit `2191b09`
specifica, `5bca555` migrazione 019 e conto nel dato, `f0d920a` email di piattaforma,
`2766c87` rotte del conto, `15c8bed` identità esterna col fornitore di prova,
`b2b8f54` migrazione 020 e modulo del carrello, `0ec349f` ordine e pagamento unico,
`843da33` rotte del carrello e dell'ordine, `8263155` conto sul sito, `d1a6453`
«Il mio conto», `6cd3f6e` carrello sul sito, `a66ef79` «Entra con Google») e la
perizia d'usabilità applicata ([rapporto](perizia-usabilita.md); commit `82ee756`
rapporto, `fc71ab1` pannello eliminato e quindici riscritture, `8a80cb8` «password»
nelle email di conto). Eseguito sullo stack **fisso** `ombre-collaudo` (web
`127.0.0.1:3232`, API `127.0.0.1:3231`) **ricostruito dal codice corrente con volume
nuovo** (migrazioni 001–**020**, seed demo e vetrina, `OMBRE_SITE_URL=http://localhost:3210`
come nei collaudi precedenti, e da questa iterazione **`OMBRE_OIDC_PROVIDER=test`**
col suo segreto in `.env.collaudo`; il `compose.yaml` passa già le due variabili
all'API — verificato, nessun difetto). Gate statici, le **otto** suite fumo in ordine
su un database appena seminato — la nuova `smoke:conto` tra `smoke:site` e
`smoke:booking` — e un giro dedicato ai criteri con `curl` (cookie jar, moduli
GET/POST, HTML servito senza alcuno script) più verifiche a database. I numeri sono
del ciclo finale, ripetuto per intero su volume nuovo.

### La suite nuova: `smoke:conto`

`scripts/smoke-conto.ts` (139 controlli, cablata in `package.json` e in
`scripts/collaudo.sh`, che ora esporta anche il fornitore OIDC di prova) percorre da
navigatore senza script: le pagine di registrazione in it e en e la **risposta neutra**
(stessa Location, byte per byte, per email nuova ed email già registrata); l'àncora
«Entra con Google (fornitore di prova)» sulle due pagine d'accesso; il **giro OIDC
intero** (avvio → consenso locale → ritorno che posa la sessione); il percorso rapido
senza conto **prima** del conto, con la stessa email, e poi «Il mio conto» che mostra
quella prenotazione **ricollegata per email**, col pass e i tasti «Aggiungi un altro
periodo» e «Aggiungi servizi»; il carrello anonimo con **due voci** (periodo 14–15/7 e
giornata 16/7, intestatari diversi, extra sulla prima), totale complessivo 90,00 →
100,00 con l'extra; «Conferma e paga» → **un ordine `ORD-…`, una prenotazione col suo
pass per voce** (due codici `OM-…`, due QR), pagamento di prova, pagina dell'ordine
anche in inglese, biglietto del carrello speso; e la scansione dei nomi vietati sulle
pagine nuove. In `smoke.ts` le pagine `registrazione`/`register` e il carrello del
Bagno delle Dune (it/en) sono entrati nel censimento dei nomi vietati (+40 controlli).

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | **235** (38 shared, 9 comms, 31 db, 150 api, 7 worker), contratto OpenAPI a **112 rotte** | Superati |
| Pagine pubbliche (`smoke`) | **453** | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 72 | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| **Conto, Google e carrello (`smoke:conto`, nuova)** | **139** | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`) | 11 | Superati |

In totale **813 controlli fumo**, tutti superati sul ciclo finale.

### Criteri del carrello e del conto (specifica §9)

1. **Carrello a più voci — superato.** Due voci con periodi diversi e intestatari
   diversi («Prima Intestataria», «Secondo Intestatario»), extra per voce, totale
   complessivo ricalcolato a ogni resa. *Nota:* nessuno stabilimento dimostrativo
   semina servizi extra (lo notava già la perizia): il collaudo ne crea uno —
   «Telo mare (collaudo)», 5,00 — **dalla pagina extra del Gestore**, cioè dal
   percorso del proprietario, sul solo database di collaudo; i seed non sono toccati.
2. **Una prenotazione per voce, un riepilogo unico — superato.** `ORD-261118-001`
   con due gruppi (`OM-270714-…`, `OM-270716-…`), un pass ciascuno (contati anche a
   database: un pass per gruppo), stati e totali sulla pagina dell'ordine, pagamento
   unico «Saldata»; pagina negata col biglietto sbagliato (404).
3. **Registrazione, email in coda, cambio obbligato — superato** (a mano, con
   `curl` e `psql`). La riga di piattaforma (`notification` con `beach_id` NULL,
   modello `account_created`) contiene la password nel corpo («Password provvisoria:
   …», provider `log`, testo pronto e copiabile); l'accesso con quella password entra,
   e **ogni** pagina dell'area risponde 307 verso `/area/password` (anche
   `/en/account/overview` verso la sua) finché la password non cambia; «corta» è
   rifiutata (`weak_password`), 12+ accettata, poi l'area torna normale. La
   registrazione ripetuta produce la riga `account.exists` (coda `outbox` e
   notifica); nel registro ci sono gli eventi di piattaforma `account.register`,
   `account.change_password`, `account.identity_link` con `beach_id` NULL.
4. **Storico e ricollegamento per email — superato.** Prenotazione rapida senza
   conto con l'email poi usata su Google: al primo accesso OIDC «Le mie prenotazioni»
   la mostra con pass, stato e totale, e il riepilogo in testa (arrivi e spesa); un
   secondo accesso ritrova lo stesso storico, nessun conto doppio.
5. **Aggiungere dal posto giusto — superato.** «Aggiungi un altro periodo» porta
   alla scheda con la giornata precompilata; «Aggiungi servizi» (a mano) crea la
   richiesta di pagamento e atterra su `/paga/{token}`: pagamento di prova,
   «Pagamento ricevuto». Vale la nota del criterio 1 sugli extra dimostrativi.
6. **«Entra con Google» sul fornitore di prova — superato.** Giro completo nella
   suite; caso limite a mano: OIDC con l'email di un conto **che ha già la password**
   entra nello stesso conto (un solo `app_user`, riga `user_identity` agganciata, il
   nome resta quello del conto) e la password continua a valere. Le **chiavi reali**
   di Google restano non esercitate: le fornirà il committente.
7. **La prenotazione rapida non cambia — superato.** `smoke:flow` (72) e
   `smoke:booking` (15) verdi come prima; nel riepilogo «Riserva la postazione» e
   «Aggiungi al carrello» convivono, e la suite nuova completa un acquisto rapido
   senza conto prima di toccare il conto.
8. **Collaudato in due lingue senza JavaScript — superato.** Ogni percorso sopra è
   HTML servito; registrazione, accesso, consenso, conto, carrello e ordine
   verificati in italiano e inglese.

### Criteri della perizia d'usabilità

1. **Rapporto — superato.** [perizia-usabilita.md](perizia-usabilita.md): censimento
   completo, cinque domande per blocco, esito e proposta già scritta per ciascuno.
2. **Prima pagina coerente — superato.** Il pannello «Tutto in un posto solo» è
   eliminato con motivo scritto (H5 nel rapporto) e non compare nell'HTML di `/` né
   `/en`; il Gestore stabilimento resta visibile nel terzo tasto e nella carta di
   «Per chi è», entrambi con collegamento (verificato sulle pagine rese, it e en).
3. **Lessico vecchio assente — superato.** `names.test.ts` dentro `test:db` e il
   censimento di `smoke.ts`, ora su sedici pagine (comprese registrazione e
   carrello), tutti verdi.
4. **Cinque domande sui blocchi rimasti — superato.** Esiti nel rapporto; eliminati:
   uno (H5); spostati: nessuno, come il rapporto dichiara.
5. **Pagine toccate collaudate — superato.** Le otto correzioni «giorno» → «giorno o
   periodo» verificate sull'HTML servito in entrambe le lingue (passo 1 dei tre
   passi, sottotitolo e stato vuoto della ricerca, sottotitolo + ancora e chiusura
   della scheda del lido, passo «Cerca» e chiusura di come-funziona, chiusura
   dell'assistenza), vecchie formule assenti, nota del periodo R5 allineata a L11
   parola per parola.

### Difetti trovati

Nessun difetto del prodotto. Due falsi allarmi, annotati per onestà: un test
(`account.test.ts`, ricollegamento per email) è scaduto una volta nel limite dei 5
secondi mentre sulla stessa macchina giravano le build dei container — in
isolamento e nel ciclo pulito passa; e la prima stesura della suite nuova contava i
QR con un conteggio di `<svg>` che prendeva anche il marchio del sito — corretto
nella suite (conteggio dei soli QR) prima del commit. Resta vera l'accortezza dei
collaudi passati: le suite vanno nell'ordine del copione, `smoke:2fa` per ultima.

### Lacune dichiarate

- **Extra dimostrativi**: nessun seed li pubblica; il collaudo li esercita creandone
  uno dal percorso del Gestore sul database di collaudo. Se si vuole che la demo li
  mostri, va deciso (seed o dato dimostrativo nuovo).
- **Google vero**: `OMBRE_OIDC_PROVIDER=google` non esercitato (servono le chiavi
  del committente); il prompt chiede di registrare la dipendenza in `stato.md`, dove
  **ancora non compare** tra le dipendenze esterne aperte.
- **Comunicazioni di piattaforma**: leggibili solo in coda via database; nessuna
  pagina le elenca (rimandato dichiarato in D45, confermato).
- **Schermate nuove, stato.md e demo aggiornata**: voci di chiusura delle due
  commesse, fuori dal perimetro di questo collaudo e non ancora presenti nel ramo.

## Collaudo del 18/11/2026 — fotografie vere nel repertorio dimostrativo

Collaudo dell'incremento D43 (commit `2e92b66`: le nove fotografie Pexels al posto
delle illustrazioni SVG, registro [immagini-reali.md](immagini-reali.md), sito
seminato del Bagno delle Dune con copertina e galleria), eseguito sullo stack fisso
`ombre-collaudo` ricostruito dal codice corrente con volume nuovo.

- **Statici e test**: lint e tipi puliti; tutti i test con database superati
  (25 shared, 135 api, 6 worker, più db — nessun cambiamento di contratto: le
  rotte restano 96).
- **Fumo, nell'ordine del collaudo**: 412 + 72 (percorso ospite) + 85 (aree) +
  25 (sito, ora a partire dal sito seminato del Bagno delle Dune: copertina
  presente prima della prima bozza, numerazione delle bozze 2 e 4, due revisioni
  archiviate) + 15 (prenotazione end-to-end) + 13 (presa simultanea) + 11 (due
  passaggi) = **633 controlli, tutti superati**.
- **Verifica a vista delle fonti**: le nove foto guardate una per una nei ritagli
  pubblicati (1200×800): soggetti giusti, nessuna persona riconoscibile in primo
  piano, nessuna insegna leggibile, nessuna filigrana. Due ritagli automatici
  erano sbagliati (`tramonto` senza mare, `docce` senza soffione) e sono stati
  rifatti a mano sulla fascia giusta.
- **Pagine rese**: la scheda del Lido Aurora mostra copertina e sei foto di
  galleria (`/demo/*.jpg`); la copertina compare nella lista della ricerca; il
  Bagno delle Dune parte col sito seminato (nel collaudo il fumo del sito poi lo
  ripubblica senza immagini, com'è scritto nel copione; nella demo resta).
- **Un'accortezza emersa**: le suite fumo vanno nell'ordine del collaudo —
  `smoke:2fa` attiva la verifica in due passaggi sulla contabilità, e un
  `smoke:booking` ripetuto dopo fallisce l'accesso (`totp_required`). Non è un
  difetto del prodotto.

## Collaudo del 18/11/2026 — tre ruoli e ricerca per periodo

Collaudo dell'iterazione della [specifica ruoli e periodo](specifica-ruoli-periodo.md)
(commit `c5c3dec` prima pagina e barra fissa, `a8c1ad2` menu e pagine per ruolo,
`b2894a2` i tre nomi con controllo automatico, `0b2da65`+`c8e8173` gruppo di prenotazione
e periodo dal–al, `12c72f8` ricerca e prenotazione per periodo, `cf15b8f` banco, scheda,
planner e incassi sul gruppo, `170d2b3` comunicazioni e OpenAPI al periodo, `5fb26ff`
suite fumo), eseguito sullo stack **fisso** `ombre-collaudo` (web `127.0.0.1:3232`, API
`127.0.0.1:3231`) **ricostruito dal codice corrente con volume nuovo** (migrazioni
001–**018** dal servizio `migrate`, seed demo «Bagno delle Dune» e vetrina «Lido
Aurora», immagine del sito con `OMBRE_SITE_URL=http://localhost:3210` come nei collaudi
precedenti), con `pnpm lint`, `pnpm typecheck`, `pnpm test:db`, le sette suite fumo in
ordine su un database appena seminato e un **giro dedicato ai criteri 1–7 del §8** nei
panni di ospite (it e en), stagionale, gestore e reception: richieste `curl` con cookie
jar e moduli GET/POST — l'HTML servito contiene già tutto, nessuno script del sito
eseguito — più verifiche a database (gruppi, pass, storni, rimborsi, proposte, coda
delle notifiche). I numeri sono quelli del ciclo finale, ripetuto per intero su un
volume nuovo.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | **209** (38 shared, 5 comms, 25 db, 135 api, 6 worker), contratto OpenAPI a **96 rotte** | Superati |
| Dizionari it/en senza formule vietate (`names.test.ts`, D42) | 3 | Superati |
| Pagine pubbliche (`smoke`) | **413** | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 72 | Superati |
| Aree riservate (`smoke:areas`) | **85** | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Giro dei criteri 2, 5 e 7 da HTTP e database | 86 | Superati (un'asserzione del giro corretta e riverificata a database, vedi difetti) |
| Giro dei criteri 1, 3, 4, 5 e 6 sull'HTML e la CSS serviti | 35 | Superati |
| Scansioni delle formule vietate (12 pagine rese × 10, email composte, pass, /paga, OpenAPI) | 175 | Superate |

Il giro dei criteri crea i propri dati dai percorsi reali: le giornate 1–3 luglio 2027
(30, 25 e 20 €), il 18–19 giugno 2027, il 17–19 novembre 2026 (18 €) e l'odierna
18 novembre; una prenotazione online di 3 giornate con pagamento di prova, una inglese
completa, una di un solo giorno uguale a oggi, due al banco di un giorno, un gruppo al
banco dal–al «da incassare» con acconto e richiesta di pagamento, e le proposte
condivise dello stagionale su B02 (20–21/06) approvate dal gestore e in parte ritirate.

### Criteri di accettazione (§8 della specifica)

| # | Criterio | Esito |
|---|---|---|
| 1 | Prima pagina: tre tasti `portal-role` con la stessa classe e lo stesso peso (griglia a 3 colonne uguali dalla CSS), **sopra** la ricerca (posizione verificata nell'HTML), in it e in en; destinazioni Ricerca ombrellone / Stagionale / Gestore stabilimento | Superato |
| 2 | Ricerca con dal–al: periodo di 3 giornate su A01 → riepilogo con le 3 giornate elencate (30+25+20) e un totale 75,00; riserva, dati, pagamento di prova, **un** pass «valido dal 1º al 3 luglio 2027, ogni giornata» (a database: 3 prenotazioni confermate, un solo pass sul gruppo); verifica in reception: il pass del futuro è rifiutato oggi (`wrong_day`), l'ingresso riesce **nella giornata di mezzo** di un gruppo 17–19/11 creato al banco (orchestrato col fuso dello stabilimento, vedi note) e col pass del giorno singolo di oggi; caso minimo di un giorno: riepilogo e pass con «Giorno», identici a prima dell'iterazione; giornata occupata nel mezzo (A03 venduta il 2/7) → postazione assente dai risultati (8 → 6) e non libera in planimetria; condivise solo se coprono: il 20/6 da sola 1 libera, il periodo 20–21/6 coperto 1 libera, il 19–20/6 non coperto nessuna, dopo il ritiro del 21/6 di nuovo nessuna; riserva tutta-o-niente con giornata presa **fra riepilogo e riserva** (dal banco): rinvio `taken=1`, messaggio in parole, 1 e 3/7 ancora libere e zero riserve attive a database; banco dal–al «da incassare»: elenco del giorno con periodo e «residuo 54,00 €», acconto di 20 → «Residuo: 34,00 €», richiesta sul residuo → `/paga` con periodo e importo; annullamento del gestore sul gruppo 1–3/7: tutte e 3 le giornate annullate e tornate libere, storni per giornata a somma zero nel registro, rimborso di 75,00 richiesto; scheda della postazione (B04, giornata di mezzo): prezzo della giornata 18,00 e, del gruppo, codice, periodo, totale 54,00, incassato 20,00, residuo 34,00; planner: le celle del gruppo condividono codice e periodo nel `title` | Superato |
| 3 | Barra pubblica fissa: `.site-header{position:sticky;top:0}` nella CSS servita, `scroll-padding-top` 7,5 rem (barra a due righe del telefono) e 5,5 rem da 72 rem — ancore e campi a fuoco non restano coperti; viewport responsive e griglia a due righe `"brand tools"/"nav nav"` sotto i 72 rem; barra presente su ogni pagina pubblica, it e en | Superato |
| 4 | Menu a bottoni: cinque voci nell'ordine richiesto (⛱️ Ricerca ombrellone · Ospite · Stagionale · Gestore · Assistenza), nessuna voce mappa; voce attiva con `aria-current` evidenziata da fondo pieno, peso e sottolineatura (non solo colore); bottoni con bordo e raggio a pillola; `/esplora`→`/ricerca-ombrellone`, `/en/explore`→`/en/umbrella-search`, `/per-gli-stabilimenti` e `/per-gli-stagionali` (e i gemelli inglesi) → 301 alle pagine nuove, query conservata | Superato |
| 5 | Dizionari verdi (3 test D42); nessuna formula vietata in 120 scansioni su 12 pagine rese (home, ricerca, le tre come-funziona, accesso, it+en), né su pass, `/paga` ed email composte (48 scansioni sulla coda `notification`: conferma it con «(3 giornate)» e «pass unico per tutto il soggiorno», conferma en con «(3 days)», richiesta di pagamento col periodo), né nell'OpenAPI (96 operazioni) | Superato |
| 6 | Due tocchi: home → tasto «Gestisco uno stabilimento» → pagina del Gestore con «Accedi al gestionale» in evidenza → modulo di accesso (2 tocchi, contati sull'HTML reale); lo stesso dalla voce di menu; le 4 schermate vere del gestionale rispondono 200; identico in inglese | Superato |
| 7 | Lint e tipi verdi; 209 test con database; le sette suite fumo verdi in ordine sull'ambiente fisso 3232/3231 (633 controlli); percorso inglese **completo** del periodo: ricerca `Period of 3 days` → planimetria → riepilogo → `/hold/` «Hold active» → dati → pagamento di prova → pass «valid from 1 to 3 July 2027, on every day» con un solo codice | Superato |

### Difetti trovati e correzioni

- **Nessun difetto del prodotto.** L'unico scarto del giro finale (85/86) era
  un'asserzione del giro stesso: contava «2 proposte approvate» mentre il gestore ne
  approvava giustamente 3, perché una proposta in attesa era stata lasciata dalla suite
  `smoke:areas`; verificato a database (20–21/06 di B02 più l'8/07 della suite) e
  corretta l'attesa dello script. Due stesure intermedie del giro hanno corretto solo
  attese dello script (cast `::text` sugli enum di PostgreSQL, entità `&nbsp;`,
  conteggi su una riga, attesa del giro del worker prima di leggere i corpi in coda).
- **Ambiente, non codice**: una prima costruzione dell'immagine del sito senza
  `OMBRE_SITE_URL` perdeva canonical, hreflang e sitemap (per progetto: il sito li
  dichiara solo se conosce il proprio indirizzo) e 51 controlli di `smoke` lo
  segnalavano; la variabile è stata aggiunta a `.env.collaudo` (file non versionato)
  e l'immagine ricostruita. Altri 4 scarti di `smoke:flow` in un giro intermedio
  venivano dai dati di prova stessi (con l'odierna pubblicata, la pagina del lido senza
  parametri propone oggi): spariti sul ciclo finale, che esegue le suite prima del giro.

### Limiti residui e note

- **Orchestrazione della «giornata di mezzo»**: la verifica del pass risolve la
  giornata corrente nel fuso dello stabilimento, e un periodo non può cominciare nel
  passato; per collaudare l'ingresso a metà gruppo il fuso del Bagno delle Dune è stato
  spostato temporaneamente a Pacific/Pago_Pago (dove «oggi» era il 17/11), il gruppo
  17–19/11 creato al banco dal percorso reale, e il fuso **ripristinato** a Europe/Rome
  prima della verifica: l'ingresso del 18/11 è passato sulla giornata di mezzo. Tutti i
  dati del gruppo vengono dai moduli veri; a fine collaudo il fuso è Europe/Rome.
- **Osservazione** (comportamento preesistente, non del periodo): una giornata di una
  postazione in abbonamento pubblicata dal gestore risulta ordinaria e vendibile; la
  proposta dello stagionale la converte in condivisa e il ritiro la restituisce
  ordinaria allo stabilimento. Il ritiro di una giornata nata solo dalla condivisione
  la lascia invece fuori vendita, come già verificato il 17/11.
- La maturazione resta per giornata: nel gruppo del banco la giornata del 17/11 è
  passata a `completed` al giro del worker, e l'annullamento del gestore (provato sul
  gruppo 1–3/7, tutto futuro) tratta «le giornate non ancora mature» come da D40.
- I collegamenti nelle email composte puntano a `http://localhost:3210`
  (`OMBRE_SITE_URL` dell'ambiente dimostrativo), come nei collaudi precedenti.
- L'ambiente `ombre-collaudo` resta **acceso** su `127.0.0.1:3232` (sito) e
  `127.0.0.1:3231` (API) con i dati del collaudo: gruppo online 1–3/07/2027 annullato
  con rimborso richiesto, prenotazione inglese 1–3/07 su A02, giorno singolo di oggi
  con ingresso registrato, gruppo del banco `OM-261117-001` su B04 (17–19/11, acconto
  20 €, richiesta di pagamento di 34 € aperta su `/paga`), condivise di B02 (20/06
  coperta, 21/06 ritirata), giornate dei collaudi fumo sul 17/06/2027; la verifica in
  due passaggi resta attiva sull'accesso di contabilità, lasciata da `smoke:2fa`.
  Accesso gestore: `gestore@bagnodelledune.example` con la password di `.env.collaudo`.
- Come prima: esclusi pagamenti reali, invio reale delle comunicazioni, carico, prove
  con persone e lettore di schermo.

## Collaudo del 17/11/2026 — console, planner e repertorio

Collaudo dell'iterazione della [specifica console/planner](specifica-console-planner.md)
(commit `646710e`+`892f7be` C1 scheda della postazione, `7302ceb`+`ea899d0` C2 planner,
`e93dc8e`+`f830a5b` C3 generazione in blocco, `3d02b85` C4 repertorio, `abf8b78` C5 layout
applicazione, `92223ef` C6 filtri/sintesi/scala), eseguito sullo stack `ombre-collaudo`
**ricostruito dal codice corrente con volume nuovo** (migrazioni 001–**017** applicate dal
servizio `migrate`, seed demo «Bagno delle Dune» e vetrina «Lido Aurora», immagine del sito
con `OMBRE_SITE_URL=http://localhost:3210` come nei collaudi precedenti), con `pnpm lint`,
`pnpm typecheck`, `pnpm test:db`, i sette collaudi fumo in ordine su un database appena
seminato e un giro HTTP dei criteri 0–7 del §6 (più §4bis e §4ter) nei panni di gestore,
reception e stagionale, con `curl`/`fetch` e moduli GET/POST, **senza eseguire alcuno
script**. I numeri sono quelli del ciclo finale, ripetuto per intero su un volume nuovo
dopo la correzione del difetto trovato.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | **192** (34 shared, 2 comms, 25 db, 125 api, 6 worker), contratto OpenAPI a **96 rotte** | Superati |
| Pagine pubbliche (`smoke`) | 279 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 69 | Superati |
| Aree riservate (`smoke:areas`) | **68** (un controllo nuovo sulla navigazione, vedi difetti) | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Criteri 1–7 da HTTP | 168 (158 del giro principale + 10 del percorso di ritiro) | Superati |
| Verifiche a database (evento `layout.rows-add`, decorazioni, 30 postazioni generate) | 3 | Superate |

Il giro dei criteri crea i propri dati: le giornate 1 e 2 luglio 2027 (30 e 20 €), una
prenotazione al banco «da incassare» con acconto, un blocco con causale, 30 postazioni
generate in riva, una decorazione, un tipo personalizzato e, per il «fuori vendita
(ritirata)», una proposta stagionale su B02 (5/07/2027) approvata e poi ritirata.

### Criteri di accettazione (§6, più §4bis e §4ter)

| # | Criterio | Esito |
|---|---|---|
| 0 | Lint, tipi e 192 test verdi; le sette suite fumo verdi in ordine sullo stack appena seminato (dopo l'allineamento di due controlli alla barra nuova, vedi difetti); contratto a 96 rotte (`operations/spot`, `planner`, `layout/rows/bulk`) verificato dai test | Superato |
| 1 | Tessera → `?postazione=`: scheda resa dal server con ancora `#scheda`; dati giusti per libera (prezzo 30,00 €, tipo di affitto, «Prenota al banco» con postazione preselezionata, modulo «Blocca»), bloccata (causale «Manutenzione», solo «Sblocca»), fuori vendita («Non in vendita (Ritirata dalla vendita)», nessuna azione) e prenotata (codice, ospite, canale, presenza «Atteso»); prenotazione al banco «da incassare»: totale 30,00/incassato 0,00/residuo 30,00 e stato «Da incassare» in parole, dopo l'acconto di 10 € dagli incassi residuo 20,00 e stato «Parziale»; «Sposta» dalla scheda porta la prenotazione su A04 e A02 torna libera; blocca/sblocca dalla scheda conservano il contesto; percentuale di occupazione nella sintesi e nel pannello, uguale a occupate/vendibili ricalcolato dai conteggi; `?postazione=Z99` → messaggio cortese; la reception vede scheda e azioni (sposta, incassa), non la voce Statistiche | Superato |
| 2 | Griglia con prenotata (iniziali «OS», title con nome e codice, link alla console del giorno con la scheda aperta), bloccata, fuori vendita e giorni non pubblicati; ogni cella porta testo oltre al colore; finestre 7/14/31 esatte, `giorni=60` ricondotto alla predefinita (14), sull'API `from/to` oltre 31 giorni → 4xx con codice d'errore; filtro `zona=riva` restringe alle postazioni generate; frecce avanti/indietro di una finestra intera; prima colonna fissa (`position: sticky`) e stampa dell'intera griglia nel CSS; la reception lo vede, lo stagionale no (pagina 404, API 403) | Superato |
| 3 | 3 file × 10 con prefisso C in riva → «Create 3 file (30 postazioni), codici C01–C30.», accodate alla zona; stesso prefisso → «Codici in collisione con postazioni esistenti: nessuna fila creata.» e nessuna fila; 11 file e 5×50 (250 > 200) rifiutati senza creare nulla; evento `layout.rows-add` nel registro coi conteggi e i codici; le postazioni generate compaiono in console e planner sulla giornata pubblicata dopo | Superato |
| 4 | Scheda («Card of spot A04», «Outstanding», «Rental type»), planner («Planner grid») e modulo di generazione («Add several rows») su `/en/…`, con la sintesi tradotta («Expected arrivals») e la cornice presente | Superato |
| 5 | Palma (senza etichetta) e chiosco (etichetta «Bar della palma») collocati dall'editor senza script; rese in editor, planimetria pubblica e console (`plan-deco`): mai dentro un `<a>`, mai con uno stato di postazione, soggetto nominato nel testo nascosto; la gomma toglie il chiosco e lascia la palma; segno «sdraio» (`deckchair`) selezionabile e tipo personalizzato «Sdraio relax» creato e in elenco; le 5 decorazioni del seed della vetrina rese sulla planimetria pubblica del Lido Aurora | Superato |
| 6 | Barra `manage-top` (stabilimento, ricerca, giorno, «Prenota al banco», chi è collegato, uscita) e navigazione `manage-nav` su tutte e dieci le pagine di gestione (console, planner, gestione, incassi, statistiche, spiaggia/disegno, sito, convenzioni, extra, comunicazioni), voce attiva giusta pagina per pagina (nessuna voce evidenziata su convenzioni/extra/comunicazioni, che non hanno voce); reception senza Statistiche né Disegno; aree di profilo e stagionale senza cornice; URL invariati (le stesse rotte dei collaudi precedenti rispondono 200); stampa senza barre (`@media print` nasconde `manage-top`, `manage-nav`, `ops-strip`, `ops-filters`) | Superato |
| 7 | Filtri `zona`/`stato` via GET, anche combinati con ricerca, viste e scheda aperta: la scena e la tabella si restringono (filtro `stato=not_for_sale` → esattamente le tessere contate dal pannello), i sei numeri della sintesi non cambiano mai col filtro e coincidono col pannello esteso (totale, libere, occupate, arrivi = attese, partenze = presenti, percentuale); sintesi fissa (`ops-strip`) presente su un giorno con stati misti; scala a scatti nel markup (`--plan-cell`: 4rem compatta, 5.5rem normale, 7rem ampia, «adatta» calcolata dalla larghezza con voce attiva evidenziata); i parametri si conservano a vicenda (viste, frecce del giorno e tessere portano `zona`, `stato` e `scala`) | Superato |

### Difetti trovati e correzioni

- **Due controlli fumo fermi alla vecchia barra** (`smoke:areas`, `smoke:site`): cercavano
  `account-bar` sulla pagina di gestione e sull'editor del sito, dove il layout
  applicazione (C5, D36) la sostituisce con la barra `manage-top` che porta le stesse
  informazioni (chi è collegato e l'uscita). Non un difetto del prodotto ma delle
  verifiche: corretto in `9333c64` — i due controlli ora verificano la barra nuova e
  `smoke:areas` guadagna un controllo sulla navigazione laterale con la voce attiva
  (67 → 68). Tutto il ciclo è stato rieseguito da zero dopo la correzione.
- Nessun difetto del prodotto: tutte le altre verifiche sono passate; le stesure
  intermedie dello script dei criteri hanno corretto solo attese dello script stesso
  (il riepilogo si legge fino a `</dl>`, i testi con i segnaposto di React, e il caso
  sotto, scoperto per strada e giusto così).

### Limiti residui e note

- **Il ritiro di una giornata venduta è rifiutato** (`invalid_state`), correttamente:
  l'unica giornata condivisa del seed (B02, 17/06/2027) viene comprata dai collaudi
  fumo, quindi il «fuori vendita (ritirata)» si ottiene — ed è stato verificato — col
  percorso completo: proposta dello stagionale, approvazione del gestore, ritiro.
- La scheda di una postazione su una giornata **mai pubblicata** (o di una postazione
  ritirata) risponde col messaggio cortese, per progetto, come le azioni sul giorno
  singolo; lo stato «Non in vendita (Mai pubblicata)» resta leggibile sulle tessere,
  nella tabella e nei conteggi.
- La reception **vede la voce «Sito»** (pagina in sola lettura, permesso `site.read`
  che ha da prima dell'iterazione): coerente con D36, che mostra le voci delle pagine
  che l'attore può raggiungere. Statistiche e Disegno restano nascosti. Se il
  committente preferisce nascondere anche il sito alla reception, è una scelta di
  permessi da registrare come decisione, non un difetto del layout.
- L'ambiente `ombre-collaudo` resta **acceso** su 3232/3231 con le immagini nuove e i
  dati del collaudo (giornate 1–2 e 5/07/2027, prenotazione `OM-270701-001` su A04 con
  acconto, blocco su A01, postazioni C01–C30, palma, tipo «Sdraio relax», ritiro su
  B02); la verifica in due passaggi resta attiva sull'accesso di contabilità, lasciata
  da `smoke:2fa`.
- Come prima: esclusi pagamenti reali, invio reale delle comunicazioni, carico, prove
  con persone e lettore di schermo.

## Collaudo del 16/11/2026 — ondata B: convenzioni, extra, pagamenti multipli e comunicazioni

Collaudo dell'ondata B della [specifica del confronto gestionale](specifica-confronto-gestionale.md)
(commit `ed9ec68`+`a16e03a` B1 convenzioni, `44b1c9f`+`21511e5` B2 extra,
`693b67a`+`e5a3049` B3 pagamenti multipli/acconti/comunicazioni), eseguito su uno stack
Docker dedicato ricostruito da zero (progetto `ombre-collaudo`, volume ricreato, migrazioni
014–016 applicate dal servizio `migrate`, seed dimostrativi e vetrina) con `pnpm check`,
`pnpm test:db`, i sette collaudi fumo e la verifica HTTP dei criteri 0 e 4–7 del §6, nei
panni di gestore, reception, contabilità e di un ospite, con `curl` e moduli GET/POST,
**senza eseguire alcuno script**. I numeri qui sotto sono quelli del ciclo finale, ripetuto
per intero su un database appena seminato dopo la correzione del difetto trovato.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm check`) | tutto il codice, contratto OpenAPI a **93 rotte** | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | 174 (34 shared, 2 comms, 25 db, 107 api, 6 worker) | Superati |
| Pagine pubbliche (`smoke`) | **279** (7 nuovi: la pagina cortese di /paga, vedi difetti) | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 69 | Superati |
| Aree riservate (`smoke:areas`) | 67 | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Criteri 0 e 4–7 da HTTP | 116 | Superati |
| Verifiche a database (trigger, ripartizioni, scopi, rimborsi, registro) | 15 | Superate |

I collaudi fumo sono stati eseguiti nell'ordine di `scripts/collaudo.sh` sullo stack appena
seminato, con `OMBRE_SITE_URL=http://localhost:3210` (il valore cotto nell'immagine del
sito) e gli indirizzi reali `127.0.0.1:3232/3231`; la verifica in due passaggi lasciata
attiva dalla suite `smoke:2fa` è stata rispenta a database prima delle prove di ruolo, come
nel collaudo dell'ondata A. La verifica dei criteri è un giro HTTP che crea i propri dati:
cinque giornate nuove più l'odierna sul Bagno delle Dune a 30 €, cinque convenzioni e due
servizi extra.

### Criteri di accettazione della specifica (§6, ondata B)

| # | Criterio | Esito |
|---|---|---|
| 0 | Tutte le suite del collaudo precedente verdi sullo stack nuovo; la disponibilità pubblica ha esattamente le chiavi di prima (`beach, currency, day, elements, gaps, layout, seaSide, spots`, più `guests`+`suggestedSpotId` solo a richiesta); console «Oggi sulla spiaggia» e statistiche dell'ondata A ancora in piedi (giro rapido: tessere e legenda, incasso solo col permesso `reports.read`, statistiche con la dimensione «Convenzioni»); lo stato di pagamento nelle statistiche è derivato dal residuo su `paid`/`partial`/`to_collect`; la contabilità riceve 403 sulle convenzioni, le comunicazioni rispondono 401 senza accesso | Superato |
| 4 | Convenzione a prezzo fisso (25 € su listino 30 €) e a sconto percentuale (15% → 25,50 €) applicate online **nello stesso campo del promo** (riepilogo web → riserva → pass a 25,00 €) e al banco **da elenco** (`desk-conventions` del giorno con le sole valide); prezzo fisso sopra il listino (50 €) → vale il listino, sconto mai negativo; scaduta, sospesa e codice ignoto rifiutati con lo stesso messaggio (422 `promo_not_applicable`, confrontato byte per byte) sia online sia al banco; convenzione e promozione non cumulabili (un campo, un codice un solo significato: `MARE10` resta una promozione al 10%); creare una convenzione col codice `MARE10` → 409 `code_taken`, creare una promozione col codice `HOTELFIX` → rifiutata dal trigger di migrazione 014; su giornata condivisa di Lido Aurora la quota stagionale esce dal prezzo convenzionato (20 €: 10,00/8,00/2,00 al 50/40/10, verificato sulle `allocation`) ed è nel rendiconto; il rendiconto conta le prenotazioni giuste (2 per la fissa a 50,00 €, 1 per la percentuale, 0 dopo l'annullamento); convenzione usata non eliminabile (409), mai usata eliminata | Superato |
| 5 | Acquisto online con 2 extra (2 teli + 1 cassaforte, 13,00 €) fino al pass: preventivo per voce, campi quantità nel riepilogo senza script, riserva a 43,00 €, pass con gli extra; elenco del giorno della reception con «2 × Telo mare» e l'esito della verifica del pass con «Da consegnare»; stessa richiesta → stessa riserva, quantità diverse con la stessa chiave → `idempotency_mismatch` (richiesta diversa); riserva scaduta: la postazione torna acquistabile e nulla resta impegnato (0 prenotazioni dallo snapshot); economia: `extras_revenue` di 13,00 € interamente allo stabilimento, quote (`allocation`) calcolate sul solo prezzo postazione (27,00/3,00 € su 30,00 €); annullamento → rimborso di 43,00 € (postazione+extra) con storno delle quote | Superato |
| 6 | Prenotazione al banco «da incassare» con email → confermata, pass emesso subito, residuo = totale, stato «Da incassare» in pagina; richiesta di acconto (10 €) → link `/paga/{token}` e notifica «in coda» col testo completo, visibile in «Comunicazioni»; link aperto senza accesso, pagamento di prova riuscito → residuo 20 €, stato «Parziale»; seconda richiesta a saldo → «Saldata», un'ulteriore richiesta → 409; link pagato, annullato e token inventato → la stessa pagina cortese, 404, identica byte per byte a token normalizzato; due richieste pendenti da 20 € su un residuo di 30 €: la prima incassa, l'esito della seconda non incassa (richiesta chiusa, rimborso `over_collection` di 20 € registrato, residuo intatto); richiesta su prenotazione poi annullata → rimborso `booking_cancelled`, mai incasso; scadenza chiesta a 240 ore ma troncata alla fine del giorno prenotato (fuso Europe/Rome); incasso parziale al banco (5 €, «Parziale»); extra a vendita fatta con incasso al banco (residuo invariato) e lasciato nel residuo (totale e residuo crescono) | Superato |
| 7 | Le rotte pubbliche (elenco, scheda, disponibilità, `/dati/mappa`) non espongono convenzioni, richieste, statistiche o comunicazioni (chiavi JSON confrontate sul vivo; gli extra pubblici dicono solo `serviceId, name, unitPriceCents`); `/paga/{token}` non valido → 404 neutro che non rivela nulla, `noindex`, escluso da robots.txt (`/paga` e `/en/pay`), sotto limite di richieste (429 alla 61ª in un minuto); il checkout online esistente è identico a prima: un solo pagamento con scopo `checkout`, `in_progress` in verifica, flusso completo fino al pass, saldata a 30,00 € | Superato |

### Difetti trovati e correzioni

- **Pagina cortese di `/paga` vuota senza script** (B3, frontend): con un token non più
  valido la pagina rispondeva sì 404 e `noindex`, ma con il **corpo vuoto** — il messaggio
  cortese viveva solo nel payload degli script, perché `notFound()` su una rotta dinamica
  rende il suo boundary solo lato client. Chi apriva il link senza JavaScript (o un lettore
  che non esegue script) vedeva una pagina bianca, contro il §5 e il «messaggio cortese»
  del §4.3. Corretto in `13717cb`: il proxy verifica il collegamento e riscrive quelli
  inutilizzabili sulla pagina cortese dedicata (`non-disponibile`), resa dal server con
  stato 404 nelle due lingue — lo stesso schema di `pagina-non-trovata`; la lettura della
  richiesta sale nella pagina (`loadPayRequest`). Verifica di regressione nei controlli
  fumo delle pagine pubbliche (7 controlli nuovi: 404, titolo cortese nel `main`,
  `noindex`, esclusione in robots.txt, due lingue); `pnpm check`, `pnpm test:db` e tutto il
  ciclo rieseguiti dopo la correzione.
- Nessun altro difetto: tutte le altre verifiche sono passate alla prima esecuzione
  completa (le prime stesure dello script di verifica hanno corretto solo attese dello
  script stesso: forme delle risposte, campo `lang` dei moduli, campi quantità
  `extra-<servizio>`).

### Limiti residui e note

- **Le 404 da `notFound()` dinamico restano a corpo vuoto altrove**: `/bagni/{slug
  ignoto}` risponde 404 con corpo vuoto senza script anche sull'immagine della demo
  (comportamento pre-esistente, non una regressione dell'ondata): da sistemare con lo
  stesso schema del proxy in un'iterazione futura.
- Il seed non crea dati dimostrativi per convenzioni, extra e richieste: cosa può provare
  un visitatore della demo è documentato in [demo.md](demo.md) (percorsi 13–15).
- L'ambiente `ombre-collaudo` resta acceso con i dati del collaudo: le giornate dal 21 al
  25/06/2027 e l'odierna sul Bagno delle Dune, le convenzioni di prova (HOTELFIX,
  HOTELPERC, HOTELCARO, HOTELFERMO sospesa, AURCONV su Lido Aurora), i due servizi extra,
  le prenotazioni dei criteri (annullate comprese) e i rimborsi registrati da eseguire.
- Le schermate di fine iterazione si fanno alla chiusura dell'iterazione, dopo questo
  collaudo.
- Come prima: esclusi pagamenti reali, invio reale delle comunicazioni (le notifiche
  restano «in coda» con il fornitore «nessuno», per costruzione), carico, prove con
  persone e lettore di schermo.

## Collaudo del 16/11/2026 — ondata A: console operativa, statistiche, postazione consigliata

Collaudo dell'ondata A della [specifica del confronto gestionale](specifica-confronto-gestionale.md)
(commit `f2e62da` backend, `3935566` frontend), eseguito su uno stack Docker dedicato
ricostruito da zero (progetto `ombre-collaudo`, volume ricreato, seed dimostrativi e
vetrina) con `pnpm check`, `pnpm test:db`, i sette collaudi fumo e la verifica HTTP dei
criteri 0–3 del §6, nei panni di gestore, reception e contabilità e di un ospite, con
`curl` e moduli GET/POST, **senza eseguire alcuno script** (come prescrive il criterio 1).

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm check`) | tutto il codice, contratto OpenAPI a **72 rotte** | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | 147 (34 shared, 2 comms, 25 db, 80 api, 6 worker) | Superati |
| Pagine pubbliche (`smoke`) | 272 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 69 | Superati |
| Aree riservate (`smoke:areas`) | 67 | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Criteri 0–3 da HTTP | 140 | Superati |

I collaudi fumo sono stati eseguiti nell'ordine di `scripts/collaudo.sh` sullo stack
appena seminato, con `OMBRE_SITE_URL=http://localhost:3210` (il valore cotto
nell'immagine del sito) e gli indirizzi reali `127.0.0.1:3232/3231`.

### Criteri di accettazione della specifica (§6, ondata A)

| # | Criterio | Esito |
|---|---|---|
| 0 | Tutte le suite del collaudo precedente verdi sullo stack nuovo; la disponibilità pubblica **senza** `guests` ha esattamente le chiavi di prima (`beach, currency, day, elements, gaps, layout, seaSide, spots`); nessuna risposta pubblica (elenco, scheda, disponibilità, `/dati/mappa`) espone cognomi, codici prenotazione, incassi, statistiche o campi gestionali — verificato sul JSON vivo | Superato |
| 1 | Console «Oggi sulla spiaggia» di Lido Aurora: 53 tessere con gli stati giusti, contati uno a uno contro l'API (libere, riservata da un hold pubblico creato apposta su E08, attese/presenti/uscita dal seed, A08 bloccata, mai pubblicate); cognome con `title`, dotazione breve `1O+2L`, distintivi R/B/S con termine per esteso nascosto (S contato sul giorno con offerte condivise); legenda e tabella equivalente; le tre viste e la selezione da query string (53 caselle, l'intera tessera è la casella); ricerca per cognome, codice postazione e codice prenotazione con evidenza su scena e tabella e conteggio; navigazione per data ancorata a Europe/Rome (predefinito, frecce, «Oggi» con `aria-current`); blocco in blocco di M03+M04+1 occupata → «2 postazioni bloccate. Rifiutate: 1 occupate.», hold vivo rifiutato come riservata, sblocco con «1 non bloccate», nessuna selezione → esito dedicato; incasso solo al gestore (`revenueCents` nullo per la reception anche sull'API); la reception vede console e selezione ma non l'incasso; la contabilità riceve 404 sulla console (e 403 sull'API) e vede le statistiche; **l'intero giro è a script spenti** (solo HTTP); ogni blocco/sblocco in `audit_event` con `bulk: true` e nota, una voce per postazione davvero cambiata | Superato |
| 2 | Su dati creati dal collaudo (Bagno delle Dune, oggi: 8 giornate pubblicate a 30 €, una vendita online con MARE10 a 27 € con ingresso registrato, una al banco a 30 € senza ingresso, una al banco annullata, una postazione bloccata) le statistiche tornano con i conti a mano: 2 vendute, incasso 57,00 €, carrello medio 28,50 €, occupazione 2/8 = 25% (bloccata e annullata nel denominatore, dichiarato in pagina), canali online 1/27 € e banco 1/30 €, arrivi 1 e 1 da `access_event`, 1 annullata da 30 € a parte, un tipo con 2/57 €; heatmap e tabella con gli stessi numeri (vendute 100%, bloccata 0% ma pubblicata); fuso `Europe/Rome` nella risposta e nel periodo predefinito (ultimi 30 giorni); periodo invertito e oltre 366 giorni → 400 e avviso in pagina; periodo vuoto detto chiaramente; nessun dato dell'ospite nel JSON né in pagina | Superato |
| 3 | Sui dati vivi di Lido Aurora la consigliata coincide con l'euristica applicata a mano per 1–4 ospiti: con 2 ospiti vince C01 (surplus minimo batte il prezzo di D ed E), con 1 ospite vince M01 (prezzo 12 € batte zona e fila della riva a 15 €), con 5 nessuna (`suggestedSpotId: null`); tre richieste identiche danno la stessa consigliata; senza ospiti nessuna chiave in risposta e nessuna evidenza in pagina; `guests` 0/21/`abc` → 400; in scheda pubblica una sola «Consigliata» in lista e un solo badge in planimetria; al banco la stessa C01 è marcata «consigliata» e preselezionata | Superato |

### Difetti trovati e correzioni

- Nessun difetto nel codice dell'applicazione: tutte le verifiche dei criteri sono
  passate alla prima esecuzione completa. (I primi passaggi dello script di verifica
  hanno corretto solo attese dello script stesso: conteggi raddoppiati dal payload RSC
  di Next, spazi stretti nei prezzi, `+` negli esiti in query string.)

### Limiti residui e note

- La suite `smoke:2fa` lascia la verifica in due passaggi **attiva** sull'account
  dimostrativo della contabilità: per le prove di ruolo il collaudo l'ha spenta a
  database (`totp_enabled = false`). Chi rilancia le suite in ordine su un database
  appena seminato non ne è toccato; da valutare se la suite debba ripulirsi da sola.
- I collaudi fumo non percorrono ancora le sezioni nuove (console, statistiche,
  consigliata): la loro verifica resta quella dei criteri da HTTP di questo collaudo.
- L'ambiente `ombre-collaudo` resta acceso con i dati del collaudo (le due vendite,
  l'annullata e la bloccata di oggi sul Bagno delle Dune; su Lido Aurora M03/M04 sono
  state sbloccate e l'hold su E08 scade da solo).
- Le schermate di fine iterazione non sono di quest'ondata: si fanno alla chiusura
  dell'iterazione, dopo l'ondata B.
- Come prima: esclusi pagamenti reali, posta, carico, prove con persone e lettore di
  schermo.

## Collaudo del 15/11/2026 (sera) — editor del disegno, tipi di postazione, cabine del mare

Collaudo della [specifica editor, tipi e cabine](specifica-editor-tipi-cabine.md)
(commit `e846fb4`, `5ef0ccd`, `2522b29`, `36b604d`), eseguito su uno stack Docker
dedicato ricostruito da zero (progetto `ombre-collaudo`, seed dimostrativi e vetrina)
con `pnpm check`, `pnpm test:db`, i sette collaudi fumo e la verifica HTTP dei nove
criteri di accettazione (0–8), nei panni di gestore, titolare di cabina, reception e
ospite, con `curl` e moduli POST, senza JavaScript.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm check`) | tutto il codice, contratto OpenAPI incluso | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | 129 (28 shared, 2 comms, 25 db, 68 api, 6 worker) | Superati |
| Pagine pubbliche (`smoke`) | 272 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 69 | Superati |
| Aree riservate (`smoke:areas`) | 67 | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |

I collaudi fumo sono stati eseguiti nell'ordine di `scripts/collaudo.sh` sullo stack
appena seminato, con `OMBRE_SITE_URL=http://localhost:3210` (il valore cotto
nell'immagine del sito) e gli indirizzi reali `127.0.0.1:3232/3231`.

### Criteri di accettazione della specifica

| # | Criterio | Esito |
|---|---|---|
| 0 | Dopo le migrazioni nessuna postazione senza `col` né senza `type_id` (61 postazioni, nessun duplicato di colonna); prezzi e prenotazioni del seed coerenti (G01/G02 a 60 €, T01 a 50 €, 20 prenotazioni, 1.135 giornate); le rotte pubbliche (`/v1/beaches`, scheda, `availability`, sito) non espongono nessuna chiave `rental_*`, `retired`, `cabin*`, `holder*`, `sublet*`, `assignment*` — verificato sul JSON vivo oltre che dal test | Superato |
| 1 | Mare in basso da modulo POST: nell'HTML pubblico compaiono solo le classi `--flip` (4 occorrenze), DOM, sequenza dei tag ed elenco identici; riportato in alto l'HTML torna **byte per byte** uguale a prima | Superato |
| 2 | Disegnate da HTTP, strumento nella query string e due passi espliciti: passerella orizzontale (ombrelloni, dopo fila 5), verticale (colonna 7), struttura «Docce» e blocco cabine; planimetria pubblica e anteprima del gestore con la stessa sequenza di 85 etichette e codici; gomma su tre elementi (`dok=Elemento rimosso.`); sovrapposizione su «Bar» rifiutata con `element_overlap` e messaggio `role="alert"` accanto alla griglia | Superato |
| 3 | I tre tipi di base ci sono; creato «Letto king» (mark daybed, 70 €); fila `K01`–`K02` in riva nata con quel tipo e i suoi predefiniti; etichetta pubblica «Letto king K01»; eliminazione rifiutata per tipo usato, builtin e tipo appena usato (`type_in_use`, messaggio sulla pagina) | Superato |
| 4 | Giornata nuova (25/12) pubblicata a 20 €: G01/G02 a 60 €, T01 a 50 €, K01/K02 a 70 €, tutte le altre a 20 €; gazebo G01 prenotato dal pubblico fino al pass con QR (`OM-261225-001`) | Superato |
| 5 | CAB3 affidata a un titolare senza accesso (solo nome e contatto); affidamento sovrapposto rifiutato con `assignment_invalid` e messaggio chiaro | Superato |
| 6 | Il titolare `cabina@lidoaurora.example` vede solo CAB1 e CAB4 (403 sulle rotte del gestore); proposta valida approvata dal gestore; fuori periodo e sovrapposta a un subaffitto approvato rifiutate (`sublet_invalid`); chiusura anticipata di CAB4 al 25/12 con 1 subaffitto troncato e l'avviso nella pagina del titolare; la reception vede «Cabine di oggi» e riceve `forbidden`/404 sulle decisioni; tutto in `audit_event` (`cabins.assign`, `cabins.assignment-end`, `cabins.sublet-propose/-approve/-truncate`, `types.*`, `layout.element-add/-remove`, `layout.sea-side`) | Superato |
| 7 | Nessuna traccia di cabine, affidamenti, subaffitti o titolari in home, «Esplora», scheda del lido, prenota, `/dati/mappa` e nelle rotte pubbliche dell'API; nella planimetria pubblica resta solo il blocco disegnato con l'etichetta «Cabine», come da specifica | Superato |
| 8 | `pnpm check` e `pnpm test:db` verdi (rieseguiti dopo la correzione); contratto OpenAPI aggiornato: **69 rotte** (61 percorsi); collaudi fumo verdi; sette schermate nuove desktop e telefono | Superato |

### Difetti trovati e correzioni

- **Conteggio d'uso dei tipi sempre a zero** (`GET /v1/manage/beaches/:slug/types`):
  nella sottoquery correlata di `listSpotTypes` Drizzle rende le colonne della lista
  di selezione senza qualificarle, così `spot_type.id` diventava `"id"` e si risolveva
  su `spot.id`: il conteggio era sempre 0 e la sezione «Tipi di postazione» offriva
  «Elimina» anche per i tipi usati (l'API rifiutava comunque: nessun effetto sui
  dati). Corretto qualificando la coppia correlata in
  `packages/db/src/spot-types.ts`; test di regressione aggiunto in
  `apps/api/tests/canvas.test.ts` (Ombrellone > 0, Gazebo = 0 sul seed di prova);
  immagini ricostruite e conteggi verificati di nuovo da HTTP (40/10/2/1/2).
- Nessun altro difetto: tutte le altre verifiche sono passate alla prima esecuzione.

### Limiti residui

- I collaudi fumo non percorrono ancora le sezioni nuove (disegno, tipi, cabine): la
  loro verifica resta quella dei criteri da HTTP di questo collaudo. Le suite sono
  state eseguite prima della correzione del conteggio, che non tocca nulla di ciò che
  misurano; `pnpm check` e `pnpm test:db` sono stati rieseguiti dopo.
- Le schermate mostrano anche le aggiunte del collaudo (fila `K01`–`K02` «Letto
  king», struttura «Docce», affidamenti su CAB3 e CAB4, prenotazione del gazebo):
  sono la prova che i percorsi dal gestore funzionano, e l'ambiente resta in piedi
  con questi dati.
- Come prima: suite fumo da eseguire in ordine su un database appena seminato;
  esclusi pagamenti reali, posta, carico, prove con persone e lettore di schermo.

## Collaudo del 15/11/2026 — mappa in evidenza e gestione della spiaggia

Collaudo della [specifica mappa e gestione della spiaggia](specifica-mappa-gestore.md)
(commit `5862ed1`, `f306e67`, `8759997`), eseguito su uno stack Docker dedicato
(progetto `ombre-collaudo`, seed dimostrativi e vetrina) con `pnpm check`,
`pnpm test:db`, i sette collaudi fumo e una verifica HTTP dei criteri di accettazione.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm check`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`pnpm test:db`) | 108 (28 shared, 2 comms, 20 db, 52 api, 6 worker) | Superati |
| Pagine pubbliche (`smoke`) | 272 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 69 | Superati |
| Aree riservate (`smoke:areas`) | 67 | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Criteri di accettazione da HTTP | 90 | Superati |

### Criteri di accettazione della specifica

| # | Criterio | Esito |
|---|---|---|
| 1 | Home con la mappa in evidenza; modulo di ricerca e «Esplora» prima del riquadro nel DOM; riquadro con stato dichiarato e invito statico senza JavaScript; `/dati/mappa` con i due lidi | Superato |
| 2 | «Esplora»: lista e mappa con la stessa selezione, con e senza filtri; un lido senza coordinate resta in sola lista (provato azzerando e ripristinando la posizione del Bagno delle Dune) | Superato |
| 3 | Il gestore imposta le coordinate da «Gestione» e le vede su `/dati/mappa`; valori fuori intervallo rifiutati (API 400, errore accanto al campo sul web); avviso finché mancano, che sparisce quando ci sono | Superato |
| 4 | File e postazioni nelle tre zone (fila F01–F03 tra gli ombrelloni, lettino R07 in riva con dotazione predefinita); le distanze 3/0 e 1/2 cambiano i corridoi della planimetria (`--plan-gap-rows`); 99 file rifiutate; la reception cambia le sole distanze e riceve `forbidden` su tutte le azioni di struttura | Superato |
| 5 | Un lettino di riva di Lido Aurora prenotato dal pubblico fino al pass con QR (prenotazione `OM-261115-006`) | Superato |
| 6 | Tipo di affitto e note per postazione e per fila intera; visibili solo nell'area riservata; registrati in `audit_event` (`layout.spot-update`, `layout.row-rental`, …); avviso a testo per «Stagionale» senza contratto e per contratto attivo con etichetta diversa | Superato |
| 7 | Postazione mai usata eliminata; postazione usata rifiutata con il messaggio che indica il ritiro; una ritirata sparisce dal pubblico e dalle nuove pubblicazioni e torna con la rimessa in vendita | Superato |
| 8 | `pnpm check` e `pnpm test:db` verdi; contratto OpenAPI aggiornato (49 rotte, test di contratto incluso in `pnpm check`); collaudi fumo verdi | Superato |

Rotte pubbliche controllate anche al livello del JSON: `rental_type`, `rental_notes` e
`retired` non compaiono mai; `availability` espone la zona di ogni postazione e le
distanze in `gaps`.

### Accessibilità (punti di verifica della specifica)

Verificato sul codice e sulle schermate: segnaposti con etichetta testuale e scheda
apribile da tastiera (Invio/Esc nel componente della mappa), controlli di zoom ≥ 44 px,
alternativa a elenco completa prima della mappa nell'ordine di lettura, altezza del
riquadro riservata nei tre stati, script della mappa caricato solo al comparire del
riquadro. Restano fuori, come per il resto del sito, le prove con lettore di schermo.

### Difetti trovati e correzioni

- `scripts/smoke-flow.ts` aveva due attese superate dalla nuova interfaccia: il conteggio
  «un solo bottone» in home (ora c'è anche l'invito a «Esplora» nel riquadro mappa) e la
  dicitura «Fila …» nella barra della scelta (oggi «Postazione A02, ombrelloni, fila 1»).
  Il collaudo ha aggiornato le due verifiche, aggiungendo il controllo che l'invito a
  «Esplora» stia nel riquadro e che la ricerca preceda la mappa. Nessun difetto nel
  codice dell'applicazione.
- Nessun altro difetto: tutte le verifiche dei criteri sono passate alla prima
  esecuzione completa.

### Limiti residui

- I collaudi fumo vanno eseguiti nell'ordine di `scripts/collaudo.sh` su un database
  appena seminato: eseguiti fuori ordine falliscono per dati già consumati, non per
  difetti.
- Tasselli OpenStreetMap: il collaudo li ha ricevuti dalla rete; senza rete il riquadro
  mostra «Mappa non disponibile» con l'invito a «Esplora» (stato verificato nel codice,
  non riprodotto in container).
- Le schermate di «Spiaggia» mostrano anche le aggiunte del collaudo (R07 in riva,
  fila F01–F03 «Albergo»): sono la prova che la configurazione dal gestore funziona.
- Restano esclusi gli stessi ambiti del collaudo generale (pagamenti reali, posta,
  carico, prove con persone).

## Collaudo generale dell'11/11/2026

Esito del collaudo dell'11/11/2026, eseguito con `pnpm collaudo` su container creati da
zero e rimossi alla fine. Il comando esegue lint e controllo dei tipi, 102 test (72 su un
PostgreSQL vero), costruisce le immagini, avvia database, API, worker e sito, percorre
sette verifiche sul sistema in esecuzione (469 controlli) e ripristina un backup.

Tutti i dati sono dimostrativi: lo stabilimento «Bagno delle Dune» è fittizio e il
pagamento passa da un fornitore di prova che non muove denaro.

### Risultato

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi | tutto il codice | Superati |
| Test | 102 | Superati |
| Pagine pubbliche e pagina «non trovata» (`smoke`) | 271 | Superati |
| Ricerca, planimetria e percorso di riserva sul sito (`smoke:flow`) | 68 | Superati |
| Aree riservate sul sito (`smoke:areas`) | 67 | Superati |
| Sito dello stabilimento (`smoke:site`) | 24 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Backup e ripristino | 24 tabelle, 26 regole di isolamento | Superato |

### I 15 scenari di accettazione del progetto

| Scenario | Come è verificato | Esito |
|---|---|---|
| Due acquisti sulla stessa giornata | Dodici richieste simultanee nei test, dieci sull'API in container: una sola riserva | Superato |
| Reception e sito contemporanei | Due prenotazioni al banco e due riserve online lanciate insieme sulla stessa postazione: una sola passa | Superato |
| Prezzo manipolato nel browser | L'importo inviato dal client è ignorato; il totale salvato resta quello del server anche se il listino cambia | Superato |
| Ultimo utilizzo promo conteso | Due riserve simultanee con una promozione a un solo utilizzo: una sola lo ottiene | Superato |
| Pagamento riuscito tardivo | Giornata ancora libera: confermata. Giornata presa da un altro: nessuna prenotazione, rimborso registrato | Superato |
| Webhook duplicato o fuori ordine | Notifica ripetuta, in ritardo o con firma errata: nessuna conferma, quota o pass in più | Superato |
| Ritiro di data riservata | Lo stagionale non può ritirare una giornata con una riserva attiva | Superato |
| Accesso a un altro bagno | Il database non restituisce né modifica righe di un altro stabilimento; un gestore esterno riceve un rifiuto su ogni operazione | Superato per API e dati. Media ed export non esistono ancora |
| Due editor sullo stesso sito | Il secondo salvataggio su una versione superata viene rifiutato; nulla va perso | Superato |
| Pubblicazione e ripristino | La bozza non è visibile al pubblico; il ripristino crea una nuova bozza e conserva la storia | Superato. La prova «su un secondo dispositivo» è fatta con un visitatore senza accesso |
| Rimborso e trasferimenti | Rimborso registrato e quote stornate con movimenti che riportano il saldo a zero | Parziale: il rimborso è registrato, non eseguito. I trasferimenti richiedono un fornitore reale |
| Due scansioni del pass | Sei scansioni simultanee: un solo ingresso; uscita e rientro controllati | Superato |
| Chiusura e spostamento | Lo spostamento acquisisce la nuova postazione prima di rilasciare la vecchia; l'annullamento libera la postazione e invalida il pass | Superato per la singola prenotazione. Manca la chiusura di un'intera giornata in un colpo solo |
| Accessibilità e smartphone | Ogni percorso funziona senza script, con moduli ed elenchi; contrasti verificati; resa controllata a 390 px | Parziale: mancano le prove con lettore di schermo e da sola tastiera, e un controllo automatico |
| Ripristino dei dati | Backup ripristinato su un PostgreSQL vuoto: stesse righe in ogni tabella | Superato |

### Soglie del pilota

| Soglia proposta | Stato |
|---|---|
| Zero sovrapposizioni imputabili al sistema | Nessuna nei test di concorrenza. Da confermare con traffico reale |
| Differenze economiche identificate e risolte | La somma delle quote coincide con il totale per ogni prenotazione; manca la riconciliazione con un fornitore reale |
| Nessuna vulnerabilità bloccante | Nessuna nota. Non è stata fatta una verifica di sicurezza indipendente |
| Personale pronto sui casi di errore | Da fare con i partner |
| Almeno 4 partner su 5 intenzionati a proseguire | Da fare con i partner |

### Cosa il collaudo non copre

- Pagamenti, rimborsi e liquidazioni con un fornitore reale.
- Invio reale della posta: le notifiche sono registrate come non inviate.
- Carico: nessuna prova di prestazioni, né misura dei Core Web Vitals.
- Prove con persone: accessibilità assistita, personale della reception, ospiti.
- Verifica di sicurezza indipendente e prove di intrusione.
- Aspetti legali e fiscali, che il progetto affida ai professionisti.

### Revisione indipendente della grafica

Dopo l'applicazione del progetto grafico del committente, un revisore che non aveva
partecipato al lavoro ha esaminato il sito in esecuzione a 390 e 1280 px, senza script e
da tastiera. Nessun difetto bloccante. Ha trovato solidi contrasti (minimo 5,49:1),
struttura dei titoli, etichette, testi alternativi, bersagli di tocco, uso senza script e
parità tra le lingue. Dei venti rilievi, quindici sono stati corretti e verificati con
nuovi controlli automatici; gli altri sono scelte rimandate, elencate tra i limiti di
[progetto-grafico.md](progetto-grafico.md).

