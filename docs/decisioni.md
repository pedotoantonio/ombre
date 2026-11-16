# Registro delle decisioni (ADR)

Decisioni brevi, una per voce, come richiede il template SweetHost. Stato:
**accettata** | **proposta** | **superata**.

## D1 — Adozione del template SweetHost — accettata (10/11/2026)

Ombrè adotta i moduli di piattaforma di SweetHost così come sono (multi-tenant con RLS,
autenticazione con 2FA, ruoli applicati dall'API, audit, piani in `plan_feature` con
catalogo unico, console, i18n it/en, OpenAPI in CI) e riscrive solo il dominio.
Conseguenza: le entità rinominate sono postazione/`InventoryDay` (risorsa), `Booking`
(evento), ospite (persona servita), stagionale (partner). Catalogo completo in
[catalogo-moduli.md](catalogo-moduli.md).

## D2 — Il controllo resta al gestore — accettata (da v3.0)

La condivisione stagionale aggiunge un'opportunità senza togliere al gestore listino e
capacità: autorizzazioni per abbonamento o per giornata, contingente massimo giornaliero,
sospensione che ferma le vendite senza cancellare le prenotazioni. È il requisito
principale conservato da tutte le versioni del concept.

## D3 — PostgreSQL unica fonte autorevole dell'occupazione — accettata (da v3.0)

Una riga `InventoryDay` per struttura+postazione+data, occupazioni acquisite sotto lock
di riga (`SELECT FOR UPDATE`), acquisizioni multiple in ordine stabile, mai una
transazione aperta durante una chiamata al provider. Cache e realtime non concedono il
diritto di vendere.

## D4 — Backend modulare unico nel primo rilascio — accettata (da v3.0)

Un solo backend con moduli (catalogo/siti, inventario, prenotazioni, economia) e outbox
transazionale verso il worker. La separazione in servizi indipendenti si valuta solo su
un'esigenza misurata.

## D5 — Stati distinti per inventario, prenotazione, pagamento, rimborso, presenza — accettata (da v3.0)

Cinque macchine a stati separate: pagare non è entrare, riservare non è confermare.
La reception registra ingressi senza toccare il rendiconto.

## D6 — Pagamenti: sandbox nel MVP, provider marketplace da validare — proposta

Riferimento tecnico Stripe Connect (addebiti e trasferimenti separati). Modello
contrattuale, soggetto venditore, fiscalità delle quote e beneficiari vanno definiti con
professionisti prima delle transazioni reali. Nessun portafoglio prelevabile autonomo.

## D7 — Tre template controllati, niente editor libero — accettata (da v3.0)

Riviera, Boutique, Essential sullo stesso modello di contenuti; campi e sezioni validate,
niente codice arbitrario. Mantiene coerenza tra contenuti, accessibilità, velocità e
aggiornamenti del motore di prenotazione.

## D8 — Pilota locale prima dell'espansione — accettata (da v3.0)

Una sola area, 3–5 stabilimenti con referente, prima i siti diretti poi la ricerca
locale. Piani ipotetici da testare: A (€490 + 5%) e B (€0 + 10%), pareggio a €9.800.

## D9 — Dove vive il codice — proposta

Lo sviluppo è partito l'11/11/2026 dentro questa cartella del repository pizzaclic. La
cartella è autosufficiente (propri `package.json`, lockfile, `Dockerfile` e compose) e
non dipende dal resto del repository: si può spostare in un repository dedicato senza
modifiche. Lo spostamento resta da decidere.

## D10 — Requisiti di qualità web dal prompt del committente — accettata (11/11/2026)

