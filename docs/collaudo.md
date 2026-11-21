# Collaudo

## Collaudo delle correzioni del gruppo A, iterazione 1 (21/11/2026)

Collaudo della commessa «Correzioni del gruppo A, iterazione 1 (D72)»
([specifica](specifica-correzioni-gruppo-a-1.md), criteri §7 cioè quelli del
[prompt](prompt-correzioni-gruppo-a-1.md) 1–6): il registro dice solo denaro
incassato (`recordSale` senza `payment_received`, una riga per pagamento sulla
capofila), quota di piattaforma zero sulle vendite al banco, dotazioni senza
parti a zero, testi it/en coerenti (cabine, annullamento, tempo di riserva),
`holdNote(minuti)` da `OMBRE_HOLD_MINUTES` e `callback.sentText` senza rinvii
a contatti assenti. Backend in `0368f72`, frontend in `7719cc6`.

Eseguito su **pila vergine usa-e-getta** con `pnpm collaudo`: progetto compose
dedicato `ombre-collaudo-pila` (web `127.0.0.1:3250`, API `127.0.0.1:3251`),
PostgreSQL dei test sulla porta predefinita **54329**, `build` → `up -d db
migrate api worker web` → health → **dodici** suite fumo nell'ordine → backup
**ripristinato davvero** (stesse righe in ogni tabella, 72 politiche di
sicurezza) → `down -v` della sola pila del giro. In più, prima del giro, `pnpm
test:db` a sé su porta **54333** e, dopo, `pnpm check` (lint, tipi, test,
build: 15 compiti turbo verdi — criterio 6). La pila esporta ora
**`OMBRE_HOLD_MINUTES=15`** (novità in `collaudo.sh`): la prova che i minuti
della riserva vengono dalla configurazione, non dal predefinito 10. L'ambiente
fisso `ombre-collaudo` (`:3232`) e `ombre-demo` **mai toccati**. **Un solo
giro, tutto verde al primo colpo.**

### Controlli estesi (mai ridotti): +12 fumo

- **`scripts/smoke.ts` +8**, da 553 a 561 — blocco «Le pagine non si
  contraddicono (gruppo A, D72)», 4 per lingua: il `<main>` di
  `/gestore-stabilimento` e `/en/beach-manager` **non contiene più «cabine» né
  «cabins»** (il gestionale le gestisce: i limiti non le rinnegano);
  `/come-funziona` e `/en/how-it-works` portano i testi nuovi «Fasce orarie e
  cabine non si prenotano online.» / «Time slots and cabins cannot be booked
  online.»; `/assistenza` e `/en/help` contengono «fino a 48 ore prima» / «up
  to 48 hours before» (48 è il predefinito di piattaforma
  `defaultCancelDeadlineHours` di `@ombre/shared`, lo stesso di
  `beach.cancel_deadline_hours`: il controllo verifica proprio quel
  predefinito, col commento che ne dice la fonte) e **non contengono più**
  «Dipende dalle condizioni» / «It depends on the terms».
- **`scripts/smoke-flow.ts` +2**, da 77 a 79: la pagina `/prenota`
  (riepilogo), nel flusso senza JavaScript, contiene
  `${Number(process.env.OMBRE_HOLD_MINUTES ?? '10')} minuti` — i minuti letti
  dall'ambiente con lo stesso predefinito del servizio web, **mai scritti a
  mano** — e «quando arriva il pagamento». Con la pila avviata a 15, il verde
  prova il «15 minuti» del criterio 4.
- **`scripts/smoke-richiamata.ts` +2**, da 52 a 54: la conferma dell'invio
  (`?inviata=1`), in entrambe le lingue, **non contiene più «più in basso» /
  «further down»** — nessun rinvio a contatti che la pagina non mostra.
- **`scripts/collaudo.sh`**: la sola riga `export OMBRE_HOLD_MINUTES=15`
  accanto alle altre export, col commento del motivo (criterio 4). Progetto e
  porte invariati.
- **`scripts/smoke-booking.ts` non toccato**: il grep preventivo (platform,
  allocation, payment\_received, collect, banco) trova una sola verifica di
  quote, sulla **vendita online** del giro end-to-end — che per D72 resta
  identica a prima («online nulla cambia») e infatti resta verde senza
  ritocchi.

Nessuna asserzione esistente tolta né indebolita.

### Test e collaudi fumo (un giro, pila vergine)

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (54333 a sé, 54329 nella pila) | **304** (**48** shared, 11 comms, 66 db, **172** api, 7 worker: **+7**, i sei di `ledger-d72.test.ts` e le dotazioni in `i18n.test.ts`), contratto OpenAPI a **138 rotte** (invariato) | Superati |
| `pnpm check` (lint, tipi, test, build) | 15 compiti turbo | Superati |
| Pagine pubbliche (`smoke`) | 561 (**+8**) | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 79 (**+2**) | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Modulo di richiamata (`smoke:richiamata`) | 54 (**+2**) | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| La spiaggia illustrata (`smoke:spiaggia`) | 121 | Superati |
| La scheda della postazione (`smoke:schede`) | 141 | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |
| Backup e prova di ripristino | quadratura, 72 politiche | Superati |

In totale **1354 controlli fumo** (1342 + 12 del collaudatore), tutti verdi
al primo giro.

### Criteri di accettazione (prompt 1–6)

1. **Il registro dice solo denaro incassato — superato.**
   `apps/api/tests/ledger-d72.test.ts` su database nuovo: «writes no inflow
   for a desk booking “da incassare”, one per collection, and their sum closes
   at the total» (nessun `payment_received` alla conferma, una riga per
   incasso parziale, la somma chiude al totale, **e il caso d'errore**:
   l'incasso oltre il residuo resta rifiutato 409 `invalid_state` senza
   lasciare traccia); «records the inflow when a payment request is
   collected»; «writes the deposit alone at an online confirmation in deposit
   mode, and the balance at its collection» (caparra D52 senza doppio
   conteggio). Verdi in `pnpm test:db` (porta 54333) e nella pila.
2. **Quota di piattaforma zero sul banco — superato.** Sempre in
   `ledger-d72.test.ts` i tre casi: «gives the beach club 100% of the spot
   price on a desk sale of an ordinary day», «keeps the seasonal share
   untouched and moves the platform share to the club on a desk sale of a
   shared day», «keeps the online quotas exactly as today»; in ogni caso la
   somma delle quote chiude al lordo. La vendita **online** end-to-end di
   `smoke:booking` (15 controlli) conferma sulla pila che online nulla cambia.
3. **Dotazioni senza parti a zero — superato.**
   `packages/shared/tests/i18n.test.ts`, «leave the zero parts out of the
   equipment line»: «1 lettino», «1 ombrellone e 2 lettini», «2 ombrelloni» e
   gli equivalenti inglesi, più la stringa vuota con entrambe le quantità a
   zero (48 test shared verdi).
4. **Le pagine non si contraddicono — superato.** Gli 8 controlli nuovi di
   `pnpm smoke` nelle due lingue (guida Gestore senza «cabine»/«cabins» nel
   `main`, guida Ospite e assistenza coi testi nuovi e le 48 ore dal
   predefinito di piattaforma) e i 2 di `smoke:flow`: pila avviata con
   `OMBRE_HOLD_MINUTES=15` e riepilogo che mostra **«15 minuti»** coi minuti
   letti dall'ambiente, più «quando arriva il pagamento». Tutti verdi.
5. **La conferma della richiamata — superato.** I 2 controlli nuovi di
   `smoke:richiamata` (54 totali): `?inviata=1` senza «più in basso» (it) né
   «further down» (en).
6. **Nessuna regressione — superato.** `pnpm check` verde (15 compiti turbo,
   build compresa), `pnpm test:db` verde (304 test, 138 rotte a contratto),
   `pnpm collaudo` verde su pila vergine al primo giro (1354 controlli fumo,
   backup ripristinato). `smoke:booking` e i test economici esistenti non
   verificavano la quota di piattaforma sul banco né il `payment_received`
   alla conferma «da incassare»: nessun adeguamento servito, motivo scritto
   sopra.

### Difetti trovati

Nessuno: né del prodotto né delle suite, giro unico tutto verde.

## Collaudo della vetrina del Gestore (21/11/2026)

Collaudo della commessa «la vetrina del Gestore e il modulo "Ti chiamiamo
noi"» ([specifica](specifica-vetrina-gestore.md), D71, criteri §6 cioè
quelli del [prompt](prompt-vetrina-gestore.md) 1–7 più i tre propri della
specifica): la pagina `/gestore-stabilimento` (e `/en/beach-manager`) è
diventata la vetrina commerciale del gestionale col modulo di richiamata.
Backend in `1b4a1c8` (migrazione 026, tre rotte, contratto a 138),
frontend in `6331a27`, quinta schermata vera in `e12cf48`.

