# Collaudo

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

