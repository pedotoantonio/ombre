# Prompt operativo: scheda, planner, generazione in blocco

Iterazione del 17/11/2026 sulla [specifica](specifica-console-planner.md),
decisioni D32–D34. Metodo a ruoli, nell'ordine: backend → frontend →
collaudo. Un commit per incremento verificato, messaggi in italiano che
iniziano con «Ombrè: …», mai push.

## Incrementi

- **C1 — Scheda e occupazione**: `spotCard` in `operations.ts`, rotta
  `GET /v1/manage/beaches/:slug/operations/spot`, scheda in `operations.tsx`
  con azioni per stato, percentuale di occupazione nel riepilogo.
- **C2 — Planner**: `plannerGrid` in `packages/db/src/planner.ts`, rotta
  `GET /v1/manage/beaches/:slug/planner`, pagina `planner` con slug
  localizzati, link dalla gestione e dalla console.
- **C3 — Generazione in blocco**: `addRows` in `layout.ts`, rotta
  `POST /v1/manage/beaches/:slug/layout/rows/bulk`, azione web
  `spiaggia-file`, modulo «Aggiungi più file» in `beach-layout.tsx`.

Ogni incremento è consegnabile da solo. Contratto delle rotte: 93 → 94 (C1)
→ 95 (C2) → 96 (C3), con OpenAPI aggiornato a ogni passo.

## Regole per gli agenti

- Leggere prima la specifica e le decisioni D20, D25, D28, D31–D34; i file
  citati nella specifica sono la mappa del codice.
- Nessuna migrazione di schema prevista: se un incremento sembrasse
  richiederne una, fermarsi e riferire.
- Pagine complete senza JavaScript; in console vale la deroga D28.
- i18n speculare it/en; `pnpm check` e i test con database verdi prima di
  ogni commit.
- Il collaudo ripete i criteri 0–4 della specifica sull'ambiente
  `ombre-collaudo` (web 3232, API 3231) e verifica la console anche a
  script spenti.
