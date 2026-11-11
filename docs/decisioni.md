# Registro delle decisioni (ADR)

Decisioni brevi, una per voce, come richiede il template SweetHost. Stato:
**accettata** | **proposta** | **superata**.

## D1 — Adozione del template SweetHost — accettata (10/11/2026)

Ombrè adotta i moduli di piattaforma di SweetHost così come sono (multi-tenant con RLS,
autenticazione con 2FA, ruoli applicati dall'API, audit, piani in `plan_feature` con
catalogo unico, console, i18n it/en, OpenAPI in CI) e riscrive solo il dominio.
Conseguenza: le entità rinominate sono postazione/`InventoryDay` (risorsa), `Booking`
(evento), ospite (persona servita), stagionale (partner). Catalogo completo in
[catalogo-moduli.md](catalogo-moduli.md).

## D2 — Il controllo resta al gestore — accettata (da v3.0)

La condivisione stagionale aggiunge un'opportunità senza togliere al gestore listino e
capacità: autorizzazioni per abbonamento o per giornata, contingente massimo giornaliero,
sospensione che ferma le vendite senza cancellare le prenotazioni. È il requisito
principale conservato da tutte le versioni del concept.

## D3 — PostgreSQL unica fonte autorevole dell'occupazione — accettata (da v3.0)

Una riga `InventoryDay` per struttura+postazione+data, occupazioni acquisite sotto lock
di riga (`SELECT FOR UPDATE`), acquisizioni multiple in ordine stabile, mai una
transazione aperta durante una chiamata al provider. Cache e realtime non concedono il
diritto di vendere.

## D4 — Backend modulare unico nel primo rilascio — accettata (da v3.0)

Un solo backend con moduli (catalogo/siti, inventario, prenotazioni, economia) e outbox
transazionale verso il worker. La separazione in servizi indipendenti si valuta solo su
un'esigenza misurata.

## D5 — Stati distinti per inventario, prenotazione, pagamento, rimborso, presenza — accettata (da v3.0)

Cinque macchine a stati separate: pagare non è entrare, riservare non è confermare.
La reception registra ingressi senza toccare il rendiconto.

## D6 — Pagamenti: sandbox nel MVP, provider marketplace da validare — proposta

Riferimento tecnico Stripe Connect (addebiti e trasferimenti separati). Modello
contrattuale, soggetto venditore, fiscalità delle quote e beneficiari vanno definiti con
professionisti prima delle transazioni reali. Nessun portafoglio prelevabile autonomo.

## D7 — Tre template controllati, niente editor libero — accettata (da v3.0)

Riviera, Boutique, Essential sullo stesso modello di contenuti; campi e sezioni validate,
niente codice arbitrario. Mantiene coerenza tra contenuti, accessibilità, velocità e
aggiornamenti del motore di prenotazione.

## D8 — Pilota locale prima dell'espansione — accettata (da v3.0)

Una sola area, 3–5 stabilimenti con referente, prima i siti diretti poi la ricerca
locale. Piani ipotetici da testare: A (€490 + 5%) e B (€0 + 10%), pareggio a €9.800.

## D9 — Dove vive il codice — proposta

Lo sviluppo è partito l'11/11/2026 dentro questa cartella del repository pizzaclic. La
cartella è autosufficiente (propri `package.json`, lockfile, `Dockerfile` e compose) e
non dipende dal resto del repository: si può spostare in un repository dedicato senza
modifiche. Lo spostamento resta da decidere.

## D10 — Requisiti di qualità web dal prompt del committente — accettata (11/11/2026)

Il prompt di miglioramento dei siti ([prompt-qualita-web.md](prompt-qualita-web.md)) è
applicato al progetto come requisiti e prove di accettazione
([qualita-web.md](qualita-web.md)): design e interazioni, accessibilità, prestazioni, SEO
tecnica, AEO e GEO. Non avvia lo sviluppo. Quando le pagine esisteranno, lo stesso prompt
si esegue sul codice a ogni rilascio delle pagine pubbliche. Conseguenza: sul sito si
pubblicano solo dati confermati; piani, percentuali e cifre della simulazione restano
fuori finché sono ipotesi.

