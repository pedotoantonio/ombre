# Prompt di correzione: difetti validi in ogni scenario (gruppo A, iterazione 1)

Committente: il proprietario di Ombrè (21 novembre 2026).
Natura: correzione di difetti, nessuna funzione nuova. Nasce dalla valutazione della fase 1 (verdetto «fermati» sul modello attuale, vedi `FASI.md`): sviluppo fermo, ammesse solo le correzioni valide in ogni scenario, compresa la cessione o licenza del software. Fonti dei rilievi: il rapporto sul modello di ricavo (vendite al banco nel registro) e la revisione commerciale dei contenuti del portale (incoerenze e difetti di resa).

## Che cosa cambia, esattamente

1. Il registro non dichiara incassi che non ci sono. Oggi `recordSale` (`packages/db/src/ledger.ts`) scrive `payment_received` per l'intero totale anche quando la prenotazione al banco è «da incassare» (`deskBooking` con `collect: 'later'`, `packages/db/src/bookings.ts`), cioè senza nessuna riga in `payment`. Correzione: `payment_received` nel registro corrisponde sempre a denaro effettivamente incassato. Per le prenotazioni «da incassare» la riga nasce all'incasso (`collectAtDesk`, richieste di pagamento), per l'importo incassato. Le quote (`allocation`, `allocation_expected`) possono restare registrate alla conferma, come oggi, perché descrivono il dovuto e non l'incassato.
2. Nessuna quota di piattaforma sulle vendite al banco. Oggi `recordSale` assegna `platformBps` su ogni vendita, qualunque sia il canale, e per il contante non esiste nessun flusso che porti quella quota alla piattaforma. Correzione: `recordSale` riceve il canale della vendita (online o banco, dal campo già presente sulla prenotazione o sul pagamento con fornitore `desk`; se il canale non è disponibile, aggiungerlo come parametro esplicito, senza nuove colonne se non indispensabili). Sul banco la quota della piattaforma è zero e va allo stabilimento. Motivo: è anche una scelta di prezzo, ammessa perché nessuno degli scenari valutati tiene una commissione sulla cassa del bagno, e senza un flusso di incasso la quota resterebbe un credito non riscuotibile; la quota dello Stagionale sulle giornate condivise resta com'è. Online nulla cambia. Le vendite già registrate non si toccano (registro che si può solo estendere): niente migrazioni dei dati esistenti.
3. Il riepilogo non scrive dotazioni a zero. `booking.equipment` in `packages/shared/src/i18n/it.ts` (e `en.ts`) stampa «0 ombrelloni e 1 lettino». Correzione nella funzione: le parti a zero si omettono. Esiti attesi: «1 lettino», «1 ombrellone e 2 lettini», «2 ombrelloni». Stessa regola in inglese.
4. Le pagine non si contraddicono.
   * Cabine. In `pages.managerGuide.limits` togliere le cabine dall'elenco di ciò che il prodotto non comprende: il gestionale le gestisce (titolari, periodi, subaffitti). In `pages.guestGuide.notes[0]` il testo diventa: «Si prenotano giornate intere. Fasce orarie e cabine non si prenotano online.» (inglese allo stesso livello).
   * Annullamento. `pages.help.faq` alla domanda sull'annullamento risponde oggi «Dipende». Il testo diventa: «Sì. Di norma annulli gratis fino a {ore} ore prima e ti rimborsiamo tutto. Alcuni stabilimenti hanno condizioni proprie: le leggi nel riepilogo, prima di pagare.» Le ore vengono dal valore predefinito di piattaforma già usato da `cancel.defaultPolicy` (48), non scritte a mano nel testo.
   * Tempo di riserva. `booking.holdNote` dice «per un tempo limitato». Il testo diventa: «Ti teniamo il posto per {minuti} minuti mentre paghi. La prenotazione è confermata quando arriva il pagamento.» I minuti vengono da `OMBRE_HOLD_MINUTES` (predefinito 10), non scritti a mano.
5. La conferma della richiamata non rimanda a contatti che non ci sono. `callback.sentText` dice «i contatti sono più in basso in questa pagina», ma la pagina non li mostra. Il testo diventa: «Ti richiamiamo al numero che hai lasciato.» Se e quando la pagina mostrerà dei contatti, la frase si potrà estendere.

## Cosa non toccare

Nessun'altra chiave di testo, nessuna rotta nuova, nessuna modifica a grafica, menu, home, vetrina o percorso di prenotazione oltre ai punti sopra. Le riscritture commerciali del rapporto sul portale sono sospese e non vanno applicate. I piani A e B, la ripartizione 50/40/10 e le percentuali restano come sono: si corregge solo il canale.

## Vincoli (invariati)

Italiano e inglese allo stesso livello; tutto funziona senza JavaScript; calcoli in centesimi interi con arrotondamento deterministico; registro che si può solo estendere; isolamento tra stabilimenti con RLS; nessuna decisione esistente revocata senza una nuova voce in `docs/decisioni.md`. Il punto 2 cambia il comportamento economico: va registrato come decisione nuova numerata (D72) che richiama D6 e D8.

## Criteri di accettazione

1. Una prenotazione al banco «da incassare» non produce `payment_received`; dopo un incasso parziale al banco esiste `payment_received` per il solo importo incassato; dopo il saldo la somma di `payment_received` è uguale al totale. Test con database nuovo in `apps/api/tests` o `packages/db`, più un caso d'errore: un incasso superiore al residuo resta rifiutato come oggi.
2. Una vendita al banco di una giornata ordinaria registra quota piattaforma zero e stabilimento 100% del prezzo della postazione; una vendita al banco di una giornata condivisa registra quota Stagionale invariata, piattaforma zero, il resto allo stabilimento; una vendita online registra le quote di oggi. In ogni caso la somma delle quote è uguale al lordo della postazione. Test per i tre casi.
3. `booking.equipment` restituisce i tre esiti attesi del punto 3 in italiano e in inglese; test unitario in `packages/shared`.
4. La pagina servita di guida Gestore non contiene «cabine» tra i limiti; la guida Ospite e l'assistenza contengono i testi nuovi con le ore e i minuti presi dalla configurazione (prova: avvio con `OMBRE_HOLD_MINUTES=15` e testo con «15 minuti»). Controlli aggiunti a `pnpm smoke` nelle due lingue.
5. La pagina di conferma della richiamata non contiene «più in basso»; controllo aggiunto a `pnpm smoke:richiamata`.
6. Nessuna regressione: `pnpm check`, `pnpm test:db` e `pnpm collaudo` verdi su pila vergine; il collaudo `smoke:booking` e i test economici esistenti aggiornati solo dove verificavano la quota di piattaforma sul banco, con il motivo scritto.

## Resoconto atteso

Per ogni criterio 1-6: superato o no, con la prova (nome del test, comando, estratto dell'output). Elenco dei file toccati. Aggiornare `docs/stato.md` e `docs/collaudo.md` con l'iterazione; in `FASI.md`, nel registro, una riga con l'esito.
