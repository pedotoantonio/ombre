# Stato del progetto

Aggiornato al 19/11/2026.

## Dove siamo

Il primo rilascio è costruito e collaudato in ambiente di prova, con dati dimostrativi.
Non è in produzione: nessun dominio, nessun pagamento reale, nessun dato di stabilimenti o
clienti veri. Il sito dichiara che il servizio è in preparazione e chiede di non essere
indicizzato.

**Fatto e provato in container**

- Grafica «Solar & Fresh» del committente su tutto il sito, con il suo logo ridisegnato
  in vettoriale ([progetto-grafico.md](progetto-grafico.md), [marchio](marchio/marchio.md)).
  La pagina iniziale si apre con la fotografia della costa fornita dal committente e
  presenta le cinque funzioni con le sue icone.
- Sito pubblico in italiano e inglese: sei pagine per lingua, più «Esplora» e la scheda
  di ogni stabilimento. Ricerca per località, giorno, ospiti e giornate condivise, con
  postazioni libere e prezzo «da» reale; planimetria a colori con barra di riepilogo.
- Mappa dei lidi come modalità principale dalla pagina iniziale (Leaflet servito dal
  sito, tasselli OpenStreetMap, caricamento pigro, tre stati, lista sempre
  equivalente); in «Esplora» mappa e lista sulla stessa selezione; coordinate
  impostate dal gestore. Gestione della spiaggia dal gestore: pagina «Spiaggia» con
  zone riva/ombrelloni/monte, lettini singoli a distanza configurabile (riva e lato
  monte, anche dalla reception), file e postazioni create dal gestore, tipo di
  affitto («Stagionale», «Albergo» o personalizzato) con note per postazione e per
  fila, ritiro dalla vendita, eliminazione solo se mai usata. Specifica e prompt in
  [specifica-mappa-gestore.md](specifica-mappa-gestore.md) e
  [prompt-mappa-gestore.md](prompt-mappa-gestore.md); decisioni D23 e D24.
- Disegno della spiaggia dal gestore: lato del mare (alto/basso), colonne esplicite
  con buchi, passerelle, strutture etichettate e blocchi cabine, con un editor a
  celle-pulsante che funziona senza JavaScript; la planimetria pubblica rispecchia il
  disegno uno a uno. Tipi di postazione per stabilimento (Ombrellone, Lettino
  singolo, Gazebo e tipi personalizzati) con segno dal repertorio, dotazione,
  capienza e prezzo predefinito applicato alle giornate nuove. Cabine del mare:
  censimento nel disegno, affidamento a un titolare (con o senza accesso, ruolo
  `cabin_holder`), subaffitti proposti dal titolare e approvati dal gestore,
  occupante del giorno per la reception, tutto nel registro e mai pubblico, senza
  denaro nel sistema. Specifica e prompt in
  [specifica-editor-tipi-cabine.md](specifica-editor-tipi-cabine.md) e
  [prompt-editor-tipi-cabine.md](prompt-editor-tipi-cabine.md); decisioni D25, D26 e
  D27, con le idee dei mock-up del committente registrate come fase successiva.
- Iterazione dal confronto con un gestionale di mercato (spiagge.it), 16/11/2026,
  specifica e prompt in
  [specifica-confronto-gestionale.md](specifica-confronto-gestionale.md) e
  [prompt-confronto-gestionale.md](prompt-confronto-gestionale.md), decisioni
  D28–D31. **Ondata A (operativa)**: console «Oggi sulla spiaggia» per gestore e
  reception — scena a tutto schermo derivata dal disegno, una tessera per
  postazione con stato operativo, cognome e dotazione, tre viste, ricerca del
  giorno, navigazione per data, selezione multipla con blocco/sblocco in blocco,
  stampa senza nomi, impostazione ripresa dal riferimento del committente (la
  scena resta la griglia del disegno, non un paesaggio); statistiche su periodo
  (vendute, incasso, carrello medio, occupazione, canali, arrivi dagli ingressi,
  tipi, migliori e peggiori postazioni, heatmap della spiaggia); postazione
  «Consigliata» con euristica deterministica, in scheda pubblica e al banco.
  **Ondata B (commerciale)**: convenzioni hotel con codice nel campo esistente,
  prezzo fisso o percentuale, rendiconto per struttura e dimensione nelle
  statistiche; servizi extra scelti nel riepilogo online e al banco, congelati
  alla riserva, interamente dello stabilimento nel registro economico,
  rimborsati con l'annullamento; pagamenti multipli per prenotazione (scopo,
  residuo, stato saldata/parziale/da incassare), prenotazione al banco «da
  incassare» con pass subito, richieste di pagamento con link temporaneo
  `/paga/{token}` sul fornitore di prova, coda delle comunicazioni col testo
  pronto e pagina «Comunicazioni».