Il prompt di miglioramento dei siti ([prompt-qualita-web.md](prompt-qualita-web.md)) è
applicato al progetto come requisiti e prove di accettazione
([qualita-web.md](qualita-web.md)): design e interazioni, accessibilità, prestazioni, SEO
tecnica, AEO e GEO. Non avvia lo sviluppo. Quando le pagine esisteranno, lo stesso prompt
si esegue sul codice a ogni rilascio delle pagine pubbliche. Conseguenza: sul sito si
pubblicano solo dati confermati; piani, percentuali e cifre della simulazione restano
fuori finché sono ipotesi.

## D11 — Indirizzi pubblici nuovi e crawler degli assistenti AI — proposta

Indirizzi non presenti nella v3.0: `/esplora/{località}`, `/come-funziona`,
`/per-gli-stabilimenti`, `/per-gli-stagionali`, `/assistenza`, `/chi-siamo`, prefisso
`/en/` per l'inglese. Le pagine pubbliche restano leggibili dai crawler dei motori di
risposta, condizione per poter essere citate. Entrambe le scelte spettano al committente.
Il codice usa già questi indirizzi, definiti in un solo file
(`packages/shared/src/i18n/routes.ts`): cambiarli è una modifica di poche righe.

## D12 — Due lingue dalla base: italiano e inglese — accettata (11/11/2026)

Decisione del committente. L'italiano è la lingua predefinita e non ha prefisso;
l'inglese sta sotto `/en/` con indirizzi tradotti (`/en/how-it-works`). Ogni testo
dell'interfaccia vive nei dizionari di `packages/shared`; un test verifica che le due
lingue abbiano le stesse chiavi e lo stesso numero di voci. `/it/...` reindirizza in modo
permanente all'indirizzo senza prefisso, così ogni pagina ha un solo indirizzo.

## D13 — Scelte tecniche di avvio — accettata (11/11/2026)

Node 22, pnpm 12, Turborepo, TypeScript 6 in modalità strict (la 7 non è ancora
supportata dagli strumenti di lint), Next.js 16 con pagine pubbliche prerenderizzate,
React 19, Vitest. CSS con token propri, senza framework grafico. Il nome della
piattaforma viene solo dalla configurazione (`OMBRE_BRAND_NAME`), mai scritto nei testi.
Tutto gira in container: immagine a più stadi, utente non root, file system in sola
lettura. I reindirizzamenti permanenti usano il codice 308, equivalente al 301.

## D14 — Database e API del primo incremento — accettata (11/11/2026)

PostgreSQL 18 in container. Le migrazioni sono file SQL scritti a mano e applicati in
ordine: sono la fonte autorevole dello schema, perché ruoli, vincoli e RLS si leggono
meglio in SQL. Drizzle dà i tipi alle query. La colonna del tenant si chiama `beach_id`
(lo stabilimento) e ogni tabella operativa ha la propria regola RLS; l'API usa il ruolo
`ombre_app`, che non è proprietario delle tabelle e non può aggirare le regole.
L'acquisizione di una giornata blocca prima la riga `inventory_day`, poi la promozione,
sempre in quest'ordine. API con Hono e validazione zod, distribuita come un solo file.
La riserva dura 10 minuti, modificabile con `OMBRE_HOLD_MINUTES`.

## D15 — Coda dei lavori in PostgreSQL, senza Valkey — accettata (11/11/2026)

Il template SweetHost usa BullMQ su Valkey. Per il primo rilascio di Ombrè la coda è una
tabella `outbox` nello stesso database: la riga viene scritta nella transazione che
conferma la prenotazione, quindi una notifica non si perde e non parte per una modifica
annullata. Il worker prende i lavori con `FOR UPDATE SKIP LOCKED`, li ritenta con attesa
crescente e li abbandona al quinto errore. Un servizio in meno da gestire e da mettere in
backup; il passaggio a BullMQ si valuta quando i volumi lo richiedono.

## D16 — Accessi, sessioni e firme — accettata (11/11/2026)

