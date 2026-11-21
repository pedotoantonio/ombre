# Specifica — Correzioni del gruppo A, iterazione 1

Commessa del 21/11/2026 (prompt archiviato in `docs/prompt-correzioni-gruppo-a-1.md`).
Natura: correzione di difetti, nessuna funzione nuova. Decisione collegata: D72.
Fuori da questi punti non si tocca nulla: niente grafica, menu, home, vetrina,
percorso di prenotazione, chiavi di testo non elencate. Le riscritture
commerciali del rapporto sul portale restano sospese.

## 1. Il registro dice solo denaro incassato (punto 1)

Oggi `recordSale` (`packages/db/src/ledger.ts`) scrive `payment_received`
per l'intero totale a ogni conferma, anche per le prenotazioni al banco
«da incassare» (`deskBooking` con `collect: 'later'`), che non hanno
nessuna riga in `payment`. Correzione:

- `recordSale` riceve due informazioni nuove nell'oggetto `sale`:
  `channel: 'online' | 'desk'` (per il §2) e `collected: boolean`.
  Con `collected: false` NON scrive `payment_received`; tutto il resto
  (riga `extras_revenue`, `allocation`, `allocation_expected`) resta
  identico, perché descrive il dovuto e non l'incassato.
- Chiamanti (`packages/db/src/bookings.ts`):
  - conferma da pagamento riuscito (riga ~309 e ~439): `collected: true`,
    `channel` dal fornitore del pagamento (`paid.provider === 'desk'`
    → `'desk'`, altrimenti `'online'`);
  - `deskBooking` con `collect: 'later'` (riga ~807): `collected: false`,
    `channel: 'desk'`.
- La riga `payment_received` nasce all'incasso, per l'importo incassato:
  - `collectAtDesk`: dopo l'inserimento del pagamento `desk`, una riga
    `payment_received` di `amountCents` sulla prenotazione capofila;
  - `settleRequestPayment`, ramo `collectable`: una riga
    `payment_received` di `paid.amountCents` (il commento «no ledger
    entry here» decade);
  - `addExtrasToBooking`: `payment_received` degli extra SOLO con
    `collect === 'desk'`; con `collect: 'later'` resta la sola riga
    `extras_revenue` e l'incasso arriverà da `collectAtDesk` o da una
    richiesta di pagamento.
- `recordRefundDue` resta com'è: lì il denaro è arrivato davvero.
- Nessuna migrazione, nessuna colonna nuova, nessun ritocco alle righe
  già registrate (registro che si può solo estendere).

## 2. Quota di piattaforma a zero sulle vendite al banco (punto 2, D72)

- In `recordSale`, con `channel: 'desk'` i punti base della piattaforma
  (`platformBps`) confluiscono nella quota dello stabilimento: la parte
  `beach_club` riceve `beachClubBps + platformBps` (giornata condivisa)
  oppure `seasonHolderBps + beachClubBps + platformBps` (giornata
  ordinaria), e NESSUNA riga `allocation` / `allocation_expected` nasce
  per la parte `platform`. La quota dello Stagionale sulle giornate
  condivise resta identica.
- Con `channel: 'online'` nulla cambia.
- La somma delle quote resta uguale al lordo della postazione in ogni
  caso (`splitAmount` con resto allo stabilimento, come oggi).
- I piani A e B, la ripartizione 50/40/10 e le percentuali della
  `split_rule` restano come sono: cambia solo l'effetto del canale.
- Niente migrazioni dei dati esistenti.

## 3. Dotazioni senza parti a zero (punto 3)

`booking.equipment` in `packages/shared/src/i18n/it.ts` e `en.ts`: le
parti con quantità zero si omettono. Esiti attesi (it): «1 lettino»,
«1 ombrellone e 2 lettini», «2 ombrelloni»; inglese allo stesso modo
(«1 sunbed», «1 umbrella and 2 sunbeds», «2 umbrellas»). Con entrambe le
quantità a zero la funzione restituisce stringa vuota. La firma non
cambia; `equipmentShort` e le altre chiavi non si toccano.

## 4. Coerenza dei testi (punto 4)

- Cabine. `pages.managerGuide.limits`: la voce «Fasce orarie, cabine e
  risorse composte.» diventa «Fasce orarie e risorse composte.» (en:
  «Time slots and composite resources.»). `pages.guestGuide.notes[0]`
  diventa: «Si prenotano giornate intere. Fasce orarie e cabine non si
  prenotano online.» (en: «You book whole days. Time slots and cabins
  cannot be booked online.»).
- Annullamento. La risposta della FAQ sull'annullamento in
  `pages.help.faq` diventa: «Sì. Di norma annulli gratis fino a {ore}
  ore prima e ti rimborsiamo tutto. Alcuni stabilimenti hanno condizioni
  proprie: le leggi nel riepilogo, prima di pagare.» (en allo stesso
  livello). Le ore vengono da una costante nuova di `@ombre/shared`
  (`defaultCancelDeadlineHours = 48`), lo stesso valore predefinito di
  piattaforma della colonna `beach.cancel_deadline_hours` usato da
  `cancel.defaultPolicy`; mai scritte a mano nel testo.
- Tempo di riserva. `booking.holdNote` diventa una funzione
  `(minutes: number) =>`: «Ti teniamo il posto per {minuti} minuti
  mentre paghi. La prenotazione è confermata quando arriva il
  pagamento.» (en: «We hold your spot for {minutes} minutes while you
  pay. The booking is confirmed when the payment arrives.»). Il
  chiamante (`apps/web/components/beach.tsx`, pagina `/prenota`) legge
  `Number(process.env.OMBRE_HOLD_MINUTES ?? '10')`, lo stesso
  predefinito dell'API. In `compose.yaml` il servizio `web` riceve
  `OMBRE_HOLD_MINUTES` come variabile d'ambiente di esecuzione (la
  pagina è dinamica: niente argomento di build).

## 5. La conferma della richiamata (punto 5)

`callback.sentText` diventa: «Ti richiamiamo al numero che hai
lasciato.» (en: «We will call you at the number you left.»). Nessun
rinvio a contatti che la pagina non mostra.

## 6. Squadra e proprietà dei file

- **Backend** (§1–§2): `packages/db/src/ledger.ts`,
  `packages/db/src/bookings.ts`, test nuovi/aggiornati in
  `apps/api/tests` e `packages/db/tests`. Aggiorna i test economici
  esistenti SOLO dove verificavano la quota di piattaforma sulle vendite
  al banco o il `payment_received` alla conferma «da incassare», con il
  motivo scritto accanto.
- **Frontend** (§3–§5): `packages/shared/src/i18n/it.ts`, `en.ts`, la
  costante in `packages/shared/src`, `apps/web/components/beach.tsx`,
  `compose.yaml`, test unitari in `packages/shared/tests`.
- **Collaudatore**: controlli nuovi in `scripts/smoke.ts` (guida
  Gestore senza «cabine», guida Ospite e assistenza con i testi nuovi,
  it/en), `scripts/smoke-flow.ts` (pagina `/prenota` con «{minuti}
  minuti» letto da `OMBRE_HOLD_MINUTES`), `scripts/smoke-richiamata.ts`
  (nessun «più in basso»), `scripts/collaudo.sh` (la pila esporta
  `OMBRE_HOLD_MINUTES=15` per provare che il valore viene dalla
  configurazione), `scripts/smoke-booking.ts` solo dove verificava la
  quota sul banco. Poi l'intero `pnpm collaudo` su pila vergine.

## 7. Criteri di accettazione

Quelli del prompt, punti 1–6, verificati uno per uno nel verbale di
collaudo.
