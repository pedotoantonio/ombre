# Stato del progetto

Aggiornato all'11/11/2026.

## Dove siamo

- **Documentazione**: concept Beach Sharing Network consolidato nel progetto
  professionale v3.0; template SweetHost applicato (catalogo dei moduli, schede,
  requisiti trasversali, checklist); stesura in [progetto.md](progetto.md); registro delle
  decisioni; schema della struttura logica ([struttura-logica.png](struttura-logica.png));
  requisiti di design, accessibilità, prestazioni, SEO, AEO e GEO in
  [qualita-web.md](qualita-web.md).
- **Codice, provato in container**:
  - sito pubblico bilingue (italiano e inglese) con sei pagine per lingua;
  - nucleo condiviso con calcoli in centesimi e le cinque macchine a stati;
  - database PostgreSQL con stabilimenti, postazioni, riga unica `inventory_day`,
    riserve e promozioni, isolato per stabilimento con RLS;
  - API `/v1`: elenco degli stabilimenti attivi, disponibilità di una giornata,
    preventivo calcolato dal server, riserva con chiave di idempotenza;
  - percorso di riserva nel sito, nelle due lingue e senza bisogno di script: pagina
    «Esplora» con gli stabilimenti attivi, scheda del bagno con le postazioni libere per
    fila, riepilogo con prezzo e codice promozionale, riserva e pagina della riserva;
  - `Dockerfile` e compose con database, migrazioni, API e sito.
- **Non fatto**: autenticazione e ruoli, aree riservate (ospite, stagionale, gestione,
  reception, console), condivisione stagionale, prenotazione confermata, pagamenti, pass,
  rendiconto, worker. Dopo la riserva il percorso si ferma: il pagamento non esiste
  ancora e la pagina lo dice. Nessun dominio registrato, nessuna pubblicazione. Il sito dichiara che il
  servizio è in preparazione e chiede di non essere indicizzato.

## Controlli eseguiti l'11/11/2026

| Controllo | Esito |
|---|---|
| Lint e controllo dei tipi | Superati |
| Test (31, di cui 13 su un PostgreSQL vero) | Superati |
| Due acquisti sulla stessa giornata | Dodici richieste simultanee, una sola riserva; ripetuto sull'API in container con dieci richieste: un 201 e nove 409 |
| Prezzo manipolato nel browser | L'importo inviato dal client è ignorato: vale quello del server |
| MARE10 su €30 | Totale €27, salvato nella riserva e immutato se il listino cambia |
| Ultimo utilizzo di una promozione conteso | Limite rispettato; l'utilizzo torna disponibile al rilascio |
| Riserva scaduta | La giornata torna acquistabile anche senza job di pulizia |
| Accesso a un altro stabilimento | Zero righe lette e zero scritte dal database, qualunque sia la query |
| Chiave di idempotenza | Stessa richiesta, stessa riserva; richiesta diversa, errore esplicito |
| Pagine servite dal container (192 verifiche su 12 pagine) | Superate |
| Percorso di riserva sul sito in container (24 verifiche) | Superato: MARE10 da 30,00 a 27,00, doppio invio del modulo senza doppia riserva, secondo acquirente rimandato alla scelta, modulo inviato da un altro sito rifiutato, dati dimostrativi non indicizzabili |
| Container | Sito e API non root, in sola lettura; database non pubblicato; ruolo dell'API senza privilegi |
| Riavvio | Migrazioni e seed ripetibili senza effetti |

Verifiche ancora aperte: documento OpenAPI generato dal codice, limiti alle richieste,
prova di ripristino da backup, Core Web Vitals misurati, prove con lettore di schermo e
da tastiera, controllo automatico di accessibilità, intestazione
Content-Security-Policy, immagine per le anteprime social, pagina 404 con la grafica del
sito. Il preventivo non è ancora salvato con una scadenza propria e manca il job che
ripulisce le riserve scadute (oggi la scadenza è valutata al momento della richiesta).

## Prossimo risultato da costruire

Un incremento operativo verificabile in ambiente di prova che colleghi:
sito personale → autorizzazione stagionale → acquisto → inventario → reception →
rendiconto. Inventario, riserva e percorso nel sito ci sono; il prossimo anello sono
gli accessi e la gestione da parte dello stabilimento.

## Passi successivi in ordine

1. Autenticazione, ruoli e gestione (inventario, prezzi, blocchi) con i test di permesso.
2. Prenotazione confermata con pagamento in sandbox, pass e verifica alla reception.
3. Condivisione stagionale, worker con outbox, rendiconto.
4. Aree riservate nel sito, sito del bagno con modelli e revisioni.
5. In parallelo, fuori dal codice: chiudere le decisioni di avvio (marchio e domini,
   soggetto venditore, provider pagamenti, condizioni) e scegliere i partner pilota.

## Dipendenze esterne aperte

- Verifica di disponibilità del marchio "Ombrè" e dei domini.
- Validazione del provider di pagamento sul modello a tre beneficiari.
- Pareri professionali: fiscalità delle quote, privacy, contratti degli stabilimenti.
- Selezione dei partner pilota e dei referenti.
- Dati per i contenuti pubblici: soggetto che pubblica, piani confermati, condizioni di
  annullamento, canali di assistenza, indirizzi proposti e scelta sui crawler AI (elenco
  completo in [qualita-web.md §8](qualita-web.md#8-dati-e-decisioni-che-servono-dal-proprietario)).
