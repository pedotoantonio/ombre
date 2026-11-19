# Testi: le schede predefinite dei tipi di postazione

Redazione del 19/11/2026 per la commessa «La scheda della postazione»
([specifica](specifica-scheda-postazione.md), §1, livello 1). Sono i testi
che un lido mostra quando il Gestore stabilimento non ha scritto nulla.
Destinazione: `packages/shared/src/domain/type-cards.ts`, chiavi
`typeCards.{segno}.{campo}`. I testi qui sotto sono la versione **dopo il
vaglio d'usabilità** del 19/11/2026 (sezione in fondo): le voci corrette
hanno preso il posto della proposta originale.

## Regole seguite

1. **Valgono per qualunque stabilimento.** Nessun testo afferma una
   dotazione, una capienza, un prezzo, un orario o un servizio che dipenda
   dal lido. Quello che il lido ha davvero arriva dai dati del tipo
   (`umbrellas`, `sunbeds`, `maxGuests`, dettagli) e la scheda lo mostra
   accanto: i testi qui sotto rimandano a quei dati, non li sostituiscono.
2. **Concreti e onesti.** Dicono che cosa si trova e come si usa quel tipo.
   Niente iperboli, superlativi, promesse; vietati «vista mozzafiato»,
   «relax assoluto» e simili. Nessuna frase che prometta più di quanto la
   piattaforma sa.
3. **Cautela nella dotazione.** Le note di dotazione tipica dicono «di
   norma» e rimandano a «dove indicato» o alla dotazione della postazione.
4. **Lessico unico** (perizia di usabilità): «postazione», «periodo»,
   «giornata», «prenotazione»; i tre nomi Ospite / Stagionale / Gestore
   stabilimento (Guest / Season holder / Beach manager), qui usati solo
   dove serve («il lido» per lo stabilimento nel testo corrente, come nelle
   guide del sito). In inglese «spot», «beach club» e i nomi dei segni già
   presenti nel dizionario: Umbrella, Single sunbed, Deck chair, Gazebo,
   Tent, Daybed, Canvas gazebo, Canoe, SUP, Pedal boat, Jet ski.
5. **Lunghezze.** Descrizione 2–3 frasi brevi; dotazione una frase breve;
   consiglio una frase, presente solo dove aggiunge qualcosa di vero e di
   nuovo (manca per ombrellone, lettino singolo e tenda a telo).
6. **Tono** del sito: seconda persona singolare («trovi», «controlla»),
   frasi asciutte, nessun punto esclamativo.
7. **Domande della perizia**, tenute presenti scrivendo: vero oggi (ogni
   frase vale per il tipo in generale); serve qui (ciascuna aiuta a capire
   che cosa si prenota); semplice (parole d'uso corrente, niente gergo
   nautico oltre al nome del mezzo); lessico unico; non duplica (la
   dotazione e la capienza esatte non si ripetono: stanno nei dati; e la
   descrizione non ripete la nota di dotazione).

## Contenuti comuni (una volta sola)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.panel.title` | I tipi di postazione | Spot types |
| `typeCards.link.label` | Vedi la scheda | See the card |

**Titolo del riquadro.** Il riquadro elenca i tipi offerti dal lido, non
le postazioni singole: «Le postazioni» si confondeva con «Elenco delle
postazioni libere» della stessa pagina. «I tipi di postazione» dice che
cosa si legge e usa la parola unica; in inglese «Spot types» (non
«spaces», non «types» da solo).

**Etichetta del collegamento.** «Vedi la scheda» dice che cosa si apre
(la «scheda della postazione») senza sembrare un dubbio sull'oggetto. In
inglese «See the card», che rispecchia «card» del dizionario («Open the
card of …», «Close the card») invece del generico «details». Il frontend vi
accosta il nome del tipo (testo nascosto agli occhi ma letto dagli screen
reader: «Vedi la scheda: Ombrellone»), così ogni collegamento in elenco
resta distinguibile; dove il nome del tipo è già esso stesso il
collegamento (planimetria, barra di selezione) l'etichetta non serve.