Eseguito su **pila vergine usa-e-getta** con `bash scripts/collaudo.sh`:
progetto compose dedicato `ombre-collaudo-pila` (web `127.0.0.1:3250`, API
`127.0.0.1:3251`), PostgreSQL dei test sulla porta predefinita **54329**,
`build` → `up -d db migrate api worker web` → health → **dodici** suite
fumo nell'ordine → backup **ripristinato davvero** (stesse righe in ogni
tabella, **72** politiche di sicurezza: una in più per
`callback_request`) → `down -v` della sola pila del giro. L'ambiente
fisso `ombre-collaudo` (`:3232`) e `ombre-demo` **mai toccati** (sul 3232
solo una passata di sola lettura di `smoke.ts` per tarare i controlli
nuovi, nessuna scrittura). **Un solo giro, tutto verde al primo colpo.**

### Controlli estesi (mai ridotti): +105 fumo

- **`scripts/smoke.ts` +53**, da 500 a 553 — blocco «La vetrina del
  Gestore (D71)» su `/gestore-stabilimento` e `/en/beach-manager` (24 per
  lingua + 5 condivisi): `h1` aggiornato al claim nuovo della vetrina
  (prima la pagina era la guida); eroe con l'azione primaria verso
  `#richiamata` (**due volte esatte**: eroe e chiusura) e la secondaria
  verso `#funzionalita`; la riga discreta `manager-already` **due volte**,
  sempre verso l'accesso (i due tocchi di D41 conservati — il controllo
  D70 del collegamento resta); modulo POST verso `/azioni/richiamata` con
  lingua nascosta, `name` (80, obbligatorio), `phone` (tel, 20,
  obbligatorio), `beach` (80, facoltativo), consenso `checkbox` con
  valore «1» e trappola `sito` nascosta (`visually-hidden`,
  `aria-hidden`, `tabindex="-1"`, `autocomplete="off"`) — i controlli
  cercano il campo per nome e poi gli attributi, senza dipendere
  dall'ordine di resa del server; **esattamente cinque** schede
  `manager-features` con le cinque schermate vere nell'ordine
  (`condivisione-it-desktop.png` compresa, `alt` vuoto), e le cinque
  immagini servite 200 come `image/*`; «Perché Ombrè» con **esattamente
  quattro** carte; le quattro sezioni della trasparenza
  (comprende / non comprende / come si attiva / Costi); chiusura
  `next-step` con l'àncora del modulo e la via discreta; **nessuna cifra
  da vetrina**: nel testo visibile di `<main>` nessun numero seguito da
  `%` (il controllo onesto scelto contro i «+30%» da brochure). Home e
  ricerca non toccate: i blocchi D70/D67/D41 restano identici.
- **NUOVA `scripts/smoke-richiamata.ts`: 52 controlli** — il percorso
  intero del modulo come un browser **senza JavaScript**, nelle **due
  lingue** (15 per lingua + 22 di consultazione): invio valido (303 su
  `?inviata=1#richiamata`, conferma resa in pagina al posto del modulo);
  convalide (nome vuoto → `enome=1`, telefono corto → `etel=1`, consenso
  mancante → `econsenso=1`, sempre coi valori ricompilati nella query e
  nei campi, errore annunciato accanto al campo); trappola compilata
  (risposta identica a un invio riuscito e **niente in archivio**);
  limite di invii (cinque passano, il **sesto dallo stesso indirizzo** →
  `emodulo=limite` spiegato accanto al modulo; ogni scenario usa il suo
  `X-Forwarded-For`); pagina riservata `/area/richieste`
  (`/en/account/callback-requests`): senza sessione → accesso, gestore
  senza ruolo di piattaforma → **404** in entrambe le lingue,
  amministratore → elenco con data, nome, telefono e stabilimento,
  marcatura «Segna come richiamato» (`?ok=1`, stato «Richiamato», modulo
  sparito, **idempotente lato pagina**), gemella inglese sullo stesso
  archivio.
- **`scripts/collaudo.sh`**: solo i due collegamenti ammessi — la suite
  nuova nell'ordine (dopo `smoke:site`, lanciata col node di pnpm perché
  non ha voce in package.json) e l'amministratore di piattaforma della
  pila (`OMBRE_ADMIN_EMAIL=amministrazione@collaudo.example`,
  `OMBRE_ADMIN_PASSWORD` uguale alla parola d'ordine dimostrativa della
  pila), creato dal servizio migrate come negli altri ambienti. Progetto
  e porte invariati. `smoke-flow.ts` non serviva: non esercita la pagina
  del Gestore.

Nessuna asserzione esistente tolta né indebolita.

### Test e collaudi fumo (un giro, pila vergine)

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (porta predefinita 54329) | **297** (47 shared, 11 comms, **66** db, **166** api, 7 worker), contratto OpenAPI a **138 rotte** | Superati |
| Pagine pubbliche (`smoke`) | 553 (**+53**) | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 77 | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| **Modulo di richiamata (`smoke:richiamata`, nuova)** | **52** | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| La spiaggia illustrata (`smoke:spiaggia`) | 121 | Superati |
| La scheda della postazione (`smoke:schede`) | 141 | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |
| Backup e prova di ripristino | quadratura, 72 politiche | Superati |

In totale **1342 controlli fumo** (1237 + 105 del collaudatore), tutti
verdi al primo giro.

### Criteri di accettazione (prompt 1–7)

1. **Eroe da vetrina con le due azioni — superato.** Claim nuovo come
   `h1`, «Ti chiamiamo noi» primaria verso il modulo, secondaria verso le
   schermate, «Entra nel gestionale» in forma discreta due volte, in
   italiano e in inglese (controlli nuovi di `smoke.ts`).
2. **Il modulo di richiamata — superato.** Registra nome, telefono ed
   eventuale stabilimento col consenso esplicito; funziona senza
   JavaScript (percorso intero della suite nuova), convalida con errori
   leggibili e valori ricompilati, conferma dopo l'invio, limite di
   cinque al minuto per indirizzo e campo trappola attivi (il bot riceve
   la risposta buona e l'archivio resta pulito).
3. **Consultazione riservata — superato.** Le richieste si leggono da
   `/area/richieste` con data, nome, telefono, stabilimento e stato;
   la marcatura «richiamato» funziona ed è idempotente; senza ruolo di
   piattaforma la pagina non esiste (404), senza sessione si va
   all'accesso; nessun dato del modulo finisce altrove (niente outbox:
   66 test db e 166 api lo attestano).
4. **Schede con le schermate vere — superato.** Cinque schede con le
   cinque schermate del gestionale dimostrativo nell'ordine, compresa la
   condivisione degli stagionali; i quattro vantaggi di «Perché Ombrè»
   sono esattamente quattro e corrispondono a funzioni reali del
   prodotto.
5. **Niente numeri, testimonianze o loghi inventati; trasparenza
   conservata — superato.** Il testo visibile della pagina non porta
   percentuali (controllo nuovo); le sezioni comprende / non comprende /
   come si attiva restano, Costi e Contatti con la formula della fase
   pilota.
6. **Nessun'altra pagina cambia — superato.** Home (D70), Ricerca
   ombrellone, guide, menu a cinque voci (D41/D67) e area riservata:
   tutti i blocchi esistenti restano verdi identici; il contratto passa
   a 138 rotte come da specifica.
7. **Tutti i collaudi verdi — superato.** 297 test di pacchetto, 138
   rotte a contratto, 1342 controlli fumo (+105); i controlli della
   vecchia pagina aggiornati alla nuova forma **estendendoli**, mai
   ridotti. Le schermate finali della pagina e della pagina riservata
   restano **in capo al coordinatore**.

### Difetti trovati

Nessuno: né del prodotto né delle suite, giro unico tutto verde.

## Collaudo della home dell'Ospite (20/11/2026)

Collaudo della commessa «la home è dell'Ospite»
([specifica](specifica-home-ospite.md), D70, criteri §6 1–6): via i tre
pulsanti dei ruoli (`portal-roles`) dall'eroe, che tiene titolo,
sottotitolo e modulo di ricerca; le carte «Per chi è» diventano l'ingresso
dei ruoli con pulsanti secondari (`button button--secondary card__cta`)
verso le tre guide; il Gestore resta a due tocchi dall'accesso. Frontend
committato in `a6efc57`.

