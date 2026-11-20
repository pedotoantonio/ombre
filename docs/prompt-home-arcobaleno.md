# Prompt di ampliamento — «La home arcobaleno: menu a tutta larghezza e la mappa dei lidi»

**Committente:** il proprietario di Ombrè (20 novembre 2026), con uno screenshot del suo
browser (resta fuori dal repository, in `/home/sysadmin/consegne-ombre/richiesta-home-20261120.png`,
perché mostra le sue schede personali). Tre modifiche alla home e all'intestazione del
portale pubblico.

## 1. Il menu sotto il logo

Oggi logo e voci di menu stanno sulla stessa riga e sullo schermo del committente
(finestra larga) le voci traboccano in uno scorrimento orizzontale con voci tagliate
(«Gestore: come funziona» mozzato). Il committente vuole: il logo su una riga sua, e
sotto una barra dei menu di larghezza piena, da bordo a bordo della pagina. Niente voci
tagliate a nessuna larghezza; sul telefono la barra può andare a capo o scorrere, ma
leggibile.

## 2. Ogni pulsante del menu di un colore diverso

Assegnare a ogni voce un colore della palette arcobaleno dei gettoni (rosso corallo,
arancio, giallo sole, verde acqua, blu mare, viola), nell'ordine dell'arcobaleno.
Rispettando i vincoli del tema: contrasto WCAG AA misurato su ogni coppia (per il giallo
servirà la variante scurita o testo scuro su fondo giallo), stati attivo/fuoco visibili,
stessa resa nelle due lingue. La scelta va documentata nei gettoni (decisione numerata).

## 3. La mappa dei lidi al posto di «Mappa non disponibile»

Nel riquadro «Trova gli stabilimenti sulla mappa» della home il committente vuole la
mappa vera con i segnaposto dei lidi dimostrativi, aprendo i quali si va alla pagina del
lido. Via a scelta nostra rispettando i vincoli del progetto: una mappa a riquadri
(es. Leaflet + OpenStreetMap con attribuzione corretta e nessun tracciamento) oppure una
mappa SVG disegnata da noi con la costa e i segnaposto. Niente profilazione (il piè di
pagina lo promette); tutto resta utilizzabile senza JavaScript (va bene la mappa come
arricchimento progressivo, ma il ripiego senza JS non può più dire solo «Mappa non
disponibile»: mostri qualcosa di utile, per esempio l'elenco o la mappa statica). Se i
lidi dimostrativi non hanno coordinate, assegnarne di fittizie coerenti (località di
fantasia: nessun indirizzo reale spacciato per vero).

## Vincoli invariati

Nessuna funzione si rompe, regressione verde (287 test / 135 rotte / 1186 fumo), due
lingue, commit a ogni incremento, **nessun push**. Al termine: schermate nuove
dell'intestazione e della mappa (1366 e 390), stato.md aggiornato, demo sullo stesso
tunnel, rapporto con i numeri.
