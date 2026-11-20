# Specifica: la home arcobaleno — menu a tutta larghezza e la mappa dei lidi

Iterazione del 20/11/2026 dal prompt del committente
([prompt-home-arcobaleno.md](prompt-home-arcobaleno.md)). Tre modifiche
alla home e all'intestazione del portale pubblico; nessuna funzione
cambia, la regressione (287 test, 135 rotte, 1186 controlli fumo) resta
verde. Decisioni D67–D69.

## 1. L'intestazione su due righe (D67)

- **Riga del marchio**: logo a sinistra, strumenti a destra (cambio
  lingua e «Area riservata»), dentro il contenitore come oggi.
- **Barra dei menu**: sotto, **da bordo a bordo della pagina**, con un
  fondo suo che la distingue dalla riga del marchio; le voci dentro un
  contenitore allineato al resto della pagina.
- **Mai voci tagliate**: le voci vanno **a capo** quando non ci stanno
  (flex con a-capo), a ogni larghezza; lo scorrimento orizzontale con le
  sfumature ai bordi sparisce. Sul telefono la barra occupa due o tre
  righe leggibili.
- La griglia `'brand nav tools'` a una riga (schermi larghi) si ritira:
  l'intestazione ha le stesse due righe a ogni larghezza.
- Nulla cambia nei testi, nelle rotte o nell'ordine delle voci (D41:
  ricerca, tre guide, assistenza).

## 2. Le voci del menu nei colori dell'arcobaleno (D68)

- Ogni voce diventa un **pulsante colorato**, nell'ordine
  dell'arcobaleno della palette (gettoni di D65):
  1. Ricerca ombrellone — rosso corallo;
  2. Ospite: come funziona — arancio;
  3. Stagionale: come funziona — giallo sole;
  4. Gestore: come funziona — verde acqua;
  5. Assistenza — blu mare;
  6. Area riservata (riga del marchio) — viola, a completare l'arco.
  Il cambio lingua resta neutro (è uno strumento, non una voce).
- Il **direttore artistico** aggiunge ai gettoni
  ([tema-arcobaleno.md](tema-arcobaleno.md)) la tavola dei sei pulsanti:
  per ciascuno fondo, testo, bordo, stato attivo (voce corrente), stati
  fuoco/passaggio, **con il contrasto misurato** (AA: 4,5:1 testo
  normale, 3:1 componenti). Dove il colore pieno non regge l'AA si usa
  la variante scurita documentata; per il **giallo sole testo scuro su
  fondo giallo** (mai giallo come testo su chiaro).
- La voce corrente non è segnalata dal solo colore: conserva un segno
  (sottolineatura spessa o bordo marcato) leggibile anche in bianco e
  nero. Stessa resa in italiano e in inglese.

## 3. La mappa dei lidi (D69)

- **La causa del guasto**: la rotta `apps/web/app/dati/mappa/route.ts`
  (i segnaposto per la mappa) esiste dal primo giorno ma **non è mai
  stata committata**, perché la regola `dati/` del `.gitignore` alla
  radice del repository ingoia anche `apps/web/app/dati/`. La demo,
  costruita da `git archive HEAD`, risponde 404 e il riquadro ripiega su
  «Mappa non disponibile». Rimedio: regola `!apps/web/app/dati/` nel
  `.gitignore` di `ombre/` (quello alla radice non si tocca: serve ad
  altri progetti) e commit della rotta.
- **La via scelta resta Leaflet + OpenStreetMap** (già costruita):
  Leaflet e il suo CSS serviti da noi, solo le tessere da OpenStreetMap
  con attribuzione sempre visibile, visitatore mai localizzato, nessun
  tracciamento (coerente con «niente profilazione»).
- **Le coordinate esistono già** per i tre lidi dimostrativi (punti
  costieri plausibili di stabilimenti inventati; nessun indirizzo reale
  spacciato per vero): la condizione «se mancano» non si applica.
- **Il ripiego diventa utile**: il server rende dentro il riquadro
  l'**elenco dei lidi** (nome, località, collegamento alla pagina) oltre
  all'invito alla ricerca. Senza JavaScript si vede l'elenco; con
  JavaScript la mappa lo sostituisce quando è pronta; se mappa o
  tessere falliscono l'elenco resta. La scritta «Mappa non disponibile»
  sparisce. La home legge i lidi dal server; se l'API non risponde il
  riquadro mostra il solo invito di oggi (la home non si rompe mai).
- La mappa della pagina di ricerca eredita lo stesso ripiego a elenco.

## 4. Squadra e ordine dei lavori

1. **Direttore artistico**: tavola dei pulsanti del menu nei gettoni,
   contrasti misurati (documento, nessun codice). 2. **Frontend
   intestazione**: due righe, barra piena, pulsanti coi gettoni del DA.
   3. **Frontend mappa**: `.gitignore`, rotta committata, ripiego a
   elenco (in parallelo col 2, file disgiunti). 4. **Esperto di
   accessibilità**: contrasti e fuoco misurati sulle pagine rese, prova
   senza colore. 5. **Collaudatore**: regressione completa e prove
   visive; i controlli fumo si estendono a intestazione e ripiego.

## 5. Rimandati (scritti)

Menu a tendina o «hamburger» sul telefono (la barra a capo basta);
mappa SVG disegnata della costa (la mappa a riquadri c'è già); pagina
dei lidi per regione.

## 6. Criteri di accettazione

1. Logo su una riga sua; sotto, la barra dei menu da bordo a bordo;
   nessuna voce tagliata a nessuna larghezza (1366, 1024, 768, 390).
2. Le sei voci (cinque del menu + Area riservata) hanno i sei colori
   della palette nell'ordine dell'arcobaleno; tavola nei gettoni con
   contrasti misurati, nessuna coppia sotto AA; giallo mai come testo
   su chiaro; voce corrente e fuoco visibili anche in bianco e nero;
   stessa resa in italiano e inglese.
3. La home mostra la mappa vera con i tre segnaposto dei lidi
   dimostrativi; aprendo un segnaposto si va alla pagina del lido;
   attribuzione OpenStreetMap visibile; nessun tracciamento.
4. Senza JavaScript il riquadro mostra l'elenco dei lidi con i
   collegamenti (niente più solo «Mappa non disponibile»); la rotta dei
   segnaposto è committata e la demo la serve.
5. Nessuna regressione: 287 test, 135 rotte a contratto, controlli fumo
   tutti verdi (estesi, mai ridotti), due lingue, tutto senza
   JavaScript.
6. Schermate nuove di intestazione e mappa (1366 e 390) verificate a
   vista; stato.md aggiornato; demo sullo stesso tunnel.