## Ombrellone — `umbrella` (en: Umbrella)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.umbrella.description` | Una postazione con un ombrellone, che fa ombra a chi sta sotto. È la stessa per tutta la prenotazione, anche se scegli un periodo di più giornate. | A spot with an umbrella, giving shade to those underneath. It is the same spot for the whole booking, even if you choose a period of several days. |
| `typeCards.umbrella.equipmentNote` | Di norma un ombrellone con lettini o sdraio, come indicato nella dotazione della postazione. | Usually an umbrella with sunbeds or deck chairs, as listed in the spot's equipment. |
| `typeCards.umbrella.tip` | (nessun consiglio: ripeterebbe la descrizione) | (no tip: it would repeat the description) |

## Lettino singolo — `sunbed` (en: Single sunbed)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.sunbed.description` | Un lettino singolo per stare distesi. L'ombra non è compresa, salvo dove indicato. | A single sunbed to lie on. Shade is not included unless stated. |
| `typeCards.sunbed.equipmentNote` | Di norma un solo lettino, senza ombrellone. | Usually one sunbed, without an umbrella. |
| `typeCards.sunbed.tip` | (nessun consiglio: non aggiunge nulla di vero a quanto già detto) | (no tip: it would add nothing true beyond what is said above) |

## Sdraio — `deckchair` (en: Deck chair)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.deckchair.description` | Una sdraio: una sedia con lo schienale reclinabile, per stare seduti più che distesi. Si prenota da sola, come una postazione a sé. | A deck chair: a chair with a reclining back, for sitting rather than lying flat. It is booked on its own, as a spot in itself. |
| `typeCards.deckchair.equipmentNote` | Di norma una sdraio; l'ombrellone c'è dove indicato. | Usually one deck chair; an umbrella is included where stated. |
| `typeCards.deckchair.tip` | Adatta a chi preferisce stare seduto, per esempio per leggere o chiacchierare. | Suits those who prefer to sit, for example to read or chat. |

## Gazebo — `gazebo` (en: Gazebo)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.gazebo.description` | Una struttura con il tetto, di norma aperta sui lati, che copre più spazio di un ombrellone. Dà ombra e un po' di riparo a più persone insieme. | A structure with a roof, usually open at the sides, covering more space than an umbrella. It gives shade and some cover to several people together. |
| `typeCards.gazebo.equipmentNote` | Di norma lettini o sedute sotto il tetto; il resto, dove indicato. | Usually sunbeds or seats under the roof; anything else where stated. |
| `typeCards.gazebo.tip` | Per gruppi e famiglie: controlla quanti ospiti può contenere. | For groups and families: check how many guests it holds. |

## Tenda — `tent` (en: Tent)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.tent.description` | Una tenda con pareti di stoffa, di norma aperta davanti. Ripara dal sole e in parte dal vento, e dà un angolo più riservato. | A tent with fabric walls, usually open at the front. It shelters from the sun and partly from the wind, and gives a more private corner. |
| `typeCards.tent.equipmentNote` | Di norma lettini o sedute dentro la tenda; il resto, dove indicato. | Usually sunbeds or seats inside the tent; anything else where stated. |
| `typeCards.tent.tip` | Utile se cerchi più riparo dal sole, per esempio con bambini piccoli. | Useful if you want more shelter from the sun, for example with small children. |

## Lettone — `daybed` (en: Daybed)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.daybed.description` | Un lettone: un letto largo con materasso, per stare distesi o seduti in più persone. Occupa più spazio di un lettino singolo. | A daybed: a wide bed with a mattress, for lying or sitting with several people. It takes up more room than a single sunbed. |
| `typeCards.daybed.equipmentNote` | Di norma il lettone con il suo materasso; ombrellone o copertura, dove indicato. | Usually the daybed with its mattress; an umbrella or cover where stated. |
| `typeCards.daybed.tip` | Prima di prenotare controlla quanti ospiti può contenere. | Before booking, check how many guests it holds. |

