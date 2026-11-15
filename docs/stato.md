# Stato del progetto

Aggiornato al 15/11/2026.

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

- Pagamenti, rimborsi e liquidazioni con un fornitore reale.
- Invio reale della posta e delle notifiche.
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
