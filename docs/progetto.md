# Ombrè — Stesura del progetto

Documento di prodotto e sviluppo, derivato dal *Progetto professionale v3.0*
(10/11/2026) e organizzato secondo il template SweetHost
([catalogo-moduli.md](catalogo-moduli.md)). Definisce il prodotto da realizzare:
**non certifica** backend operativi, pagamenti reali, domini registrati o app pubblicate.
Nome e identità grafica sono proposte: disponibilità del marchio e titolarità dei domini
vanno verificate prima dell'uso pubblico.

## Visione e proposta di valore

Ombrè collega una disponibilità fisica (l'ombrellone), una relazione commerciale
(l'abbonamento stagionale) e un acquisto (la giornata al mare). Il prodotto riesce quando:

- lo **stagionale** propone con pochi passaggi le giornate in cui non andrà al mare e
  consulta quanto previsto dall'accordo con il gestore;
- il **gestore** conserva il controllo: decide quali abbonamenti abilitare, quante
  postazioni pubblicare, in quali date e a che prezzo;
- l'**ospite** trova una disponibilità, legge il prezzo finale e le condizioni, compra e
  accede con un pass affidabile;
- la **reception** inserisce prenotazioni e verifica i pass sullo stesso inventario del
  sito, senza agenda parallela;
- la **piattaforma** attiva i partner, segue le anomalie e ha ricavi tracciabili.

Il beneficio del gestore viene prima: le vendite condivise si misurano separatamente
dalle ordinarie e non si presentano automaticamente come ricavi incrementali.

### Esempio coerente usato in tutto il progetto

Bagno delle Dune (fittizio), Lido di Pomposa, 17 giugno 2027, 09:00–19:00. Postazione
condivisa B02, fila 2, un ombrellone e due lettini per due ospiti. Prezzo €30,00;
promozione MARE10 (−10%, valida anche per una sola giornata) → totale cliente €27,00.
Rimborso 100% entro le 18:00 del 16 giugno (Europe/Rome), poi nessun rimborso per
ripensamento. Ripartizione illustrativa sul prezzo scontato: stagionale 50% (€13,50),
bagno 40% (€10,80), piattaforma 10% (€2,70). Tutti i valori sono ipotesi da validare.

## Perimetro del primo rilascio (MVP)

| MVP operativo | Fase successiva |
|---|---|
| Portale pubblico, ricerca locale e schede dei bagni | Espansione nazionale e campagne su larga scala |
| Tre template e pubblicazione con revisioni | Marketplace di template e impaginazione libera |
| Giornate intere, postazioni fisse, dotazione dichiarata | Fasce orarie, cabine, risorse composte |
| Account, ruoli e abbonamenti verificati | App native per store e programmi fedeltà |
| Ricorrenze semplici, autorizzazioni e vincoli commerciali | Prezzi predittivi o automatismi AI |
| Checkout sandbox; provider reale dopo configurazione | Più provider di pagamento contemporanei |
| Codice/QR, reception, rimborsi e rendiconto | Varchi automatici e pass nei wallet |
| Promozioni semplici e tracciamento del canale | Campagne automatizzate |

**Definizione di completamento**: una funzione entra nel rilascio solo con permessi,
persistenza, messaggi di errore, tracciamento e prova di accettazione. Nessuna dicitura
"attivo" per pulsanti dimostrativi o servizi esterni non collegati.

**Sistemi già in uso**: se un bagno usa un altro gestionale, prima dell'attivazione si
sceglie la fonte autorevole dell'inventario (contingente esclusivo per Ombrè o stesso
calendario). Un import periodico non evita le vendite simultanee su due sistemi.

## Ruoli e responsabilità

| Ruolo | Permessi principali | Limiti |
|---|---|---|
| Amministratore piattaforma | Partner, piani, supporto, incidenti | Accesso ai dati dei bagni solo con motivo e traccia |
| Responsabile cooperativa | Vista aggregata sulle strutture assegnate | Nessun accesso a strutture esterne al gruppo |
| Gestore | Inventario, sito, prezzi, utenti, condizioni | Operazioni finanziarie secondo deleghe configurate |
| Reception | Arrivi, prenotazioni, blocchi operativi | Niente commissioni o coordinate di pagamento |
| Contabilità | Rendiconti, riconciliazione, export | Niente pubblicazione sito o modifica inventario |
| Stagionale | Proposte sul proprio abbonamento | Niente ritiro di date già impegnate |
| Ospite | Acquisto e gestione delle proprie prenotazioni | Nessun accesso ad abbonamenti o dati altrui |

L'account è distinto dall'appartenenza a una struttura: inviti con scadenza e revoca,
ruolo esplicito, contesto selezionato da chi lavora per due bagni. Una revoca invalida
anche le sessioni già aperte. Lo stagionale entra per invito o richiesta: il gestore
verifica contratto, periodo e postazione (il numero dell'ombrellone da solo non abilita);
il sistema registra la versione delle condizioni accettate. Il supporto della piattaforma
non assume silenziosamente l'identità del gestore: accesso assistito con durata,
motivazione, ambito e registro.

## Superfici e navigazione

| Superficie | Voci principali |
|---|---|
| Portale Ombrè | Esplora; come funziona; per gli stabilimenti; assistenza; account |
| Sito del bagno | Home; stabilimento; servizi; offerte; prenota; FAQ; contatti |
| Area ospite | Prenotazioni; pass; assistenza; profilo |
| Area stagionale | Abbonamenti; calendario; proposte; prenotazioni collegate; rendiconto |
| Gestore/reception | Oggi; inventario; prenotazioni; stagionali; sito; promozioni; rendiconti; impostazioni |
| Console centrale | Partner; gruppi; piani; attivazioni; anomalie; supporto; indicatori |

URL proposti: `/esplora`, `/bagni/{slug}`, `/bagni/{slug}/prenota`,
`/bagni/{slug}/offerte/{slug-offerta}`, `/account/prenotazioni`, `/stagionale`,
`/gestione`. Un dominio verificato del bagno apre lo stesso sito e gli stessi dati di
`/bagni/{slug}`: nessuna duplicazione dell'inventario per il cambio di dominio. Il cambio
di contesto portale→sito mantiene data e ospiti quando compatibili e ripete il prezzo
valido; un cambio di struttura ricalcola sempre disponibilità, promozioni e condizioni.
L'identità visiva non è una protezione dei dati: i controlli appartengono al server.

## Identità visiva e accessibilità

> Palette e logo di questa sezione sono quelli proposti nella v3.0. Dall'11/11/2026 vale
> il progetto grafico del committente: vedi [progetto-grafico.md](progetto-grafico.md) e
> la decisione D20. Restano valide le regole su accessibilità, stati e linguaggio.

| Token | Colore | Uso |
|---|---|---|
| Laguna / primario | `#023047` | Testi, navigazione, pulsanti principali |
| Sole / accento | `#FFB703` | Azioni rilevanti con testo Laguna; promozioni |
| Sabbia / fondo | `#FFF8E7` | Superfici di accoglienza e sezioni editoriali |
| Mare / secondario | `#126777` | Supporto e collegamenti |
| Libero / stato | `#23644B` | Testo e icona su fondo verde molto chiaro |
| Errore / stato | `#A34336` | Problemi, rifiuti, azioni critiche con spiegazione |

Logotipo minuscolo "ombrè" con simbolo ombrellone+onda (da rifinire a 16/32/192 px).
Gerarchia: il portale usa Ombrè come marchio dominante; il sito del bagno usa il brand
del bagno con la firma discreta "Prenotazioni con Ombrè"; i colori scelti dal gestore
restano entro accoppiamenti leggibili.

Obiettivo WCAG **2.2 AA**, verificabile sulle pagine effettive, non dichiarato dalla
palette. Coppie verificate: `#023047` su `#FFB703` = 7,93:1 (ok per testo normale);
bianco su `#219EBC` = 3,14:1 e bianco su `#FFB703` = 1,75:1 (da evitare per testo
normale). Tipografia: Plus Jakarta Sans con fallback di sistema; testo base 16 px,
metadati ≥ 14 px; scala spazi 4/8/12/16/24/32/48; touch 44×44 px. Ogni componente
definisce gli stati normale/focus/selezionato/disabilitato/caricamento/errore; il colore
non basta (etichette, forme, icone); la postazione è selezionabile anche da tastiera e
lettore di schermo tramite vista a elenco. Uso reale in spiaggia: leggibilità con luce
intensa, barra di riepilogo che non copre contenuti né tastiera, riduzione animazioni.

Linguaggio: accogliente nei contenuti, preciso nei passaggi economici
("Riserva attiva per 10 minuti", "Pagamento in verifica", "Prenotazione confermata");
mai confondere un blocco temporaneo con una conferma.

Regole di interazione e animazione, contrasti verificati della palette e soglie di
prestazione delle pagine pubbliche sono in [qualita-web.md](qualita-web.md). Per note e
metadati si usa `#3E5C6B`: il grigio `#7A8B93` su Sabbia arriva a 3,34:1 e va riservato al
testo grande.

## Flussi chiave

### Ricerca e acquisto (ospite)

Ricerca per località, giorno e ospiti, consultabile senza registrazione; il prezzo "da"
corrisponde a una postazione realmente acquistabile per i parametri scelti. Percorso
mobile in tre passi: planimetria/elenco → riepilogo (prezzo, sconto, extra, condizioni di
annullamento) → pass con QR e codice `OM-AAMMGG-NNN`.

- Il **preventivo** è calcolato dal server e ha una validità esplicita.
- La **riserva** (proposta: 10 minuti, configurabile) nasce solo dopo l'acquisizione
  dell'inventario; la scadenza deriva dal tempo del server; aggiornare la pagina non la
  estende.
- Prezzo, condizioni, quote e promo applicata sono **salvati nell'ordine**: la conferma
  non li ricostruisce dal listino corrente.

Casi di errore previsti: postazione appena venduta (alternative equivalenti e nuovo
prezzo), promo non applicabile (motivo specifico, prezzo da riaccettare), riserva scaduta
(ricalcolo), esito pagamento incerto ("Pagamento in verifica", nessun invito a ripagare
senza controllo), rete interrotta dopo il pagamento (recupero dell'ordine), nessuna
postazione adatta (date/località alternative senza cambiare dotazione).

### Condivisione stagionale

Ogni abbonamento (`SeasonContract`) collega titolare verificato, bagno, stagione,
postazione e periodo; un cliente può avere più contratti e familiari delegati espliciti.

| Regola | Comportamento |
|---|---|
| Proposta ricorrente | Espansa in giornate nella stagione; ricorrenza ed eccezioni registrate; riepilogo prima del salvataggio (aggiunte, già presenti, escluse, in conflitto) |
| Approvazione per abbonamento | Pubblicazione automatica entro limiti già autorizzati |
| Approvazione per giornata | Proposta invisibile agli ospiti fino alla conferma del gestore |
| Massimo giornaliero di condivise | Contingente unico per struttura e giorno, protetto transazionalmente |
| Esclusione o sospensione | Ferma nuove vendite; non cancella prenotazioni confermate |
| Ritiro | Solo senza riserve o prenotazioni incompatibili; in conflitto si spiega come chiedere assistenza; il gestore non "forza" la liberazione |
| Cambio postazione | Prima si risolvono le prenotazioni future; origine e storico conservati |

La **maturazione economica** è un evento separato dal click di prenotazione e
dall'ingresso; finestre di pubblicazione e annullamento in Europe/Rome; una quota
contestata può restare sospesa con motivo visibile. Lo stagionale vede il dettaglio
economico senza i dati personali non necessari dell'ospite.

### Reception

Vista operativa sul **medesimo inventario** usato online: planimetria con stati per
postazione, inserimento al banco, blocco manutenzione, spostamento (nuova disponibilità
acquisita e precedente rilasciata nella stessa transazione). Pagamento, prenotazione e
presenza sono stati distinti: registrare un ingresso non modifica il rendiconto né
ricalcola il prezzo. Ogni azione registra operatore, struttura, motivo e risultato; i
nomi completi non compaiono sulla mappa panoramica.

Pass: token opaco non prevedibile verificato sul server; il QR non contiene dati
personali; il codice breve è un'alternativa assistita con limite ai tentativi. Scansioni
simultanee non generano due ingressi. Guasto di rete: si sospendono le nuove vendite; per
gli arrivi confermati esiste una procedura di emergenza con elenco minimo, responsabile e
riconciliazione successiva. No-show: la mancata scansione non lo dimostra da sola;
maltempo, annullamento del cliente e chiusura del bagno sono eventi diversi che applicano
le condizioni memorizzate nell'ordine.

### Sito del bagno ed editor

Modello editoriale: `Site`, `Revision`, `Section`, `Media`, `Translation`. Flusso:
modifica → bozza → validazione → anteprima protetta (scade, non indicizzabile) →
pubblicazione revisione → invalidazione cache → conferma. Un errore di pubblicazione
conserva l'ultima versione valida; il ripristino crea una nuova revisione mantenendo la
storia. Tre template (Riviera, Boutique, Essential) sullo stesso contenuto: cambiare
template cambia la presentazione, non elimina contenuti, URL, traduzioni o regole.
Campi validati (testi, immagini con alt, collegamenti), niente script arbitrari, colori
controllati per contrasto; due editor concorrenti ricevono un conflitto di versione.
Criterio di completamento: un visitatore su un secondo dispositivo vede la versione
pubblicata; il gestore vede la bozza etichettata.

## Promozioni

Campi: nome, codice, stato, **intervallo di acquisto distinto dall'intervallo di
fruizione**, giorni ammessi, strutture, zone, postazioni, canali, importo o percentuale,
spesa minima, cap e politica di ripristino. Il preventivo verifica l'eleggibilità, la
riserva impegna temporaneamente un utilizzo, la conferma lo consuma, la scadenza lo
rilascia; due acquisti simultanei non superano il cap (limite condiviso tra portale e
sito diretto quando previsto). La disattivazione blocca nuovi utilizzi mantenendo valide
le condizioni degli acquisti confermati. Link/QR di campagna identificano struttura,
offerta e canale senza dati personali. Niente invii a contatti importati senza base
giuridica e preferenze.

## Economia: piani, quote, pagamenti

Piani ipotetici da validare con i partner: **Piano A** €490/anno + 5%;
**Piano B** €0 + 10%; **Gruppi** da concordare (pareggio aritmetico A/B a €9.800 di
volume annuo). Canoni e commissioni **versionati per struttura, canale e tipo di
postazione**; nessuna modifica retroattiva delle prenotazioni; ogni ordine conserva piano
e percentuali applicati.

Calcoli in centesimi interi, arrotondamento deterministico, residuo assegnato
esplicitamente. Una postazione ordinaria non genera quota stagionale. Il totale cliente
non cambia in funzione di calcoli interni.

Stati economici: **previsto** (quota su prenotazione confermata, non maturata) →
**maturato** (condizioni soddisfatte) → **liquidazione in corso** → **liquidato**
(trasferimento confermato e riconciliato); più **sospeso** (con motivo) e **rettificato**
(movimento compensativo, mai cancellazione). Registro immutabile degli eventi economici;
rimborso al cliente e recupero delle quote trasferite sono processi distinti. Controlli
giornalieri: confronto tra ordini, eventi del provider e registro interno, ogni
differenza con importo, motivo, responsabile e stato. Gli export non sostituiscono i
documenti fiscali; nessun portafoglio prelevabile senza struttura contrattuale adeguata.

Provider: riferimento tecnico Stripe Connect (addebiti e trasferimenti separati), **da
validare** su modello contrattuale, territori e beneficiari. Identificazione del
venditore, imposte e modalità di liquidazione si definiscono con professionisti prima
delle transazioni reali.

## Architettura

Quattro superfici (portale, siti dei bagni, PWA, reception) su **API centralizzate** con
identità, autorizzazioni e contesto di struttura; backend modulare unico nel primo
rilascio (la separazione in servizi si valuta su esigenze misurate); **PostgreSQL fonte
autorevole dell'occupazione** (cache e realtime migliorano l'esperienza ma non concedono
il diritto di vendere); **outbox transazionale** tra modifiche degli ordini e job di
notifica; worker per email, scadenze riserve, pubblicazioni e riconciliazione. Provider
esterni: pagamenti, email/push, mappe, domini, media.

Stack: TypeScript con framework web moderno, sul modello del monorepo SweetHost
(pnpm + Turborepo; pacchetti `shared`, `ui`, `comms`, `db`). Versioni, hosting e librerie
si fissano al kickoff.

## Modello dati

| Entità | Scopo e vincolo essenziale |
|---|---|
| `Organization` / `Beach` | Soggetto e stabilimento; appartenenza esplicita per ogni risorsa riservata |
| `User` / `Membership` | Identità distinta dai ruoli per struttura; inviti e revoche |
| `Spot` / `SeasonContract` | Postazione e abbonamento valido per periodo; nessuna assegnazione sovrapposta incompatibile |
| `AvailabilityProposal` | Giornate proposte, autorizzazioni, ricorrenze, eccezioni |
| `InventoryDay` | **Riga autorevole unica** per struttura+postazione+data; stato e occupazione |
| `Hold` / `Booking` / `BookingItem` | Riserva temporanea, ordine, giornate; importi e condizioni memorizzati |
| `PriceRule` / `Promotion` | Regole versionate, periodi, canali, contatori di utilizzo |
| `Payment` / `Refund` / `Transfer` | Riferimenti provider, esiti, chiavi di idempotenza, tentativi |
| `LedgerEntry` / `Allocation` | Movimenti e ripartizioni senza modifica distruttiva |
| `Pass` / `AccessEvent` | Credenziale revocabile e passaggi; presenza distinta dall'ordine |
| `Site` / `Revision` / `Media` | Bozza, revisione pubblicata, materiali; conflitti controllati |
| `AuditEvent` / `SupportTicket` | Traccia delle azioni e anomalie correlate |

Vincoli che non possono restare nel frontend: unicità di `InventoryDay` sulla chiave
composta; coerenza struttura↔ordine↔postazione; importi non negativi salvo rettifiche;
quote riconciliate al totale; periodo valido dell'abbonamento; revisione pubblicata
appartenente allo stesso bagno. Ogni occupazione attiva si acquisisce sotto lock della
riga `InventoryDay`; i job non liberano una riga acquisita nel frattempo da un altro
ordine.

## Concorrenza e macchine a stati

Acquisizione di una giornata, in transazione: lock della riga (`SELECT FOR UPDATE`),
verifica autorizzazioni e stato, controllo prezzi e contingente condiviso, impegno
dell'eventuale promo, creazione della riserva. Più giornate: acquisizione in ordine
stabile (anti-deadlock), tutto o niente. **Mai una transazione database aperta durante
una chiamata di rete al provider.**

| Dimensione | Stati |
|---|---|
| Inventario | non pubblicabile; disponibile; riservato; occupato; bloccato |
| Prenotazione | in preparazione; in verifica; confermata; annullata; conclusa |
| Pagamento | non avviato; in corso; riuscito; fallito; in verifica |
| Rimborso | non richiesto; richiesto; in corso; completato; fallito |
| Presenza | atteso; dentro; fuori con rientro ammesso; terminato |

Scadenze valutate dal server anche se il job di pulizia è in ritardo. Pagamento riuscito
tardivo: riacquisizione atomica dell'inventario, altrimenti rimborso tracciato; nessun
pass senza disponibilità acquisita. Idempotenza: stessa richiesta + stessa chiave + stessi
parametri = stesso risultato; parametri diversi = errore esplicito; webhook duplicati non
creano quote o conferme aggiuntive.

## API, eventi e contratti

| Endpoint `/v1` | Comportamento atteso |
|---|---|
| `GET /beaches`, `/availability` | Dati pubblici filtrati; solo disponibilità autorizzate, prezzi calcolabili |
| `POST /quotes` | Preventivo con scadenza, dotazione, sconto, totale e versione condizioni |
| `POST /holds` | Acquisizione atomica; chiave di idempotenza; `hold_id` e `expires_at` |
| `POST /checkouts` | Avvio provider sul preventivo valido; nessuna fiducia negli importi del client |
| `POST /payment-webhooks` | Autenticazione provider, deduplicazione, processamento affidabile |
| `POST /bookings/{id}/cancel` | Valuta policy e conseguenze; annulla o apre rimborso tracciato |
| `POST /access-events` | Verifica pass e transizione presenza; niente ingressi duplicati |
| `POST /availability-proposals` | Controlla titolarità, periodo, ricorrenza e conflitti |
| `PUT /sites/{id}/draft` | Validazione contenuti e controllo della revisione attesa |
| `POST /sites/{id}/publish` | Pubblica revisione autorizzata; aggiorna cache e stato pubblico |
| `GET /reports` | Viste filtrate per struttura, ruolo e intervallo |

Errori coerenti (autenticazione mancante, permesso negato, conflitto di inventario,
preventivo scaduto, dati non validi, integrazione indisponibile) che non rivelano risorse
non autorizzate. Eventi minimi: `availability.published`, `hold.created`, `hold.expired`,
`booking.confirmed`, `booking.cancelled`, `refund.updated`, `access.registered`,
`site.published` — con id, versione schema, struttura, timestamp; consegna ripetibile,
consumatori idempotenti. OpenAPI generata dal codice e controllata in CI.

## Domini, PWA, SEO

IDN corretto: ombrè.com → `xn--ombr-8oa.com` (il precedente `xn--ombr-7na.com` è un
altro nome); proprietà e disponibilità non verificate. Certificati sui nomi effettivi
(la wildcard non copre l'apice né più livelli; il dominio personalizzato del bagno
richiede verifica dedicata). Tenant risolto da host verificato e slug autorizzato: un
host sconosciuto non apre il bagno sbagliato. PWA: manifest per struttura, scope separati
sul dominio condiviso; nessuna cache di risposte riservate o pagamenti; prenotazioni
offline solo con "ultimo aggiornamento" esplicito; vendite e verifica definitiva del pass
richiedono il server. Niente cookie condivisi tra domini estranei né token permanenti
negli URL: passaggio sito→account centrale con codici brevi monouso a scadenza. SEO:
pagine pubbliche renderizzabili, metadata e anteprime social, sitemap dei soli siti
attivi, canonical sull'host principale scelto; bozze, account e checkout esclusi; nessuna
recensione generata. Il dettaglio pagina per pagina (title, H1, indicizzazione, dati
strutturati, codici di stato, lingue), le domande dei clienti a cui ogni pagina deve
rispondere e i criteri per essere citati dagli assistenti AI sono in
[qualita-web.md](qualita-web.md).

## Sicurezza, privacy, continuità

- Contesto struttura e permessi verificati lato server per ogni API, job ed export; 2FA
  per i ruoli amministrativi; sessioni revocabili; recupero account controllato.
- Upload con tipi e dimensioni consentiti, metadati rimossi, contenuti non eseguibili;
  collegamenti validati e rich text sanitizzato.
- Token imprevedibili, limiti ai tentativi, webhook autenticati, segreti fuori dal
  codice; log senza password, dati di carte o token completi.
- Backup, monitoraggio, allarmi e prove di ripristino; aggiornamento dipendenze e
  scansione segreti nel processo di rilascio.
- Privacy by design: dati necessari per ruolo, conservazione per categoria, richieste
  degli interessati, accordi con i fornitori. Il gestore non vede tutta l'attività
  dell'ospite sul marketplace; lo stagionale non vede l'anagrafica completa degli ospiti.
- **Da affidare ai professionisti prima del reale**: compatibilità della condivisione con
  i contratti dello stabilimento, titolarità del servizio venduto, fiscalità delle quote,
  beneficiari dei pagamenti, informative privacy, responsabilità e coperture.

Obiettivi tecnici del pilota (da concordare e provare, non garanzie): ricerca < 2 s al
95° percentile; disponibilità 99,5% mensile; RPO 1 ora, RTO 4 ore.

## Indicatori

Offerta effettiva (giornate-postazione autorizzate al netto di blocchi), tasso di vendita
condivisa (vendute/vendibili), conversione (acquisti confermati / sessioni con
disponibilità), valore transato (rimborsi separati), ricavo piattaforma (canoni e
commissioni, rettifiche distinte), carico reception (tempo per operazione), qualità
(sovrapposizioni, reclami, rimborsi falliti, tempi di risoluzione).

Simulazione illustrativa, non previsione: 20 postazioni × 12 giorni condivisi = 240
giornate offerte; al 40% venduto e €27 medi → €2.592 transati e €259,20 di commissione
teorica al 10% per bagno; 30 bagni identici → €77.760 transati, €7.776 di commissioni.
L'attribuzione di ricavo incrementale richiede un confronto esplicito tra periodi e
canali comparabili, non un'etichetta automatica.

## Roadmap e impegno

| Fase | Risultato verificabile | Impegno ipotetico |
|---|---|---|
| Validazione | Partner, flusso economico e regole pronti per la specifica | 8–12 gg/persona |
| Design e contenuti | Flussi, componenti, template ed esempi coerenti | 12–18 gg/persona |
| Backend e inventario | Ruoli, prenotazioni, pagamenti, movimenti, API | 20–30 gg/persona |
| Interfacce operative | Portale, account, stagionale, reception, dashboard | 20–30 gg/persona |
| Siti ed editor | Template, revisioni, media, domini, pubblicazione | 10–16 gg/persona |
| Collaudo e avvio | Test integrati, correzioni, formazione, pilota | 12–18 gg/persona |

Totale di pianificazione 82–124 gg/persona; a una tariffa ipotetica di €400–600/g:
€32.800–74.400, con riserva 20% ≈ €39.400–89.300 (non preventivi; esclusi IVA,
consulenze, marketing, provider, infrastruttura, app native). Finestra indicativa 16–24
settimane. Lancio progressivo: ambiente di prova → test con personale → 3–5 bagni nella
stessa zona → gruppo di stagionali → prime transazioni controllate → verifica indicatori
→ ampliamento locale.

Percorso di adesione dello stabilimento: richiesta → verifica anagrafica e accordi →
configurazione inventario → import abbonamenti → prezzi e condizioni → configurazione
sito → prova completa di acquisto e annullamento → formazione reception → apertura
controllata.

## Collaudo: scenari di accettazione

| Prova | Risultato atteso |
|---|---|
| Due acquisti sulla stessa giornata | Al massimo un'occupazione valida; l'altro riceve un conflitto comprensibile |
| Reception e sito contemporanei | Stessa protezione transazionale, nessun canale privilegiato |
| Prezzo manipolato nel browser | Prevale l'importo del server |
| Ultimo utilizzo promo conteso | Cap rispettato anche con richieste simultanee |
| Pagamento riuscito tardivo | Riacquisizione sicura oppure rimborso tracciato |
| Webhook duplicato o fuori ordine | Nessuna conferma, quota o liquidazione duplicata |
| Ritiro di data riservata | Conflitto; disponibilità non rimossa sotto un checkout attivo |
| Accesso a un altro bagno | Rifiuto per API, media riservati, job ed export |
| Due editor sullo stesso sito | Conflitto di revisione, nessuna perdita silenziosa |
| Pubblicazione e ripristino | Bozza separata; sito coerente su un secondo dispositivo |
| Rimborso e trasferimenti | Movimenti riconciliati fino all'esito definitivo |
| Due scansioni del pass | Una sola transizione d'ingresso; uscita/rientro controllati |
| Chiusura e spostamento | Ordini individuati; nuova occupazione acquisita prima del rilascio |
| Accessibilità e smartphone | Percorsi completi da tastiera e vista a elenco; layout senza contenuti coperti |
| Pagine pubbliche lette senza script | Title, H1, canonical, contenuti essenziali e dati strutturati nell'HTML servito, uguali al testo visibile |
| Indicizzazione | Sitemap con le sole pagine pubbliche attive; aree riservate, checkout e anteprime esclusi e protetti dall'accesso |
| Prestazioni su mobile | LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 sulle pagine pubbliche |
| Ripristino dei dati | Backup recuperabile; inventario e rendiconto consistenti |

Ogni esecuzione conserva ambiente, versione del codice, dati di prova, risultato e
anomalie. Nessuna prova backend è superata dalla sola produzione delle tavole grafiche.

## Backlog di consegna e condizioni di avvio

Dimostrazioni richieste: tre siti dimostrativi con cambio template senza perdita e
pubblicazione verificata su secondo dispositivo; percorso completo proposta stagionale →
autorizzazione → acquisto → ingresso → maturazione quota; prenotazione al banco visibile
online con i medesimi vincoli; MARE10 applicata a €30 con totale €27 e cap concorrente
rispettato; ripartizione configurata e conservata, rimborso riconciliato; ruoli distinti
con prova di isolamento, audit e ripristino.

Materiale da consegnare: repository e licenze, migrazioni e schema, configurazione di
esempio senza segreti, istruzioni di sviluppo e rilascio, documentazione API, matrice
ruoli, guida gestore e reception, esiti dei test, procedura backup/restore, elenco
integrazioni e limiti. Ambienti e credenziali amministrative al committente.

Decisioni da chiudere prima delle vendite reali: marchio e domini; soggetto venditore e
trattamento delle quote; provider e beneficiari; cancellazioni, chiusure e maturazione;
responsabilità del supporto; condizioni e documenti; partner pilota e prova del percorso
completo. Soglie pilota proposte: zero sovrapposizioni imputabili al sistema, differenze
economiche identificate e risolte, nessuna vulnerabilità bloccante, personale pronto sui
casi di errore, intenzione di proseguire di almeno 4 partner su 5.