Eseguito su **pila vergine usa-e-getta** con `bash scripts/collaudo.sh`:
progetto compose dedicato `ombre-collaudo-pila` (web `127.0.0.1:3250`, API
`127.0.0.1:3251`), PostgreSQL dei test usa-e-getta sulla porta
predefinita **54329**, `build` → `up -d db migrate api worker web` →
health → undici suite fumo nell'ordine → backup **ripristinato davvero**
(stesse righe in ogni tabella, 71 politiche di sicurezza) → `down -v`
della sola pila del giro. L'ambiente fisso `ombre-collaudo` (`:3232`) e
`ombre-demo` **mai toccati**. Due giri completi: al primo, un rosso in
`smoke:flow` diagnosticato come **controllo della suite legato alla
vecchia forma** (sotto); aggiornata la suite, **secondo giro da pila
vergine tutto verde**.

### Controlli estesi (mai ridotti): +23 fumo

- **`scripts/smoke.ts` +22**, da 478 a 500 — blocco «La home è
  dell'Ospite (D70)», su `/` e `/en` (11 per lingua): `portal-roles`
  assente; i testi esatti dei tre vecchi tasti assenti in ogni variante
  di resa dell'apostrofo («Cerco un ombrellone», «Affitto il mio
  ombrellone», «Gestisco uno stabilimento» / "I'm looking for an
  umbrella", "I rent out my umbrella", "I manage a beach club" — mentre
  «Gestore stabilimento» e "Beach manager" restano legittimi nelle carte
  e nel menu); l'eroe `portal-hero` conserva `h1` e modulo
  `portal-search`; **esattamente tre** collegamenti `button
  button--secondary card__cta`, confrontati su classi e `href`
  nell'ordine `/come-funziona`, `/stagionale`, `/gestore-stabilimento`
  (it) e `/en/how-it-works`, `/en/season-holder`, `/en/beach-manager`
  (en); i due tocchi del Gestore: `/gestore-stabilimento` →
  `/area/accesso` e `/en/beach-manager` → `/en/account/sign-in`.
- **`scripts/smoke-flow.ts` +1**, da 76 a 77: il controllo «un solo
  bottone sulla home» contava ogni `class="button…"` e per D70 vedeva
  anche i tre pulsanti secondari delle carte. Aggiornato alla nuova
  forma **estendendolo**: il tasto d'invio della ricerca resta l'**unico
  pulsante primario** fuori dal riquadro della mappa, e in più si
  pretende che i secondari siano **esattamente i tre** `card__cta` delle
  carte e nient'altro.

Nessuna asserzione esistente tolta né indebolita; nessun ritocco a
`scripts/collaudo.sh` (progetto e porte invariati).

### Test e collaudi fumo (secondo giro, pila vergine)

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (porta predefinita 54329) | **287** (47 shared, 11 comms, 61 db, 161 api, 7 worker), contratto OpenAPI a **135 rotte** (invariato) | Superati |
| Pagine pubbliche (`smoke`) | 500 (**+22**) | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 77 (**+1**) | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| La spiaggia illustrata (`smoke:spiaggia`) | 121 | Superati |
| La scheda della postazione (`smoke:schede`) | 141 | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |
| Backup e prova di ripristino | quadratura | Superati |

In totale **1237 controlli fumo** (1214 + 23 del collaudatore), tutti
verdi al secondo giro.

### Criteri di accettazione (specifica §6)

1. **Eroe dell'Ospite — superato.** Su `/` e `/en` l'eroe mostra titolo
   (`h1`), sottotitolo e modulo di ricerca; `portal-roles` e i testi dei
   tre vecchi tasti non compaiono più in nessun punto della pagina, in
   italiano e in inglese (controlli nuovi).
2. **Carte «Per chi è» come ingresso dei ruoli — superato.** Le tre carte
   portano pulsanti secondari (`button button--secondary card__cta`),
   esattamente tre per lingua, verso le tre guide nell'ordine giusto; il
   Gestore raggiunge l'accesso in due tocchi: menu o carta → guida →
   «Area riservata» (`/area/accesso`, `/en/account/sign-in`), verificato
   dai controlli nuovi.
3. **Menu a cinque voci invariato, nessun'altra pagina cambiata —
   superato.** I controlli D67/D41 dell'intestazione restano verdi
   identici su `/` e `/en`; tutte le altre suite sono invariate e verdi
   (aree riservate, sito, conto, mercato, spiaggia, schede, prenotazioni,
   2FA), con le 135 rotte a contratto.
4. **D70 richiama D41 e ne supera la sola parte dei «tre tasti di pari
   peso» — superato.** Registrato in [decisioni.md](decisioni.md) (D70);
   il resto di D41 (menu a cinque voci, nomi delle pagine) resta
   esercitato dai controlli esistenti, tutti verdi.
5. **Tutti i collaudi verdi, quelli dell'eroe estesi e mai ridotti —
   superato.** 287 test, 135 rotte a contratto, 1237 controlli fumo
   (+23); nessuna asserzione tolta; l'unico controllo aggiornato
   (`smoke-flow`) è stato esteso, non indebolito.
6. **Schermate della home (1366 e 390), stato.md e demo — in capo al
   coordinatore.**

### Difetti trovati

Nessun difetto del prodotto. Un solo rosso al primo giro, in
`smoke:flow` («expected exactly one main button»): **difetto della
suite**, scritta per la forma precedente alla D70; aggiornata come sopra,
secondo giro tutto verde.


Collaudo della commessa «la home arcobaleno»
([specifica](specifica-home-arcobaleno.md), D67–D69, criteri §6 1–6):
intestazione su due righe con la barra dei menu da bordo a bordo e le voci
mai tagliate (D67), sei pulsanti del menu nei colori dell'arcobaleno con la
tavola misurata del direttore artistico (D68), mappa della home con i
segnaposto dalla rotta `/dati/mappa` finalmente committata e ripiego a
elenco senza JavaScript (D69).

Eseguito su **pila vergine usa-e-getta** con `bash scripts/collaudo.sh`:
progetto compose dedicato `ombre-collaudo-pila` (web `127.0.0.1:3250`, API
`127.0.0.1:3251` — il 3210 era occupato da un `next dev` di lavorazione),
PostgreSQL dei test usa-e-getta sulla porta predefinita **54329**, `build`
→ `up -d db migrate api worker web` → health → undici suite fumo
nell'ordine → backup **ripristinato davvero** → `down -v` della sola pila
del giro. L'ambiente fisso `ombre-collaudo` (`:3232`) e `ombre-demo`
(`:3220`) **mai toccati**. Due giri completi: al primo, quattro rossi in
`smoke:spiaggia` diagnosticati come **difetto della suite** (sotto);
corretta la suite, **secondo giro da pila vergine tutto verde**.

### Controlli estesi (mai ridotti): +28 fumo

- **`scripts/smoke.ts` +25 (il collaudatore)**, da 453 a 478: **8** per
  l'intestazione D67 (su `/` e `/en`: un solo `nav.site-nav`, **fuori** da
  `.site-header__inner` come fascia propria dopo la riga del marchio, voci
  dentro `ul.container`, e le **cinque voci nell'ordine D41** con testo e
  collegamento esatti nelle due lingue); **9** per la rotta `/dati/mappa`
  D69 (per `lang=it` e `lang=en`: esattamente **tre segnaposto** e, per
  ciascun lido demo, slug, nome, località, coordinate numeriche e `href`
  localizzato; una lingua ignota ripiega sull'italiano); **8** per
  l'elenco di ripiego D69 (home it e en: tre voci in
  `.portal-map__list`, ciascuna col collegamento giusto e la località).
- **`scripts/smoke-flow.ts` +3 (il collega della mappa)**, da 73 a 76:
  elenco di ripiego reso dal server su home e ricerca, e «Mappa non
  disponibile» sparita per sempre.

### Correzioni alle suite (nessuna al prodotto), in `scripts/collaudo.sh`

1. **Progetto compose parametrico** (`OMBRE_COLLAUDO_PROJECT`, predefinito
   nuovo `ombre-collaudo-pila`): prima era cablato `ombre-collaudo`, lo
   stesso nome dell'**ambiente fisso** acceso su `:3232`; un giro l'avrebbe
   ricreato su porte diverse e la trappola EXIT l'avrebbe **spento con
   `down -v`**.
2. **Porte parametriche** (`OMBRE_WEB_PORT`/`OMBRE_API_PORT`, predefinite
   3210/3211) passate anche alle suite: ogni script fumo riceve
   l'indirizzo giusto (sito, API o entrambi).
