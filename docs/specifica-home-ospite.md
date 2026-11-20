# Specifica: la home è dell'Ospite — l'ingresso del Gestore si fa da parte

Iterazione del 20 novembre 2026 (pomeriggio) dal prompt del committente
([prompt-home-ospite.md](prompt-home-ospite.md)). Ritocco mirato della sola
home pubblica: nessuna funzione cambia, la regressione (287 test, 135 rotte,
1214 controlli fumo) resta verde. Decisione D70.

## 1. Che cosa osserva il committente

La home ripete i tre ruoli tre volte: i tre tasti nell'eroe, le tre guide
nel menu, le tre carte «Per chi è». I portali a due pubblici (Booking,
Airbnb, MySunbed) tengono l'ingresso di chi offre in disparte, mai alla
pari con l'azione principale. Il committente revoca la parte di D41 sui
«tre tasti di pari peso sopra la ricerca»; il resto di D41 resta valido.

## 2. L'eroe dell'Ospite (D70)

- Il blocco `portal-roles` (le tre porte di ruolo) **sparisce dall'eroe**
  di `HomePage`: restano titolo, sottotitolo e modulo di ricerca, prima
  azione della pagina.
- **L'equilibrio non richiede contenuti nuovi**: il modulo di ricerca ha
  già il suo respiro (`margin-top: var(--spazio-6)`), quindi togliere il
  blocco non lascia buchi; il frontend lo verifica a vista a 1366 e 390.
- Si eliminano con il blocco: le regole `.portal-roles` / `.portal-role`
  in `portal.css` (compresa la colonna a tre nel media query) e le chiavi
  `rolesLabel` e `roles` del gruppo `pages.home` nei dizionari it/en
  (nessun altro punto le usa; il test dei dizionari conferma la simmetria).

## 3. Le carte «Per chi è» come ingresso dei ruoli (D70)

- Le tre carte esistono già con testi chiari e un collegamento ciascuna
  alle tre guide (Ospite → `come-funziona`, Stagionale → `stagionale`,
  Gestore stabilimento → `gestore-stabilimento`).
- **Il collegamento si rafforza**: da collegamento testuale
  (`card__link`) a **pulsante secondario**, con le classi già esistenti
  `button button--secondary` più una classe di posa `card__cta` (solo
  spaziatura dentro la carta: `margin-top: auto` e allineamento a
  sinistra). Nessuna nuova sezione, nessun nuovo testo.
- `card__link` resta com'è: lo usano l'area riservata, le schede e i
  risultati di ricerca, che **non cambiano**.
- La via dei due tocchi del Gestore non cambia: menu «Gestore: come
  funziona» → pagina della guida → «Area riservata».

## 4. Che cosa non si tocca

Il menu a cinque voci (D41/D68), la Ricerca ombrellone, le tre guide,
l'area riservata, rotte, moduli, dati e seed, l'accessibilità (gerarchia
dei titoli, contrasti, tastiera). Nessun'altra pagina cambia.

## 5. Squadra e ordine dei lavori

1. **Analista**: questa specifica e la decisione D70 (nessun codice).
2. **Frontend**: eroe e carte (`pages.tsx`, `portal.css`, `base.css` solo
   per `card__cta`, dizionari it/en).
3. **Collaudatore**: i controlli fumo dell'eroe si **aggiornano alla
   nuova forma** (mai ridotti): l'eroe NON contiene i tre tasti né i loro
   testi, in italiano e in inglese; le carte «Per chi è» portano alle tre
   guide; il Gestore resta a due tocchi dall'accesso; regressione
   completa (test, rotte a contratto, tutte le suite fumo).

## 6. Criteri di accettazione

1. L'eroe mostra titolo, sottotitolo e modulo di ricerca; i tre pulsanti
   dei ruoli non ci sono più, in italiano e in inglese.
2. Le carte «Per chi è» restano l'ingresso di Stagionale e Gestore, con
   pulsanti secondari verso le tre guide; il Gestore raggiunge l'accesso
   in due tocchi dal sito.
3. Il menu a cinque voci è invariato su tutte le pagine; nessun'altra
   pagina è cambiata.
4. D70 richiama D41 e ne supera la sola parte dei «tre tasti di pari
   peso».
5. Tutti i collaudi verdi: i precedenti invariati, quelli dell'eroe
   aggiornati alla nuova forma (estesi, mai ridotti).
6. Tutto funziona anche senza JavaScript, nelle due lingue; schermate
   nuove della home (1366 e 390, it); stato.md aggiornato; demo sullo
   stesso tunnel.
