# Perizia d'usabilità — il sito pubblico di Ombrè

**Data:** 18 novembre 2026.
**Perito:** esperto esterno di usabilità e scrittura d'interfaccia. Non è l'autore del sito: lo giudica da utente — una persona in spiaggia, col telefono, al sole, di fretta.
**Metodo:** censimento di ogni blocco informativo del lato pubblico; per ciascun blocco le cinque domande del mandato (è vero oggi? serve qui? è semplice? usa il lessico unico? duplica qualcosa?) e un esito: **tenere / riscrivere / spostare / eliminare**, con la proposta già scritta. Giudicato anche l'ordine dei blocchi in ogni pagina.
**Pagine visitate** (italiano e inglese, via HTTP senza JavaScript): prima pagina `/` e `/en`; `/ricerca-ombrellone` (`/en/umbrella-search`), anche con periodo `?day=2026-11-18&to=2026-11-20`; `/bagni/lido-aurora` (`/en/beach-clubs/lido-aurora`) e `/bagni/bagno-delle-dune` (`/en/beach-clubs/bagno-delle-dune`), anche con periodo; riepilogo di prenotazione `/bagni/…/prenota` (`/en/…/book`), per giorno e per periodo, senza riservare; `/come-funziona` (`/en/how-it-works`); `/stagionale` (`/en/season-holder`); `/gestore-stabilimento` (`/en/beach-manager`); `/assistenza` (`/en/help`); `/area/accesso` (`/en/account/sign-in`). Email in coda: testi in `packages/comms/src/index.ts`. Dizionari `packages/shared/src/i18n/it.ts` e `en.ts` usati solo come riscontro del lessico.

**Censiti 65 blocchi.** Esiti: **47 tenere · 17 riscrivere · 0 spostare · 1 eliminare.**

---

## Il caso di partenza: il pannello «Tutto in un posto solo» (H5)

Prima pagina, dopo la mappa. Oggi ha cinque carte: *Ricerca postazione · Mappa spiaggia · Il tuo pass QR · Giornate condivise · Gestore stabilimento* (la quinta è stata aggiunta dopo la segnalazione). In inglese: *Find a spot · Beach map · Your QR pass · Shared days · Beach manager*.

**1. È vero oggi? No.** «Ricerca postazione» non esiste: la funzione si chiama «Ricerca ombrellone», come dicono il menu, il tasto e la pagina stessa. «Per località, giorno e numero di ospiti» ignora il periodo dal–al, che la ricerca offre da due campi. «Mappa spiaggia — Scegli la postazione sulla planimetria» presenta come funzione a sé una cosa che vive dentro la scheda del lido; e si confonde con l'altra mappa, quella dei lidi, che sta tre righe sopra. «Giornate condivise — Se sei uno Stagionale con abbonamento» è il mestiere dello Stagionale, che ha già il suo tasto e la sua pagina.

**2. Serve qui? No.** Nessuna carta è un collegamento: è testo fermo. E ogni carta rimanda a qualcosa che la pagina dice già meglio altrove: la ricerca al modulo di ricerca, la planimetria e il pass a «Tre passi, dal telefono», le giornate condivise a «Da dove arrivano le giornate disponibili», il Gestore al terzo tasto e alla carta di «Per chi è». Il pannello non aiuta nessuna azione: allontana «Tre passi» dal modulo di ricerca.

**3. È semplice? Le frasi sì, l'insieme no.** Cinque carte senza destinatario: tre parlano all'Ospite, una allo Stagionale, una al Gestore, senza dirlo. Chi legge di fretta non capisce a chi parla il pannello né che cosa dovrebbe farne.

**4. Lessico unico? No.** Due nomi vecchi («Ricerca postazione», «Mappa spiaggia» come funzione) e «giorno» dove vale «periodo». Le stesse violazioni in inglese («Find a spot», «By place, day and number of guests»).

**5. Duplica qualcosa? Sì, tutte e cinque le carte**, senza aggiungere nulla: la pagina contiene già i tre tasti, il modulo di ricerca, la mappa, i tre passi dell'Ospite, la spiegazione delle giornate condivise e le tre carte dei ruoli.