## Tenda a telo — `canopy` (en: Canvas gazebo)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.canopy.description` | Un telo teso su pali, senza pareti. Fa ombra su un'area più ampia di un ombrellone ma resta aperto da ogni lato, quindi ripara dal sole più che dal vento. | A canvas sheet stretched over poles, without walls. It shades a larger area than an umbrella but stays open on every side, so it shelters from the sun more than from the wind. |
| `typeCards.canopy.equipmentNote` | Di norma lettini o sedute sotto il telo; il resto, dove indicato. | Usually sunbeds or seats under the sheet; anything else where stated. |
| `typeCards.canopy.tip` | (nessun consiglio: ripeterebbe la descrizione) | (no tip: it would repeat the description) |

## Canoa — `canoe` (en: Canoe)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.canoe.description` | Una canoa che si muove con la pagaia, per una o più persone. Prenoti il mezzo per la giornata o il periodo che scegli, non un posto in spiaggia. Dove e come uscire in acqua lo decide il lido. | A canoe moved with a paddle, for one or more people. You book the craft for the day or period you choose, not a place on the beach. Where and how to go out on the water is up to the beach club. |
| `typeCards.canoe.equipmentNote` | Di norma la canoa con le pagaie; il giubbotto di salvataggio, dove indicato. | Usually the canoe with paddles; a life jacket where stated. |
| `typeCards.canoe.tip` | Controlla quanti ospiti può portare. | Check how many guests it carries. |

## SUP — `sup` (en: SUP)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.sup.description` | Il SUP (stand up paddle) è una tavola su cui si sta in piedi o in ginocchio, spingendosi con una pagaia. Prenoti la tavola per la giornata o il periodo che scegli, non un posto in spiaggia. Dove e come uscire in acqua lo decide il lido. | A SUP (stand up paddle) is a board you stand or kneel on, pushing yourself along with a paddle. You book the board for the day or period you choose, not a place on the beach. Where and how to go out on the water is up to the beach club. |
| `typeCards.sup.equipmentNote` | Di norma la tavola con la pagaia; il giubbotto di salvataggio, dove indicato. | Usually the board with a paddle; a life jacket where stated. |
| `typeCards.sup.tip` | Richiede un po' di equilibrio: se è la prima volta, chiedi consiglio al lido. | It takes some balance: if it is your first time, ask the beach club for advice. |

## Pedalò — `pedalo` (en: Pedal boat)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.pedalo.description` | Un pedalò è un'imbarcazione che si muove pedalando, stando seduti. Prenoti il mezzo per la giornata o il periodo che scegli, non un posto in spiaggia. Dove e come uscire in acqua lo decide il lido. | A pedal boat moves by pedalling, and you stay seated. You book the craft for the day or period you choose, not a place on the beach. Where and how to go out on the water is up to the beach club. |
| `typeCards.pedalo.equipmentNote` | Di norma il pedalò; il giubbotto di salvataggio, dove indicato. | Usually the pedal boat; a life jacket where stated. |
| `typeCards.pedalo.tip` | Per stare in acqua senza pagaiare: controlla quanti ospiti può portare. | For being on the water without paddling: check how many guests it carries. |

## Moto d'acqua — `jetski` (en: Jet ski)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.jetski.description` | Una moto d'acqua è un mezzo a motore che si guida con un manubrio, per una o più persone. Prenoti il mezzo per la giornata o il periodo che scegli, non un posto in spiaggia. Chi può guidarla, con quali documenti e in quali zone, dipende dalla legge e dal lido. | A jet ski is a motorised craft steered with handlebars, for one or more people. You book the craft for the day or period you choose, not a place on the beach. Who may ride it, with what documents and in which areas, depends on the law and on the beach club. |
| `typeCards.jetski.equipmentNote` | Di norma la moto d'acqua; il giubbotto di salvataggio, dove indicato. | Usually the jet ski; a life jacket where stated. |
| `typeCards.jetski.tip` | Prima di prenotare chiedi al lido che cosa serve per guidarla. | Before booking, ask the beach club what you need to ride it. |

## Note per il frontend e per il vaglio

- Le voci «Di norma… dove indicato» non vanno mai mostrate come dotazione
  certa: la scheda le presenta come nota **sotto** la dotazione vera
  (quella dei dati), con la stessa formattazione di una nota, non di un
  elenco di dotazioni.