3. **`OMBRE_COLLAUDO_PSQL` puntato alla pila sotto prova**: la scia di
   audit di `smoke:spiaggia` era letta col progetto cablato
   `ombre-collaudo` (riga 22 della suite), cioè dal database
   dell'ambiente fisso — da qui i quattro rossi del primo giro
   (`layout.saved` 0 → 0): **difetto di ambiente della suite, non del
   prodotto**. Al secondo giro, scia letta dalla pila giusta: 7
   salvataggi, 7 voci, generi e conteggi esatti, tutto verde.
4. **Un rosso ferma il collaudo**: `pnpm -s suite | tail -1` inghiottiva
   l'esito (quello della pipeline è di `tail`), tanto che il primo giro ha
   chiuso «Collaudo completato senza errori» **con quattro controlli
   rossi**; ora l'uscita di ogni suite si conserva e un fallimento
   interrompe il giro.
5. **`OMBRE_DEMO_MODE=true`** come nell'ambiente fisso (`.env.collaudo`):
   la pila mostra l'avviso dimostrativo e `smoke.ts` lo pretende (il
   controllo condizionale non resta più muto).

### Test e collaudi fumo (secondo giro, pila vergine)

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi (`pnpm lint`, `pnpm typecheck`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`OMBRE_TEST_DB_PORT` predefinita 54329) | **287** (47 shared, 11 comms, 61 db, 161 api, 7 worker), contratto OpenAPI a **135 rotte** (invariato) | Superati |
| Pagine pubbliche (`smoke`) | 478 (**+25**) | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 76 (**+3**) | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| La spiaggia illustrata (`smoke:spiaggia`) | 121 | Superati |
| La scheda della postazione (`smoke:schede`) | 141 | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |
| Backup e prova di ripristino | quadratura | Superati |

In totale **1214 controlli fumo** (1186 + 3 del collega + 25 del
collaudatore), tutti verdi al secondo giro; **nessuna asserzione esistente
cambiata né tolta**.

### Criteri di accettazione (specifica §6)

1. **Intestazione su due righe — superato (struttura).** Il logo sta nella
   riga del marchio col cambio lingua e «Area riservata»; `nav.site-nav` è
   reso **fuori** da `.site-header__inner` come fascia a tutta pagina
   (fondo spuma, uno dei tre fondi su cui la tavola D68 è misurata) con le
   voci in `ul.container` che **vanno a capo** (`flex-wrap`), niente
   scorrimento né sfumature; verificato dai controlli nuovi su `/` e
   `/en`. La prova a vista alle quattro larghezze sta nelle schermate del
   criterio 6 (aperto).
2. **Sei colori nell'ordine dell'arcobaleno — superato.** La tavola D68 è
   nei gettoni ([tema-arcobaleno.md](tema-arcobaleno.md)) con **tutti i
   rapporti misurati** (vincolato minimo 3,18 ≥ 3, testo minimo 4,87 ≥
   4,5); giallo sole solo come fondo con testo abisso e bordo `#a85600`;
   voce corrente con sottolineatura 3px + peso 800 (mai solo colore); i
   gettoni `--menu-*` sono applicati per `nth-child` sull'ordine D41,
   identico nelle due lingue (controllato in it e en). L'esperto
   d'accessibilità ha misurato le pagine rese (195 rapporti): l'unica
   coppia sotto soglia (collegamenti dell'elenco di ripiego, 4,23) è
   corretta a 7,00 in `portal.css` — correzione committata dal collega
   (`7ca1251`) ed esercitata da questo collaudo.
3. **Mappa con i tre segnaposto — superato** per quanto si collauda senza
   browser: `/dati/mappa` risponde con i tre lidi demo completi e l'`href`
   localizzato (stessi collegamenti che il segnaposto apre), Leaflet e il
   suo CSS sono serviti dal sito (bundle npm), le tessere vengono da
   OpenStreetMap **con attribuzione** e collegamento al copyright, il
   visitatore non è mai localizzato e non c'è tracciamento. La mappa resa
   a vista è nelle prove del criterio 6.
4. **Rotta committata e ripiego senza JavaScript — superato sul codice,
   aperto sulla demo.** La rotta è nel repository (commit `904d581`, regola
   `!apps/web/app/dati/` nel `.gitignore` di `ombre/`) e la pila di
   collaudo la serve; senza JavaScript il riquadro mostra l'elenco dei tre
   lidi coi collegamenti giusti e «Mappa non disponibile» è sparita (11
   controlli fra collaudatore e collega). **Ma l'ambiente `ombre-demo`
   (`:3220`) risponde ancora 404 su `/dati/mappa`**: è stato costruito
   prima del commit e va ricostruito e ridistribuito (compito di
   distribuzione, non difetto del codice).
5. **Nessuna regressione — superato.** 287 test, contratto fermo a 135
   rotte, 1214 controlli fumo tutti verdi su pila vergine, nelle due
   lingue e senza JavaScript; controlli **estesi** (+28), mai ridotti.
6. **Schermate, stato.md e demo — aperto.** In `docs/schermate` non ci
   sono ancora le schermate nuove di intestazione e mappa (1366 e 390),
   `stato.md` non registra ancora l'iterazione e la demo non è stata
   ridistribuita sul tunnel (vedi criterio 4): restano alla squadra.

### Difetti

**Nessun difetto di prodotto.** Difetti **delle suite** trovati e corretti
dal collaudatore (le cinque correzioni a `collaudo.sh` qui sopra; le prime
quattro erano latenti da prima della commessa). Nota aperta per la squadra:
la demo va ricostruita perché serva `/dati/mappa`, con le schermate e
`stato.md` del criterio 6.

## Collaudo del 20/11/2026 — Il tema arcobaleno

Collaudo della commessa «il tema arcobaleno»
([specifica](specifica-tema-arcobaleno.md), D64–D66, criteri §6 1–7):
rifacimento **puramente visivo** — logo arcobaleno, gettoni del tema
([tavola del direttore artistico](tema-arcobaleno.md)), gradiente confinato
all'elenco chiuso, planimetria pastello con accenti — già vagliato
dall'accessibilità (verbale del 20/11 in coda alla tavola: 5.456 nodi
misurati, 0 coppie sotto soglia). Il collaudo è la **regressione completa**
più le prove visive dei criteri: nessuna suite nuova, nessuna asserzione
cambiata.

Eseguito sullo stack **fisso** `ombre-collaudo` (web `127.0.0.1:3232`, API
`127.0.0.1:3231`, variabili di `.env.collaudo`) **ricostruito dal codice
corrente con volume nuovo** (`build` → `down -v` → `up -d db migrate api
worker web` → health): migrazioni 001–**025**, seed demo e vetrina, OIDC di
prova, posta a log, avviso dimostrativo. Gate statici (`pnpm lint`,
`pnpm -r typecheck`, `pnpm -r build`), la suite dei test completa su un
PostgreSQL usa-e-getta (`OMBRE_TEST_DB_PORT=54333`), poi le **undici** suite
fumo nell'ordine di `collaudo.sh` (`smoke:2fa` per ultima), col verde letto
suite per suite in un giro solo. **L'ambiente resta acceso** alla fine.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm lint`, `pnpm -r typecheck`, `pnpm -r build`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`OMBRE_TEST_DB_PORT=54333 pnpm test:db`) | **287** (47 shared, 11 comms, 61 db, 161 api, 7 worker), contratto OpenAPI a **135 rotte** | Superati |
| Pagine pubbliche (`smoke`) | 453 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 73 | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| La spiaggia illustrata (`smoke:spiaggia`) | 121 | Superati |
| La scheda della postazione (`smoke:schede`) | 141 | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |

In totale **1186 controlli fumo**, tutti superati al primo giro: il
rifacimento visivo non ha toccato un solo controllo funzionale —
**nessuna asserzione aggiornata**, né nei test né nelle suite fumo.

### Prove visive (Playwright 1.49.1 nel contenitore ufficiale, `--network host`)

