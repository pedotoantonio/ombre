# Prompt di modifica e miglioramento — iterazione dal confronto con un gestionale di mercato

Prompt operativo per realizzare la
[specifica del confronto](specifica-confronto-gestionale.md) con agenti per
ruolo, come nelle iterazioni precedenti. Chi esegue legge prima la specifica,
[stato.md](stato.md), [decisioni.md](decisioni.md) e
[qualita-web.md](qualita-web.md).

## Ruoli e ordine

1. **Product/UX** — rivede la specifica prima di ogni riga di codice: coerenza
   col prodotto, flussi senza JavaScript, accessibilità, rischi di perimetro.
   I rilievi si recepiscono nella specifica, che poi si committa.
2. **Backend/dati** — per ciascuna ondata: migrazioni SQL a mano (continuano la
   numerazione in `packages/db/migrations/`), specchio Drizzle, GRANT e RLS,
   moduli in `packages/db/src`, rotte API in `apps/api` con zod, test (i test
   con database girano con `pnpm test:db`), conteggio del test di contratto
   aggiornato. Nessun campo gestionale nelle risposte pubbliche.
3. **Frontend/web** — per ciascuna ondata: pagine in `apps/web` (slug localizzati
   in `routes.ts`, testi nei dizionari it/en di `packages/shared`), moduli
   GET/POST senza JavaScript, stile dai token di `packages/ui`, obiettivi
   ≥ 44×44 px, mai solo colore.
4. **Collaudo** — per ciascuna ondata: `pnpm check`, `pnpm test:db`, ambiente di
   prova (`ombre-collaudo`, vedi sotto), controlli fumo
   (`scripts/collaudo.sh`), verifica puntuale dei criteri della specifica,
   difetti corretti con test di regressione; alla fine dell'iterazione le
   schermate (desktop e larghezza telefono) in `docs/schermate/`.

## Regole fisse

- Un **commit per incremento verificato**, messaggio in italiano che inizia con
  «Ombrè: …», con la riga `Co-Authored-By` in uso. **Nessun push.**
- Ordine delle ondate: prima la A (operativa), poi la B (commerciale); ogni
  ondata dev'essere consegnabile da sola. Dentro la B, **tre incrementi**
  nell'ordine B1 convenzioni → B2 extra → B3 pagamenti multipli/acconti,
  ciascuno committato e consegnabile da solo; la **prima attività di B3 è il
  modello dei pagamenti multipli** (scopo sul pagamento, residuo, webhook per
  scopo), perché ogni altra cosa di B3 ci poggia sopra.
- Il collaudo della console operativa ripete il giro completo del criterio 1
  **a script spenti**, non solo «la pagina si apre».
- Le decisioni nuove si aggiungono a [decisioni.md](decisioni.md) (da D28);
  [stato.md](stato.md) si aggiorna a fine iterazione.
- Ambiente di prova: progetto compose `ombre-collaudo` con `.env.collaudo`
  (sito 3232, API 3231), già acceso; i dati dimostrativi si rigenerano con il
  seed. Non toccare `ombre-demo`.
- Vincoli trasversali della specifica (§5) sempre validi; in dubbio decide la
  specifica, poi [qualita-web.md](qualita-web.md).