**Esito: eliminare il pannello, titolo compreso.** Il mandato chiedeva se sotto i tre tasti avesse ancora un mestiere, per esempio «come funziona, in breve» per il solo Ospite: quel mestiere esiste, ma lo fa già — e meglio — «Tre passi, dal telefono», che è esattamente il percorso dell'Ospite in tre mosse. Correggere il pannello vorrebbe dire riscrivere un doppione. Il Gestore stabilimento non diventa invisibile: resta nel terzo tasto in cima e nella terza carta di «Per chi è», entrambe con collegamento alla sua pagina — più di quanto faccia oggi la carta muta del pannello. Dopo l'eliminazione, «Tre passi, dal telefono» segue direttamente la mappa: l'ordine ne guadagna.

---

## Blocchi comuni a tutte le pagine

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| C1 | Nastro «Ambiente dimostrativo: dati di esempio, nessun pagamento reale.» / «Demonstration environment: sample data, no real payment.» | Vero, utile, una riga, stesso posto ovunque. | **Tenere** |
| C2 | Menu: ⛱️ Ricerca ombrellone · Ospite: come funziona · Stagionale: come funziona · Gestore: come funziona · Assistenza · Lingua · Area riservata | Lessico unico rispettato nelle due lingue; ordine giusto (prima l'azione, poi le spiegazioni, per ultimo l'accesso). «Gestore: come funziona» è l'abbreviazione tollerabile di un nome lungo in uno spazio stretto; la pagina di destinazione dà subito il nome pieno. | **Tenere** |
| C3 | Piè di pagina: motto «Il tuo posto al sole, senza pensieri.», elenco «Pagine», avviso «Ombrè è un progetto in sviluppo…» | L'elenco «Pagine» duplica il menu, ma a fondo pagina è convenzione che serve a chi è arrivato in fondo; l'avviso è vero e onesto. | **Tenere** |

---

## Prima pagina `/` e `/en`

Ordine attuale: hero → tre tasti → ricerca → mappa → «Tutto in un posto solo» → «Tre passi» → «Da dove arrivano le giornate» → «Per chi è» → piè di pagina. **Giudizio sull'ordine:** giusto — l'azione (tasti, ricerca) precede le spiegazioni — con un corpo estraneo: il pannello H5, che separa la mappa dai tre passi. Eliminato quello, l'ordine è pulito e non va toccato.

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| H1 | Hero: «Il tuo posto al sole, anche per un giorno solo» + capoverso | Vero, semplice, dice in due frasi che cosa fa il sito e che il prezzo si vede prima di pagare. | **Tenere** |
| H2 | I tre tasti: «Cerco un ombrellone / Affitto il mio ombrellone / Gestisco uno stabilimento» | In prima persona, dalla parte dell'utente: è la cosa migliore della pagina. Coerenti con i tre ruoli. | **Tenere** |
| H3 | Modulo di ricerca: Località o stabilimento · Dal giorno · Al giorno (facoltativo) · Ospiti · «Solo giornate condivise» con nota | «Dal giorno / Al giorno (facoltativo)» rende bene il periodo senza dire «periodo»; la nota sulle giornate condivise spiega il termine proprio dove serve. | **Tenere** |
| H4 | Pannello mappa: «Trova i lidi sulla mappa» + didascalia + paragrafo + tasto «Apri la ricerca ombrellone» | Tre difetti: «lidi» dove il sito dice sempre «stabilimenti»; la frase «la ricerca e “Ricerca ombrellone” restano la via a elenco» è contorta (che cos'è una «via a elenco»?); «per località, giorno e ospiti» ignora il periodo. Il tasto è utile (porta all'azione dal contesto della mappa). | **Riscrivere** (proposta n. 1) |
| H5 | «Tutto in un posto solo», cinque carte | Giudizio completo sopra. | **Eliminare** |
| H6 | «Tre passi, dal telefono»: Scegli la postazione / Controlla il riepilogo / Entra con il pass | Il percorso dell'Ospite in tre mosse: esatto e al posto giusto. Unico neo: il passo 1 dice «per località, giorno e numero di ospiti» — manca il periodo. | **Riscrivere** il solo passo 1 (proposta n. 2) |
| H7 | «Da dove arrivano le giornate disponibili» | Spiega l'idea del servizio in tre righe, con i tre ruoli nominati per esteso e nell'ordine giusto (Stagionale propone, Gestore autorizza, Ospite prenota). | **Tenere** |
| H8 | «Per chi è»: tre carte Ospite / Stagionale / Gestore stabilimento con collegamento | Non duplica i tasti: li approfondisce con una frase ciascuno e porta alle tre pagine. Lessico a posto nelle due lingue. | **Tenere** |