Le password sono verificate dentro il database (bcrypt di pgcrypto) da funzioni
dedicate: il ruolo dell'API non legge mai un hash e non può aprire una sessione senza la
password giusta. Blocco al quinto errore per 15 minuti. I token di sessione sono casuali
e in tabella ne resta solo l'impronta. I collegamenti alle prenotazioni e i pass sono
firmati con `OMBRE_SIGNING_SECRET`, così non serve conservare un segreto per riga e un
pass non si può indovinare. Manca ancora il secondo fattore per gestore e
amministratore, richiesto dal template.

## D17 — Sito dello stabilimento: revisioni, tre modelli, solo testo — accettata (11/11/2026)

Ogni salvataggio lavora su una bozza con numero di versione; la pubblicazione archivia
la revisione precedente e il ripristino crea una nuova bozza, senza riscrivere la storia.
L'anteprima è la bozza resa nell'editor, visibile solo a chi ha accesso allo
stabilimento: non esistono collegamenti di anteprima pubblici. I contenuti sono testo
semplice convalidato; immagini e dominio personalizzato sono rimandati perché richiedono
archiviazione dei file e gestione dei DNS.

## D18 — Stessa coda per sito e banco; l'annullamento è dello stabilimento — accettata (11/11/2026)

La prenotazione al banco passa dalla stessa riserva e dallo stesso blocco di riga di un
acquisto online. Lo spostamento acquisisce la nuova postazione prima di rilasciare la
precedente e non ricalcola l'economia della vendita. L'annullamento oggi può farlo solo
il gestore: libera la postazione, invalida il pass, registra il rimborso da eseguire e
storna le quote con nuovi movimenti. L'annullamento da parte dell'ospite resta fuori
finché le condizioni di cancellazione non sono definite.

## D19 — Ambiente dimostrativo con indirizzo temporaneo — accettata (11/11/2026)

Su richiesta del committente esiste un ambiente dimostrativo separato (progetto compose
`ombre-demo`, porte 3220 e 3221, segreti generati in `.env.demo`, non versionato)
raggiungibile da un indirizzo temporaneo creato dal profilo `tunnel`. Contiene solo dati
dimostrativi e il fornitore di pagamento di prova. Non è un rilascio: il sito resta non
indicizzabile e, con `OMBRE_DEMO_MODE=true`, dichiara in ogni pagina di essere un
ambiente dimostrativo con dati di esempio e senza pagamenti reali.

## D20 — Progetto grafico e logo del committente — accettata (11/11/2026)

Il sito adotta il progetto «Solar & Fresh» fornito dal committente: palette (Deep Ocean
Teal, Seafoam Tint, Sand Amber, Slate Abyss, Ivory Sand), ricerca in evidenza,
planimetria a colori con barra di riepilogo. Sostituisce l'identità proposta nella v3.0.
Il logo è quello del committente, ricalcato in vettoriale dalla sua scheda; la scritta è
in Nunito Bold convertita in tracciati. Le versioni che la scheda non mostra
(orizzontale, su fondo scuro, a un colore, icona semplificata) sono derivate e attendono
la sua approvazione; un originale vettoriale, se esiste, sostituisce il ricalco.
I colori di stato della planimetria non reggono il testo sopra: riempiono solo segni
grafici, e lo stato è sempre indicato anche da forma ed etichetta.

## D21 — Solo dati veri nell'interfaccia; immagini dimostrative dichiarate — accettata (11/11/2026)

Gli elementi del progetto grafico senza dati dietro non compaiono: fotografie, punteggi
da recensioni, distanza dalla spiaggia, mappa interattiva, portafogli di pagamento. Le
immagini dell'ambiente dimostrativo sono illustrazioni originali dichiarate come tali, e
il sito dello stabilimento può scegliere solo tra quelle finché non esiste il
caricamento di foto proprie. Lo stabilimento «Lido Aurora» è di fantasia e segnalato in
ogni pagina.

## D22 — Fotografia di apertura e icone del committente — accettata (11/11/2026)

