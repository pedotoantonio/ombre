# Prompt di ampliamento — «Carrello, conto dell'Ospite e accesso con Google»

**Committente:** il proprietario di Ombrè (18 novembre 2026).
**Natura:** ampliamento funzionale del lato pubblico. Oggi ogni prenotazione è un acquisto a sé e l'Ospite non ha un conto: questa iterazione introduce il carrello, il conto personale con lo storico e l'accesso con Google.

## Principio guida

L'Ospite diventa una persona che il sistema conosce e serve nel tempo: può mettere nel carrello più cose insieme — postazioni, periodi, servizi — anche per persone diverse, pagarle in un'operazione sola, e ritrovare in ogni momento che cosa ha prenotato, oggi e in passato. Tutto questo **senza togliere nulla a chi non vuole un conto**: la prenotazione rapida di oggi resta e continua a funzionare identica.

## Le funzioni, una per una

### 1. Il carrello
L'Ospite raccoglie nel carrello più voci prima di pagare:
- **più postazioni** dello stesso stabilimento, anche su **periodi diversi** (ciascuna voce con il suo dal–al);
- **i servizi extra dello stabilimento** (teli, casseforti, noleggi…), legati a una voce del carrello o aggiunti a una prenotazione in corso;
- ogni voce può avere un **intestatario diverso** («per chi è»): il nome di chi userà la postazione, così una famiglia o un gruppo prenota in un colpo solo;
- il carrello mostra il **totale complessivo** e il dettaglio voce per voce; alla conferma nasce **una prenotazione per voce, ognuna con il suo pass**, e un **riepilogo d'ordine unico**;
- la specifica fissa le decisioni fini e le scrive: la riserva (per voce o per l'intero carrello), il comportamento se una voce scade o non è più libera, l'annullamento per voce, il pagamento unico e la sua ripartizione contabile per stabilimento;
- il carrello sopravvive alla navigazione (anche senza JavaScript) e si ritrova nel conto.

### 2. Il conto dell'Ospite
- **Registrazione con i dati della persona**: nome, email, e i soli dati necessari; niente raccolte superflue;
- **invio di account e parola d'ordine**: alla registrazione (o alla prima prenotazione, se l'Ospite lo chiede) il sistema prepara l'email con le credenziali e il collegamento d'accesso; finché manca il fornitore di posta reale, il testo resta nella coda «Comunicazioni» già esistente, pronto e copiabile — come oggi per le conferme; al primo accesso la parola d'ordine si cambia;
- dal conto si vedono **il carrello**, i dati personali e lo storico;
- gli accessi usano le difese già esistenti (blocco dei tentativi, registro delle azioni).

### 3. Lo storico: «Le mie prenotazioni»
- L'elenco di **tutto ciò che l'Ospite ha prenotato, anche in passato**: per ogni voce stabilimento, postazione, periodo, intestatario, extra, totale, stato (confermata, annullata, conclusa) e il pass se ancora valido;
- un **riepilogo** chiaro in testa: prossimi arrivi e spesa complessiva;
- le prenotazioni fatte prima della registrazione si **ricollegano al conto** tramite l'email, con una regola scritta in specifica;
- riservatezza: lo storico è solo dell'Ospite; gestore e reception continuano a vedere ciò che già vedono, niente di più.

### 4. Aggiungere, dal posto giusto
- Dalla **scheda dello stabilimento** e dal riepilogo: «Aggiungi al carrello» accanto a «Prenota subito»;
- da una prenotazione nel conto: **aggiungi un altro periodo** (stessa postazione o un'altra) e **aggiungi servizi** dello stabilimento, senza rifare da capo la ricerca.

### 5. L'accesso con Google
- Accesso e registrazione **«Entra con Google»** secondo OpenID Connect, accanto alle credenziali classiche;
- il conto si aggancia per email: chi entra con Google ritrova lo stesso storico;
- le **chiavi reali** (client Google) le fornirà il committente: fino ad allora il flusso gira su un **fornitore di prova** configurabile — la stessa strada già scelta per i pagamenti — e il collaudo lo esercita per intero; la dipendenza esterna va registrata in stato.md;
- chi entra con Google non ha parola d'ordine locale da gestire; la pagina d'accesso lo dice con chiarezza.

## Vincoli (invariati)

- Tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello; i tre nomi di ruolo (Ospite, Stagionale, Gestore stabilimento) ovunque.
- **Nessuna funzione esistente si rompe**: la prenotazione rapida senza conto, i gruppi per periodo, i pass, la reception e il registro economico di oggi restano validi.
- I dati personali sono il minimo necessario, mai esposti a chi non deve vederli; le parole d'ordine si conservano solo come impronte.
- Specifica e decisioni numerate prima del codice; squadra di agenti con ruoli (analista, backend, frontend, collaudatore); collaudo con criteri numerati; commit a ogni incremento; **nessun push**.
- Al termine: schermate nuove, stato.md aggiornato, demo aggiornata sullo stesso tunnel.

## Criteri di accettazione

1. Il carrello accetta più postazioni, periodi diversi, extra e intestatari diversi, e mostra il totale complessivo.
2. La conferma del carrello produce una prenotazione per voce, ciascuna con il suo pass, e un riepilogo d'ordine unico.
3. La registrazione crea il conto e prepara l'email con account e parola d'ordine nella coda «Comunicazioni»; al primo accesso la parola d'ordine si cambia.
4. «Le mie prenotazioni» mostra passato e futuro con stati, totali e pass, e ricollega al conto le prenotazioni precedenti fatte con la stessa email.
5. Dal conto e dalla scheda del lido si aggiungono altri periodi e altri servizi senza rifare la ricerca.
6. «Entra con Google» completa registrazione e accesso sul fornitore di prova, e aggancia lo storico per email.
7. La prenotazione rapida senza conto funziona esattamente come prima.
8. Tutto collaudato, in italiano e inglese, anche senza JavaScript.
