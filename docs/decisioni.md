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

## D32 — Scheda della postazione nella console — accettata (17/11/2026)

La tessera della console apre una scheda servita dal server
(`?postazione=CODICE`, pannello con ancora `#scheda`): dati del giorno,
prenotazione con totale/incassato/residuo dal modello D31, azioni solo se
compatibili con stato e permessi (prenota al banco, incassa, sposta,
blocca/sblocca, reception). Niente pannello flottante in JavaScript: la
scheda è parte della pagina e funziona senza script, coerente con D28. Lo
storico per postazione è rinviato alla fase successiva.

## D33 — Planner a griglia giorno per giorno — accettata (17/11/2026)

Il planner è una pagina di sola lettura nell'area di gestione: righe le
postazioni del disegno, colonne i giorni di una finestra di 7, 14 o 31 giorni
(mai oltre 31 per richiesta), celle lo stato della coppia postazione-giorno
con testo oltre al colore (D20). Nel modello una prenotazione è una
postazione per un giorno, quindi la griglia è la rappresentazione fedele, non
una semplificazione. Le modifiche si fanno dove già esistono (banco,
reception, console): niente trascinamento, che richiederebbe script
obbligatori. Le celle sono collegamenti alla console del giorno.

## D34 — Generazione in blocco delle file — accettata (17/11/2026)

L'editor guadagna «Aggiungi più file»: fino a 10 file per 50 postazioni l'una,
tetto di 200 postazioni per operazione, numerazione progressiva con un solo
prefisso attraverso le file (A01–A10, A11–A20, …), transazione unica che
fallisce intera in caso di collisione di codici, evento nel registro coi
conteggi. Il trascinamento libero, la rotazione e il ridimensionamento
proposti dall'analisi esterna restano fuori: l'editor è a celle per scelta
(D25). Le altre proposte rifiutate o rinviate sono motivate nella
[specifica](specifica-console-planner.md) §1.

## D35 — Repertorio ampliato dalle tavole del committente — accettata (17/11/2026)

