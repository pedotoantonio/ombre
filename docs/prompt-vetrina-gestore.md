# Prompt di ampliamento — «La vetrina del Gestore: la pagina che presenta il gestionale e il modulo "Ti chiamiamo noi"»

**Committente:** il proprietario di Ombrè (21 novembre 2026).
**Natura:** rifacimento della pagina `/gestore-stabilimento` (e della gemella inglese), che da guida
documentale diventa la **vetrina commerciale del gestionale**, più **una novità funzionale**: il
modulo di richiamata «Ti chiamiamo noi». Il committente ha studiato come spiagge.it presenta il
proprio gestionale (https://www.spiagge.it/gestionale-spiaggia/) e vuole la stessa impostazione,
**ma col carattere di Ombrè**. La pagina Ricerca ombrellone **non si tocca**: il pulsante di
richiamata vive solo nella pagina che presenta il gestionale.

## Il modello studiato (spiagge.it) e cosa se ne prende

La loro pagina, nell'ordine: eroe col beneficio e due pulsanti («Inizia ora» e «Ti chiamiamo
noi»); subito sotto il **modulo di richiamata** (solo nome e telefono, informativa privacy,
pulsante «Chiamami»); cinque **funzionalità in schede con schermate**; quattro vantaggi secchi
(«Perché scegliere…»); numeri e testimonianze; chiusura che ripete i due pulsanti. Tono diretto
col «tu», orientato ai benefici, niente prezzi in pagina.

**Se ne prende l'impianto** (eroe con doppia azione, modulo di richiamata in alto e ripetuto in
chiusura, funzionalità in schede con schermate, vantaggi, chiusura con le stesse azioni).
**Non se ne prendono** i numeri, le testimonianze e i loghi dei partner: Ombrè non li ha e
**non si inventano** — al loro posto la trasparenza, che è il nostro carattere.

## Che cosa cambia, esattamente

1. **L'eroe diventa da vetrina**: un claim sul beneficio (sito, prenotazione diretta e reception
   che lavorano sullo stesso inventario) e **due azioni**: la primaria **«Ti chiamiamo noi»**
   (porta al modulo di richiamata) e una secondaria che porta alle schermate o al percorso di
   attivazione — lo decide l'analista. **«Entra nel gestionale»** resta ma in forma discreta,
   come via di chi è già cliente (il loro «Sei già un cliente?»): non è più l'azione principale
   della pagina.
2. **Il modulo di richiamata «Ti chiamiamo noi»** — la sola novità funzionale della commessa:
   - campi **minimi**: nome, telefono, nome dello stabilimento (facoltativo); **consenso
     esplicito** con testo onesto: il recapito serve solo a richiamare per l'adesione alla fase
     pilota, nessuna profilazione, cancellazione su richiesta — coerente con la promessa del
     portale;
   - **funziona senza JavaScript**: modulo POST, convalida lato server con errori leggibili,
     registrazione in archivio (nuova tabella), conferma chiara dopo l'invio;
   - **filtro anti-abuso semplice**: limite di invii per indirizzo e campo trappola invisibile;
   - **dove si leggono le richieste**: il minimo onesto per la fase pilota — archivio in banca
     dati e una pagina riservata di consultazione (elenco con data, nome, telefono, stabilimento,
     segnabile come «richiamato»); la forma esatta la decide l'analista, senza costruire un CRM;
   - il modulo compare **due volte**: sotto l'eroe e in chiusura di pagina (o la chiusura rimanda
     all'àncora del modulo).
3. **Le quattro schermate vere diventano schede-funzionalità** con titoli da beneficio (console
   del giorno, planner, scheda della postazione, riepilogo economico), più una **quinta scheda
   sulla condivisione delle giornate degli stagionali** — la funzione che i concorrenti non
   hanno, il nostro distintivo; se serve una schermata nuova, si prende dal gestionale demo.
4. **«Perché Ombrè»**: quattro vantaggi reali e verificabili — resti tu a decidere; un solo
   inventario per sito, portale e reception; la condivisione degli stagionali; niente
   profilazione dei tuoi clienti.
5. **La trasparenza resta, compattata verso il fondo**: «Cosa comprende il primo rilascio»,
   «Cosa non comprende, per ora» e «Come si attiva» si conservano (anche riorganizzati), perché
   sono il carattere di Ombrè. **Costi** e **Contatti** restano con la formula onesta
   «saranno pubblicati con la fase pilota».
6. **Chiusura con le stesse azioni dell'eroe**, come nel modello.
7. **Nessun'altra pagina cambia**: Ricerca ombrellone, home, guide dell'Ospite e dello
   Stagionale, area riservata restano come sono. Il menu a cinque voci (D41) e la home
   dell'Ospite (D70) non si toccano.

## Vincoli (invariati)

- **Niente numeri, testimonianze, loghi o recensioni inventati**: ogni affermazione della
  vetrina deve corrispondere a una funzione reale del prodotto.
- Tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello; i tre nomi di
  ruolo; lessico unico.
- **Nessuna funzione esistente cambia e nessuna si rompe**: i collaudi esistenti restano verdi;
  quelli della vecchia pagina si aggiornano alla nuova forma; il modulo di richiamata ha
  collaudi propri (convalida, registrazione, limite di invii, campo trappola, percorso senza
  JavaScript, due lingue).
- Accessibilità invariata: gerarchia dei titoli, etichette dei campi, errori annunciati,
  contrasti, navigazione da tastiera.
- Specifica e **decisione numerata prima del codice**; commit a ogni incremento; **nessun push**.
- Squadra proporzionata: **analista** (specifica e decisione), **backend** (modulo, archivio,
  pagina riservata di consultazione, filtro anti-abuso), **frontend** (vetrina), **collaudatore**
  (regressione completa + collaudi nuovi).

## Al termine

- Schermate nuove della pagina (1366 e 390, it): eroe con le due azioni, modulo di richiamata,
  schede delle funzionalità, chiusura; più una della pagina riservata delle richieste.
- stato.md aggiornato; demo sullo stesso tunnel già attivo.

## Criteri di accettazione

1. `/gestore-stabilimento` apre con l'eroe da vetrina: claim e due azioni, con «Ti chiamiamo noi» che porta al modulo; «Entra nel gestionale» resta in forma discreta, in italiano e in inglese.
2. Il modulo di richiamata registra nome, telefono ed eventuale stabilimento con consenso esplicito; funziona senza JavaScript, convalida con errori leggibili, conferma dopo l'invio, limite di invii e campo trappola attivi.
3. Le richieste registrate si consultano da una pagina riservata con data e stato «richiamato»; nessun dato del modulo finisce altrove.
4. Le funzionalità sono presentate in schede con le schermate vere, compresa la condivisione degli stagionali; i quattro vantaggi di «Perché Ombrè» corrispondono a funzioni reali.
5. Nessun numero, testimonianza o logo inventato in pagina; le sezioni della trasparenza (comprende / non comprende / come si attiva / costi e contatti «con la fase pilota») restano.
6. La pagina Ricerca ombrellone, la home, le altre guide e il menu a cinque voci sono invariati; D41 e D70 restano rispettate.
7. Tutti i collaudi verdi: i precedenti invariati o aggiornati alla nuova forma, più i collaudi propri del modulo, nelle due lingue e senza JavaScript.
