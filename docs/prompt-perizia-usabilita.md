# Prompt di perizia — «Usabilità e informazione del sito pubblico»

**Committente:** il proprietario di Ombrè, su segnalazione della famiglia (18 novembre 2026).
**Origine:** dopo la correzione dei tre ruoli, il pannello «Tutto in un posto solo» della prima pagina (quattro carte: Ricerca postazione · Mappa spiaggia · Il tuo pass QR · Giornate condivise) è rimasto al lessico e alla struttura precedenti: «non ha senso» rispetto ai tre tasti. Il problema non è solo quel pannello: serve una perizia d'usabilità su **tutta l'informazione** che il sito propone.

## Il ruolo dell'esperto

Un **esperto senior di usabilità e di scrittura d'interfaccia**, che non è l'autore del sito e lo giudica da utente: una persona in spiaggia, col telefono, al sole, di fretta. Non valuta il codice né aggiunge funzioni: valuta e corregge **le informazioni** — pannelli, carte, titoli, didascalie, testi esplicativi, voci e ordini di navigazione — in italiano e in inglese.

## Il metodo: cinque domande per ogni blocco

Prima un **censimento** di tutti i blocchi informativi del lato pubblico (prima pagina, Ricerca ombrellone, scheda del lido, riepilogo, pass, pagine «come funziona», Assistenza, sito dello stabilimento, email in coda). Poi, per ciascun blocco, cinque domande:

1. **È vero oggi?** Coerente con i tre ruoli, la ricerca per periodo, il menu attuale: niente nomi vecchi, niente «giorno» dove vale «periodo», niente riferimenti a voci rimosse.
2. **Serve qui?** Aiuta chi legge a compiere l'azione successiva in quel punto, o è decorazione che sposta in basso ciò che conta?
3. **È semplice?** Parole piane, una sola idea per blocco, nessun gergo; comprensibile al primo sguardo da telefono.
4. **Usa il lessico unico?** Ospite / Stagionale / Gestore stabilimento, «Ricerca ombrellone», «periodo», sempre le stesse parole per le stesse cose, nelle due lingue.
5. **Duplica qualcosa?** Se ripete il menu o i tre tasti senza aggiungere nulla, è un candidato all'eliminazione: ogni cosa detta una volta, nel posto giusto.

Esito per ogni blocco: **tenere / riscrivere / spostare / eliminare**, con la proposta concreta già scritta (testo nuovo compreso). Le proposte si applicano, non restano su carta.

## Il caso di partenza: «Tutto in un posto solo»

Il pannello a quattro carte va giudicato per primo, con le cinque domande. Oggi è incoerente quattro volte: «Ricerca postazione» (si chiama Ricerca ombrellone ⛱️), «per località, giorno e ospiti» (è un periodo), «Mappa spiaggia» come funzione a sé (la mappa vive dentro la ricerca), «Giornate condivise» (si chiama Stagionale, e ha già il suo tasto) — e non nomina il Gestore stabilimento. L'esperto decide se sotto i tre tasti quel pannello abbia ancora un mestiere (per esempio: «come funziona, in breve» per il solo Ospite — cerca, scegli sulla planimetria, paga, mostra il pass) o se vada eliminato perché duplica tasti e menu; e scrive la versione corretta, o la sua assenza.

## Vincoli (invariati)

- Solo informazione, etichette, ordine e gerarchia: **nessuna funzione nuova**, nessuna riscrittura del framework; tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello.
- Nessun percorso esistente si rompe; i tre nomi di ruolo ovunque, verificati dalle scansioni automatiche già in opera.
- La perizia precede le modifiche: prima il rapporto con il censimento e i giudizi, poi le correzioni costruite da quel rapporto, con collaudo sui criteri; commit a ogni incremento; **nessun push**.
- Al termine: schermate nuove delle pagine toccate, stato.md aggiornato, demo aggiornata sullo stesso tunnel.
- Coordinamento con l'iterazione «Carrello, conto dell'Ospite e accesso con Google» in corso: stessi file, nessun conflitto — la sequenza la decide chi costruisce, ma l'incoerenza della prima pagina non aspetta la fine del carrello.

## Criteri di accettazione

1. Esiste il rapporto di perizia: ogni blocco informativo censito, giudicato con le cinque domande, con esito e proposta.
2. Il pannello della prima pagina è coerente con i tre tasti e il lessico unico, oppure è stato eliminato con motivo scritto; in ogni caso il Gestore stabilimento non è invisibile.
3. Nessun blocco del sito usa il lessico vecchio (scansione automatica su italiano e inglese).
4. Ogni blocco rimasto supera le cinque domande; gli eliminati e gli spostati sono elencati nel rapporto.
5. Le pagine toccate sono collaudate nelle due lingue, anche senza JavaScript.
