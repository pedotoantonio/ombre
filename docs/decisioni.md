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

Questa cartella contiene oggi solo la documentazione, dentro il repository pizzaclic per
comodità di avvio. Prima del kickoff tecnico il progetto va spostato in un repository
dedicato (monorepo TypeScript sul modello SweetHost: pnpm + Turborepo, pacchetti
`shared`, `ui`, `comms`, `db`).