Le tre tavole fornite dal committente (in docs/grafica) dettano i soggetti,
non i disegni: ogni segno nuovo è ridisegnato in vettoriale nello stile
Solar & Fresh. Il disegno guadagna le **decorazioni** — elementi a una cella
con segno ed etichetta facoltativa, senza numerazione, stato né vendita —
rese in editor, planimetria pubblica e console e mai confondibili con le
postazioni; il repertorio dei tipi si estende ai soggetti a noleggio
(sdraio, gazebo a telo, canoa, SUP, pedalò, moto d'acqua). La legenda degli
stati resta quella di D20; il tipo di affitto compare nella scheda della
postazione (D32).

## D36 — Layout «applicazione» dell'area di gestione — accettata (17/11/2026)

L'area di gestione (gestore e reception) adotta una barra superiore fissa
(stabilimento, ricerca, giorno, «Prenota al banco», profilo) e una
navigazione laterale compatta a icone con etichetta e voce attiva; a
larghezza telefono la navigazione passa in basso. Tutto servito dal server,
senza JavaScript; icone vettoriali del progetto. Le aree dell'ospite e
dello stagionale restano come sono. Dal secondo prompt del committente si
scartano, con motivo in specifica (§4ter): mappa a coordinate libere in
React/Konva, trascinamento con rotazione e ridimensionamento, modulo cassa
fiscale e CRM separato (fase successiva).

## D37 — Console: filtri, sintesi fissa e scala a scatti — accettata (17/11/2026)

La console guadagna filtri GET per zona e stato (restringono scena e
tabella, mai i totali), una riga di sintesi sempre visibile (totale,
libere, occupate, arrivi previsti = attese, partenze previste = presenti,
percentuale di occupazione; nel modello una prenotazione dura un giorno) e
la scala della scena a scatti via query string, con «adatta» calcolata dal
server sulla larghezza del disegno. Nessuno script: la deroga D28 resta
confinata agli arricchimenti già esistenti.

## D38 — Gruppo di prenotazione per il periodo — accettata (17/11/2026)

La prenotazione resta una postazione per una giornata; il periodo dal–al è
un gruppo (`booking_group`) di giornate consecutive sulla stessa postazione
— al massimo 31 — con un codice, un pass e un totale. Ogni prenotazione
esistente diventa un gruppo di un giorno col suo stesso codice (il codice
vive sul gruppo); pagamenti e richieste D31 passano al gruppo; gli extra
valgono una volta per periodo e maturano con la prima giornata; la verifica
del pass risolve la giornata corrente. Carrello multi postazione rimandato.

## D39 — Ricerca e riserva per periodo — accettata (17/11/2026)

La ricerca chiede dal e al («al» predefinito = «dal»); una postazione è nei
risultati solo se libera ogni giornata del periodo, col totale «da»; le
condivise contano se coprono la giornata; la riserva prende tutte le
giornate in una transazione, tutta o niente, con scadenza unica. Al banco
si prenota per periodo come online, «da incassare» compresa.

## D40 — Annullamento del periodo intero — accettata (17/11/2026)

L'annullamento del gestore tratta il gruppo: tutte le giornate non mature,
con gli storni compensativi e il rimborso degli extra se nessuna giornata è
maturata. Annullare singole giornate di un gruppo è rimandato e scritto.

## D41 — Sito pubblico a tre ruoli — accettata (17/11/2026)

Prima pagina a tre tasti di pari peso (Ospite, Stagionale, Gestore
stabilimento) sopra la ricerca; barra pubblica fissa; menu a bottoni con
cinque voci e nessuna voce mappa; «Esplora» diventa «Ricerca ombrellone»
(`ricerca-ombrellone` / `umbrella-search`) con 301 dai vecchi indirizzi;
«Come funziona» si sdoppia in tre per ruolo e le pagine «Per gli
stabilimenti» e «Per gli stagionali» vi confluiscono con 301; la pagina del
Gestore mostra le schermate vere e porta all'accesso: due tocchi dal sito.

## D42 — I tre nomi con controllo automatico — accettata (17/11/2026)

Ovunque solo Ospite / Stagionale / Gestore stabilimento (Guest / Season
holder / Beach manager): un test sui dizionari it/en e un controllo fumo
sulle pagine rese vietano le vecchie formule («Per gli stabilimenti», «Per
gli stagionali», «condividi giornate» come etichetta e varianti). Titolare
di cabina e contabilità restano nomi interni dell'area riservata.

## D43 — Fotografie vere nel repertorio dimostrativo — accettata (18/11/2026)

Le nove illustrazioni dimostrative (`/demo/*.svg`) lasciano il posto a nove
fotografie vere, scattate da persone, con licenza libera accertata alla
fonte (pubblico dominio o CC0 in testa; mai immagini generate o con persone
riconoscibili in primo piano, insegne leggibili di attività vere). Ogni
foto è registrata in `docs/immagini-reali.md` con fonte, autore, licenza ed
eventuale obbligo di attribuzione; se una licenza chiede l'attribuzione,
questa compare dove serve, altrimenti si sceglie un'altra foto. Le chiavi
del repertorio (`demoMedia`) restano le stesse: copertina e galleria degli
stabilimenti e l'editor del sito non cambiano forma. Il Bagno delle Dune
riceve nel seme un sito pubblicato con copertina e galleria, come il Lido
Aurora. Restano com'erano la fotografia della costa del committente, il
marchio, le icone e le schermate vere del gestionale.

## D44 — Il conto dell'Ospite — accettata (18/11/2026)

L'Ospite con conto è una riga di `app_user` senza appartenenze. La
registrazione chiede nome ed email; la parola d'ordine la genera il sistema
e viaggia nell'email in coda; `must_change_password` obbliga al cambio al
primo accesso (almeno 12 caratteri). Difese di oggi: blocco dei tentativi,
limiti di frequenza, impronte bcrypt; due passaggi disponibili. L'area di
chi non ha appartenenze diventa «Il mio conto». Risposte identiche per
email nuova ed esistente: nessuna enumerazione dei conti.

## D45 — Comunicazioni e registro di piattaforma — accettata (18/11/2026)

`notification.beach_id`, `outbox.beach_id` e `audit_event.beach_id`
diventano annullabili: le righe senza stabilimento sono «di piattaforma»
(email del conto, azioni del conto). Il testo resta pronto e copiabile
nella coda come oggi; nessuna pagina le elenca ancora (console della
piattaforma rimandata). Generi nuovi: `account.created`, `account.exists`.

## D46 — Carrello e ordine — accettata (18/11/2026)

Carrello nel server, di un solo stabilimento, al più 10 voci (postazione,
dal–al entro i 31 giorni, intestatario libero, promozione, extra per voce);
senza conto vive dietro un biglietto firmato in cookie e all'accesso si
fonde col carrello del conto. Mettere nel carrello non riserva nulla; la
conferma prende tutte le riserve in una transazione, tutta o niente. Nasce
l'ordine (`ORD-AAMMGG-NNN`): un gruppo D38 per voce, ciascuno con codice e
pass, un pagamento solo sull'ordine (`payment.order_id`), conferma e
annullamento di tutti i gruppi insieme all'esito, ripartizione contabile
invariata per giornata. Annullamento per voce = per gruppo (D40), rimborsi
dai pagamenti dell'ordine. Riepilogo d'ordine pubblico col biglietto
firmato. «Aggiungi al carrello» accanto al percorso rapido, che resta
identico.

## D47 — Storico e ricollegamento per email — accettata (18/11/2026)

`booking_group.user_id`: valorizzato alla conferma da connessi e, per i
gruppi con la stessa `guest_email` e `user_id` nullo, alla registrazione e
a ogni accesso. Lettura attraverso gli stabilimenti con la politica RLS del
proprietario (`app.user_id`), in sola lettura, su gruppi, prenotazioni,
pass, pagamenti, ordini ed extra. «Le mie prenotazioni»: prossimi e
passati, prossimi arrivi e spesa in testa. Gestore e reception vedono ciò
che vedono oggi.

## D48 — Accesso con Google (OpenID Connect) — accettata (18/11/2026)

Flusso code con `state` firmato in cookie, avvio da un'àncora (la CSP non
cambia), verifica dell'`id_token` con `email_verified`. `user_identity`
(fornitore + subject unici) aggancia per email il conto esistente o ne crea
uno con parola d'ordine casuale sconosciuta e nessun cambio obbligato; la
pagina d'accesso dice che chi entra con Google non ha parola d'ordine
locale. Fornitore di prova `OMBRE_OIDC_PROVIDER=test` con pagina locale di
consenso e codice firmato, come il fornitore di prova dei pagamenti; le
chiavi vere del committente sono una dipendenza esterna aperta.