Schermate riprese sullo stack di collaudo ed **esaminate una per una**
(home intera e testata, piè di pagina, campionario del favicon a
16/32/64/160 px su bianco e su abisso, accesso con errore, console «Oggi»
dell'Aurora, testate di gestionale e reception, planimetria pubblica
dell'Aurora a colori e in grigio, legenda). In più un censimento a
`getComputedStyle` di **ogni elemento e pseudo-elemento** di home e console
per contare le comparse del gradiente.

### Criteri di accettazione (specifica §6)

1. **Logo arcobaleno attivo dappertutto — superato.** In testata della home
   l'SVG del marchio porta il `linearGradient` con le sei fermate esatte del
   committente (`#e63946 → #f77f00 → #fcbf49 → #2a9d8f → #0077b6 →
   #7b2cbf`) e il sole arancio sulla «è»; stessa testata, verificata viva,
   nel gestionale (console «Oggi») e nella reception (banco della Dune,
   accesso da `reception@…`). Nel piè di pagina la scritta è bianca e il
   simbolo resta a colori. `/icon.svg` (1268 byte) è il ventaglio a sei
   spicchi piatti nei sei colori pieni con l'onda `#ee9b00`: guardato nel
   campionario, leggibile a 16 px, su abisso dentro il disco bianco. I file
   storici del marchio sono ancora tutti in `docs/marchio/` e
   [marchio.md](marchio/marchio.md) dice quali file sono in uso e come
   ripristinare i precedenti col tag.
2. **Tavola dei gettoni con i contrasti — superato.**
   [tema-arcobaleno.md](tema-arcobaleno.md) esiste e porta la tabella
   completa (nome, valore, ruolo, contrasto misurato sui fondi previsti),
   le coppie sotto soglia coi rimedi, e in coda il verbale d'accessibilità
   del 20/11: 5.456 nodi di testo misurati sulle pagine rese, **0 coppie
   sotto WCAG AA** dopo le sette correzioni blu-su-spuma.
3. **Coerenza della palette — superato.** Il censimento del gradiente sulla
   home trova **esattamente** le comparse dell'elenco chiuso:
   `.portal-hero::before` (fascia dell'eroe), le sottolineature `h2::after`
   dei tre titoli di sezione, `.site-footer::before` (bordo del piè di
   pagina) — e nient'altro; nella console l'unica comparsa è il bordo del
   piè di pagina. Il bottone primario è blu pieno (`rgb(0, 119, 182)` =
   `#0077b6`, fondo senza immagine). Il modulo d'accesso con credenziali
   sbagliate mostra l'esito rosso da tavola: icona «!», bordo `#b3202c`,
   fondo `#fce8ea`, testo abisso — fotografato.
4. **Planimetria leggibile con gli accenti — superato.** La planimetria
   pubblica dell'Aurora conserva mare, sabbia e scenografia pastello; gli
   stati sono colore **+ glifo** (spunta = libera, mezzaluna = condivisa,
   × = non disponibile, scudo = scelta) e la legenda ha i contenuti di
   prima: «Libera», «Libera, giornata condivisa», «Non disponibile»,
   «Scelta da te» più i tipi (Lettino singolo, Gazebo, Tenda). La console
   «Oggi» dell'Aurora ha la sua legenda completa (Disponibile, Prenotato,
   Occupato, Stagionale, In manutenzione, Non in vendita o bloccata,
   riservata, condivisione stagionale, bloccata) e lo stato **in parole**
   su ogni riga della tabella. Entrambe fotografate.
5. **Giallo mai testo su chiaro; leggibile in bianco e nero — superato.**
   A verbale del direttore (§6 della tavola) e dell'esperto
   d'accessibilità: il giallo `#fcbf49` compare solo come fermata del
   gradiente, spicchio del favicon e velo di tela «disponibile» — mai come
   testo. Prova senza colore ripetuta dal collaudatore: la planimetria
   dell'Aurora fotografata col filtro grigio resta leggibile dai glifi,
   dai codici e dalla legenda, come al vaglio.
6. **Nessuna regressione — superato.** I numeri sopra: 287 test (contratto
   a 135 rotte) e 1186 controlli fumo verdi al primo giro su stack appena
   ricostruito, prenotazione rapida, carrello, caparra, pianificatore e
   schede comprese, nelle due lingue e senza JavaScript.
7. **Backup e ripristino documentati — superato.** `stato.md` ha la sezione
   «Backup e ripristino del tema originale»: tag git
   `ombre-tema-originale-20261120` (commit `3bcd7e9`) con il comando di
   ripristino mirato e l'elenco dei file del tema, più l'archivio
   `/home/sysadmin/backup-ombre/ombre-tema-originale-20261120.tar.gz`.

### Difetti

Nessun difetto trovato: niente da aggiustare, nessuna suite da rilanciare.
(Unica nota di collaudo, non del prodotto: sulla pagina del banco la
condizione `networkidle` di Playwright non arriva mai per i tasselli della
mappa; le prove usano `load`.)

## Collaudo del 19/11/2026 (notte) — La scheda della postazione

Collaudo della commessa «la scheda della postazione»
([specifica](specifica-scheda-postazione.md), D61–D63, criteri §6 1–7): la
scheda illustrativa di ogni tipo di postazione nel percorso d'acquisto, su due
livelli (predefinita di piattaforma e personalizzata del lido, risolte campo
per campo), con le fotografie a licenza registrata e il ritorno esatto al punto
d'acquisto. Eseguito sullo stack **fisso** `ombre-collaudo` (web
`127.0.0.1:3232`, API `127.0.0.1:3231`) **ricostruito dal codice corrente con
volume nuovo** (`build` → `down -v` → `up`): migrazioni 001–**025**
(`025_type_cards`), seed demo e vetrina (l'Aurora con **tre schede
personalizzate** dal seme, Dune e Cala predefinite), stesse variabili dei
collaudi precedenti. Gate statici (`pnpm lint`, `pnpm -s typecheck`,
`pnpm -r build`), la suite dei test completa su un PostgreSQL usa-e-getta
(`OMBRE_TEST_DB_PORT=54335`), poi le **undici** suite fumo nell'ordine di
`collaudo.sh` — la nuova `smoke:schede` tra `smoke:spiaggia` e
`smoke:booking`, `smoke:2fa` per ultima — col verde letto suite per suite in
un giro solo sullo stack appena ricostruito. **L'ambiente resta acceso** alla
fine, coi dati che il collaudo vi ha lasciato: il collaudo vive nel collaudo.

### La suite nuova: `smoke:schede`

`scripts/smoke-schede.ts` (**141 controlli numerati, stampati uno a uno**;
cablata in `package.json` e in `scripts/collaudo.sh` dopo `smoke:spiaggia` e
prima di `smoke:booking`) percorre da navigatore senza script, it e en, sul
modello di smoke-mercato e smoke-spiaggia:

- **gli ingressi veri dell'Aurora** (criterio 1): riquadro «I tipi di
  postazione», elenco delle postazioni libere («Vedi la scheda»), barra di
  selezione, riepilogo prima di pagare, pagina della riserva (creata via API)
  e voce del carrello (aggiunta dal modulo vero, tolta in coda). Per ciascuno
  la suite **estrae l'href con `torna` dalla pagina**, apre la scheda da quel
  collegamento, legge in fondo «Torna a dove eri» e verifica che punti
  **ESATTAMENTE** alla pagina di partenza, query e àncora comprese
  (`#tipi-postazione`, `#elenco`, `#scelta`, `#voce-{id}`), poi la riapre;
  tutto ripetuto **speculare in inglese** su `/en/…/spot-types/` (criterio 7);
- **la predefinita della Dune** (criterio 2): scheda dell'Ombrellone con
  titolo = nome del tipo, la **frase esatta del redattore**
  (docs/testi-schede-tipi.md, it e en), la nota di dotazione vagliata parola
  per parola, la foto `/demo/tipi/umbrella.jpg` servita (HTTP 200,
  content-type immagine), nessuna nota «Scheda del lido», e senza `torna` il
  ritorno alla scheda del lido;
- **la personalizzazione dal gestionale della Dune** (criterio 3): la
  sottopagina «Postazioni» (it e en) con gli stati «Predefinita di
  Ombrè»/«Personalizzata», il tipo senza postazioni che resta in elenco con la
  sua nota; il salvataggio dal **modulo** (titolo, descrizioni it/en, due foto
  della libreria con didascalia, nota di dotazione, consiglio, dettaglio);
  l'**anteprima IDENTICA al pubblico**: il corpo della scheda (foto con alt e
  didascalie, descrizione, riga della dotazione, nota, consiglio, dettagli,
  nota del lido) è estratto dalle due pagine e confrontato **campo per
  campo**, stesso titolo compreso; il pubblico aggiornato subito; i rifiuti
  dell'API (foto fuori dalla libreria → **409 `invalid_state`**, sette foto →
  **400**) con la scheda salvata intatta; il **ripristino con conferma**
  («Confermi il ripristino…», «Sì, torna alla predefinita», senza JavaScript)
  e il pubblico di nuovo predefinito, foto di repertorio compresa;
- **la differenza Aurora/Dune** (criterio 4): l'ombrellone dell'Aurora col
  titolo proprio «Gli ombrelloni dell'Aurora», la nota «Scheda del lido»,
  **3 fotografie** con didascalie e dettagli etichetta/valore (anche in
  inglese), contro la Dune con una foto di repertorio, nessuna nota e nessun
  dettaglio;