---

## Ricerca ombrellone `/ricerca-ombrellone` e `/en/umbrella-search`

Ordine attuale: titolo → modulo → mappa dei risultati → elenco risultati. **Giudizio sull'ordine:** da telefono la mappa spinge in basso l'elenco, ma il salto «Vai all'elenco» rimedia; accettabile così.

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| R1 | Titolo + sottotitolo «…con disponibilità e prezzo per la data scelta» | «La data scelta» è falso quando la ricerca è dal–al: la pagina stessa mostra «Disponibilità dal 18 al 20 novembre». | **Riscrivere** (proposta n. 3) |
| R2 | Modulo di ricerca (identico a H3) | Qui non è un doppione: è la funzione della pagina. | **Tenere** |
| R3 | «I risultati sulla mappa» + «Gli stessi stabilimenti della lista… Chi non ha ancora una posizione resta solo in lista.» + «Vai all'elenco» | Utile e vero, ma «Chi non ha ancora una posizione» suona come se parlasse di persone; e la pagina alterna «lista» ed «elenco» per la stessa cosa. | **Riscrivere** (proposta n. 4) |
| R4 | Stato senza data: «Indica un giorno per vedere le postazioni libere e il prezzo di partenza.» | Invito giusto nel posto giusto, ma solo «un giorno»: il modulo appena sopra offre il dal–al. | **Riscrivere** (proposta n. 5) |
| R5 | Intestazione dei risultati con periodo: «Disponibilità dal 18 al 20 novembre 2026 — Periodo di 3 giornate: contano solo le postazioni libere ogni giornata. Postazioni per 2 ospiti.» | Informazione preziosa (spiega perché i risultati calano col periodo), ma «contano solo le postazioni libere ogni giornata» si decifra al secondo tentativo; e non dice che il prezzo mostrato è dell'intero periodo — la scheda del lido lo dice meglio (L11). | **Riscrivere** (proposta n. 6) |
| R6 | Carte dei risultati: foto, nome, località, «33 postazioni libere da 84,00 € a postazione, per l'intero periodo», nota demo, «Vedi le postazioni libere» | Il prezzo «per l'intero periodo» è detto dove si legge la cifra: bene. Il tasto dice l'azione successiva. | **Tenere** |
| R7 | «Altri stabilimenti, senza postazioni libere per questa ricerca: …» | Onesto: dice chi c'è ma non ha posto, invece di farlo sparire. | **Tenere** |

---

## Scheda del lido `/bagni/lido-aurora`, `/bagni/bagno-delle-dune` e `/en/beach-clubs/…`