## D49 — Servizi dello stabilimento e filtri — accettata (19/11/2026)

Catalogo fisso e traducibile di dodici servizi con identificatori stabili
(etichette solo nei dizionari it/en); tabella `beach_amenity` (migrazione
021) scelta dal Gestore nel pannello impostazioni. La Ricerca ombrellone
filtra con caselle GET (`srv` ripetuto, senza JavaScript) e l'API tiene
gli stabilimenti che hanno **tutti** i servizi chiesti; distintivi sulle
carte dei risultati (al più quattro, poi «+n»), elenco per esteso con
icone sobrie sulla scheda. I `services` liberi del sito restano testo.

## D50 — Zone con nome nella planimetria — accettata (19/11/2026)

Tabella `beach_zone` (nome libero 2–40, unico per stabilimento, al più
20) e `spot.named_zone_id` annullabile (migrazione 021). Il nome è un
nome proprio del Gestore, identico nelle due lingue; la fascia fisica
resta un concetto distinto. Gestione nella pagina planimetria (crea,
rinomina, elimina, assegna per postazione e per fila). Il nome compare
ovunque ci sia il codice della postazione: planimetria pubblica,
proposta nella scheda, riepilogo, carrello, ordine, pass, conto,
verifica all'ingresso e reception. La proposta nelle carte dei risultati
di ricerca è rimandata (le carte oggi non propongono postazioni).

## D51 — Recensioni verificate — accettata (19/11/2026)