- Terza iterazione dal confronto (17/11/2026), su due prompt e tre tavole del
  committente, specifica e prompt in
  [specifica-console-planner.md](specifica-console-planner.md) e
  [prompt-console-planner.md](prompt-console-planner.md), decisioni D32–D37:
  scheda della postazione nella console (dati del giorno,
  totale/incassato/residuo, tipo di affitto, azioni per stato e permesso),
  planner a griglia su 7/14/31 giorni con filtro zona e celle collegate alle
  console dei giorni, generazione in blocco delle file dall'editor
  (numerazione progressiva, tetto di 200 per operazione), repertorio ampliato
  dalle tavole (16 decorazioni e 6 segni a noleggio ridisegnati in
  vettoriale), layout «applicazione» dell'area di gestione (barra fissa e
  navigazione a icone, in basso a telefono) e console con filtri zona/stato,
  sintesi sempre visibile e scala della scena a scatti. Le proposte esterne
  in contrasto con l'architettura (mappa a coordinate libere, trascinamento,
  cassa, CRM) sono scartate con motivo in specifica.
- Iterazione «tre ruoli e ricerca per periodo» (18/11/2026), dal prompt del
  committente e del figlio, specifica in
  [specifica-ruoli-periodo.md](specifica-ruoli-periodo.md)
  ([prompt](prompt-ruoli-periodo.md)), decisioni D38–D42: ricerca e
  prenotazione per periodo dal–al (gruppo di giornate consecutive, al
  massimo 31, con un codice, un pass valido ogni giornata e un totale;
  riserva tutta o niente; pagamenti, richieste e annullamento sul gruppo;
  extra una volta per periodo; un giorno resta il caso minimo e le
  prenotazioni esistenti sono gruppi di un giorno); prima pagina a tre
  tasti di pari peso (Ospite, Stagionale, Gestore stabilimento), barra
  pubblica fissa, menu a bottoni senza voce mappa, «Esplora» diventa
  «Ricerca ombrellone» con 301 dai vecchi indirizzi, «Come funziona» in tre
  pagine per ruolo (quella del Gestore con le schermate vere e l'accesso in
  due tocchi), i tre nomi ovunque con controllo automatico nei test e nelle
  suite fumo.
- Fotografie vere nel repertorio dimostrativo (18/11/2026, D43): le nove
  illustrazioni di `/demo` sono ora fotografie scattate da persone, con licenza
  libera accertata alla fonte e registrata in
  [immagini-reali.md](immagini-reali.md) (tutte Pexels License, senza obbligo di
  attribuzione), ritagliate a 1200×800 e verificate a vista (niente persone
  riconoscibili in primo piano, niente insegne di attività vere). Il Bagno delle
  Dune ha ora nel seme un sito pubblicato con copertina e galleria, come il Lido
  Aurora. Restano com'erano la fotografia della costa del committente (diritti
  da confermare), il marchio, le icone e le schermate del gestionale.
