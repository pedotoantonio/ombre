# Collaudo

Esito del collaudo dell'11/11/2026, eseguito con `pnpm collaudo` su container creati da
zero e rimossi alla fine. Il comando esegue lint e controllo dei tipi, 85 test (47 su un
PostgreSQL vero), costruisce le immagini, avvia database, API, worker e sito, percorre
sette verifiche sul sistema in esecuzione (332 controlli) e ripristina un backup.

Tutti i dati sono dimostrativi: lo stabilimento «Bagno delle Dune» è fittizio e il
pagamento passa da un fornitore di prova che non muove denaro.

## Risultato

| Parte | Controlli | Esito |
|---|---|---|
| Lint e tipi | tutto il codice | Superati |
| Test | 85 | Superati |
| Pagine pubbliche (`smoke`) | 204 | Superati |
| Percorso di riserva sul sito (`smoke:flow`) | 24 | Superati |
| Aree riservate sul sito (`smoke:areas`) | 45 | Superati |
| Sito dello stabilimento (`smoke:site`) | 20 | Superati |
| Prenotazione e ruoli sull'API (`smoke:booking`) | 15 | Superati |
| Acquisti simultanei sull'API (`smoke:api`) | 13 | Superati |
| Verifica in due passaggi (`smoke:2fa`) | 11 | Superati |
| Backup e ripristino | 24 tabelle, 26 regole di isolamento | Superato |

## I 15 scenari di accettazione del progetto

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

## Soglie del pilota

| Soglia proposta | Stato |
|---|---|
| Zero sovrapposizioni imputabili al sistema | Nessuna nei test di concorrenza. Da confermare con traffico reale |
| Differenze economiche identificate e risolte | La somma delle quote coincide con il totale per ogni prenotazione; manca la riconciliazione con un fornitore reale |
| Nessuna vulnerabilità bloccante | Nessuna nota. Non è stata fatta una verifica di sicurezza indipendente |
| Personale pronto sui casi di errore | Da fare con i partner |
| Almeno 4 partner su 5 intenzionati a proseguire | Da fare con i partner |

## Cosa il collaudo non copre

- Pagamenti, rimborsi e liquidazioni con un fornitore reale.
- Invio reale della posta: le notifiche sono registrate come non inviate.
- Carico: nessuna prova di prestazioni, né misura dei Core Web Vitals.
- Prove con persone: accessibilità assistita, personale della reception, ospiti.
- Verifica di sicurezza indipendente e prove di intrusione.
- Aspetti legali e fiscali, che il progetto affida ai professionisti.