Ordine attuale: titolo → presentazione del lido (copertina, testo, servizi, informazioni, galleria) → modulo giorno/ospiti → planimetria → elenco postazioni. **Giudizio sull'ordine:** difendibile — la pagina è anche la vetrina dello stabilimento — e l'ancora «Scegli il giorno e la postazione» in testa porta subito chi ha fretta al modulo. Va solo corretto il nome dell'ancora (L1).

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| L1 | Sottotitolo «Stabilimento balneare a … . Scegli il giorno e guarda le postazioni libere.» + ancora «Scegli il giorno e la postazione» | Due frasi quasi uguali a tre righe di distanza, ed entrambe dicono «giorno» dove il modulo offre il dal–al. | **Riscrivere** (proposta n. 7) |
| L2 | Nota «Stabilimento dimostrativo: dati di esempio» | Vera e necessaria finché i lidi sono di fantasia. | **Tenere** |
| L3 | Presentazione: copertina con didascalia + testo dello stabilimento | Testo del sito del lido: caldo ma onesto («stabilimento di fantasia creato per provare il sistema»). | **Tenere** |
| L4 | Servizi (elenco) | Voci brevi, concrete. | **Tenere** |
| L5 | Informazioni: periodo di apertura, orari, indirizzo, telefono, accessibilità | L'accessibilità descritta in concreto (passerella, sedia da mare, bagno accessibile) è raro e prezioso. | **Tenere** |
| L6 | Galleria (testi alternativi delle foto) | Alt descrittivi veri, in entrambe le lingue. | **Tenere** |
| L7 | Modulo: Dal giorno · Al giorno (facoltativo) · Ospiti (facoltativo) + nota «Con gli ospiti indicati la postazione consigliata è evidenziata. Nessun obbligo: scegli quella che preferisci.» | La nota toglie l'ansia da «campo obbligatorio» e spiega a che cosa serve il dato: scrittura d'interfaccia come si deve. | **Tenere** |
| L8 | Intestazione disponibilità + «Planimetria — Ogni ombrellone è una postazione. Scegli una postazione libera per vedere il riepilogo e continuare.» | «Ogni ombrellone è una postazione» è falso sulla stessa planimetria: ci sono anche lettini singoli, gazebo e tende, e la legenda li elenca due righe sotto. | **Riscrivere** (proposta n. 8) |
| L9 | Legenda (Libera / Libera, giornata condivisa / Non disponibile / Scelta da te / tipi) + «47 postazioni libere su 53» + «Vai all'elenco delle postazioni libere» + «Scorri di lato per vedere tutta la fila.» | Tutto al servizio dell'azione; l'avviso sullo scorrimento laterale è pensato per il telefone. «Giornata condivisa» coerente col lessico. | **Tenere** |
| L10 | Planimetria: celle «A03 Ombrellone A03. Libera. 45,00 €. 1 ombrellone e 2 lettini» | Formula completa e leggibile anche da lettore di schermo. **Segnalazione (dati, non dizionario):** nelle pagine inglesi i nomi dei tipi restano in italiano — «Ombrellone», «Lettino singolo», «Tenda araba» — mentre la legenda li traduce (Single sunbed, Tent). Stessa cosa, due nomi, due lingue mescolate. I nomi vengono dai dati dello stabilimento: serve un campo tradotto o una traduzione dei dati dimostrativi. | **Tenere** il formato; sanare i dati (vedi «Ciò che non ho potuto vedere») |
| L11 | Nota col periodo: «Periodo di 3 giornate: una postazione compare solo se è libera ogni giornata e il prezzo è il totale dell'intero periodo.» | Esattamente l'informazione che serve, nel momento in cui serve. È la versione buona di R5: le due pagine dicano la stessa cosa con le stesse parole. | **Tenere** (e usarla come modello per R5) |
| L12 | Elenco delle postazioni libere: carte «R01 · Lettino singolo · 0 ombrelloni e 1 lettino · Fino a 1 ospite · 15,00 € · Scegli R01» | Alternativa alla planimetria con le stesse informazioni; «Fino a N ospiti» previene l'errore prima del riepilogo. | **Tenere** |
| L13 | Chiusura: «Non disponibili in questo giorno: A01, A02, …» | Con una ricerca dal–al la pagina dice ancora «in questo giorno»: falso nel caso periodo. | **Riscrivere** (proposta n. 9) |

---

## Riepilogo di prenotazione `/bagni/…/prenota` e `/en/…/book`

Ordine attuale: avviso sulla riserva → riepilogo → codice promozionale → condizioni di annullamento → tasto «Riserva la postazione». **Giudizio sull'ordine:** giusto: le condizioni di annullamento stanno prima del tasto, come promesso da «Come funziona».

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| P1 | «Prenota a … — La postazione resta riservata per un tempo limitato mentre completi il pagamento. La riserva non è una conferma.» | Dice la cosa più importante (riserva ≠ conferma) prima di tutto. «Un tempo limitato» è vago, ma «Come funziona» promette che il tempo è «indicato a schermo» nella fase di pagamento: coerente. | **Tenere** |
| P2 | Riepilogo: Giorno (o «Periodo — Dal 18 al 20 novembre 2026, 3 giornate» con le giornate elencate una per una e il prezzo di ciascuna), Postazione, Dotazione, Prezzo, Totale | Il caso periodo è esemplare: periodo per esteso, conteggio delle giornate, prezzo per giornata e totale. Lessico «periodo» rispettato. | **Tenere** |
| P3 | «Codice promozionale» + «Applica» | Una riga, facoltativa, prima del totale definitivo. | **Tenere** |
| P4 | «Condizioni di annullamento — Lo stabilimento non ha ancora pubblicato le condizioni di annullamento.» | Lo stato vuoto è dichiarato invece che nascosto: onesto. | **Tenere** |
| P5 | Tasto «Riserva la postazione» / «Hold this spot» | Il verbo è coerente con l'avviso P1 e col glossario («Riserva. Non è una conferma»). Non promette più di quel che fa. | **Tenere** |

