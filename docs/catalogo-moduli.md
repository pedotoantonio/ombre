# Catalogo dei moduli — template SweetHost applicato a Ombrè

Questo documento applica a Ombrè il *Template funzionalità da SweetHost* (35 moduli su
6 strati più i requisiti trasversali). Per ogni modulo è segnata la decisione:
**uguale** (si riusa com'è), **da adattare** (si riusa cambiando entità o regole),
**specifico** (va scritto per Ombrè), **fase successiva** (nel disegno ma fuori dal primo
rilascio), **non serve**. I moduli adottati nel primo rilascio hanno una
[scheda modulo](schede-moduli.md).

Regola d'oro ereditata da SweetHost: ciò che un piano include sta in una tabella del
database (`plan_feature`) e in un catalogo unico (`feature-catalog.ts`), mai sparso nel
codice.

## Strato Piattaforma (riuso quasi identico)

| # | Modulo | In SweetHost | In Ombrè | Decisione |
|---|---|---|---|---|
| 1 | Multi-tenant | Database condiviso, `tenant_id` su ogni tabella, RLS, tenant risolto da host o token | Identico: il tenant è lo stabilimento; risolto da host verificato (dominio del bagno) o slug `/bagni/{slug}` | **Uguale** |
| 2 | Autenticazione | Argon2id, 2FA TOTP obbligatorio per il titolare, codici di recupero, link magico, blocco tentativi, sessioni revocabili | Identico; 2FA obbligatorio per gestore e admin; link magico/codice per l'area ospite; una revoca invalida anche le sessioni aperte | **Uguale** |
| 3 | Ruoli e permessi | Titolare, Staff, Pulizie, Proprietario; è l'API a rifiutare | Admin piattaforma, Responsabile cooperativa, Gestore, Reception, Contabilità, Stagionale, Ospite; account distinto dall'appartenenza, inviti con scadenza e revoca | **Da adattare** (nomi e matrice) |
| 4 | Registro attività | Audit delle azioni sul tenant | `AuditEvent`: ogni azione di reception/gestione registra operatore, struttura, motivo e risultato | **Uguale** |
| 5 | Accesso di supporto | "Vedi come" con motivo registrato | Identico, con durata limitata, ambito e registro consultabile dai responsabili | **Uguale** |
| 6 | Piani, limiti e catalogo | 4 piani, `plan_feature`, limiti, catalogo unico sito+pannello | Piano A (€490 + 5%), Piano B (€0 + 10%), Gruppi da concordare; limiti su postazioni condivise pubblicabili, utenti, MB media; **canoni e commissioni versionati, mai retroattivi** | **Uguale** (cambiano voci e prezzi) |
| 7 | Iscrizione e prova | Self-service con prova gratuita | Adesione con verifica: richiesta → verifica anagrafica e accordi → configurazione → prova completa → apertura controllata. Non self-service nel pilota | **Da adattare** |
| 8 | Admin di piattaforma | Tenant, piani, partner, metriche MRR | Console centrale: partner (candidato→attivo→sospeso), gruppi, piani, attivazioni, anomalie, supporto, indicatori | **Uguale** |
| 9 | Lingue | it/en ovunque (i18n in shared) | Identico | **Uguale** |
| 10 | API pubblica | REST `/v1`, OpenAPI generata e controllata in CI | Identico (contratti in [progetto.md §API](progetto.md#api-eventi-e-contratti)) | **Uguale** |

## Strato Dominio (da riscrivere con le entità di Ombrè)

| # | Modulo | In SweetHost | In Ombrè | Decisione |
|---|---|---|---|---|
| 11 | Risorse vendibili | Strutture e alloggi | Stabilimenti e postazioni (`Spot`): fila, dotazione (ombrellone, lettini), capienza | **Da adattare** |
| 12 | Disponibilità e tariffe | Planning, tariffe, notti minime | `InventoryDay`: riga autorevole unica per struttura+postazione+data; giornata intera nel MVP; `PriceRule` versionate; contingente massimo di condivise per giorno | **Da adattare** |
| 13 | Ordini / prenotazioni | Prenotazioni con stati, incassi collegati | `Hold`/`Booking`/`BookingItem` con 5 macchine a stati distinte (inventario, prenotazione, pagamento, rimborso, presenza); prezzo, condizioni e promo salvati nell'ordine | **Da adattare** |
| 14 | Anagrafica clienti | Scheda ospite, storico, check-in online | Scheda ospite con prenotazioni e pass; dati minimi prima del pagamento | **Da adattare** |
| 15 | Sincronizzazione esterna | iCal Booking/Airbnb/Vrbo | Non nel MVP: con gestionali balneari terzi si sceglie la fonte autorevole o un contingente esclusivo; un import periodico non basta a evitare doppie vendite | **Fase successiva** |
| 16 | Promozioni | Offerte dal preventivo | `Promotion`: intervallo di acquisto distinto dall'intervallo di fruizione, canali, cap concorrente, una fruizione per account, politica di ripristino (esempio di riferimento: MARE10) | **Da adattare** |
| 17 | Prezzi dinamici | Suggerimenti stagione/occupazione | Escluso dal primo rilascio (niente automatismi predittivi) | **Fase successiva** |
| 18 | **Condivisione stagionale** | — (non esiste in SweetHost) | Il cuore di Ombrè: `SeasonContract`, `AvailabilityProposal`, ricorrenze con eccezioni, approvazione per abbonamento o per giornata, ritiro solo senza occupazioni attive, maturazione quota separata | **Specifico** (nuovo modulo) |

## Strato Canali

| # | Modulo | In SweetHost | In Ombrè | Decisione |
|---|---|---|---|---|
| 19 | Portale white label | Sito su `nome.sweethost.it` | Doppia natura: portale centrale a marchio Ombrè (ricerca e marketplace) + sito del bagno con identità del bagno dominante e firma discreta "Prenotazioni con Ombrè" | **Da adattare** |
| 20 | Template e personalizzazione | Template per tipo di struttura, controllo contrasto | Tre template (Riviera, Boutique, Essential) sullo stesso modello di contenuti; editor a campi e sezioni controllate, niente codice arbitrario; revisioni con conflitto di versione | **Da adattare** |
| 21 | Dominio personalizzato | CNAME + HTTPS automatico | Identico; host verificato, scelta dell'host principale, canonical coerenti; IDN: ombrè.com → `xn--ombr-8oa.com` | **Uguale** |
| 22 | SEO e accessibilità | Dati strutturati, sitemap, WCAG 2.1 AA | Identico ma su WCAG **2.2** AA; sitemap dei soli siti attivi; bozze e checkout esclusi dall'indice | **Uguale** |
| 23 | Vendita diretta | Disponibilità reale e prezzo finale prima della richiesta | Prezzo "da" corrispondente a una postazione realmente acquistabile; preventivo calcolato sul server con scadenza; riserva di 10 minuti | **Da adattare** |
| 24 | Area cliente | Prenotazioni sul portale, codice o link magico | Area ospite: prenotazioni, pass, assistenza, profilo; annullamento con conseguenze mostrate prima | **Uguale** |
| 25 | Contenuti e guida | Welcome Book | Sezioni del sito: stabilimento, servizi, accessibilità, offerte, FAQ, contatti, documenti collegati al checkout | **Da adattare** |
| 26 | Schermi in sede | Info Wall PWA kiosk | Non nel primo rilascio | **Fase successiva** |
| 27 | App mobile | App ospiti Expo | PWA installabile nel MVP (manifest per bagno, scope separati); app native per store dopo | **Da adattare** (PWA) |

## Strato Comunicazioni

| # | Modulo | In SweetHost | In Ombrè | Decisione |
|---|---|---|---|---|
| 28 | Email automatiche | Conferma, promemoria, istruzioni nella lingua del cliente | Conferma con pass, promemoria, esito annullamento/rimborso; modelli distinti operativi/promozionali | **Uguale** |
| 29 | Inbox unica | Conversazioni con presa in carico | Non nel MVP; il supporto passa dai ticket della console | **Fase successiva** |
| 30 | WhatsApp e push | Dal numero della struttura | Non nel MVP (le push PWA si valutano nel pilota) | **Fase successiva** |
| 31 | Assistente AI | Risposte dalle informazioni pubblicate | Non nel MVP | **Fase successiva** |

## Strato Operazioni

| # | Modulo | In SweetHost | In Ombrè | Decisione |
|---|---|---|---|---|
| 32 | Compiti operativi | Pulizie a ogni check-out, manutenzioni | Reception: registro ingressi (pass/QR con transizione atomica), uscita/rientro, spostamento postazione, blocchi manutenzione — tutto sullo stesso inventario del sito | **Da adattare** |
| 33 | Area partner | Proprietari: quote e rendiconti, sola lettura | Area stagionale: abbonamenti, calendario, proposte, prenotazioni collegate (senza dati personali non necessari), quote previste/maturate | **Da adattare** |
| 34 | Report ed export | Occupazione, ADR, RevPAR, Excel/CSV | Indicatori propri: offerta effettiva, tasso di vendita condivisa, conversione, transato, ricavo piattaforma, carico reception, qualità; export CSV con id stabili | **Da adattare** (indicatori) |

## Strato Soldi e adempimenti

| # | Modulo | In SweetHost | In Ombrè | Decisione |
|---|---|---|---|---|
| 35 | Incassi e rimborsi | Bonifico, contanti, Satispay, PayPal registrati | Checkout sandbox nel MVP; provider marketplace (riferimento tecnico: Stripe Connect, da validare) per addebiti e trasferimenti separati; stati economici previsto→maturato→liquidato / sospeso / rettificato; ledger immutabile e riconciliazione giornaliera | **Specifico** |
| 36 | Adempimenti di legge | Alloggiati Web, imposta di soggiorno, ISTAT, CIN | Da definire con professionisti prima delle vendite reali: soggetto venditore, trattamento fiscale delle quote, documenti; **nessuna attestazione di conformità nel progetto** | **Specifico** (dipendenza esterna) |

Moduli API aggiuntivi di SweetHost: **GDPR/privacy** si adotta (dati minimi per ruolo,
conservazione per categoria, richieste degli interessati); **leads** diventa la richiesta
di adesione degli stabilimenti; **recensioni** in fase successiva (niente valutazioni
generate per riempire le schede).

## Requisiti trasversali (si copiano senza adattamenti)

| Area | Requisito | Come (da SweetHost) |
|---|---|---|
| Isolamento | Nessun dato di un bagno visibile a un altro | `tenant_id` ovunque, RLS attiva, `SET LOCAL app.tenant_id` a ogni transazione; test di isolamento nella definizione di fatto |
| Sicurezza | Verifica contro uno standard | Revisione OWASP ASVS 4.0.3 livello 2, test black-box in `tests/security` |
| Segreti | Mai nel repository | `.env*` e `secrets/` esclusi; Docker secrets in `/run/secrets`; nessuna chiave live sullo staging |
| Container | Superficie minima | Solo il proxy espone 80/443; reti separate, backend senza Internet, egress solo per i provider; container non root, read-only, no-new-privileges, healthcheck e limiti |
| Dati | Backup verificati | pgBackRest/restic, prova di ripristino mensile, procedura nel runbook (obiettivo pilota: RPO 1 ora, RTO 4 ore) |
| Osservabilità | Sapere quando qualcosa non va | Health su API e worker, metriche Prometheus interne, Grafana, Loki, GlitchTip, allarmi con risposta scritta |
| Code | Lavoro lento fuori dalla richiesta | Worker BullMQ: email, scadenza riserve, pubblicazione siti, riconciliazione — con outbox transazionale |
| Contratto API | Documentazione sempre allineata | OpenAPI rigenerata dal codice, la CI fallisce se è obsoleta |
| Qualità | Una definizione di fatto unica | TypeScript strict, nessun `any`, lint e typecheck puliti, copertura ≥ 80% sul dominio, i18n it/en, docs aggiornate |
| Decisioni | Ogni scelta non ovvia è scritta | ADR brevi in [decisioni.md](decisioni.md), stato in [stato.md](stato.md) |
| Carico | Capacità misurata | Prove k6 in `tests/load` (obiettivo pilota: ricerca < 2 s al 95° percentile su dataset concordato) |
| Vendita | Demo senza rischi | Stabilimento demo dal seed ("Bagno delle Dune"); ambiente dimostrativo etichettato |
| Onestà commerciale | Il sito non promette ciò che il codice non fa | Stato "in arrivo" nel catalogo; un test fallisce se un testo cita una funzione in arrivo senza dirlo |

## Checklist di adozione

Le prime cinque voci si completano **prima** di scrivere codice di dominio.

- [x] Catalogo compilato: ogni modulo segnato uguale, da adattare, specifico o non serve
- [x] Entità del dominio rinominate (postazione/giornata, prenotazione, ospite, stagionale)
- [x] Ruoli definiti con cosa ciascuno può e non può fare ([progetto.md §Ruoli](progetto.md#ruoli-e-responsabilità)); da applicare dall'API
- [ ] Piani e limiti in `plan_feature`, catalogo unico per portale e pannello
- [x] Una scheda modulo per ogni modulo adottato, con "cosa resta manuale" ([schede-moduli.md](schede-moduli.md))
- [ ] `tenant_id` e RLS su ogni tabella, test di isolamento tra stabilimenti verde
- [ ] Autenticazione con 2FA per gestore e admin, blocco tentativi, sessioni revocabili
- [ ] Registro attività e accesso di supporto con motivo
- [ ] Segreti fuori dal repository, Docker secrets in produzione
- [ ] Container non root e read-only, reti separate, solo il proxy su 80/443
- [ ] Backup automatico con almeno una prova di ripristino riuscita
- [ ] Health, metriche interne e allarmi
- [ ] OpenAPI generata e controllata in CI
- [ ] Stabilimento demo dal seed
- [ ] Testi in italiano e inglese
- [x] Registro delle decisioni e documento di stato aperti
