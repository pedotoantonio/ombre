# Stato del progetto

Aggiornato all'11/11/2026.

## Dove siamo

Il primo rilascio è costruito e collaudato in ambiente di prova, con dati dimostrativi.
Non è in produzione: nessun dominio, nessun pagamento reale, nessun dato di stabilimenti o
clienti veri. Il sito dichiara che il servizio è in preparazione e chiede di non essere
indicizzato.

**Fatto e provato in container**

- Sito pubblico in italiano e inglese: sei pagine per lingua, più «Esplora» e la scheda
  di ogni stabilimento.
- Prenotazione dell'ospite: scelta della postazione, riepilogo con codice promozionale,
  riserva, dati, pagamento di prova, pass con codice QR e codice breve.
- Reception: verifica del pass con ingresso, uscita e rientro, prenotazione al banco,
  spostamento di postazione, elenco del giorno.
- Gestione dello stabilimento: giornate, prezzi, blocchi, annullamento con rimborso
  registrato, proposte degli stagionali, regole della condivisione, abbonamenti,
  riepilogo economico, sito con tre modelli, bozze e revisioni.
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
- Immagini e dominio personalizzato nel sito dello stabilimento.
- Pagine di località, «Chi siamo», mappa.
- Metriche, allarmi, backup pianificato, CI collegata a un repository.

## Collaudo

Esito completo in [collaudo.md](collaudo.md). In sintesi, l'11/11/2026: 85 test e 332
controlli sul sistema in esecuzione superati, backup ripristinato. Dei 15 scenari di
accettazione del progetto, 12 sono superati e 3 lo sono in parte (rimborsi eseguiti,
chiusura di un'intera giornata, prove di accessibilità con persone).

Limiti noti del codice: la Content-Security-Policy ammette gli script in linea, perché
il framework scrive in linea i dati delle pagine; i limiti alle richieste vivono nella
memoria di un solo processo dell'API; il preventivo non è salvato con una scadenza
propria; il segreto della verifica in due passaggi è salvato in chiaro nel database.

## Ambiente dimostrativo

Progetto compose `ombre-demo`, porte 3220 (sito) e 3221 (API), segreti in `.env.demo`
(non versionato). Si avvia e si ferma così, dalla cartella `ombre/`:

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