---

## Ospite: come funziona `/come-funziona` e `/en/how-it-works`

Ordine attuale: lead → i cinque passi → glossario → avvertenze → invito alla ricerca. **Giudizio sull'ordine:** giusto: prima il percorso, poi le parole, poi le eccezioni, in fondo l'azione.

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| CF1 | Titolo + lead «L'Ospite prenota una giornata intera su una postazione precisa… Il prezzo che leggi nel riepilogo è quello che paghi.» | La promessa centrale in una riga. | **Tenere** |
| CF2 | «Dalla ricerca al pass», cinque passi | Passi giusti e brevi; ma il passo «Cerca» dice «località, giorno e numero di ospiti»: manca il periodo, che pure è il caso in cui il riepilogo cambia di più. | **Riscrivere** il solo passo «Cerca» (proposta n. 10) |
| CF3 | «Le parole che usiamo»: Postazione · Giornata condivisa · Riserva · Pass | Un glossario di quattro voci è un'ottima idea. Ma la voce «Giornata condivisa» scrive i ruoli in minuscolo e a mezzo nome: «proposta dallo stagionale e autorizzata dal gestore» (en: «the season holder», «the manager»). Proprio il glossario deve dare i nomi esatti. | **Riscrivere** la voce (proposta n. 11) |
| CF4 | «Da sapere prima di prenotare»: giornate intere; condizioni dello stabilimento; «Pagamento in verifica» | Tre avvertenze vere, una idea per riga; la terza previene il doppio pagamento. | **Tenere** |
| CF5 | Chiusura «Comincia dalla ricerca — Indica località e giorno e guarda le postazioni libere, con il prezzo per la giornata.» + «Trova uno stabilimento» | Di nuovo solo «giorno» e «prezzo per la giornata». | **Riscrivere** (proposta n. 12) |

---

## Stagionale: come funziona `/stagionale` e `/en/season-holder`

Ordine attuale: lead → accesso all'area → quattro passi → regole in breve. **Giudizio sull'ordine:** il riquadro «La tua area riservata» prima dei passi è giusto: chi è già Stagionale cerca la porta, non la spiegazione.

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| S1 | Titolo + lead «Hai un abbonamento stagionale…? Proponi le giornate, il Gestore stabilimento le autorizza e un Ospite le prenota.» | I tre ruoli per esteso, la frase-motore del servizio ripetuta dal punto di vista giusto. | **Tenere** |
| S2 | «La tua area riservata» + «Accedi alla tua area» | Dice anche da dove arriva l'accesso (dal tuo stabilimento): previene la domanda «come mi registro?». | **Tenere** |
| S3 | Quattro passi: Chiedi l'accesso / Proponi le date / Il gestore autorizza / Segui il rendiconto | Contenuto giusto; ma «Il gestore verifica…» e il titolo «Il gestore autorizza» usano il mezzo nome in minuscolo (en: «The manager checks», «The manager approves»), mentre lead e lessico dicono «Gestore stabilimento». | **Riscrivere** le due occorrenze (proposta n. 13) |
| S4 | «Le regole in breve»: ritiro delle date, quota, riservatezza dei dati dell'ospite | Tre regole concrete, compresa quella sulla privacy che gioca a favore della fiducia. | **Tenere** |

---

## Gestore stabilimento `/gestore-stabilimento` e `/en/beach-manager`