Tabella `review` (migrazione 022): una per soggiorno (`booking_group_id`
unico), solo dal proprietario di un gruppo concluso e non annullato, voto
1–5 e testo facoltativo (600), nome del conto e mai l'email, non
modificabile (rimandato). Media e numero sulle carte dei risultati e
sulla scheda, elenco pubblico dal più recente. Moderazione del Gestore
nella sottopagina `recensioni` (permesso `reviews.moderate`): segnalazione
alla piattaforma con motivo scritto e replica; la segnalata resta
visibile con la replica finché la piattaforma non decide (console di
piattaforma rimandata). Niente recensioni comprate o importate.

## D52 — Caparra: acconto e saldo al lido — accettata (19/11/2026)

`beach.payment_mode` (`full|deposit`) e `deposit_percent` (10–90,
predefinito 30; migrazione 022), scelti dal Gestore. Con la caparra il
pagamento online vale l'acconto, calcolato per gruppo (l'ordine somma gli
acconti delle voci); la conferma resta piena: `recordSale` col totale
intero, pass emesso, stato `partial`, saldo = residuo di oggi, incasso
del saldo al banco con `banco-incassa` che esiste già. Acconto e saldo
visibili in riepilogo, carrello, ordine, email, conto e reception.
L'email di conferma smette di dire «Totale pagato» quando non è vero
(vale anche per il banco «da incassare», che mentiva). Fornitore di prova.

## D53 — Condizioni e termine di annullamento — accettata (19/11/2026)

`beach.cancel_deadline_hours` (0–336, predefinito di piattaforma 48) e
testi `cancel_policy_it/en` facoltativi (migrazione 022; vuoti ⇒ testo
predefinito dei dizionari). Il termine si misura dalla mezzanotte del
giorno d'arrivo nel fuso dello stabilimento. Condizioni e termine
visibili prima di pagare in riepilogo, carrello e ordine. Gesto nuovo
dell'Ospite dal conto: annullamento del gruppo confermato, non maturato,
entro il termine, con rimborso pieno (cuore di `cancelByBeachClub`
estratto in una funzione condivisa; la via del Gestore invariata); oltre
il termine il gesto non compare e la pagina rimanda allo stabilimento.
I testi e le percentuali definitivi li deciderà il committente (scritto).

## D54 — Niente profilazione — accettata (19/11/2026)

Riga nel piè di pagina pubblico nelle due lingue (`footer.privacy`):
niente cookie di profilazione né pubblicità, solo cookie tecnici
(sessione, carrello, lingua); voce nuova in Assistenza che lo spiega con
parole piane. Nessun banner: la sua assenza è il messaggio.

## D55 — Il linguaggio grafico «beach-art» — accettata (19/11/2026)

Una famiglia sola di SVG originali scritti in codice (mai ricalchi dei
riferimenti, mai raster): modulo presentazionale `beach-art` reso dal
server, vista dall'alto, contorni morbidi, palette dai gettoni Solar &
Fresh. Simboli delle postazioni con la dotazione visibile (ombrellone a
spicchi coi lettini accostati), scenografia completa (mare con onde,
sabbia, passerelle, palme, dune, chiosco, docce, torretta, bandiera,
cestini, campi, giochi, natanti); i segni del repertorio D35 ridisegnati
mantenendo le chiavi. Griglia a celle quadrate, leggibile a 390 px.
Usato dappertutto: scheda pubblica, editor, console, planner, reception
e pass.

## D56 — Stati con colore e glifo, legenda unica — accettata (19/11/2026)

Cinque stati del gestionale — disponibile (salvia, spunta), prenotato
(azzurro, calendario), occupato (corallo, persona), Stagionale (indaco,
tessera; mai «abbonamento»), manutenzione (ambra, chiave) — sempre
colore + glifo, mai il colore da solo; il pubblico conserva i suoi stati
ridisegnati con lo stesso principio. Legenda compatta identica nelle due
lingue, al telefono dietro un `<details>`. `spot.maintenance` nuova
(migrazione 023): non prenotabile finché vera, resta nel disegno, le
prenotazioni già prese restano; distinta dal ritiro dalla vendita.

## D57 — Pianificatore con bozza e salvataggio esplicito — accettata (19/11/2026)