- **il registro delle licenze** (criterio 5): le **11 fotografie**
  `/demo/tipi/{segno}.jpg` servite come immagini e le 11 voci di
  `docs/immagini-reali.md` lette dal disco, ciascuna con fonte e licenza;
- **niente rotture** (criterio 6, leggero): il giorno del seme della Dune
  ancora in vendita col suo riepilogo, il carrello dell'Aurora di nuovo vuoto
  dopo la pulizia, il pianificatore della Dune col pannello della bozza e la
  bozza vuota.

Residui: la voce del carrello è tolta, la scheda personalizzata finisce
**ripristinata alla predefinita**, l'unica riserva presa sull'Aurora scade da
sola su un giorno che nessuna suite successiva usa: `smoke:booking`,
`smoke:api` e `smoke:2fa` girano dopo e restano verdi.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm lint`, `pnpm -s typecheck`, `pnpm -r build`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`OMBRE_TEST_DB_PORT=54335 pnpm test:db`) | **287** (47 shared, 11 comms, 61 db, 161 api, 7 worker), contratto OpenAPI a **135 rotte** | Superati |
| Pagine pubbliche (`smoke`) | 453 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 73 | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| La spiaggia illustrata (`smoke:spiaggia`) | 121 | Superati |
| **La scheda della postazione (`smoke:schede`, nuova)** | **141** | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |

In totale **1186 controlli fumo**, tutti superati, verde letto suite per suite.

### Difetti trovati e aggiustati

1. **`smoke:site` rosso sul conteggio delle miniature.** Il controllo
   «editor: a gallery option has no thumbnail» contava le miniature con la
   regex `/demo/[a-z]+\.jpg` e non prevedeva le undici foto dei tipi entrate
   nella libreria del sito (D62), servite da `/demo/tipi/{segno}.jpg`: col
   repertorio nuovo il conto non tornava più. Corretto il controllo
   (`/demo/(?:tipi/)?[a-z]+\.jpg`); `smoke:site` rilanciata su stack vergine,
   di nuovo verde a 25, e l'intera catena ripetuta dall'inizio.
2. **Due correzioni alla suite nuova durante la messa a punto** (non difetti
   del prodotto): il riquadro va seguito dalla pagina con `?day=…`, perché
   senza giorno la pagina sceglie oggi e il `torna` lo porta con sé; e il tipo
   personalizzato dal collaudo dev'essere un tipo **in vendita** (l'Ombrellone
   della Dune), perché la pagina pubblica della scheda serve i tipi in uso —
   il Lettino singolo senza postazioni resta nel gestionale con la sua nota,
   e la suite lo verifica lì.

### Criteri di accettazione (specifica §6)

1. **Scheda raggiungibile da planimetria, elenco, riepilogo e carrello —
   superato.** Dall'Aurora la suite segue i collegamenti VERI di riquadro,
   elenco («Vedi la scheda» col nome del tipo per gli screen reader), barra di
   selezione (il nome del tipo è il collegamento), riepilogo, riserva e voce
   del carrello: ogni scheda si apre senza JavaScript e «Torna a dove eri»
   riporta ESATTAMENTE alla pagina di partenza con query e àncora
   (controlli 9–105 del giro verde). Tutto speculare in inglese su
   `/en/beach-clubs/…/spot-types/…`.
2. **La predefinita esiste comunque — superato.** L'Ombrellone della Dune,
   mai curato, serve la scheda con titolo «Ombrellone», la descrizione e la
   nota di dotazione ESATTE del redattore vagliate dall'usabilità, la
   fotografia di repertorio `/demo/tipi/umbrella.jpg` (servita, content-type
   immagine) e nessuna nota «Scheda del lido», it e en.
3. **Personalizzazione con anteprima identica e ripristino — superato.** Il
   Gestore della Dune salva dal modulo titolo, descrizioni, due foto della
   libreria con didascalia, note e un dettaglio; lo stato passa a
   «Personalizzata», l'anteprima del gestionale è IDENTICA al pubblico (corpo
   confrontato campo per campo, stesso componente), il pubblico è aggiornato
   subito; la foto fuori repertorio è rifiutata (409 `invalid_state`), sette
   foto sono rifiutate (400) e la scheda non si muove; «Torna alla
   predefinita» chiede conferma e riporta davvero alla predefinita, pubblico
   compreso.
4. **La differenza si vede — superato.** Nel seme l'Aurora cura tre schede:
   quella dell'ombrellone ha titolo proprio, nota «Scheda del lido», tre
   fotografie con didascalie (it/en) e dettagli; la Dune predefinita ha una
   foto di repertorio, nessuna nota e nessun dettaglio.
5. **Licenze registrate — superato.** Le undici fotografie dei tipi sono
   servite e `docs/immagini-reali.md` porta le undici voci `tipi/{segno}.jpg`
   con fonte, autore e licenza (Pexels License), controllate una per una;
   nessuna immagine generata nel repertorio.
6. **Niente rotture — superato.** Il giorno del seme della Dune è ancora in
   vendita e il riepilogo della prenotazione rapida risponde; il carrello
   dell'Aurora funziona e torna vuoto; il pianificatore della Dune risponde
   con la bozza vuota. Le dieci suite precedenti, rilanciate TUTTE
   nell'ordine di `collaudo.sh` sullo stack ricostruito, restano verdi
   (1045 controlli oltre ai 141 nuovi).
7. **Collaudato in due lingue con verbale — superato.** Ogni pagina toccata
   è verificata anche in inglese (schede, ingressi, gestionale su
   `/spot-types`), i criteri sono numerati nel verbale e la suite stampa i
   141 controlli uno a uno.

## Collaudo del 19/11/2026 — La spiaggia illustrata e il pianificatore

Collaudo della commessa «la spiaggia illustrata e il pianificatore»
([specifica](specifica-spiaggia-illustrata.md), D55–D60): il linguaggio grafico
beach-art, gli stati colore+glifo con la manutenzione, il pianificatore a bozza
con salvataggio esplicito, lo spostamento che conserva l'identità, la
scenografia e la tenuta a 390 px. Eseguito sullo stack **fisso** `ombre-collaudo`
(web `127.0.0.1:3232`, API `127.0.0.1:3231`) **ricostruito dal codice corrente
con volume nuovo** (`build` → `down -v` → `up`): migrazioni 001–**024**
(`023_planner_draft`, `024_scenografia`), seed demo e vetrina a tre stabilimenti
(l'Aurora con torretta, dune, campi da gioco, natanti alla riva e **M02 in
manutenzione**), stesse variabili dei collaudi precedenti. Gate statici
(`pnpm lint`, `pnpm -s typecheck`, `pnpm -r build`), la suite dei test completa
su un PostgreSQL usa-e-getta (`OMBRE_TEST_DB_PORT=54335`), poi le **dieci**
suite fumo nell'ordine di `collaudo.sh` — la nuova `smoke:spiaggia` tra
`smoke:mercato` e `smoke:booking`, `smoke:2fa` per ultima — col verde letto
suite per suite. **L'ambiente resta acceso** alla fine, con i dati che il
collaudo vi ha lasciato (le postazioni del pianificatore, una prenotazione di
oggi col suo ingresso scandito): il collaudo vive nel collaudo.

### La suite nuova: `smoke:spiaggia`

`scripts/smoke-spiaggia.ts` (**121 controlli numerati, stampati uno a uno**;
cablata in `package.json` e in `scripts/collaudo.sh` dopo `smoke:mercato` e
prima di `smoke:booking`) percorre da navigatore senza script, it e en: la
**grafica beach-art** sulle planimetrie pubbliche delle tre spiagge (fascia del
mare, sabbia, simboli delle postazioni), la scenografia del seme sull'Aurora
(torretta, dune, beach volley, bocce, pedalò, canoa, SUP), console «Oggi»,
planner del gestionale e il pass del conto; la **legenda** colore+glifo
identica nelle due lingue (stessi stati nello stesso ordine, `<details>` al
telefono), i sei stati del gestionale con «In manutenzione» e «Stagionale»;
**M02** disegnata ma senza link di prenotazione, fuori dalla disponibilità e
rifiutata dal banco (`inventory_conflict`); il **pianificatore a bozza** dal
Gestore via moduli: postazione singola e griglia 2×2 a numerazione automatica
(prefisso nuovo a ogni giro), anteprima con la bozza e «Solo in bozza», il
pubblico che NON le vede prima del salvataggio; lo **spostamento** di una
postazione con prenotazione di oggi (pubblicata e pagata col fornitore di
prova) col modulo fascia/fila/colonna: stesso id, stesso codice, stessa
prenotazione, **stesso pass verificato col biglietto al banco** (ingresso
registrato), vecchia cella libera; **modifiche** in bozza (tipo, dotazione,
codice, zona con nome, manutenzione) e pennello di zona con «Annulla l'ultima
operazione»; l'**eliminazione** rifiutata sulla postazione prenotata (riepilogo
con «operazione n. 1 ha impedito il salvataggio», motivo «prenotazioni future»,
niente applicato) e applicata su una mai usata; la **scenografia** (palma
aggiunta, spostata, tolta) col registro economico immobile, lordo e
ripartizioni identici; ogni salvataggio col **riepilogo in parole prima della
conferma**, l'esito coi conteggi e la voce **`layout.saved`** nella scia, letta
dal database via `docker compose … psql` come la leggono i test col database
(7 voci per 7 salvataggi, conteggi per genere); i **390 px** su markup e CSS
serviti (viewport, mappa che scorre solo dentro `.plan__scroll`, SVG a
`viewBox`, nessuna regola `beach-*` oltre i 390 px). In coda la bozza resta
vuota e il giorno del seme della Dune è ancora in vendita: il residuo non
guasta `smoke:booking`, `smoke:api` e `smoke:2fa`, che girano dopo e restano
verdi.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm lint`, `pnpm -s typecheck`, `pnpm -r build`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`OMBRE_TEST_DB_PORT=54335 pnpm test:db`) | **267** (38 shared, 11 comms, 55 db, 156 api, 7 worker), contratto OpenAPI a **131 rotte** | Superati |
| Pagine pubbliche (`smoke`) | 453 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 72 | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| Al passo col mercato (`smoke:mercato`) | 110 | Superati |
| **La spiaggia illustrata (`smoke:spiaggia`, nuova)** | **121** | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |

In totale **1044 controlli fumo**, tutti superati, verde letto suite per suite.

### Criteri di accettazione (specifica §7)

1. **Grafica nuova dappertutto — superato.** Le planimetrie pubbliche di
   Aurora, Cala e Dune servono SVG originali `beach-art`: fascia del mare con
   onde e riva (`beach-art beach-sea`), sabbia (`beach-art--sand`), postazioni
   come simboli in cella 64×64. La scenografia del seme sta sull'Aurora
   (torretta, due dune con vegetazione, beach volley, bocce, pedalò, canoa,
   SUP, classi `beach-element--*`); la console «Oggi» e il planner del
   gestionale, raggiunti dal Gestore via moduli, usano simboli e distintivi; il
   conto dell'Ospite mostra il simbolo della postazione accanto al pass.
2. **Colore + glifo e legenda identica — superato.** La legenda pubblica
   elenca gli stessi stati nello stesso ordine in it e in en (available,
   shared, unavailable, selected) e al telefono si apre da `<details>`; quella
   del gestionale porta i sei stati D56 (`available, booked, occupied,
   seasonal, maintenance, unavailable`) con «In manutenzione»/«Under
   maintenance» e «Stagionale»/«Seasonal», identica nelle due lingue. M02 è
   disegnata con ambra + chiave inglese, resta sulla planimetria pubblica
   **senza** link di prenotazione, non compare nella disponibilità e il banco
   la rifiuta (`inventory_conflict`).
3. **Creare: singola e griglia — superato.** Dal Gestore dell'Aurora, il
   modulo delle coordinate accoda una postazione singola (codice automatico) e
   il modulo delle file una griglia 2×2 con numerazione automatica
   (`QHCQ01–QHCQ04` nell'ultimo giro); il pannello della bozza le dice in
   parole, l'anteprima le mostra col distintivo «Solo in bozza» e la pagina
   pubblica NON le ha prima del salvataggio; dopo, compaiono subito.
4. **Spostare senza perdere nulla — superato.** Una postazione della griglia,
   pubblicata e prenotata per oggi (pagamento di prova confermato, pass
   emesso), è spostata col **modulo** fascia/fila/colonna: dopo «Salva la
   spiaggia» stesso `spot.id`, stesso codice, la prenotazione risponde
   identica dall'API, il **pass è lo stesso byte per byte e il biglietto
   scandito al banco apre l'ingresso di oggi sulla stessa postazione**; la
   vecchia cella è libera. Il trascinamento con JavaScript è la scorciatoia
   progressiva: `/pianificatore.js` è servito e compila lo stesso modulo
   (`modulo-sposta`), e **la prova del trascinamento vero è stata fatta con
   Playwright dal frontend** — prova esterna alla suite, qui citata.
5. **Modificare ed eliminare con giudizio — superato.** In bozza cambiano
   tipo (Gazebo), codice, dotazione, zona con nome e manutenzione, applicati
   in un salvataggio solo; il pennello di zona accoda l'assegnazione e
   «Annulla l'ultima operazione» la toglie. L'eliminazione della postazione
   prenotata è accodata ma il salvataggio rifiuta TUTTO: il riepilogo segna
   «operazione n. 1 ha impedito il salvataggio», il motivo «La postazione ha
   prenotazioni future…» e «Niente è stato applicato»; la postazione mai usata
   invece si elimina e sparisce dal disegno.
6. **Scenografia innocua — superato.** Una palma si aggiunge dalla griglia
   del disegno, si sposta dal modulo della carta e si toglie con la gomma, in
   tre salvataggi; la planimetria pubblica la mostra e poi torna al conto di
   prima; il riepilogo economico dell'Aurora (lordo e ripartizioni) è identico
   prima e dopo, e la prenotazione del collaudo resta intonsa.
7. **Salvataggio con riepilogo, audit e pubblico — superato.** Ogni «Salva la
   spiaggia» passa dal riepilogo in parole (`?salva=1`, una riga per
   operazione) e l'esito conta le operazioni per genere («postazioni create,
   file generate», «eliminazioni», «scenografia tolta»…); nella scia stanno
   **7 voci `layout.saved` per 7 salvataggi**, l'ultima con
   `{"total": 1, "remove_element": 1}`, lette dal database come fanno i test
   col database; la planimetria pubblica è aggiornata alla richiesta
   successiva al salvataggio.
8. **390 px e le due lingue — superato.** Sulla pagina pubblica il viewport è
   `width=device-width`, la mappa scorre solo dentro `.plan__scroll`
   (`overflow-x:auto` nel CSS servito), ogni SVG beach-art scala col `viewBox`
   senza larghezze fisse oltre la cella da 64 e nessuna regola `beach-*` fissa
   larghezze oltre i 390 px; la prova visiva a 390 px è delle schermate del
   frontend. Tutto il giro è ripetuto in inglese dove ha senso (planimetria,
   legende, pianificatore) e i collaudi precedenti restano verdi.

### Difetti e ritocchi