Ordine attuale: lead → accesso al gestionale → quattro schermate → «Resti tu a decidere» → cosa comprende / cosa non comprende → come si attiva → costi → contatti → rimando al portale. **Giudizio sull'ordine:** giusto per un lettore professionale: prima la porta, poi la prova (schermate), poi il perimetro, in fondo le pratiche.

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| G1 | Titolo + lead «Ombrè è pensato per stabilimenti con postazioni fisse vendute a giornata intera…» | Dice subito per chi è e per chi non è: fa risparmiare tempo a entrambi. | **Tenere** |
| G2 | «Entra nel gestionale» + tasto | Elenca ciò che c'è dietro la porta (console, planner, incassi, statistiche, sito). | **Tenere** |
| G3 | «Il gestionale, in quattro schermate» + quattro didascalie | Schermate vere con didascalie che spiegano il mestiere di ciascuna. Un neo di battitura nella versione inglese: «Today on the beach» tra virgolette basse «…», estranee all'inglese. | **Riscrivere** solo le virgolette EN (proposta n. 14) |
| G4 | «Resti tu a decidere» | Risponde alla paura giusta del Gestore (perdere il controllo) con fatti: tetto giornaliero, sospensione vendite. | **Tenere** |
| G5 | «Cosa comprende il primo rilascio» (sei voci) | Concreto, lessico coerente («giornate degli stagionali, sempre con la tua autorizzazione»). | **Tenere** |
| G6 | «Cosa non comprende, per ora» | Dire i limiti prima della firma è la riga più credibile della pagina. | **Tenere** |
| G7 | «Come si attiva» (nove tappe) | Numerate, nell'ordine reale, con la prova d'acquisto prima dell'apertura. | **Tenere** |
| G8 | «Costi — Piani e commissioni saranno pubblicati qui al termine della fase pilota.» | Stato vuoto dichiarato, con il «qui» che promette dove guardare. | **Tenere** |
| G9 | «Contatti — I contatti saranno pubblicati qui all'avvio della fase pilota.» | Come G8. (La stessa riga è in Assistenza: lì serve all'Ospite, qui al Gestore — non è un doppione da eliminare.) | **Tenere** |
| G10 | «Guarda il portale come lo vede un Ospite» + due rimandi | Chiude il giro dei ruoli senza ripetere contenuto. | **Tenere** |

---

## Assistenza `/assistenza` e `/en/help`

Ordine attuale: sottotitolo → sei domande frequenti → contatti → invito alla ricerca. **Giudizio sull'ordine:** giusto; le domande seguono il percorso dell'Ospite (prenoto? prezzo? annullo? entro? pagamento in dubbio? dove?).

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| A1 | Titolo + «Risposte brevi su prenotazione, prezzo, annullamento e ingresso in spiaggia.» | Mantiene la promessa: le risposte sono davvero brevi. | **Tenere** |
| A2 | Le sei domande frequenti | Vere e coerenti con il resto del sito (riserva, pass, «Pagamento in verifica», zona pilota). Nessun lessico vecchio. | **Tenere** |
| A3 | «Contatti» (riga di attesa) | Vedi G9. | **Tenere** |
| A4 | Chiusura «Cerca una giornata al mare — … le postazioni libere per il giorno che scegli.» | Solo «giorno», manca il periodo. | **Riscrivere** (proposta n. 15) |

---

## Accesso `/area/accesso` e `/en/account/sign-in`

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| AC1 | «Accedi — Area riservata al Gestore stabilimento, alla reception e agli Stagionali.» | Vero **oggi** e scritto con i nomi giusti. Avvertenza per domani: l'iterazione in corso introduce il conto dell'Ospite; quando andrà in linea, questa riga diventerà falsa e andrà estesa (per esempio «…e a chi ha un conto Ombrè»). Da tenere d'occhio, non da cambiare ora. | **Tenere** |
| AC2 | Modulo: Email · Password · «Codice di verifica (solo se hai attivato la verifica in due passaggi)» · Accedi | Etichette asciutte; la parentesi sul codice evita il panico di chi non usa la verifica in due passaggi. **Nota di lessico:** qui la parola è «Password» — è il riferimento per le email M3 e M4, che oggi dicono «parola d'ordine». | **Tenere** |

---

## Email in coda (`packages/comms/src/index.ts`)

| Id | Blocco | Giudizio | Esito |
|---|---|---|---|
| M1 | Conferma di prenotazione («prenotazione … confermata») | Ottima: nel caso periodo scrive «Periodo: da giovedì… a sabato… (3 giornate)» e spiega che il pass è «unico per tutto il soggiorno e valido ogni giornata» — previene la domanda più probabile. L'avviso finale sul collegamento riservato è chiaro. | **Tenere** |
| M2 | Richiesta di pagamento («richiesta di pagamento per la prenotazione …») | Dice chi chiede, quanto, per che cosa, dove pagare e fino a quando. Nomina sempre l'intero soggiorno, mai il solo primo giorno. | **Tenere** |
| M3 | Conto pronto («il tuo conto è pronto») | Un difetto serio: «Parola d'ordine provvisoria» e «una parola d'ordine tua» — ma il modulo d'accesso in cui l'utente digiterà quella parola la chiama **Password** (AC2), e l'email inglese dice *password*. Stessa cosa, due nomi, nel passaggio più delicato (primo accesso). L'avviso «Non condividere questa email» è giusto. | **Riscrivere** (proposta n. 16) |
| M4 | Conto esistente («hai già un conto») | Impostazione corretta (spiega, non allarma, dice che il conto non è cambiato); stesso difetto di lessico: «con la tua parola d'ordine». | **Riscrivere** (proposta n. 17) |

