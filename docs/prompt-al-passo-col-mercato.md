# Prompt di ampliamento — «Al passo con il mercato: filtri, zone, recensioni, acconto e fiducia»

**Committente:** il proprietario di Ombrè (19 novembre 2026).
**Origine:** perizia comparativa in clean room sui concorrenti, condotta con Craft Anything
(progetto `~/craft-anything-projects/concorrenti.cany`, reperti fnd_1–fnd_4). Il quadro:
il mercato italiano si è consolidato in **Spiagge.it (gruppo Zucchetti)**, che ha assorbito
YourBeach e Cocobuk; all'estero spicca **MySunbed**. Da ciò che offrono loro — e da ciò che
sbagliano — nascono le sei funzioni di questa commessa.

## Le funzioni, una per una

### 1. Filtri per servizi nella Ricerca ombrellone
I concorrenti filtrano per servizi; Ombrè oggi no.
- Ogni stabilimento dichiara i propri **servizi** da un elenco fisso e traducibile (bar/chiosco,
  ristorante, parcheggio, docce calde, area giochi, accesso disabili, animali ammessi, Wi-Fi,
  salvataggio…): li sceglie il Gestore stabilimento dal gestionale (pagina del sito o scheda).
- Nella **Ricerca ombrellone** compaiono come filtri (caselle, funzionanti anche senza JavaScript);
  i risultati li mostrano come **distintivi** sintetici sulla carta di ogni lido.
- La **scheda del lido** li elenca per esteso, con icone sobrie e lo stesso lessico nelle due lingue.

### 2. Zone con nome nella planimetria
Spiagge.it vende la scelta del posto per zona («prima fila», «vicino al bar», «area relax»).
- Il Gestore può dare un **nome di zona** a gruppi di postazioni della planimetria (prima fila,
  vicino al chiosco, area famiglie, zona tranquilla…).
- La zona compare **nella planimetria pubblica**, nel riepilogo di prenotazione, nel carrello,
  nel pass e al banco della reception: sempre le stesse parole.
- Nei risultati di ricerca la postazione proposta indica la zona quando esiste.

### 3. Recensioni verificate degli Ospiti
MySunbed mostra recensioni proprie o di Google; Ombrè non ne ha.
- Può recensire **solo l'Ospite con un soggiorno concluso** in quello stabilimento (prenotazione
  confermata e passata): voto da 1 a 5 e testo breve facoltativo, una recensione per soggiorno,
  dal proprio conto («Le mie prenotazioni»).
- **Moderazione**: il Gestore stabilimento vede le recensioni e può segnalarne una alla
  piattaforma con motivo scritto; la recensione segnalata resta visibile con la replica del
  Gestore finché la piattaforma non decide. Niente recensioni comprate: solo soggiorni veri.
- La **media** e il numero compaiono sulla scheda del lido e nelle carte dei risultati; l'elenco
  completo sulla scheda, dal più recente. Tutto in italiano e inglese, anche senza JavaScript.

### 4. Acconto: «caparra adesso, saldo al lido»
MySunbed offre il pagamento in loco con un acconto alla conferma.
- Per ogni stabilimento il Gestore sceglie fra **pagamento intero online** (com'è oggi) o
  **caparra** (percentuale configurabile, es. 20–30%) **con saldo all'arrivo**.
- Il riepilogo, il carrello, l'ordine, l'email di conferma, il conto dell'Ospite e il **banco
  della reception** mostrano con chiarezza quanto è stato pagato e quanto resta da saldare;
  la reception incassa il saldo e il registro economico quadra.
- Tutto sul **fornitore di pagamento di prova**, come le altre operazioni; la ripartizione
  contabile va scritta in specifica.

### 5. Condizioni di annullamento visibili prima della conferma
MySunbed mostra il termine di annullamento gratuito prima di pagare; da noi le condizioni
definitive sono una decisione che spetta al committente, ma **il meccanismo si costruisce ora**:
- ogni stabilimento ha un **testo di condizioni** e un **termine** (es. «gratuito fino a 48 ore
  dall'arrivo»), con un valore predefinito di piattaforma modificabile dal Gestore;
- riepilogo, carrello e conferma li mostrano **prima** del pagamento; l'annullamento dal conto
  li applica (entro il termine: rimborso pieno sul fornitore di prova; oltre: quello che le
  condizioni dicono);
- in specifica resta scritto che i testi e le percentuali definitivi li deciderà il committente.

### 6. La fiducia come differenza: «niente profilazione»
Le home di Spiagge.it e MySunbed accolgono l'utente con banner di cookie pubblicitari; Ombrè
non traccia nessuno.
- Una riga nel piè di pagina pubblico, nelle due lingue: Ombrè non usa cookie di profilazione
  né pubblicità; i soli cookie sono tecnici (sessione, carrello, lingua).
- Una breve voce in Assistenza che lo spiega con parole piane.
- Nessun banner: non serve, e la sua assenza è il messaggio.

## Rimandate con motivo scritto (non costruire)
- **Tariffe adulto/bambino** e **mezze giornate** (mattina/pomeriggio/sera): cambiano il modello
  dei prezzi in profondità; vanno decise dal committente con i listini veri.
- **Recensioni importate da Google**: dipendenza esterna e chiavi che non abbiamo.
- Restano ferme le esclusioni già decise (Konva, drag-and-drop, cassa, CRM, carrello
  multi-stabilimento).

## Vincoli (invariati)
- Tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello; i tre nomi di
  ruolo ovunque (Ospite, Stagionale, Gestore stabilimento); lessico unico (periodo, Ricerca
  ombrellone ⛱️).
- **Nessuna funzione esistente si rompe**: prenotazione rapida, carrello, conto, Google di
  prova, pass, reception, Stagionale e registro economico restano validi; i collaudi esistenti
  (235 test, 112 rotte, 813 controlli) restano verdi e si ampliano.
- Dati minimi, recensioni legate al conto senza esporre l'email, parole d'ordine solo come impronte.
- Specifica e decisioni numerate prima del codice; squadra di agenti con ruoli (analista,
  backend, frontend, collaudatore, esperto di usabilità per i testi dei filtri/recensioni);
  commit a ogni incremento; **nessun push**.
- Al termine: schermate nuove (ricerca con filtri, scheda con servizi e recensioni, planimetria
  con zone, riepilogo con caparra e condizioni, piè di pagina), stato.md aggiornato, demo
  aggiornata sullo stesso tunnel, seed con dati dimostrativi (servizi, zone, recensioni,
  uno stabilimento con caparra).

## Criteri di accettazione
1. La Ricerca ombrellone filtra per servizi e i risultati mostrano i distintivi; la scheda li elenca nelle due lingue.
2. Le zone nominate compaiono in planimetria, riepilogo, carrello, pass e reception con le stesse parole.
3. Solo un Ospite con soggiorno concluso può recensire; media e numero compaiono su scheda e risultati; la segnalazione del Gestore con replica funziona.
4. Uno stabilimento con caparra mostra acconto e saldo in riepilogo, ordine, conto e reception, e il registro economico quadra.
5. Condizioni e termine di annullamento sono visibili prima del pagamento e applicati all'annullamento dal conto.
6. Il piè di pagina dichiara l'assenza di profilazione nelle due lingue e Assistenza lo spiega.
7. La prenotazione rapida, il carrello, il conto e l'accesso Google di prova funzionano come prima.
8. Tutto collaudato, in italiano e inglese, anche senza JavaScript, con i collaudi precedenti ancora verdi.
