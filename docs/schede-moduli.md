# Schede dei moduli del primo rilascio

Formato della scheda preso dal template SweetHost (`feature-catalog.ts`): una chiave di
piano, uno stato onesto (disponibile o in arrivo) e il campo **"Cosa resta manuale"**,
che evita le promesse sbagliate. Oggi ogni modulo è **in arrivo**: nessuna funzione è
stata costruita. I moduli di piattaforma (multi-tenant, autenticazione, audit, supporto,
piani, console, i18n, API) seguono le schede SweetHost con la sola rinomina delle entità
e non sono ripetuti qui.

### Ricerca e portale

- **Id**: `marketplace_search`
- **Strato**: Canali
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: tutti i piani (la visibilità sul portale è parte dell'adesione)
- **Piano minimo**: —
- **Limite**: nessuno
- **Ruoli**: pubblico in lettura; nessuna scrittura

**In una frase**: l'ospite trova i bagni della zona con disponibilità e prezzo reali per
data e numero di persone.

**Cosa fa esattamente**: ricerca per località, giorno, ospiti; filtri per servizi e tipo
di disponibilità; schede con prezzo "da" corrispondente a una postazione acquistabile;
mappa e lista sulla stessa selezione; nessun risultato → alternative senza cambiare
silenziosamente la richiesta.

**Cosa resta manuale**: la qualità di foto e descrizioni dipende dal gestore; la
posizione precisa dell'utente è facoltativa.

**Dati**: lettura su `Beach`, `Spot`, `InventoryDay`, `PriceRule`, `Promotion`.
**API**: `GET /v1/beaches`, `GET /v1/availability` (pubbliche, filtrate).
**Lavori in coda**: ricalcolo cache di disponibilità aggregata.
**Integrazioni esterne**: mappe (provider da scegliere).
**Test minimi**: prezzo "da" sempre acquistabile; nessuna disponibilità non autorizzata esposta;
title, H1, canonical e contenuti essenziali presenti nell'HTML servito; ricerche con
parametri non indicizzabili ([qualita-web.md §5](qualita-web.md#5-seo-tecnica-delle-pagine-pubbliche)).
**Testi**: it/en per ricerca, filtri, assenza risultati.

### Inventario e disponibilità

- **Id**: `inventory`
- **Strato**: Dominio
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: tutti i piani
- **Piano minimo**: —
- **Limite**: postazioni per struttura secondo piano
- **Ruoli**: gestore scrive; reception opera; stagionale propone; ospite legge il pubblico

**In una frase**: una sola fonte autorevole dell'occupazione per sito, portale e banco.

**Cosa fa esattamente**: una riga `InventoryDay` unica per struttura+postazione+data con
stati non pubblicabile / disponibile / riservato / occupato / bloccato; ogni occupazione
attiva acquisita sotto lock di riga; contingente massimo di condivise per giorno protetto
transazionalmente; righe precreate per la stagione o create con unicità e retry.

**Cosa resta manuale**: con un gestionale terzo il gestore sceglie la fonte autorevole o
riserva a Ombrè un contingente esclusivo; l'import periodico non evita doppie vendite.

**Dati**: `Spot`, `InventoryDay` (chiave composta unica), blocchi manutenzione.
**API**: interno a `/v1/holds`, `/v1/availability`; blocchi da `/gestione`.
**Lavori in coda**: rilascio riserve scadute (scadenza comunque valutata dal server).
**Integrazioni esterne**: nessuna nel MVP.
**Test minimi**: due acquisti concorrenti → una sola occupazione; reception e sito con la
stessa protezione; job che non libera righe riacquisite.
**Testi**: stati e motivi di blocco in it/en.

### Condivisione stagionale

- **Id**: `season_sharing`
- **Strato**: Dominio (specifico di Ombrè)
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: `season_sharing`
- **Piano minimo**: tutti i piani del pilota
- **Limite**: massimo giornaliero di postazioni condivise per struttura
- **Ruoli**: stagionale propone sul proprio abbonamento; gestore autorizza e configura;
  ospite vede solo le giornate pubblicate

**In una frase**: lo stagionale propone le giornate in cui non c'è, il gestore le
autorizza, e diventano acquistabili senza perdere il controllo dell'inventario.

**Cosa fa esattamente**: `SeasonContract` collega titolare verificato, bagno, stagione,
postazione e periodo; proposte singole o ricorrenti espanse in giornate con eccezioni e
riepilogo prima del salvataggio; approvazione per abbonamento (entro limiti) o per
giornata; ritiro solo senza riserve o prenotazioni; cambio postazione dopo la risoluzione
delle prenotazioni future; alla scadenza del contratto cessano le proposte, restano
storia e rendiconti.

**Cosa resta manuale**: la verifica di contratto, periodo e postazione resta al gestore
(il numero dell'ombrellone da solo non abilita); la compatibilità della condivisione con
i contratti dello stabilimento va verificata con professionisti.

**Dati**: `SeasonContract`, `AvailabilityProposal` (ricorrenza, eccezioni, stato).
**API**: `POST /v1/availability-proposals` (titolarità, periodo, conflitti).
**Lavori in coda**: espansione ricorrenze; notifiche di approvazione.
**Integrazioni esterne**: nessuna.
**Test minimi**: ritiro di data riservata → conflitto; proposta fuori periodo → rifiuto;
contingente rispettato sotto concorrenza.
**Testi**: "Condividi le date libere", riepiloghi e conflitti in it/en.

### Prenotazione e checkout

- **Id**: `booking_checkout`
- **Strato**: Dominio
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: tutti i piani
- **Piano minimo**: —
- **Limite**: nessuno
- **Ruoli**: ospite compra; reception inserisce al banco; gestore configura condizioni

**In una frase**: dall'esplorazione al pass in tre passi, con prezzo e condizioni salvati
nell'ordine.

**Cosa fa esattamente**: preventivo server con scadenza (`POST /v1/quotes`); riserva di
10 minuti dopo acquisizione dell'inventario (`POST /v1/holds`, idempotente); checkout sul
preventivo valido (`POST /v1/checkouts`); cinque macchine a stati distinte (inventario,
prenotazione, pagamento, rimborso, presenza); annullamento con policy valutata e
conseguenze mostrate prima; ordine che conserva prezzo, condizioni, quote e promo.

**Cosa resta manuale**: nel MVP il pagamento è in sandbox; il provider reale si attiva
dopo la configurazione contrattuale; gli esiti incerti finiscono in "Pagamento in
verifica" e possono richiedere il supporto.

**Dati**: `Hold`, `Booking`, `BookingItem`, `Payment`, `Refund`.
**API**: `quotes`, `holds`, `checkouts`, `payment-webhooks`, `bookings/{id}/cancel`.
**Lavori in coda**: scadenza riserve, riconciliazione esiti, email di conferma (outbox).
**Integrazioni esterne**: provider pagamenti (sandbox nel MVP; Stripe Connect da validare).
**Test minimi**: prezzo manipolato nel browser rifiutato; pagamento tardivo →
riacquisizione o rimborso; webhook duplicato senza effetti.
**Testi**: passi del checkout, errori e condizioni in it/en.

### Promozioni

- **Id**: `promotions`
- **Strato**: Dominio
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: `promotions`
- **Piano minimo**: tutti i piani del pilota
- **Limite**: cap di utilizzi per promozione; una fruizione per account verificato
- **Ruoli**: gestore crea e disattiva; ospite usa; backend valida

**In una frase**: sconti con regole verificabili, applicati dal preventivo e mai
ricalcolati a sorpresa.

**Cosa fa esattamente**: campi completi (codice, stato, intervallo di acquisto distinto
da quello di fruizione, giorni, strutture, zone, postazioni, canali, importo/percentuale,
spesa minima, cap, politica di ripristino); eleggibilità al preventivo, impegno alla
riserva, consumo alla conferma, rilascio alla scadenza; cap condiviso tra portale e sito
diretto; link/QR campagna senza dati personali; disattivazione che non tocca gli acquisti
confermati.

**Cosa resta manuale**: niente campagne verso contatti importati senza base giuridica e
preferenze; gli extra (consumazioni, noleggi) sono esclusi dal MVP se non gestibili.

**Dati**: `Promotion` con contatori di utilizzo.
**API**: validazione dentro `quotes`/`holds`; gestione da `/gestione`.
**Lavori in coda**: rilascio utilizzi scaduti.
**Test minimi**: ultimo utilizzo conteso → cap rispettato; promo non applicabile →
motivo specifico e prezzo da riaccettare.
**Testi**: condizioni dell'offerta in it/en.

### Pass e reception

- **Id**: `pass_reception`
- **Strato**: Operazioni
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: tutti i piani
- **Piano minimo**: —
- **Limite**: nessuno
- **Ruoli**: reception registra; gestore/delegato sposta; contabilità legge

**In una frase**: la reception verifica i pass e lavora sull'inventario del sito, con
ogni azione tracciata.

**Cosa fa esattamente**: pass con token opaco verificato sul server (QR senza dati
personali; codice breve assistito con limite tentativi); ingresso come transizione
atomica (due scansioni ≠ due ingressi); uscita/rientro secondo politica; inserimento al
banco, blocco manutenzione e spostamento nella stessa transazione; presenza distinta da
pagamento e prenotazione; vista "oggi" e planimetria senza nomi completi.

**Cosa resta manuale**: con rete o piattaforma giù si sospendono le vendite e si usa la
procedura di emergenza (elenco minimo, responsabile, riconciliazione dopo); il no-show
non è dedotto dalla sola mancata scansione; nessuna validazione offline promessa senza
protocollo dedicato.

**Dati**: `Pass`, `AccessEvent`, `AuditEvent`.
**API**: `POST /v1/access-events`.
**Lavori in coda**: chiusura giornata con verifica operatore.
**Test minimi**: doppia scansione → un ingresso; pass annullato rifiutato con motivo;
spostamento acquisisce prima di rilasciare.
**Testi**: stati presenza e motivi di rifiuto in it/en.

### Sito del bagno ed editor

- **Id**: `site_builder`
- **Strato**: Canali
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: `site_builder`; `custom_domain` separata
- **Piano minimo**: tutti i piani (dominio personalizzato: da definire)
- **Limite**: MB di media per piano
- **Ruoli**: gestore modifica e pubblica; reception legge; ospite vede il pubblicato

**In una frase**: il bagno ha un sito con la propria identità, tre template e
pubblicazione controllata con revisioni.

**Cosa fa esattamente**: entità `Site`/`Revision`/`Section`/`Media`/`Translation`; flusso
bozza → validazione → anteprima protetta → pubblicazione → invalidazione cache; ripristino
come nuova revisione; tre template (Riviera, Boutique, Essential) sullo stesso contenuto;
campi validati senza script arbitrari; colori con controllo contrasto; conflitto di
versione tra editor concorrenti; dominio personalizzato con host verificato e canonical
coerenti.

**Cosa resta manuale**: fotografie autorizzate, testi alternativi e informazioni di
accessibilità veritiere restano responsabilità del gestore; la registrazione del dominio
è del bagno.

**Dati**: `Site`, `Revision`, `Section`, `Media`, `Translation`.
**API**: `PUT /v1/sites/{id}/draft`, `POST /v1/sites/{id}/publish`.
**Lavori in coda**: pubblicazione, invalidazione cache, elaborazione media.
**Integrazioni esterne**: DNS/HTTPS per domini personalizzati; storage media.
**Test minimi**: due editor → conflitto; pubblicazione verificata su secondo dispositivo;
anteprime scadute non accessibili; `LocalBusiness` generato dai soli campi compilati e
uguale al testo visibile; un solo indirizzo canonico per bagno; bagno sospeso fuori dalla
sitemap; i tre template entro le soglie di prestazione e contrasto
([qualita-web.md](qualita-web.md)).
**Testi**: editor e stati di pubblicazione in it/en.

### Economia e rendiconto

- **Id**: `ledger_payouts`
- **Strato**: Soldi e adempimenti
- **Stato**: in prova (funziona nell'ambiente dimostrativo, non in produzione)
- **Chiave di piano**: tutti i piani
- **Piano minimo**: —
- **Limite**: nessuno
- **Ruoli**: contabilità legge e riconcilia; gestore legge; stagionale vede le proprie quote

**In una frase**: ogni euro ha uno stato, una storia immutabile e una riconciliazione
quotidiana.

**Cosa fa esattamente**: ripartizione per ordine con piano e percentuali conservati;
calcoli in centesimi con arrotondamento deterministico e residuo esplicito; stati
previsto / maturato / sospeso / liquidazione in corso / liquidato / rettificato;
maturazione separata da prenotazione e ingresso; registro eventi immutabile
(`LedgerEntry`/`Allocation`); confronto giornaliero ordini ↔ provider ↔ registro con
differenze motivate; export con id stabili.

**Cosa resta manuale**: soggetto venditore, fiscalità delle quote, beneficiari e
liquidazioni si definiscono con professionisti e provider prima delle transazioni reali;
gli export non sostituiscono i documenti fiscali.

**Dati**: `LedgerEntry`, `Allocation`, `Transfer`.
**API**: `GET /v1/reports` (filtri per struttura, ruolo, periodo).
**Lavori in coda**: maturazione a fine giornata, riconciliazione, liquidazioni.
**Integrazioni esterne**: provider pagamenti (trasferimenti separati, da validare).
**Test minimi**: quote riconciliate al totale; rimborso con movimenti compensativi, mai
cancellazioni; webhook duplicato senza doppie quote.
**Testi**: stati economici e rendiconti in it/en.