La pagina iniziale usa la fotografia della costa e le cinque icone che il committente ha
fornito in un bozzetto ([grafica/icone-e-sfondo-riferimento.jpg](grafica/icone-e-sfondo-riferimento.jpg)).
La fotografia è stata estratta dal bozzetto e ripulita dal titolo e dal pulsante che vi
erano stampati sopra; le icone sono ricalcate in vettoriale con i loro due colori
originali (`#378192` e `#F47B60`), che non fanno parte della palette e restano confinati
alle icone. Il corallo ha contrasto 2,68:1 sul bianco: va bene per un'icona accanto alla
sua etichetta, non per testo o pulsanti, che restano in verde oceano. Dal bozzetto non
sono stati ripresi la scritta «Ombrè» con le grazie (vale il logo della scheda del
committente) né il pulsante corallo con testo bianco (3,09:1). Prima di una
pubblicazione il committente deve confermare provenienza e diritti della fotografia.


## D23 — Mappa con Leaflet e tasselli OpenStreetMap; coordinate sul `beach` — accettata (15/11/2026)

Il committente chiede la navigazione su mappa come modalità principale per identificare
i lidi dalla pagina iniziale. Si supera il rinvio della mappa interattiva: libreria
Leaflet installata da npm e servita dal dominio di Ombrè (nessuno script esterno, come
da qualità web §4), tasselli raster di OpenStreetMap con attribuzione visibile, unica
aggiunta alla Content-Security-Policy in `img-src`. Le coordinate sono due colonne
facoltative su `beach`, impostate dal gestore: uno stabilimento senza coordinate non
compare sulla mappa e resta in lista (coerente con D21). La mappa si carica pigramente,
non è mai un requisito: la lista rimane la via completa ed equivalente, e in «Esplora»
mappa e lista mostrano la stessa selezione. Niente geolocalizzazione del visitatore.
Specifica in [specifica-mappa-gestore.md](specifica-mappa-gestore.md).

## D24 — Zone riva/monte, lettini singoli e tipo di affitto sul posto — accettata (15/11/2026)

Il layout resta sulla sola tabella `spot`, estesa con la zona (`riva`, `ombrelloni`,
`monte`, fila contata dentro la zona) e con `rental_type` e `rental_notes`, dati
gestionali mai pubblici; su `beach` le distanze `shore_gap_rows` e `land_gap_rows`
(file di distacco dei lettini dagli ombrelloni, richieste dal committente). Un lettino
singolo è una postazione ordinaria (0 ombrelloni, 1 lettino, 1 ospite): prenotabile,
bloccabile, con prezzo per giornata. L'etichetta «Stagionale» è una classificazione del
gestore e non crea né richiede un `season_contract`. Il gestore configura struttura e
tipi con il nuovo permesso `layout.edit`; la reception può cambiare le sole distanze.
L'eliminazione di una postazione è ammessa solo se mai usata.

## D25 — Il disegno della spiaggia è la griglia, con elementi e lato del mare — accettata (15/11/2026)

Il committente chiede di «disegnare» la propria struttura: posizione del mare,
passerelle, ombrelloni e altri elementi. Si resta sulla griglia (niente canvas a pixel
né trascinamento): la colonna diventa esplicita su `spot` (con buchi ammessi), il lato
del mare è una scelta dello stabilimento (alto o basso, la fila 1 resta la più vicina
al mare), e passerelle, strutture etichettate e blocchi di cabine sono elementi della
nuova tabella `layout_element`, senza sovrapposizioni. L'editor funziona senza
JavaScript: ogni cella libera è un pulsante e lo strumento scelto si applica alla
cella cliccata. La planimetria pubblica rispecchia il disegno uno a uno.

## D26 — Tipi di postazione per stabilimento con repertorio fisso di segni — accettata (15/11/2026)

