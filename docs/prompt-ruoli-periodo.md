# Prompt di correzione — «Tre ruoli chiari e ricerca per periodo»

**Committente:** il proprietario di Ombrè, su consigli propri e del figlio (17 novembre 2026).
**Natura:** correzione dell'esperienza pubblica e della navigazione. Un solo punto amplia le funzioni (la ricerca per periodo); tutto il resto riordina nomi, menu e prima pagina.

## Principio guida

Tutta l'applicazione parla di **tre ruoli, con tre nomi fissi e mai equivocabili**:

| Ruolo | Nome unico, ovunque | Chi è |
|---|---|---|
| **OSPITE** | Ospite | chi cerca e prenota un ombrellone |
| **STAGIONALE** | Stagionale | l'abbonato che affitta il suo ombrellone nei giorni in cui non c'è |
| **GESTORE STABILIMENTO** | Gestore stabilimento | chi amministra il lido |

Ogni pagina, menu, titolo, email e testo — in italiano e in inglese — usa solo questi tre nomi. Spariscono le formule alternative («Per gli stabilimenti», «Per gli stagionali», «condividi giornate» come voce a sé…).

## Le correzioni, una per una

### 1. Prima schermata a tre tasti
La pagina iniziale si apre con **tre grandi tasti**, uno per ruolo, prima di ogni altra cosa:
- **«Cerco un ombrellone»** → la ricerca (punto 2) con mappa e lista;
- **«Affitto il mio ombrellone»** → l'area e la spiegazione dello Stagionale;
- **«Gestisco uno stabilimento»** → l'area e la spiegazione del Gestore stabilimento.
I tre tasti hanno lo stesso peso visivo. La ricerca e la mappa restano in prima pagina, sotto i tasti, come oggi.

### 2. Da «giorno» a «periodo» (ampliamento funzionale)
Oggi si cerca e si prenota una sola giornata. La ricerca deve chiedere **un periodo: dal — al** (un solo giorno resta il caso minimo, con «al» uguale a «dal»):
- i risultati mostrano le postazioni libere **per tutto il periodo** e il prezzo totale «da»;
- la planimetria della scheda lido mostra la disponibilità sull'intero periodo;
- la prenotazione copre tutte le giornate del periodo in un'operazione sola: un codice, un pass valido per tutti i giorni, un riepilogo con il totale;
- prezzo = somma delle giornate (con extra e codici applicati come oggi); l'annullamento e il rimborso trattano il periodo intero;
- le giornate condivise dello Stagionale restano per singola giornata: in una ricerca per periodo compaiono solo se coprono tutto il periodo richiesto.
Le decisioni fini (riserva, pagamento parziale su più giorni, statistiche) le fissa la specifica, e ciò che si rimanda va scritto.

### 3. Menu superiore fisso
La barra di navigazione del sito pubblico **resta visibile durante lo scorrimento** (fissa in alto), su computer e telefono, senza coprire i contenuti.

### 4. Menu per ruolo
Le voci di navigazione diventano, in quest'ordine:
**Ricerca ombrellone ⛱️ · Ospite: come funziona · Stagionale: come funziona · Gestore: come funziona · Assistenza**
(più il cambio lingua e l'accesso). La pagina «Come funziona» si sdoppia in tre spiegazioni, una per ruolo, con i contenuti attuali redistribuiti.

### 5. Voci di menu come bottoni
Le voci sono **poco più che bottoni**: compatte, con bordo o fondo leggero, tutte uguali tra loro; la voce attiva è evidenziata.

### 6. Via la voce «mappa»
Nessuna voce di menu dedicata alla mappa: la mappa è **dentro «Ricerca ombrellone»** (l'attuale «Esplora», rinominata), come modalità principale di ricerca insieme alla lista. Nessun percorso si perde: chi arrivava dalla mappa arriva alla ricerca.

### 7. Lo Stagionale allo stesso livello del Gestore
L'ingresso dello Stagionale («Affitto il mio ombrellone» / «Stagionale») ha **la stessa evidenza** dell'ingresso del Gestore stabilimento: stesso peso in prima pagina (punto 1) e nel menu (punto 4). Niente più «condividi giornate» come etichetta: si chiama Stagionale.

### 8. I tre nomi in tutta l'app
Censimento di **tutte** le occorrenze (pagine pubbliche, area riservata, email in coda, pass, sito dello stabilimento, documentazione OpenAPI dove esposta): ogni testo usa Ospite / Stagionale / Gestore stabilimento. Un controllo automatico verifica che le vecchie formule non compaiano più.

### 9. L'ingresso al gestionale deve vedersi
Dal sito pubblico oggi non si capisce dove sia il gestionale. Il tasto **«Gestisco uno stabilimento»** e la voce «Gestore: come funziona» portano a una pagina che spiega il gestionale (con le schermate vere) e all'**accesso all'area riservata**, ben visibile.

## Vincoli (invariati)

- Tutto funziona anche senza JavaScript; niente riscritture del framework; italiano e inglese allo stesso livello.
- Nessuna funzione esistente si rompe: prenotazioni, pass e registri di oggi restano validi (una prenotazione esistente è un periodo di un giorno).
- Specifica e decisioni prima del codice; agenti con ruoli (analista, backend, frontend, collaudatore); collaudo con criteri numerati; commit a ogni incremento; **nessun push**.
- Al termine: schermate nuove, stato aggiornato, demo aggiornata sullo stesso tunnel.

## Criteri di accettazione

1. La prima pagina mostra i tre tasti, con lo stesso peso, sopra la ricerca.
2. La ricerca accetta un periodo e una prenotazione copre più giornate con un solo pass.
3. La barra del sito pubblico resta fissa durante lo scorrimento.
4. Il menu ha le voci del punto 4, a forma di bottone, e nessuna voce mappa.
5. In tutta l'app compaiono solo Ospite / Stagionale / Gestore stabilimento (controllo automatico).
6. Dal sito pubblico si arriva all'accesso del gestionale in due tocchi al massimo.
7. Tutto collaudato, in italiano e inglese, anche senza JavaScript.