Nessun difetto del prodotto. Tre ritocchi **alla suite** durante la messa a
punto: il controllo del pass sul conto ora usa una prenotazione viva del
collaudo (l'ospite demo ha solo soggiorni conclusi, senza pass in corso); i
conteggi delle classi sono relativi, perché il flusso RSC in coda alla pagina
ripete ogni classe; il prefisso della griglia è nuovo a ogni giro, così la
numerazione automatica non si scontra coi codici di un collaudo precedente.
Un primo giro di `test:db` è caduto per un timeout del contenitore di prova
mentre le immagini Docker compilavano in parallelo: rilanciato da solo, tutto
verde (267 test).

## Collaudo del 19/11/2026 — Al passo con il mercato

Collaudo della commessa «al passo con il mercato»
([specifica](specifica-al-passo-col-mercato.md), D49–D54, testi in
[testi-al-passo.md](testi-al-passo.md)): servizi e filtri, zone con nome,
recensioni verificate, caparra, condizioni di annullamento e «niente
profilazione». Eseguito sullo stack **fisso** `ombre-collaudo` (web
`127.0.0.1:3232`, API `127.0.0.1:3231`) **ricostruito dal codice corrente con
volume nuovo** (`build` → `down -v` → `up`): migrazioni 001–**022**, seed demo
**e vetrina a tre stabilimenti** (Bagno delle Dune; Lido Aurora con zone e tre
recensioni; **Cala del Moro** con caparra 30% e termine 72 ore),
`OMBRE_SITE_URL=http://localhost:3210`, fornitore OIDC di prova e pagamenti
sandbox come nei collaudi precedenti. Gate statici (`pnpm lint`,
`pnpm -r typecheck`, `pnpm -r build`), la suite dei test completa su un
PostgreSQL usa-e-getta, poi le **nove** suite fumo nell'ordine di
`collaudo.sh` — la nuova `smoke:mercato` tra `smoke:conto` e `smoke:booking`,
`smoke:2fa` per ultima — col verde letto suite per suite. **L'ambiente resta
acceso** alla fine, con i dati che il collaudo vi ha lasciato (una recensione
segnalata, un saldo incassato): il collaudo vive nel collaudo.

### La suite nuova: `smoke:mercato`

`scripts/smoke-mercato.ts` (**110 controlli numerati, stampati uno a uno**;
cablata in `package.json` e in `scripts/collaudo.sh`, che ora semina anche la
vetrina) percorre da navigatore senza script, it e en: la **ricerca** con
`?srv=wifi&srv=bar` (caselle che restano spuntate, tre risultati, distintivi
col «+4», voto sulle carte; con `srv=restaurant` restano solo l'Aurora, con
`srv=accessible` solo la Dune); la **scheda dell'Aurora** (otto servizi con
icone, «4,3 su 5 · 3 recensioni» in testa, recensioni verificate con replica,
nome del conto e mai l'email, «Zona Prima fila» su planimetria, barra di
selezione e riepilogo); le **recensioni** (il soggiorno già recensito risponde
`review_exists` / «Hai già recensito questo soggiorno.», quello futuro
`review_not_allowed`; dal gestionale la replica e la **segnalazione con
motivo**, con la recensione segnalata che resta visibile sulla scheda con la
nota «Segnalata alla piattaforma.»); la **caparra della Cala** («Caparra adesso
21,00 · Saldo allo stabilimento 49,00» e condizioni di 72 ore PRIMA del
pagamento, 30% incassato dal fornitore di prova, «Parziale» con residuo nel
conto); il **carrello** con caparra e condizioni prima di «Conferma e paga»;
l'**annullamento dal conto** entro il termine (rimborso pieno, giornate di
nuovo in vendita) e oltre (nessun bottone, rimando allo stabilimento);
l'**incasso del saldo al banco** e la **quadratura del registro**; piè di
pagina e FAQ «niente profilazione»; la **Dune invariata**. I dati che il seme
non ha nascono dalle vie vere della suite: la Cala non ha credenziali demo
(scelta del seme), quindi banco e registro sono esercitati all'**Aurora**,
portata alla caparra **dal pannello del Gestore** e riportata subito al
pagamento intero. Le suite esistenti non hanno avuto bisogno di ritocchi: i
tre stabilimenti del seme non rompono nessun conteggio.

### Test e collaudi fumo

| Parte | Controlli | Esito |
|---|---|---|
| Lint, tipi e build (`pnpm lint`, `pnpm -r typecheck`, `pnpm -r build`) | tutto il codice | Superati |
| Test con PostgreSQL vero (`OMBRE_TEST_DB_PORT=54335 pnpm test:db`) | **258** (38 shared, 11 comms, 49 db, 153 api, 7 worker), contratto OpenAPI a **126 rotte** | Superati |
| Pagine pubbliche (`smoke`) | 453 | Superati |
| Ricerca, planimetria e riserva (`smoke:flow`) | 72 | Superati |
| Aree riservate (`smoke:areas`) | 85 | Superati |
| Sito dello stabilimento (`smoke:site`) | 25 | Superati |
| Conto, Google e carrello (`smoke:conto`) | 139 | Superati |
| **Al passo col mercato (`smoke:mercato`, nuova)** | **110** | Superati |
| Prenotazione end-to-end (`smoke:booking`) | 15 | Superati |
| Presa simultanea (`smoke:api`) | 13 | Superati |
| Due passaggi (`smoke:2fa`, per ultima) | 11 | Superati |

In totale **923 controlli fumo**, tutti superati, verde letto suite per suite.

### Criteri di accettazione (specifica §9)

1. **Filtri per servizi e distintivi — superato.** `?srv=wifi&srv=bar` tiene i
   tre stabilimenti (li hanno tutti e due), `srv=restaurant` lascia la sola
   Aurora e `srv=accessible` la sola Dune: chi non ha **tutti** i servizi
   sparisce. Le caselle restano spuntate dopo l'invio (modulo GET, zero
   script); le carte mostrano quattro distintivi e «+4» (otto servizi) col
   voto; la scheda li elenca per esteso con otto icone in linea, in italiano e
   in inglese («Bar e chiosco» / «Bar and kiosk»).
2. **Zone con nome, le stesse parole ovunque — superato.** «Prima fila»
   compare come «Zona Prima fila» nella carta della planimetria dell'Aurora,
   come «zona Prima fila» nella barra di selezione, come riga «Zona · Prima
   fila» nel riepilogo di prenotazione, sulla voce del carrello della Cala e
   accanto al codice nel conto dell'Ospite (dove sta il pass), identica in
   inglese («Zone Prima fila»). Reception e verifica all'ingresso portano lo
   stesso `zoneName`, coperte dai test con database (153 dell'API).
3. **Recensioni verificate con moderazione — superato.** L'ospite dimostrativo
   (tre soggiorni conclusi all'Aurora, tutti recensiti) non riceve più il
   modulo e vede «La tua recensione»; ripetere la recensione risponde
   `review_exists` («Hai già recensito questo soggiorno.»); un gruppo futuro
   risponde `review_not_allowed` («Puoi recensire solo un soggiorno
   concluso.») — a runtime non si può creare un soggiorno concluso non
   recensito, quindi la via d'errore è la prova. Media e numero («4,3 su 5 ·
   3 recensioni») stanno su carte e scheda. Dal gestionale dell'Aurora il
   Gestore demo pubblica una replica (riletta su gestionale e scheda pubblica)
   e **segnala con motivo**: la segnalata **resta visibile** — le recensioni
   sulla scheda restano tre — con la nota «Segnalata alla piattaforma.», e il
   collaudo la lascia così.
4. **Caparra: acconto e saldo, registro in quadratura — superato.** Sulla Cala
   del Moro (periodo di due giornate, 70,00): riepilogo con «Caparra adesso
   21,00» e «Saldo allo stabilimento 49,00» prima del pagamento, pagamento
   sandbox che incassa **il 30% esatto**, pagina del pass «Parziale», conto
   con «Pagato adesso: 21,00 · residuo 49,00». La Cala non ha credenziali demo
   (scelta scritta del seme): l'incasso al banco è esercitato all'Aurora —
   caparra accesa dal pannello del Gestore, prenotazione `OM-261125-001`
   pagata al 30% (residuo 10,50 su 15,00), poi pagamento intero ripristinato —
   con la scheda incassi «Parziale» → `banco-incassa` → «Saldata», residuo
   0,00. Registro economico dall'API dei rapporti: **somma delle ripartizioni
   61.790 = lordo delle vendite 61.790**, caparra compresa (le quote restano
   sul totale della prenotazione).
5. **Condizioni visibili e applicate — superato.** Il testo proprio della Cala
   («Annullamento gratuito fino a 72 ore prima del giorno di arrivo…») e il
   termine calcolato compaiono nel riepilogo e **nel carrello prima del
   modulo «Conferma e paga»** (posizione verificata nell'HTML); sulla Dune
   vale il predefinito di piattaforma (48 ore). Dal conto, la prenotazione
   futura entro il termine offre «Annulla la prenotazione» con l'importo del
   rimborso, e l'annullamento risponde «Prenotazione annullata. Ti rimborsiamo
   21,00…», gruppo «Annullata» e giornate di nuovo in vendita; la prenotazione
   con arrivo domani (oltre le 72 ore) **non ha il bottone** e dice «Il
   termine per annullare gratis è passato. Rivolgiti allo stabilimento».
6. **Niente profilazione — superato.** La riga «Niente cookie di profilazione
   né pubblicità: solo cookie tecnici, per sessione, carrello e lingua.» sta
   nel piè di pagina it e en; Assistenza ha la FAQ «Ombrè mi traccia o mi
   mostra pubblicità?» con la risposta che spiega anche l'assenza del banner,
   nelle due lingue. Nessun banner, come scritto.
7. **Tutto il resto come prima — superato.** Il riepilogo della Dune NON
   mostra caparra e offre il percorso rapido «Riserva la postazione» intatto;
   `smoke:flow`, `smoke:conto` (Google di prova, carrello e ordine pagato),
   `smoke:booking` e `smoke:api` sono verdi sugli stessi numeri di sempre.
8. **Collaudato, bilingue, senza JavaScript — superato.** Tutte le pagine
   toccate sono state lette anche in inglese (ricerca, scheda, riepilogo,
   carrello, conto, assistenza, moderazione), ogni passo è `fetch` puro senza
   script, e i collaudi precedenti restano verdi (923 controlli in tutto).

Nessun difetto trovato nel prodotto. Unico ritocco, di solo collaudo:
`scripts/collaudo.sh` ora esporta `OMBRE_SEED_SHOWCASE=true`, perché la suite
nuova vive sui dati della vetrina; le altre suite non sono state toccate.

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