- Iterazione «carrello, conto dell'Ospite e accesso con Google» (18/11/2026),
  specifica in [specifica-carrello-conto.md](specifica-carrello-conto.md)
  ([prompt](prompt-carrello-conto-ospite.md)), decisioni D44–D48: carrello nel
  server di un solo stabilimento (più postazioni su periodi diversi, extra e
  intestatario per voce, biglietto firmato in cookie per chi non ha un conto,
  fusione all'accesso), conferma tutta o niente che produce un ordine
  `ORD-…` con una prenotazione e un pass per voce e un pagamento solo;
  conto dell'Ospite (utente senza appartenenze) con registrazione a nome ed
  email, password generata e spedita dalla coda di piattaforma, cambio
  obbligato al primo accesso, «Il mio conto» con prossimi arrivi, spesa,
  «Le mie prenotazioni» (ricollegate per email, lettura col ruolo di
  proprietario nella RLS), aggiunta di periodi e servizi dalle proprie
  prenotazioni; «Entra con Google» in OpenID Connect sul fornitore di prova
  configurabile, aggancio del conto per email. La prenotazione rapida senza
  conto è rimasta identica.
- Perizia d'usabilità dell'informazione del sito pubblico (18/11/2026, su
  segnalazione della famiglia): rapporto dell'esperto esterno in
  [perizia-usabilita.md](perizia-usabilita.md) — 65 blocchi censiti con le
  cinque domande, 47 tenuti. Applicati: eliminato il pannello della prima
  pagina «Tutto in un posto solo» (falso e interamente duplicato dai tre
  tasti, dalla ricerca e da «Tre passi»), 17 riscritture nelle due lingue
  (il periodo dal–al nominato negli otto punti che dicevano solo «giorno»,
  i ruoli per esteso nel glossario e nei passi, «parola d'ordine» diventata
  «password» nelle email del conto).
- Iterazione «Al passo con il mercato» (19/11/2026), dalla perizia comparativa
  sui concorrenti, specifica in
  [specifica-al-passo-col-mercato.md](specifica-al-passo-col-mercato.md)
  ([prompt](prompt-al-passo-col-mercato.md), testi dell'esperto in
  [testi-al-passo.md](testi-al-passo.md)), decisioni D49–D54: servizi dello
  stabilimento da un catalogo fisso di dodici voci traducibili, scelti dal
  Gestore e usati come filtri a caselle nella Ricerca ombrellone (senza
  JavaScript), distintivi sulle carte e elenco con icone sulla scheda; zone
  con nome nella planimetria (nome proprio del Gestore, per postazione e per
  fila), riportate identiche in planimetria, proposta, riepilogo, carrello,
  ordine, pass, conto, verifica all'ingresso e reception; recensioni
  verificate (solo l'Ospite con soggiorno concluso, una per soggiorno, voto
  1–5 e testo, nome del conto e mai l'email), con media e numero su carte e
  scheda, replica del Gestore e segnalazione alla piattaforma che lascia la
  recensione visibile; caparra per stabilimento («caparra adesso, saldo allo
  stabilimento», percentuale 10–90 scelta dal Gestore) sul fornitore di
  prova, con acconto e saldo visibili ovunque, incasso del saldo al banco e
  registro che quadra sul totale; condizioni e termine di annullamento per
  stabilimento (predefinito di piattaforma 48 ore, testi facoltativi it/en),
  visibili prima di pagare, con l'annullamento dal conto dell'Ospite entro il
  termine e rimborso pieno; riga «niente profilazione, solo cookie tecnici»
  nel piè di pagina e voce in Assistenza, senza banner. L'email di conferma
  ora distingue totale, pagato adesso e da saldare all'arrivo (prima diceva
  «Totale pagato» anche al banco «da incassare»).
- Iterazione «La spiaggia illustrata e il pianificatore» (19/11/2026), dalla
  perizia visiva del pannello concorrente, specifica in
  [specifica-spiaggia-illustrata.md](specifica-spiaggia-illustrata.md)
  ([prompt](prompt-spiaggia-illustrata.md)), decisioni D55–D60: linguaggio
  grafico «beach-art» di SVG originali disegnati in codice (ombrellone con
  tela a spicchi e dotazione visibile, 11 segni di postazione, 28 soggetti
  di scenografia: mare con onde, sabbia, passerelle, palme, dune, chiosco,
  docce, torretta, bandiera, cestini, campi, giochi, natanti) usato su
  planimetria pubblica, editor, console, planner, reception e pass; stati
  con colore + glifo (disponibile, prenotato, occupato, Stagionale,
  manutenzione — proprietà nuova della postazione, esclusa dalla vendita)
  e legenda unica nelle due lingue, al telefono dietro un tasto; la pagina
  «Spiaggia» è il pianificatore a bozza con salvataggio esplicito: creare
  postazioni singole e file/griglie con numerazione automatica, spostare
  col modulo e col trascinamento progressivo (la postazione resta la
  stessa: codice, prenotazioni e pass), modificare tipo/dotazione/codice/
  zona/manutenzione, eliminare solo senza prenotazioni, scenografia e
  pennello di zona, riepilogo in parole prima della conferma, applicazione
  in una transazione con rollback totale e voce `layout.saved` nel
  registro delle azioni; il pubblico vede solo la spiaggia salvata.
- Prenotazione dell'ospite: scelta della postazione, riepilogo con codice promozionale,
  riserva, dati, pagamento di prova, pass con codice QR e codice breve.
- Reception: verifica del pass con ingresso, uscita e rientro, prenotazione al banco,
  spostamento di postazione, elenco del giorno.
- Gestione dello stabilimento: giornate, prezzi, blocchi, annullamento con rimborso
  registrato, proposte degli stagionali, regole della condivisione, abbonamenti,
  riepilogo economico, sito con tre modelli, bozze, revisioni, copertina e galleria
  scelte tra le immagini dimostrative.
- Stagionale: proposte anche ricorrenti, ritiro delle date libere, rendiconto con la
  propria quota e senza dati dell'ospite.
- Economia: ripartizione di ogni vendita, registro che si può solo estendere,
  maturazione a fine giornata, storni con movimenti compensativi.
- Piattaforma: isolamento tra stabilimenti nel database, accessi con blocco dei
  tentativi e verifica in due passaggi, ruoli, registro delle azioni, limiti alle
  richieste, documento OpenAPI, worker con coda affidabile, backup con ripristino provato.
- Docker: database, migrazioni, API, worker e sito partono con un comando; sito, API e
  worker girano non root e in sola lettura.

**Non fatto**

- Pagamenti, rimborsi e liquidazioni con un fornitore reale (acconti e link di
  pagamento sono già modellati sul fornitore di prova).
- Invio reale della posta e delle notifiche (la coda con i testi pronti c'è;
  manca il fornitore).
- Dal confronto col gestionale di mercato, registrati e non costruiti: cassa
  fiscale, bar/ristorante, app mobile, marketplace di esperienze, gestionale
  piscina, convenzioni con fattura mensile alla struttura, CRM, automazioni
  WhatsApp, prezzi dinamici, storico per postazione, aggiornamento in tempo
  reale della console (vedi §7 della specifica del confronto e §4ter della
  specifica console/planner).
- Dal periodo dal–al, rimandati e scritti (§7 della specifica ruoli/periodo):
  carrello con più postazioni, spostamento dell'intero periodo, annullamento
  di singole giornate di un gruppo, sconti soggiorno, statistiche per gruppo,
  periodi non consecutivi.
- Recupero della password dimenticata (oggi passa da un nuovo invio
  dell'amministratore); inviti del personale: gli accessi di gestore,
  reception e contabilità li crea ancora l'amministratore da riga di comando
  (l'Ospite ora si registra da sé).
- Dal carrello e dal conto, rimandati e scritti (§8 della specifica):
  carrello su più stabilimenti, smentita del ricollegamento per email,
  eliminazione del conto, console di piattaforma per le comunicazioni senza
  stabilimento, altri fornitori OIDC; le chiavi vere di Google sono del
  committente (dipendenza aperta).
- Console centrale della piattaforma, gruppi e cooperative, piani in `plan_feature`.
- Dalla spiaggia illustrata, rimandati e scritti (§6 della specifica):
  coordinate libere e rotazioni, trascinamento multiplo, bozze per utente,
  storico delle bozze salvate, animazioni del mare, stampa illustrata;
  Konva e le librerie canvas restano escluse.
- Dall'iterazione «Al passo con il mercato», rimandati e scritti (§8 della
  specifica): tariffe adulto/bambino e mezze giornate (aspettano i listini
  veri del committente), recensioni importate da Google, modifica ed
  eliminazione della recensione, decisione della piattaforma sulle
  recensioni segnalate (va con la console di piattaforma), annullamento
  dell'Ospite oltre il termine (oggi rimanda allo stabilimento; i testi e le
  percentuali definitivi delle condizioni li deciderà il committente).
- Chiusura di un'intera giornata con annullamento di tutte le prenotazioni.
- Caricamento di foto proprie e dominio personalizzato nel sito dello stabilimento.
- Pagine di località, «Chi siamo», distanza dalla spiaggia; sulla mappa:
  ricerca per area visibile, «vicino a me», raggruppamento dei segnaposti.
- Console della reception a griglia («Ombrè Skipper»), banner «Dritta Ombrè», elenco
  degli stabilimenti in pagina iniziale: vedi i limiti in
  [progetto-grafico.md](progetto-grafico.md).
- Metriche, allarmi, backup pianificato, CI collegata a un repository.

## Collaudo

Esito completo in [collaudo.md](collaudo.md).

Il 19/11/2026 (sera), iterazione «La spiaggia illustrata e il
pianificatore»: 267 test con database (contratto a 131 rotte), 1044
controlli fumo con la suite nuova `smoke:spiaggia` (121 controlli:
grafica nuova sulle tre planimetrie e nel gestionale, legenda it/en,
manutenzione esclusa dalla vendita, bozza con creazione singola e a
griglia, spostamento che conserva codice/prenotazione/pass verificato col
biglietto, eliminazione rifiutata con l'indice dell'operazione, scenografia
senza movimenti economici, riepilogo e `layout.saved` nella scia, 390 px);
gli otto criteri del committente tutti superati, nessun difetto del
prodotto; il trascinamento provato con Playwright. Ambiente di collaudo
ricostruito (migrazioni fino alla 024) e lasciato acceso.

Il 19/11/2026, iterazione «Al passo con il mercato»: 258 test con database
(contratto a 126 rotte), 923 controlli fumo con la suite nuova
`smoke:mercato` (110 controlli: filtri con «tutti i servizi», distintivi e
voti sulle carte, recensioni con replica e segnalazione, caparra al 30% con
sandbox e residuo, annullamento dal conto entro e oltre il termine, registro
che quadra — somma delle ripartizioni uguale al lordo —, piè di pagina e FAQ
nelle due lingue); gli otto criteri del committente tutti superati, nessun
difetto del prodotto. Ambiente di collaudo ricostruito (migrazioni fino alla
022) e lasciato acceso.

In sintesi, l'11/11/2026, dopo il nuovo
progetto grafico: 102 test e 469 controlli sul sistema in esecuzione superati, backup
ripristinato. Una revisione indipendente di grafica e accessibilità ha trovato venti
rilievi, nessuno bloccante: quindici corretti, gli altri registrati tra i limiti. Dei 15 scenari di
accettazione del progetto, 12 sono superati e 3 lo sono in parte (rimborsi eseguiti,
chiusura di un'intera giornata, prove di accessibilità con persone).

Il 15/11/2026, dopo mappa e gestione della spiaggia: `pnpm check` e 108 test con
database verdi, 471 controlli dei collaudi fumo sull'ambiente in esecuzione, 90
verifiche sugli otto criteri di accettazione della specifica, tutte superate;
schermate aggiornate in [schermate](schermate/).

La sera del 15/11/2026, dopo disegno, tipi di postazione e cabine: `pnpm check` e
129 test con database verdi, 471 controlli fumo, i nove criteri di accettazione
(0–8) della seconda specifica tutti superati; un difetto trovato e corretto (il
conteggio d'uso dei tipi usciva a zero dall'elenco del gestore); sette schermate
nuove in [schermate](schermate/).

Il 16/11/2026, iterazione dal confronto. Ondata A: 147 test con database, suite
fumo verdi, 140 verifiche HTTP sui criteri 1–3 e sul criterio 0, tutte superate
alla prima esecuzione completa, nessun difetto. Ondata B: 174 test con database
(contratto a 93 rotte), suite fumo verdi (smoke a 279 controlli), 116 verifiche
HTTP sui criteri 4–7 più 15 a database, tutte superate; un difetto trovato e
corretto (la pagina cortese di `/paga` arrivava vuota senza JavaScript). In
coda, i tag `canonical`/`hreflang`/`og:url` sono omessi quando l'indirizzo
pubblico non è configurato (prima puntavano al segnaposto `localhost`).

Il 18/11/2026 (sera), iterazione «carrello, conto dell'Ospite e accesso con
Google» più perizia d'usabilità applicata: 235 test con database (contratto a
112 rotte), 813 controlli fumo con la suite nuova `smoke:conto` (139
controlli: registrazione, OIDC di prova per intero, ricollegamento dello
storico, carrello a due voci fino all'ordine pagato coi pass per voce) e il
censimento dei nomi allargato alle pagine nuove; i tredici criteri delle due
commesse (8 + 5) tutti superati; nessun difetto del prodotto. Lacune
dichiarate nel rapporto: nessun seed pubblica extra, Google vero non
esercitato (chiavi del committente), comunicazioni di piattaforma leggibili
solo in coda. Ambiente di collaudo ricostruito col fornitore OIDC di prova e
lasciato acceso.

Il 18/11/2026, incremento «fotografie vere» (D43): lint, tipi e tutti i test
con database verdi (contratto fermo a 96 rotte), 633 controlli fumo
sull'ambiente ricostruito (il fumo del sito parte ora dal sito seminato del
Bagno delle Dune), verifica a vista dei nove ritagli pubblicati; due ritagli
automatici rifatti a mano (`tramonto`, `docce`); sette schermate aggiornate in
[schermate](schermate/). Ambiente di collaudo riseminato e lasciato acceso.

Il 18/11/2026, iterazione «tre ruoli e ricerca per periodo»: 209 test con
database (contratto a 96 rotte), 633 controlli fumo (col percorso completo
di un periodo di tre giornate, in italiano e in inglese), 86 verifiche
dedicate ai sette criteri del committente più 35 su HTML/CSS serviti e 175
scansioni automatiche dei nomi di ruolo, tutte superate; nessun difetto del
prodotto (una sola asserzione del giro di collaudo corretta). Ambiente di
collaudo ricostruito (migrazioni fino alla 018) e lasciato acceso.

Il 17/11/2026, iterazione console/planner/repertorio (scheda, planner,
generazione in blocco, decorazioni, layout applicazione, filtri e scala):
192 test con database (contratto a 96 rotte), 479 controlli fumo, 171
verifiche sui criteri 0–7 della nuova specifica, tutti superati; un difetto
trovato e corretto nelle sole suite di verifica (cercavano la vecchia barra
dell'account sulle pagine col layout nuovo). Ambiente di collaudo
ricostruito dal codice corrente e lasciato acceso.

Limiti noti del codice: la Content-Security-Policy ammette gli script in linea, perché
il framework scrive in linea i dati delle pagine; i limiti alle richieste vivono nella
memoria di un solo processo dell'API; il preventivo non è salvato con una scadenza
propria; il segreto della verifica in due passaggi è salvato in chiaro nel database; la
pagina «non trovata» di un indirizzo ben formato ma senza dati (per esempio uno
stabilimento inesistente) ha il codice 404 giusto, ma senza script appare vuota.

## Ambiente dimostrativo

Progetto compose `ombre-demo`, porte 3220 (sito) e 3221 (API), segreti in `.env.demo`
(non versionato). Contiene tre stabilimenti di fantasia, tutti con sito
pubblicato e fotografie vere (D43); «Lido Aurora» ha anche abbonamenti,
prenotazioni già fatte, zone con nome e tre recensioni con la replica del
gestore; «Cala del Moro» lavora con la caparra al 30% e condizioni proprie
di annullamento; l'Ospite dimostrativo è `ospite@ombre.example`: guida in
[demo.md](demo.md). Si avvia e si ferma così, dalla cartella `ombre/`:

```bash
docker compose --env-file .env.demo -p ombre-demo --profile tunnel up -d
docker compose --env-file .env.demo -p ombre-demo --profile tunnel down
```

L'indirizzo pubblico temporaneo è nel registro del servizio `tunnel` e cambia a ogni
avvio. Vedi la decisione D19.

## Passi successivi

1. Decisioni che spettano al committente: marchio e dominio, soggetto venditore,
   fornitore di pagamento, condizioni di cancellazione, piani e commissioni, zona e
   partner del pilota. Elenco in
   [qualita-web.md §8](qualita-web.md#8-dati-e-decisioni-che-servono-dal-proprietario).
2. Con quelle decisioni: fornitore di pagamento reale, posta reale, annullamento
   dell'ospite, pagine di località, contenuti definitivi.
3. Prima del pilota: repository dedicato con CI, proxy pubblico con HTTPS, Docker
   secrets, backup pianificato, metriche e allarmi, verifica di sicurezza indipendente,
   prove di accessibilità con persone, formazione della reception.

## Dipendenze esterne aperte

- Testi e percentuali definitivi delle condizioni di annullamento e della
  caparra: il meccanismo c'è (D52, D53) coi predefiniti di piattaforma;
  le parole e i numeri veri li decide il committente.
- Chiavi OAuth di Google del committente per «Entra con Google» (client id e
  segreto): finché mancano, il flusso gira sul fornitore di prova
  configurabile (`OMBRE_OIDC_PROVIDER=test`), collaudato per intero.
- Verifica di disponibilità del marchio "Ombrè" e dei domini.
- Validazione del provider di pagamento sul modello a tre beneficiari.
- Pareri professionali: fiscalità delle quote, privacy, contratti degli stabilimenti.
- Selezione dei partner pilota e dei referenti.
