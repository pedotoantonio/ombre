# Prompt di modifica — «La home è dell'Ospite: l'ingresso del Gestore si fa da parte»

**Committente:** il proprietario di Ombrè (20 novembre 2026, pomeriggio).
**Natura:** ritocco mirato della home pubblica. Il committente ha osservato che il pulsante
«Gestisco uno stabilimento», alla pari accanto alla ricerca, non appartiene al percorso di chi
cerca un ombrellone. L'analisi lo conferma: la home ripete oggi i tre ruoli **tre volte**
(i tre tasti nell'eroe, le tre guide nel menu, le tre carte «Per chi è»), e i portali a due
pubblici — Booking, Airbnb, MySunbed — tengono l'ingresso di chi offre in disparte, mai alla
pari con l'azione principale.

## La decisione del committente (supera in parte D41)

La parte di **D41** che prescriveva «tre tasti di pari peso sopra la ricerca» è **revocata dal
committente**: va scritta una nuova decisione numerata che la richiama e la supera. Il resto di
D41 — barra pubblica fissa, menu a cinque voci nell'ordine committed, le tre guide per ruolo,
«due tocchi dal sito» per l'accesso del Gestore — **resta valido e non si tocca**.

## Che cosa cambia, esattamente

1. **L'eroe della home diventa dell'Ospite**: i tre pulsanti dei ruoli (`portal-roles`)
   spariscono dall'eroe. Resta il titolo, il sottotitolo e il **modulo di ricerca** ben in
   vista, prima azione della pagina. Se togliendo i tasti l'eroe risulta vuoto o sbilanciato,
   il frontend riequilibra spazi e gerarchia — senza inventare contenuti nuovi.
2. **«Affitto il mio ombrellone» e «Gestisco uno stabilimento» vivono nelle carte «Per chi è»**,
   che già esistono più in basso con i loro collegamenti: si verifica che le carte bastino da
   sole come ingresso (titolo chiaro, collegamento esplicito alla guida del ruolo) e, se serve,
   si rafforza il collegamento della carta (es. da collegamento testuale a pulsante secondario).
   Niente nuove sezioni.
3. **Il menu non cambia**: le cinque voci di D41 restano come sono, su tutte le pagine.
   «Gestore: come funziona» nel menu è la via dei due tocchi e resta tale.
4. **Nessun'altra pagina cambia**: la Ricerca ombrellone, le guide, l'area riservata non si
   toccano.

## Vincoli (invariati)

- Tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello; i tre nomi
  di ruolo; lessico unico.
- **Nessuna funzione cambia e nessuna si rompe**: niente modifiche a rotte, moduli, dati o
  seed. I collaudi esistenti restano verdi; quelli che verificano i tre tasti nell'eroe
  (collaudo di D41) **si aggiornano alla nuova forma**, non si cancellano: il nuovo collaudo
  verifica che l'eroe NON contenga i tre tasti e che le carte «Per chi è» portino alle tre guide.
- Accessibilità invariata: gerarchia dei titoli, contrasti, navigazione da tastiera.
- Decisione numerata **prima del codice**; commit a ogni incremento; **nessun push**.
- Squadra proporzionata alla commessa: **analista** (decisione e aggiornamento della
  specifica), **frontend** (eroe e carte), **collaudatore** (regressione completa + collaudi
  aggiornati). Niente backend: non ce n'è bisogno.

## Al termine

- Schermate nuove della home (1366 e 390, it), con l'eroe senza i tre tasti e le carte
  «Per chi è» visibili.
- stato.md aggiornato; demo sullo stesso tunnel già attivo.

## Criteri di accettazione

1. L'eroe della home mostra titolo, sottotitolo e modulo di ricerca; i tre pulsanti dei ruoli non ci sono più, in italiano e in inglese.
2. Le carte «Per chi è» restano l'ingresso di Stagionale e Gestore, con collegamenti chiari alle rispettive guide; il Gestore raggiunge l'accesso sempre in due tocchi dal sito.
3. Il menu a cinque voci è invariato su tutte le pagine; nessun'altra pagina è cambiata.
4. Una nuova decisione numerata richiama D41 e ne supera la parte dei «tre tasti di pari peso».
5. Tutti i collaudi verdi: i precedenti invariati, quelli dell'eroe aggiornati alla nuova forma.
6. Tutto funziona anche senza JavaScript, nelle due lingue.