La pagina «Spiaggia» diventa il pianificatore sulla griglia esistente
(niente coordinate libere, niente Konva). Ogni gesto accoda
un'operazione a una bozza per stabilimento (`layout_draft`, migrazione
023): creare singole e file/griglie (numerazione automatica di D34),
spostare, modificare (tipo, dotazione, codice, zona, manutenzione),
eliminare solo senza prenotazioni future, scenografia, zone a pennello.
L'anteprima del pianificatore mostra la bozza; il pubblico solo il
salvato. «Annulla l'ultima», «Scarta», «Salva» con riepilogo in parole e
applicazione in una transazione (se un'operazione non è più valida,
niente si applica e il riepilogo la indica); ogni salvataggio scrive
`layout.saved` nel registro delle azioni. Cataloghi (tipi, zone, lato
del mare) immediati come oggi, fuori dalla bozza. Rotte nuove solo per
la bozza (draft, ops, undo, discard, apply).

## D58 — Scenografia nel pianificatore — accettata (19/11/2026)

Gli elementi del disegno si aggiungono, si spostano e si tolgono dalla
bozza; non sono prenotabili e non toccano prenotazioni né registro
economico. Il repertorio si amplia con i soggetti nuovi del linguaggio
D55 (torretta, bandiera, cestini, campi da beach volley e bocce,
pedalò, canoa, SUP, dune).

## D59 — Zone disegnate sul pianificatore — accettata (19/11/2026)

