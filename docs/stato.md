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
  - accessi e ruoli nell'API: password verificate dentro il database, blocco dopo cinque
    tentativi, sessioni revocabili, ruoli gestore, reception e contabilità per
    stabilimento, registro delle azioni;
  - gestione dell'inventario nell'API: pubblicazione di una giornata, blocco operativo,
    cambio di prezzo, vista completa delle postazioni;
  - prenotazione nell'API: dalla riserva alla prenotazione in verifica, pagamento con un
    fornitore di prova, conferma solo a pagamento riuscito, codice `OM-AAMMGG-NNN`, pass
    firmato, rimborso registrato quando la giornata non è più disponibile;
  - reception nell'API: ingresso, uscita e rientro con il testo del QR o il codice breve,
    elenco delle prenotazioni del giorno;
  - condivisione stagionale nell'API: abbonamenti registrati dal gestore, proposte dello
    stagionale anche con ricorrenza, autorizzazione giornata per giornata o automatica,
    limite giornaliero, ritiro delle date libere, sospensione dell'abbonamento;
  - economia nell'API: ripartizione di ogni vendita secondo le percentuali in vigore,
    registro che si può solo estendere, maturazione a fine giornata, riepilogo per lo
    stabilimento e rendiconto dello stagionale senza dati dell'ospite;
  - worker: coda affidabile scritta nella stessa transazione delle modifiche, conferma
    della prenotazione per posta nella lingua dell'ospite (senza un fornitore reale la
    notifica è registrata come non inviata), pulizia delle riserve scadute, chiusura
    automatica delle giornate passate con maturazione delle quote;
  - `Dockerfile` e compose con database, migrazioni, API, worker e sito.
- **Non fatto**: secondo fattore di accesso, inviti e recupero password, aree riservate (ospite, stagionale, gestione,
  reception, console), annullamento da parte dell'ospite, pagamenti e liquidazioni
  reali, inviti agli stagionali (oggi l'utente deve già esistere), worker. Dopo la riserva il percorso si ferma: il pagamento non esiste
  ancora e la pagina lo dice. Nessun dominio registrato, nessuna pubblicazione. Il sito dichiara che il
  servizio è in preparazione e chiede di non essere indicizzato.

## Controlli eseguiti l'11/11/2026

| Controllo | Esito |
|---|---|
| Lint e controllo dei tipi | Superati |
| Test (65, di cui 42 su un PostgreSQL vero) | Superati |
| Due acquisti sulla stessa giornata | Dodici richieste simultanee, una sola riserva; ripetuto sull'API in container con dieci richieste: un 201 e nove 409 |
| Prezzo manipolato nel browser | L'importo inviato dal client è ignorato: vale quello del server |
| MARE10 su €30 | Totale €27, salvato nella riserva e immutato se il listino cambia |
| Ultimo utilizzo di una promozione conteso | Limite rispettato; l'utilizzo torna disponibile al rilascio |
| Riserva scaduta | La giornata torna acquistabile anche senza job di pulizia |
| Accesso a un altro stabilimento | Zero righe lette e zero scritte dal database, qualunque sia la query |
| Ruoli | La reception blocca ma non cambia i prezzi; la contabilità non tocca l'inventario; un gestore non entra in un altro stabilimento; ogni azione finisce nel registro |
| Accessi | Risposta identica per password errata e utente inesistente; blocco al quinto errore; uscita e rimozione dell'appartenenza hanno effetto immediato |
| Pagamento riuscito tardivo | Giornata ancora libera: prenotazione confermata. Giornata presa da un altro: nessuna prenotazione e rimborso registrato |
| Notifica del fornitore ripetuta o fuori ordine | Applicata una volta sola: nessuna conferma o pass duplicato; firma errata rifiutata |
| Pagamento fallito | Prenotazione annullata, postazione di nuovo libera, utilizzo della promozione restituito |
| Due scansioni del pass | Sei scansioni simultanee, un solo ingresso; uscita e rientro controllati; pass contraffatto, di un altro giorno o annullato rifiutato |
| Condivisione stagionale | Giornata visibile solo dopo l'autorizzazione; limite giornaliero rispettato anche con due autorizzazioni simultanee; ritiro rifiutato su una data riservata; la sospensione ferma le vendite e non tocca le prenotazioni confermate |
| Ripartizione | Vendita condivisa a €27: 13,50 / 10,80 / 2,70. Giornata ordinaria: nessuna quota stagionale. Somma delle quote sempre uguale al totale. Registro non modificabile nemmeno dal proprietario del database |
| Worker | Ogni elemento della coda trattato una volta anche con due worker insieme; un errore viene ritentato e abbandonato al quinto tentativo; riserve scadute liberate; giornate passate chiuse; una giornata passata non si può più vendere |
| Percorso completo sui container (20 verifiche) | Riserva, prenotazione, pagamento di prova firmato, conferma `OM-270617-001`, notifica dal worker, quote 13,50 / 10,80 / 2,70, ruoli e rendiconto dello stagionale |
| Chiave di idempotenza | Stessa richiesta, stessa riserva; richiesta diversa, errore esplicito |
| Pagine servite dal container (192 verifiche su 12 pagine) | Superate |
| Percorso di riserva sul sito in container (24 verifiche) | Superato: MARE10 da 30,00 a 27,00, doppio invio del modulo senza doppia riserva, secondo acquirente rimandato alla scelta, modulo inviato da un altro sito rifiutato, dati dimostrativi non indicizzabili |
| Container | Sito e API non root, in sola lettura; database non pubblicato; ruolo dell'API senza privilegi |
| Riavvio | Migrazioni e seed ripetibili senza effetti |

Verifiche ancora aperte: documento OpenAPI generato dal codice, limiti alle richieste,
prova di ripristino da backup, Core Web Vitals misurati, prove con lettore di schermo e
da tastiera, controllo automatico di accessibilità, intestazione
Content-Security-Policy, immagine per le anteprime social, pagina 404 con la grafica del
sito. Il preventivo non è ancora salvato con una scadenza propria.

## Prossimo risultato da costruire

Un incremento operativo verificabile in ambiente di prova che colleghi:
sito personale → autorizzazione stagionale → acquisto → inventario → reception →
rendiconto. Inventario, riserva e percorso nel sito ci sono; il prossimo anello sono
le aree riservate nel sito: pagamento e pass per l'ospite, poi stagionale, gestione e reception.

## Passi successivi in ordine

1. Aree riservate nel sito, sito del bagno con modelli e revisioni.
2. In parallelo, fuori dal codice: chiudere le decisioni di avvio (marchio e domini,
   soggetto venditore, provider pagamenti, condizioni) e scegliere i partner pilota.

## Dipendenze esterne aperte

- Verifica di disponibilità del marchio "Ombrè" e dei domini.
- Validazione del provider di pagamento sul modello a tre beneficiari.
- Pareri professionali: fiscalità delle quote, privacy, contratti degli stabilimenti.
- Selezione dei partner pilota e dei referenti.
- Dati per i contenuti pubblici: soggetto che pubblica, piani confermati, condizioni di
  annullamento, canali di assistenza, indirizzi proposti e scelta sui crawler AI (elenco
  completo in [qualita-web.md §8](qualita-web.md#8-dati-e-decisioni-che-servono-dal-proprietario)).