## D11 — Indirizzi pubblici nuovi e crawler degli assistenti AI — proposta

Indirizzi non presenti nella v3.0: `/esplora/{località}`, `/come-funziona`,
`/per-gli-stabilimenti`, `/per-gli-stagionali`, `/assistenza`, `/chi-siamo`, prefisso
`/en/` per l'inglese. Le pagine pubbliche restano leggibili dai crawler dei motori di
risposta, condizione per poter essere citate. Entrambe le scelte spettano al committente.
Il codice usa già questi indirizzi, definiti in un solo file
(`packages/shared/src/i18n/routes.ts`): cambiarli è una modifica di poche righe.

## D12 — Due lingue dalla base: italiano e inglese — accettata (11/11/2026)

Decisione del committente. L'italiano è la lingua predefinita e non ha prefisso;
l'inglese sta sotto `/en/` con indirizzi tradotti (`/en/how-it-works`). Ogni testo
dell'interfaccia vive nei dizionari di `packages/shared`; un test verifica che le due
lingue abbiano le stesse chiavi e lo stesso numero di voci. `/it/...` reindirizza in modo
permanente all'indirizzo senza prefisso, così ogni pagina ha un solo indirizzo.

## D13 — Scelte tecniche di avvio — accettata (11/11/2026)

Node 22, pnpm 12, Turborepo, TypeScript 6 in modalità strict (la 7 non è ancora
supportata dagli strumenti di lint), Next.js 16 con pagine pubbliche prerenderizzate,
React 19, Vitest. CSS con token propri, senza framework grafico. Il nome della
piattaforma viene solo dalla configurazione (`OMBRE_BRAND_NAME`), mai scritto nei testi.
Tutto gira in container: immagine a più stadi, utente non root, file system in sola
lettura. I reindirizzamenti permanenti usano il codice 308, equivalente al 301.

## D14 — Database e API del primo incremento — accettata (11/11/2026)

PostgreSQL 18 in container. Le migrazioni sono file SQL scritti a mano e applicati in
ordine: sono la fonte autorevole dello schema, perché ruoli, vincoli e RLS si leggono
meglio in SQL. Drizzle dà i tipi alle query. La colonna del tenant si chiama `beach_id`
(lo stabilimento) e ogni tabella operativa ha la propria regola RLS; l'API usa il ruolo
`ombre_app`, che non è proprietario delle tabelle e non può aggirare le regole.
L'acquisizione di una giornata blocca prima la riga `inventory_day`, poi la promozione,
sempre in quest'ordine. API con Hono e validazione zod, distribuita come un solo file.
La riserva dura 10 minuti, modificabile con `OMBRE_HOLD_MINUTES`.

## D15 — Coda dei lavori in PostgreSQL, senza Valkey — accettata (11/11/2026)

Il template SweetHost usa BullMQ su Valkey. Per il primo rilascio di Ombrè la coda è una
tabella `outbox` nello stesso database: la riga viene scritta nella transazione che
conferma la prenotazione, quindi una notifica non si perde e non parte per una modifica
annullata. Il worker prende i lavori con `FOR UPDATE SKIP LOCKED`, li ritenta con attesa
crescente e li abbandona al quinto errore. Un servizio in meno da gestire e da mettere in
backup; il passaggio a BullMQ si valuta quando i volumi lo richiedono.

## D16 — Accessi, sessioni e firme — accettata (11/11/2026)

Le password sono verificate dentro il database (bcrypt di pgcrypto) da funzioni
dedicate: il ruolo dell'API non legge mai un hash e non può aprire una sessione senza la
password giusta. Blocco al quinto errore per 15 minuti. I token di sessione sono casuali
e in tabella ne resta solo l'impronta. I collegamenti alle prenotazioni e i pass sono
firmati con `OMBRE_SIGNING_SECRET`, così non serve conservare un segreto per riga e un
pass non si può indovinare. Manca ancora il secondo fattore per gestore e
amministratore, richiesto dal template.