Le postazioni si colorano con un velo pastello per zona con nome; il
«pennello di zona» senza JavaScript (scelta la zona, ogni clic accoda
l'assegnazione); restano i gesti per fila e per postazione di D50.

## D60 — Lo spostamento conserva l'identità — accettata (19/11/2026)

L'identità della postazione sta nell'id, mai nella cella: lo spostamento
cambia fascia, fila e colonna e non tocca codice, prenotazioni, pass e
storia. Il trascinamento con aggancio alla griglia è JavaScript
progressivo che compila e invia lo stesso modulo della via senza
JavaScript, mai l'unica via.

## D61 — La scheda del tipo di postazione — accettata (19/11/2026)

La scheda è del tipo, non della singola postazione. Due livelli: la
predefinita di piattaforma per ognuno degli 11 segni del repertorio
(testo del redattore vagliato dall'usabilità, foto di repertorio a
licenza registrata, in codice condiviso) e la personalizzata del lido
(`spot_type_card`, migrazione 025: titolo, descrizioni it/en con ripiego,
1–6 foto dalla libreria del sito con didascalie, dotazione, capienza,
fino a 6 dettagli). Risoluzione per campo: personalizzato dove c'è,
predefinito altrove. «Cabina» e «tavolo» non sono tipi di postazione
(cabine D26, tavolo scenografia): interpretazione scritta.

## D62 — Le fotografie dei tipi — accettata (19/11/2026)

Solo fotografie vere con licenza verificata e registrate in
immagini-reali.md (regole D43), ritagli 3:2 1200×800 in
`/demo/tipi/{segno}.jpg`, aggiunte anche alla libreria `demoMedia` così
servono pure alle schede personalizzate. Niente immagini generate; il
caricamento di foto proprie resta rimandato.

## D63 — Pagina pubblica e sottopagina «Postazioni» — accettata (19/11/2026)

Pagina pubblica `/bagni/{slug}/postazioni/{typeId}` (it `postazioni`, en
`spot-types`) con ritorno esatto via `torna` convalidato; ingressi da
planimetria, barra di selezione, elenco, riepilogo, carrello e riquadro
«Le postazioni» sulla scheda del lido. Gestione nella sottopagina nuova
«Postazioni» con anteprima identica al pubblico (stesso componente) e
ripristino alla predefinita; permesso `site.edit`. Rotte nuove: pubblica
`GET /v1/beaches/{slug}/spot-types`; di gestione GET/PUT/DELETE
`…/type-cards[/{typeId}]`. Contratto da 131 a 135.

## D64 — Il logo arcobaleno e il ripristino — accettata (20/11/2026)

I file approvati dal committente entrano in docs/marchio accanto a
quelli attuali, che non si cancellano; marchio.md dice quali sono in uso
e come tornare indietro. L'illustratore porta il logo nel componente di
packages/ui fedele al file del committente e rifà il favicon leggibile a
16 px. Backup già fatto e intoccabile: tag `ombre-tema-originale-20261120`
(3bcd7e9) e archivio in /home/sysadmin/backup-ombre/; la procedura di
ripristino è documentata in stato.md. Restano arancio #ee9b00 il sole e
l'onda del logo.

## D65 — I gettoni del tema arcobaleno — accettata (20/11/2026)

Prima del CSS, il direttore artistico scrive docs/tema-arcobaleno.md:
gettoni con nome, valore, ruolo e contrasto misurato. Gerarchia ferrea:
gradiente intero solo su logo e grandi superfici decorative, mai su
testo o componenti piccoli; colori funzionali uno per ruolo (blu mare
azioni, verde acqua conferme, rosso corallo errori, arancio avvisi) con
varianti scurite documentate dove l'AA lo chiede; giallo #fcbf49 mai
come testo su chiaro; il colore mai unico segnale. Il frontend applica i
gettoni nelle variabili CSS esistenti senza duplicare regole né toccare
markup; l'esperto di accessibilità misura e mette a verbale.

## D66 — La planimetria resta serena — accettata (20/11/2026)

La planimetria illustrata conserva il carattere pastello di D55: la
palette entra negli accenti (tele, legenda, cornici) per mano
dell'illustratore; stati sempre colore + glifo, legenda invariata nei
contenuti.

## D67 — L'intestazione su due righe (20/11/2026)

Il logo sta su una riga sua (marchio a sinistra, cambio lingua e «Area
riservata» a destra); sotto, la barra dei menu **da bordo a bordo della
pagina**, con un fondo proprio e le voci dentro il contenitore. Le voci
non si tagliano mai: vanno a capo quando non ci stanno, a ogni
larghezza; lo scorrimento orizzontale con le sfumature sparisce. La
griglia a una riga degli schermi larghi si ritira. Ordine e testi delle
voci restano quelli di D41.

## D68 — I pulsanti del menu nei colori dell'arcobaleno (20/11/2026)

Ogni voce del menu è un pulsante colorato, nell'ordine dell'arcobaleno
dei gettoni (D65): Ricerca ombrellone rosso corallo, Ospite arancio,
Stagionale giallo sole, Gestore verde acqua, Assistenza blu mare;
«Area riservata», nella riga del marchio, prende il viola e completa
l'arco. Il cambio lingua resta neutro. Il direttore artistico mette a
verbale nei gettoni la tavola dei sei pulsanti (fondo, testo, bordo,
voce corrente, fuoco) con i contrasti **misurati**: nessuna coppia
sotto WCAG AA, varianti scurite dove il colore pieno non regge, giallo
sole solo come fondo con testo scuro. La voce corrente conserva un
segno oltre il colore, leggibile anche in bianco e nero.

## D69 — La mappa dei lidi e il ripiego a elenco (20/11/2026)

La rotta dei segnaposto (`apps/web/app/dati/mappa/route.ts`) esisteva
ma non fu mai committata: la regola `dati/` del `.gitignore` alla
radice del repository ingoiava anche `apps/web/app/dati/`, perciò la
demo rispondeva 404 e il riquadro ripiegava su «Mappa non disponibile».
Rimedio: regola `!apps/web/app/dati/` nel `.gitignore` di `ombre/` (il
file alla radice serve ad altri progetti e non si tocca) e rotta
committata. La via resta Leaflet + OpenStreetMap: libreria e CSS
serviti da noi, solo le tessere da OpenStreetMap con attribuzione
visibile, visitatore mai localizzato. Le coordinate dei tre lidi
dimostrativi esistono già (punti costieri plausibili di stabilimenti
inventati). Il ripiego diventa utile: il server rende nel riquadro
l'elenco dei lidi (nome, località, collegamento) oltre all'invito alla
ricerca; senza JavaScript si vede l'elenco, con JavaScript la mappa lo
sostituisce, se mappa o tessere falliscono l'elenco resta; «Mappa non
disponibile» sparisce. Se l'API non risponde, la home mostra il solo
invito e non si rompe. La mappa della ricerca eredita lo stesso
ripiego.

## D70 — La home è dell'Ospite — accettata (20/11/2026)

Il committente revoca la parte di D41 che prescriveva i «tre tasti di
pari peso sopra la ricerca»: la home ripeteva i tre ruoli tre volte e i
portali a due pubblici tengono l'ingresso di chi offre in disparte.
L'eroe resta con titolo, sottotitolo e modulo di ricerca; il blocco
`portal-roles` sparisce con il suo CSS e le sue chiavi di dizionario.
Stagionale e Gestore entrano dalle carte «Per chi è», il cui collegamento
diventa un pulsante secondario (classi esistenti, solo nella home); la
via dei due tocchi del Gestore resta quella del menu. Il resto di D41 —
barra fissa, cinque voci nell'ordine committed, tre guide per ruolo —
resta valido. I collaudi dell'eroe si aggiornano alla nuova forma: l'eroe
non contiene i tre tasti, le carte portano alle tre guide.

## D71 — La vetrina del Gestore e il modulo «Ti chiamiamo noi» — accettata (21/11/2026)

La pagina del Gestore diventa la vetrina commerciale del gestionale,
sull'impianto studiato di spiagge.it ma senza numeri, testimonianze o
loghi inventati: eroe con claim e due azioni («Ti chiamiamo noi» verso
il modulo, «Guarda il gestionale» verso le schede), riga discreta «Sei
già un cliente? Entra nel gestionale», cinque schede-funzionalità con
le schermate vere (la quinta, la condivisione degli stagionali, con una
schermata nuova dal gestionale dimostrativo), quattro vantaggi reali,
trasparenza conservata verso il fondo, chiusura che rimanda all'àncora
del modulo. Il modulo di richiamata: nome, telefono, stabilimento
facoltativo, consenso esplicito; POST senza JavaScript con errori
leggibili; campo trappola che finge l'esito buono; limite di cinque
invii al minuto per indirizzo; archivio nella nuova tabella
`callback_request` (migrazione 026) e consultazione nella pagina
riservata `/area/richieste`, solo per il ruolo di piattaforma `admin`
(mai usato finora), con la marcatura «richiamato». Tre rotte nuove nel
contratto (135 → 138). Indirizzi, menu (D41) e home (D70) invariati.

## D72 — Il registro dice il vero e il banco non paga la piattaforma — accettata (21/11/2026)

Correzione di difetti del modello economico (gruppo A, iterazione 1), valida
in ogni scenario, compresa la cessione o licenza del software. Richiama D6
(nessun flusso di incasso reale nel MVP: una quota trattenuta sul contante
del banco resterebbe un credito non riscuotibile) e D8 (i piani A e B e le
percentuali restano quelli del pilota: cambia solo l'effetto del canale).

1. `payment_received` nel registro corrisponde sempre a denaro davvero
   incassato: una riga per pagamento riuscito, per il suo importo. Alla
   conferma online la riga dice ciò che il pagamento ha incassato (in
   modalità caparra D52, la sola caparra); per le prenotazioni al banco
   «da incassare» non nasce nessuna riga e l'incasso la scrive quando
   arriva (`collectAtDesk`, richieste di pagamento, extra incassati al
   banco). Le quote (`allocation`, `allocation_expected`) restano
   registrate alla conferma perché descrivono il dovuto. Questo corregge
   il passo di D31 «vendita registrata alla conferma»: la vendita resta
   registrata alla conferma nelle quote, ma l'incasso si scrive solo
   quando arriva.
2. Nessuna quota di piattaforma sulle vendite al banco: `recordSale` riceve
   il canale della vendita e sul banco i punti base della piattaforma
   confluiscono allo stabilimento (nessuna riga di quota `platform`); la
   quota dello Stagionale sulle giornate condivise resta invariata. Online
   nulla cambia. È anche una scelta di prezzo: nessuno degli scenari
   valutati tiene una commissione sulla cassa del bagno.

Registro che si può solo estendere: nessuna migrazione, le vendite già
registrate non si toccano.