---

## Elenco riassuntivo 1 — Blocchi da riscrivere, con i testi pronti

**1. H4 — Prima pagina, pannello mappa.**
IT — titolo: «Trova gli stabilimenti sulla mappa». Didascalia: «Ogni segnaposto è uno stabilimento attivo: aprilo per andare alla sua pagina.» Paragrafo: «Preferisci l'elenco? In «Ricerca ombrellone» trovi gli stessi stabilimenti, con la ricerca per località, periodo e ospiti.» Tasto: «Apri la ricerca ombrellone» (invariato).
EN — title: "Find the beach clubs on the map" (unchanged). Caption: "Each pin is an active beach club: open it to reach its page." Paragraph: "Prefer a list? In “Umbrella search” you find the same beach clubs, with a search by place, period and guests." Button: "Open the umbrella search" (unchanged).

**2. H6 — Prima pagina, «Tre passi», passo 1.**
IT: «Cerchi per località, giorno o periodo e numero di ospiti. Ogni postazione mostra la sua dotazione, per esempio un ombrellone e due lettini.»
EN: "Search by place, day or period and number of guests. Each spot shows what it includes, for example one umbrella and two sunbeds."

**3. R1 — Ricerca ombrellone, sottotitolo.**
IT: «Gli stabilimenti che accettano prenotazioni giornaliere, sulla mappa e in elenco, con disponibilità e prezzo per il giorno o il periodo scelto.»
EN: "The beach clubs that take daily bookings, on the map and in a list, with availability and price for the day or the period you choose."

**4. R3 — Ricerca ombrellone, pannello mappa.**
IT: «Gli stessi stabilimenti dell'elenco, con un segnaposto ciascuno. Gli stabilimenti senza posizione sulla mappa restano solo nell'elenco.»
EN: "The same beach clubs as the list, one pin each. Clubs without a map position stay in the list only."

**5. R4 — Ricerca ombrellone, stato senza data.**
IT: «Indica un giorno o un periodo per vedere le postazioni libere e il prezzo di partenza.»
EN: "Enter a day or a period to see the free spots and the starting price."

**6. R5 — Ricerca ombrellone, nota del periodo** (allineata a L11; N e ospiti restano variabili).
IT: «Periodo di N giornate: uno stabilimento compare solo con postazioni libere in tutte le giornate, e il prezzo è il totale dell'intero periodo. Postazioni per N ospiti.»
EN: "Period of N days: a beach club is listed only with spots free on every day, and the price is the total for the whole period. Spots for N guests."

**7. L1 — Scheda del lido, sottotitolo e ancora.**
IT — sottotitolo: «Stabilimento balneare a [località]. Scegli un giorno o un periodo e guarda le postazioni libere.» Ancora: «Vai alla scelta della postazione».
EN — subtitle: "Beach club in [place]. Choose a day or a period and see the free spots." Anchor: "Go to spot selection".

**8. L8 — Scheda del lido, nota della planimetria.**
IT: «Ogni simbolo della planimetria è una postazione: ombrellone, lettino, gazebo o tenda. Scegli una postazione libera per vedere il riepilogo e continuare.»
EN: "Each symbol on the beach map is a spot: umbrella, sunbed, gazebo or tent. Choose a free one to see its summary and continue."

**9. L13 — Scheda del lido, chiusura delle non disponibili** (vale per giorno e periodo).
IT: «Non disponibili per questa ricerca: …»
EN: "Not available for this search: …"

**10. CF2 — Ospite: come funziona, passo «Cerca».**
IT: «Indichi località, giorno o periodo e numero di ospiti. Per cercare non serve registrarsi.»
EN: "Enter the place, a day or a period and the number of guests. You do not need an account to search."