Oltre all'ombrellone: tabella `spot_type` per stabilimento con nome, segno grafico da
un repertorio fisso (umbrella, sunbed, gazebo, tent, daybed), dotazione, capienza e
prezzo predefinito facoltativo; tre tipi di base non eliminabili (Ombrellone, Lettino
singolo, Gazebo) e tipi personalizzati del gestore. `spot.type_id` obbligatorio dopo
il riempimento; la dotazione della singola postazione resta modificabile; in
pubblicazione vale il prezzo predefinito del tipo dove c'è, altrimenti il prezzo base
della giornata.

## D27 — Cabine del mare: affidamento e subaffitto senza denaro — accettata (15/11/2026)

Le cabine sono censite nel disegno (`cabin`, agganciabile a un blocco cabine) e
gestite con `cabin_assignment` (affidamento del gestore a un titolare, con o senza
accesso, senza sovrapposizioni) e `cabin_sublet` (proposta del titolare, approvazione
del gestore, occupante tracciato). Nuovo ruolo `cabin_holder` e permesso
`cabins.manage`. Nessun denaro nel sistema: periodi, persone e approvazioni; i canoni
si regolano fuori, come oggi per i flussi economici non attivi. Le cabine non
compaiono nel pubblico.

## D28 — Iterazione dal confronto con un gestionale di mercato — accettata (16/11/2026)

Dal confronto con spiagge.it (gruppo Zucchetti) emergono tredici mancanze,
classificate in [specifica-confronto-gestionale.md](specifica-confronto-gestionale.md):
sei si costruiscono ora in due ondate (A operativa: console del giorno,
statistiche, postazione consigliata; B commerciale: convenzioni, extra,
acconti e comunicazioni — in tre incrementi B1→B2→B3 ciascuno consegnabile da
solo), le altre dipendono da fornitori o restano registrate. Il planner a
linea temporale è rinviato: rende con le prenotazioni multi-giorno, che oggi
non ci sono.

## D29 — Console operativa: JavaScript di arricchimento ammesso, via senza script completa — accettata (16/11/2026)

Su riferimento del committente (pagina operativa di spiagge.it PRO,
[schermata](grafica/riferimento-console-operativa.png)) la console «Oggi sulla
spiaggia» riprende l'impostazione a scena intera con tessere per postazione,
resa nella grafica di Ombrè e derivata dallo stesso disegno dell'editor (la
scena è la griglia, non una ricostruzione libera; nessun asset altrui). Deroga
puntuale al vincolo trasversale: in questa sola pagina è ammesso JavaScript di
arricchimento, in linea e di prima parte, con ogni funzione completa anche
senza script e CSP invariata.

## D30 — Convenzioni: l'ospite paga il prezzo convenzionato — accettata (16/11/2026)

La convenzione applica all'ospite il prezzo concordato (mai sopra il listino);
il rendiconto per struttura è informativo, per la riconciliazione mensile; la
ripartizione economica resta quella ordinaria sul totale scontato, anche sulle
giornate condivise. La variante con fattura mensile alla struttura (ospite che
non paga) è rinviata e poggerà sulle fondamenta di D31. Un codice vive in un
solo registro: convenzioni e promozioni si escludono a vicenda anche nel nome.

## D31 — Più pagamenti per prenotazione e incasso rinviato — accettata (16/11/2026)

Ogni pagamento acquisisce uno scopo (`checkout`, `desk`, `request`); il
residuo è il totale meno i pagamenti riusciti; il webhook instrada per scopo e
l'esito di una richiesta non passa mai dal percorso conferma/annulla del
checkout. Al banco una prenotazione può essere confermata «da incassare»: pass
subito (D5: pagare non è entrare), vendita registrata alla conferma, stato di
pagamento derivato (saldata/parziale/da incassare). Le richieste di pagamento
hanno token firmato, scadenza entro il giorno prenotato e link pubblico
`/paga/{token}` col fornitore di prova; la tabella `notification` si estende a
coda di messaggi pronti per il fornitore vero.
