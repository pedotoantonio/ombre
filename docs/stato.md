# Stato del progetto

Aggiornato al 17/11/2026.

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
- Inviti e recupero della password: oggi gli accessi li crea l'amministratore da riga di
  comando.
- Console centrale della piattaforma, gruppi e cooperative, piani in `plan_feature`.
- Annullamento da parte dell'ospite: aspetta le condizioni di cancellazione.
- Chiusura di un'intera giornata con annullamento di tutte le prenotazioni.
- Caricamento di foto proprie e dominio personalizzato nel sito dello stabilimento.
- Pagine di località, «Chi siamo», recensioni, distanza dalla spiaggia; sulla mappa:
  ricerca per area visibile, «vicino a me», raggruppamento dei segnaposti.
- Console della reception a griglia («Ombrè Skipper»), banner «Dritta Ombrè», elenco
  degli stabilimenti in pagina iniziale: vedi i limiti in
  [progetto-grafico.md](progetto-grafico.md).
- Metriche, allarmi, backup pianificato, CI collegata a un repository.

## Collaudo

Esito completo in [collaudo.md](collaudo.md). In sintesi, l'11/11/2026, dopo il nuovo
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
(non versionato). Contiene due stabilimenti di fantasia, tra cui «Lido Aurora» con
immagini, abbonamenti e prenotazioni già fatte: guida in [demo.md](demo.md). Si avvia e si ferma così, dalla cartella `ombre/`:

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

- Verifica di disponibilità del marchio "Ombrè" e dei domini.
- Validazione del provider di pagamento sul modello a tre beneficiari.
- Pareri professionali: fiscalità delle quote, privacy, contratti degli stabilimenti.
- Selezione dei partner pilota e dei referenti.