**11. CF3 — Glossario, voce «Giornata condivisa».**
IT: «Una giornata su una postazione in abbonamento, proposta dallo Stagionale e autorizzata dal Gestore stabilimento.»
EN: "A day on a season pass spot, offered by the Season holder and approved by the Beach manager."

**12. CF5 — Ospite: come funziona, chiusura.**
IT: «Indica località e un giorno o un periodo e guarda le postazioni libere, con il loro prezzo.»
EN: "Enter a place and a day or a period and see the free spots, with their price."

**13. S3 — Stagionale, due occorrenze del ruolo.**
IT: «Il Gestore stabilimento verifica contratto, periodo e postazione.» — titolo del terzo passo: «Il Gestore stabilimento autorizza».
EN: "The Beach manager checks contract, period and spot." — step title: "The Beach manager approves".

**14. G3 — Gestore stabilimento, didascalia inglese della console.**
EN: "The “Today on the beach” console: one tile per spot, with states, filters and the summary of the day." (solo le virgolette: da «…» a “…”; l'italiano resta invariato).

**15. A4 — Assistenza, chiusura.**
IT: «Nella pagina Ricerca ombrellone trovi gli stabilimenti attivi e le postazioni libere per il giorno o il periodo che scegli.»
EN: "On the Umbrella search page you find the active beach clubs and the free spots for the day or the period you choose."

**16. M3 — Email «il tuo conto è pronto» (solo italiano; l'inglese già dice password).**
IT: «Password provvisoria: …» e «Entra da questa pagina; ti verrà chiesto subito di scegliere una password tua:». Il resto invariato.

**17. M4 — Email «hai già un conto» (solo italiano).**
IT: «Puoi entrare da questa pagina con la tua password:». Il resto invariato.

## Elenco riassuntivo 2 — Blocchi da spostare o eliminare, con i motivi

**Da spostare: nessuno.** Ogni informazione censita è già nella pagina in cui serve; i doppioni trovati erano da correggere sul posto (R5 allineata a L11) o da eliminare, non da trasferire.

**Da eliminare: uno.**
- **H5 — pannello «Tutto in un posto solo», prima pagina, titolo e cinque carte, IT e EN.** Motivo: è falso in tre carte su cinque («Ricerca postazione», «Mappa spiaggia» come funzione a sé, «giorno» senza periodo), non è azionabile (nessuna carta è un collegamento) e duplica integralmente blocchi migliori della stessa pagina: il modulo di ricerca (H3), la mappa (H4), «Tre passi, dal telefono» (H6), «Da dove arrivano le giornate disponibili» (H7) e «Per chi è» (H8). Il mestiere ipotizzato dal mandato — «come funziona, in breve» per l'Ospite — è già svolto da H6. Dopo l'eliminazione il Gestore stabilimento resta visibile nel terzo tasto e nella terza carta di «Per chi è», entrambi con collegamento.

## Ciò che non ho potuto vedere

- **Gli extra nel riepilogo di prenotazione.** Il mandato li nomina, ma nessuno dei due stabilimenti dimostrativi ne pubblica: nelle pagine `/prenota` compaiono solo riepilogo, codice promozionale e condizioni. I testi degli extra restano non periziati.
- **Il percorso dopo «Riserva la postazione»** (pagina di pagamento, schermata del pass, pagina «Pagamento in verifica»): per mandato non ho completato prenotazioni. Dei testi del pass e della verifica ho visto solo ciò che ne dicono le altre pagine e l'email di conferma.
- **Le condizioni di annullamento pubblicate:** entrambi i lidi mostrano lo stato «non ancora pubblicate»; il testo di condizioni reali non è giudicabile.
- **L'area riservata** (Gestore, reception, Stagionale) e le pagine `/paga/{token}`: fuori dal perimetro pubblico della perizia.
- **I nomi dei tipi di postazione nelle pagine inglesi** (L10): «Ombrellone», «Lettino singolo», «Tenda araba» arrivano dai dati dello stabilimento, non dai dizionari, e in inglese restano in italiano mentre la legenda li traduce. La correzione è nei dati (nome tradotto o traduzione dei dati dimostrativi), non nei testi d'interfaccia: la segnalo senza proposta di testo.
- **Email oltre le quattro censite:** in `packages/comms` esistono solo conferma, richiesta di pagamento e le due email di conto; eventuali altre comunicazioni (annullamento, promemoria) non esistono ancora e non sono giudicabili.