- Il consiglio (`.tip`) è facoltativo per segno: se assente, non si mostra
  nulla (per `umbrella`, `sunbed` e `canopy` è assente di proposito; le
  righe della tabella sopra sono solo un promemoria e non vanno copiate
  nel codice).
- Nessun testo contiene prezzi, orari o nomi di lidi. Nessun testo dipende
  dalla stagione.
- Se il lido scrive una propria descrizione (livello 2), la predefinita non
  si mostra insieme: la risoluzione è per campo (specifica §1), quindi
  descrizione, dotazione e consiglio si possono sostituire uno per uno.
- I due dubbi dichiarati dal redattore (rimando alle «norme» per la moto
  d'acqua; «tenda» e «tenda a telo») hanno risposta nel vaglio in fondo.

## Vaglio d'usabilità (19/11/2026)

**Metodo.** Ogni blocco it e en è passato alle cinque domande della
perizia: (1) vero oggi per qualunque lido? (2) serve a chi sta per
prenotare? (3) è semplice? (4) lessico unico, «spot» in inglese? (5)
duplica quello che la pagina già dice (dotazione e capienza dai dati del
tipo; la descrizione non deve ripetere la nota)? Dove un blocco non
passava, la versione nuova è scritta al posto della vecchia, qui sopra.
Nessuna voce aggiunta. Difetti ricorrenti trovati e tolti:

- **Promesse non vere per ogni lido:** «piantato nella sabbia»,
  «di solito nelle file più vicine all'acqua», «fila e numero»,
  «i sedili affiancati», «non serve una particolare esperienza», «dove
  lasciare le proprie cose». Ogni lido ha una spiaggia e una dotazione sua.
- **Doppioni con la pagina o tra campi:** la planimetria già mostra fila e
  numero; «dotazione e capienza sono quelle indicate dal lido» ripeteva la
  nota di dotazione e la scheda stessa; la descrizione dell'ombrellone, del
  lettone e della sdraio ripeteva la nota («lo dice la dotazione»); «La
  dotazione … li trovi nella scheda» era un rimando alla pagina in cui il
  testo già sta.
- **Lessico:** le imbarcazioni dicevano solo «giornata scelta», ma il
  sito prenota anche per periodo: ora «giornata o periodo»; «posti» e
  «persone» alternati per «ospiti» nei consigli.
- **Frasi lunghe e ripetute:** la formula «come e dove uscire in acqua lo
  stabilisce il lido, con le sue regole di sicurezza» (due clausole, una
  non verificabile) è ora «dove e come uscire in acqua lo decide il lido».
- **Inglese non speculare:** «paddled by hand» (non traduce «a pagaia»),
  «with one or more seats» (diverso da «una o più persone»), «See details»
  (il dizionario dice «card»).

### Verdetto per segno

| Segno | Verdetto | Perché |
|---|---|---|
| Titolo riquadro | Riscritta | «Le postazioni» si confondeva con l'elenco delle postazioni libere della stessa pagina; il riquadro elenca i tipi |
| Ombrellone | Riscritta | «Piantato nella sabbia» e «fila e numero» non valgono per ogni lido; la frase sulla dotazione ripeteva la nota; tip tolto (ripeteva «la stessa postazione») |
| Lettino singolo | Riscritta | «Di solito nelle file più vicine all'acqua» è falso in generale; fila e numero duplicavano la planimetria |
| Sdraio | Riscritta | «Seggiola pieghevole» poco corrente; frase su ombrellone e posti duplicava la nota; «fila e numero» non vero per ogni lido |
| Gazebo | Riscritta (lieve) | «Capienza e dotazione sono quelle indicate dal lido» duplicava dati e nota; il resto reggeva |
| Tenda | Riscritta | «Aperta davanti o con una parte che si chiude» promette una forma; «nella scheda» rimandava a sé stessa; «tela» ora riservato al telo, per distinguerla dall'altra |
| Lettone | Riscritta | Due frasi su tre duplicavano la nota («si prenota come una postazione precisa», «se c'è una copertura»); consiglio lungo |
| Tenda a telo | Riscritta | Due frasi dicevano «senza pareti» e «aperto da ogni lato»; capienza duplicata; tip tolto (ripeteva la descrizione) |
| Canoa | Riscritta (lieve) | Solo «giornata», non il periodo; clausola sulla sicurezza non verificabile; EN «paddled by hand» |
| SUP | Riscritta (lieve) | Solo «giornata»; stessa clausola; consiglio ambiguo («chiedilo» a chi?). Definizione del SUP: passata |
| Pedalò | Riscritta | «Sedili affiancati» e «non serve una particolare esperienza» non verificabili (età, regole del lido); il consiglio ripeteva «si sta seduti» |
| Moto d'acqua | Riscritta | Vedi risposta sotto: rimando alle norme trasformato in un'azione; stessa correzione sul periodo |

Sono **passati** senza cambiare parola: le note di dotazione di sunbed,
deckchair (parte «l'ombrellone c'è dove indicato»), canoe, sup, pedalo,
jetski; la definizione del SUP; la descrizione del lettino singolo nella
parte sull'ombra; l'assenza di consiglio per il lettino singolo. Iperboli
residue: nessuna trovata, nessun superlativo. Il tono (seconda persona,
frasi asciutte, niente punto esclamativo) è passato ovunque.

### Risposta ai due punti del redattore

**(a) Il rimando generico alle «norme» per la moto d'acqua.** La scelta di
non enunciare requisiti è giusta: età, patente e documenti variano per
luogo e per lido, e la piattaforma non può promettere nulla. Ma il rimando
nudo («dipende dalle norme e dal lido, che li indica») fallisce due prove:
dice «che li indica» come se ogni lido lo facesse (non verificabile) e non
dice che cosa fare. Soluzione adottata: la descrizione dice soltanto *che
cosa dipende* («chi può guidarla, con quali documenti e in quali zone,
dipende dalla legge e dal lido»; «norme» passa a «legge», parola d'uso
corrente) e il consiglio dà l'azione: «Prima di prenotare chiedi al lido
che cosa serve per guidarla». Non si elencano requisiti.

**(b) «Tenda» e «tenda a telo».** La distinzione per le pareti regge, ma
solo se ciascuna descrizione la apre con ciò che le distingue e se le due
non condividono il materiale: prima entrambe dicevano «tela» e «telo», e
in inglese «canvas walls» contro «canvas sheet» (e il nome «Canvas
gazebo» richiama anche il Gazebo). Ora la tenda ha «pareti di stoffa» («fabric
walls») e il telo è «senza pareti», «aperto da ogni lato», con la sola
parola «telo»/«canvas sheet». Per il Gazebo, il discrimine è il tetto
contro il telo teso su pali. Resta una riserva fuori da questo file: in
inglese il nome «Canvas gazebo» (dizionario, non dei testi) è il più
confondibile dell'insieme; se il dizionario si potesse ritoccare, «Canopy»
(il nome della chiave) sarebbe più chiaro. Non lo cambio qui: i nomi dei
segni sono presupposto di questo vaglio.

### Giudizio sulle etichette comuni

- **«Le postazioni» / «The spots» — riscritta in «I tipi di postazione» /
  «Spot types».** Il riquadro mostra i tipi offerti, non le postazioni
  singole; la stessa pagina ha poi l'elenco delle postazioni libere e il
  doppio senso è reale. Attenzione: la specifica (riga 60 di
  `specifica-scheda-postazione.md`) nomina il riquadro «Le postazioni» e
  va allineata dall'autore.
- **«Vedi la scheda» — passata in italiano; «See details» riscritta in
  «See the card».** In italiano è coerente con «scheda della postazione» e
  con «Vedi le postazioni libere» già in uso; resta il rischio di essere
  scambiata per la scheda del lido, attenuato dal nome del tipo accostato
  (anche per gli screen reader). In inglese il dizionario chiama «card» la
  stessa cosa; «details» era un'altra parola per lo stesso oggetto.
