# Collaudo

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

