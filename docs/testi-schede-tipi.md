# Testi: le schede predefinite dei tipi di postazione

Redazione del 19/11/2026 per la commessa «La scheda della postazione»
([specifica](specifica-scheda-postazione.md), §1, livello 1). Sono i testi
che un lido mostra quando il Gestore stabilimento non ha scritto nulla.
Destinazione: `packages/shared/src/domain/type-cards.ts`, chiavi
`typeCards.{segno}.{campo}`. Una proposta sola per voce; il vaglio
spetta all'esperto di usabilità.

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
5. **Lunghezze.** Descrizione 2–4 frasi; dotazione una frase breve;
   consiglio una frase, presente solo dove aggiunge qualcosa di vero
   (per il lettino singolo manca di proposito).
6. **Tono** del sito: seconda persona singolare («trovi», «controlla»),
   frasi asciutte, nessun punto esclamativo.
7. **Domande della perizia**, tenute presenti scrivendo: vero oggi (ogni
   frase vale per il tipo in generale); serve qui (ciascuna aiuta a capire
   che cosa si prenota); semplice (parole d'uso corrente, niente gergo
   nautico oltre al nome del mezzo); lessico unico; non duplica (la
   dotazione e la capienza esatte non si ripetono: stanno nei dati).

## Contenuti comuni (una volta sola)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.panel.title` | Le postazioni | The spots |
| `typeCards.link.label` | Vedi la scheda | See details |

**Titolo del riquadro.** «Le postazioni» è già il nome fissato dalla
specifica e usa la parola unica «postazione»; in inglese «The spots»
rispecchia «free spots» e «spot» del dizionario (non «spaces», non «types»).

**Etichetta del collegamento.** Scelgo «Vedi la scheda» e non «Che cos'è?»:
dice che cosa si apre (la «scheda della postazione») senza sembrare un
dubbio sull'oggetto, e funziona anche per un nome che l'Ospite conosce già.
Il frontend vi accosta il nome del tipo (testo nascosto agli occhi ma
letto dagli screen reader: «Vedi la scheda: Ombrellone»), così ogni
collegamento in elenco resta distinguibile; dove il nome del tipo è già
esso stesso il collegamento (planimetria, barra di selezione) l'etichetta
non serve.

## Ombrellone — `umbrella` (en: Umbrella)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.umbrella.description` | Una postazione con un ombrellone piantato nella sabbia, che fa ombra a chi sta sotto. Hai lo stesso posto per la giornata scelta, con fila e numero che vedi sulla planimetria. Quanti lettini o sdraio ci siano accanto lo dice la dotazione della postazione. | A spot with an umbrella fixed in the sand, giving shade to those underneath. You have the same place for the day you choose, with a row and number you can see on the beach map. How many sunbeds or deck chairs come with it is shown in the spot's equipment. |
| `typeCards.umbrella.equipmentNote` | Di norma un ombrellone con lettini o sdraio; il numero preciso è nella dotazione della postazione. | Usually an umbrella with sunbeds or deck chairs; the exact number is in the spot's equipment. |
| `typeCards.umbrella.tip` | Comodo per chi vuole un posto stabile dove lasciare le proprie cose. | Handy if you want a fixed place to leave your things. |

## Lettino singolo — `sunbed` (en: Single sunbed)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.sunbed.description` | Un lettino singolo per sdraiarsi, senza ombrellone. Di solito sta nelle file più vicine all'acqua, e lo vedi sulla planimetria con la sua fila e il suo numero. L'ombra non è compresa, salvo dove indicato. | A single sunbed to lie on, without an umbrella. It is usually in the rows closest to the water, and you can see it on the beach map with its row and number. Shade is not included unless stated. |
| `typeCards.sunbed.equipmentNote` | Di norma un solo lettino, senza ombrellone. | Usually one sunbed, without an umbrella. |
| `typeCards.sunbed.tip` | (nessun consiglio: non aggiunge nulla di vero a quanto già detto) | (no tip: it would add nothing true beyond what is said above) |

## Sdraio — `deckchair` (en: Deck chair)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.deckchair.description` | Una sdraio: una seggiola pieghevole con lo schienale reclinabile, su cui si sta più seduti che distesi. La prenoti come una postazione precisa, con fila e numero. Se c'è un ombrellone, o quanti posti ci sono, lo dice la dotazione della postazione. | A deck chair: a folding chair with a reclining back, on which you sit rather than lie flat. You book it as a specific spot, with a row and number. Whether there is an umbrella, and how many seats, is shown in the spot's equipment. |
| `typeCards.deckchair.equipmentNote` | Di norma una sdraio; l'ombrellone c'è dove indicato. | Usually one deck chair; an umbrella is included where stated. |
| `typeCards.deckchair.tip` | Comoda per chi preferisce stare seduto, per leggere o chiacchierare. | Comfortable if you prefer to sit, to read or chat. |

## Gazebo — `gazebo` (en: Gazebo)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.gazebo.description` | Una struttura con il tetto, di norma aperta sui lati, che copre una postazione più ampia di un ombrellone. Dà ombra e un po' di riparo a più persone insieme. Capienza e dotazione sono quelle indicate dal lido per questa postazione. | A structure with a roof, usually open at the sides, covering a larger spot than an umbrella. It gives shade and some cover to several people together. Capacity and equipment are those the beach club states for this spot. |
| `typeCards.gazebo.equipmentNote` | Di norma una struttura coperta con lettini o sedute; il resto, dove indicato. | Usually a covered structure with sunbeds or seats; anything else where stated. |
| `typeCards.gazebo.tip` | Pensato per gruppi e famiglie: controlla quanti ospiti può contenere. | Meant for groups and families: check how many guests it holds. |

## Tenda — `tent` (en: Tent)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.tent.description` | Una tenda con pareti di tela, aperta davanti o con una parte che si chiude. Ripara dal sole e in parte dal vento, e dà un angolo più riservato. La dotazione e il numero di ospiti dipendono dal lido e li trovi nella scheda. | A tent with canvas walls, open at the front or with a side that closes. It shelters from the sun and partly from the wind, and gives a more private corner. Equipment and number of guests depend on the beach club and are shown on the card. |
| `typeCards.tent.equipmentNote` | Di norma una tenda con lettini o sedute; il resto, dove indicato. | Usually a tent with sunbeds or seats; anything else where stated. |
| `typeCards.tent.tip` | Utile per chi cerca più riparo dal sole, per esempio con bambini piccoli. | Useful if you want more shelter from the sun, for example with small children. |

## Lettone — `daybed` (en: Daybed)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.daybed.description` | Un lettone: un letto largo con materasso, su cui si sta distesi o seduti in più persone. Occupa più spazio di un lettino singolo e si prenota come una postazione precisa. Se c'è una copertura sopra, lo dice la dotazione. | A daybed: a wide bed with a mattress, where several people can lie or sit together. It takes up more room than a single sunbed and is booked as a specific spot. Whether there is a cover above it is shown in the equipment. |
| `typeCards.daybed.equipmentNote` | Di norma un letto largo con materasso; ombrellone o copertura, dove indicato. | Usually a wide bed with a mattress; an umbrella or cover where stated. |
| `typeCards.daybed.tip` | Pensato per due o più persone che vogliono stare vicine: controlla quanti ospiti può contenere. | Meant for two or more people who want to stay close: check how many guests it holds. |

## Tenda a telo — `canopy` (en: Canvas gazebo)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.canopy.description` | Un telo teso su pali, senza pareti: fa ombra su un'area più ampia di un ombrellone, ma resta aperto da ogni lato. È una struttura leggera, quindi ripara dal sole più che dal vento. Dotazione e capienza sono quelle indicate dal lido. | A canvas sheet stretched over poles, without walls: it shades a larger area than an umbrella but stays open on every side. It is a light structure, so it shelters from the sun more than from the wind. Equipment and capacity are those the beach club states. |
| `typeCards.canopy.equipmentNote` | Di norma un telo su pali con lettini o sedute; il resto, dove indicato. | Usually a sheet on poles with sunbeds or seats; anything else where stated. |
| `typeCards.canopy.tip` | Per chi vuole un'ombra ampia senza pareti attorno. | For those who want wide shade without walls around. |

## Canoa — `canoe` (en: Canoe)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.canoe.description` | Una canoa da condurre a pagaia, da una o più persone. Prenoti il mezzo per la giornata scelta, non un posto in spiaggia. Come e dove uscire in acqua lo stabilisce il lido, con le sue regole di sicurezza. | A canoe paddled by hand, for one or more people. You book the craft for the day you choose, not a place on the beach. How and where to go out on the water is set by the beach club, with its safety rules. |
| `typeCards.canoe.equipmentNote` | Di norma la canoa con le pagaie; il giubbotto di salvataggio, dove indicato. | Usually the canoe with paddles; a life jacket where stated. |
| `typeCards.canoe.tip` | Il mezzo si prenota intero: controlla quante persone può portare. | The craft is booked as a whole: check how many people it carries. |

## SUP — `sup` (en: SUP)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.sup.description` | Il SUP (stand up paddle) è una tavola su cui si sta in piedi o in ginocchio, spingendosi con una pagaia. Prenoti la tavola per la giornata scelta, non un posto in spiaggia. Come e dove uscire in acqua lo stabilisce il lido, con le sue regole di sicurezza. | A SUP (stand up paddle) is a board you stand or kneel on, pushing yourself along with a paddle. You book the board for the day you choose, not a place on the beach. How and where to go out on the water is set by the beach club, with its safety rules. |
| `typeCards.sup.equipmentNote` | Di norma la tavola con la pagaia; il giubbotto di salvataggio, dove indicato. | Usually the board with a paddle; a life jacket where stated. |
| `typeCards.sup.tip` | Richiede un po' di equilibrio: se è la prima volta, chiedilo al lido. | It takes some balance: if it is your first time, ask the beach club. |

## Pedalò — `pedalo` (en: Pedal boat)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.pedalo.description` | Un pedalò è un'imbarcazione che si muove pedalando, con i sedili affiancati. Si sta seduti e non serve una particolare esperienza. Prenoti il mezzo per la giornata scelta; come e dove uscire in acqua lo stabilisce il lido, con le sue regole di sicurezza. | A pedal boat moves by pedalling, with seats side by side. You sit and no particular experience is needed. You book the craft for the day you choose; how and where to go out on the water is set by the beach club, with its safety rules. |
| `typeCards.pedalo.equipmentNote` | Di norma il pedalò; il giubbotto di salvataggio, dove indicato. | Usually the pedal boat; a life jacket where stated. |
| `typeCards.pedalo.tip` | Si sta seduti: va bene per chi vuole stare in acqua senza pagaiare. Controlla quanti posti ha. | You stay seated: good if you want to be on the water without paddling. Check how many seats it has. |

## Moto d'acqua — `jetski` (en: Jet ski)

| Chiave | Italiano | Inglese |
|---|---|---|
| `typeCards.jetski.description` | Una moto d'acqua è un mezzo a motore che si guida con un manubrio, a uno o più posti. Prenoti il mezzo per la giornata scelta, non un posto in spiaggia. Chi può guidarlo, con quali documenti e in quali zone dipende dalle norme e dal lido, che li indica. | A jet ski is a motorised craft steered with handlebars, with one or more seats. You book the craft for the day you choose, not a place on the beach. Who may ride it, with what documents and in which areas depends on the regulations and the beach club, which states them. |
| `typeCards.jetski.equipmentNote` | Di norma la moto d'acqua; il giubbotto di salvataggio, dove indicato. | Usually the jet ski; a life jacket where stated. |
| `typeCards.jetski.tip` | Prima di prenotare controlla i requisiti per guidarla. | Before booking, check the requirements to ride it. |

## Note per il frontend e per il vaglio

- Le voci «Di norma… dove indicato» non vanno mai mostrate come dotazione
  certa: la scheda le presenta come nota **sotto** la dotazione vera
  (quella dei dati), con la stessa formattazione di una nota, non di un
  elenco di dotazioni.
- Il consiglio (`.tip`) è facoltativo per segno: se assente, non si mostra
  nulla (per `sunbed` è assente di proposito; la riga della tabella sopra è
  solo un promemoria e non va copiata nel codice).
- Nessun testo contiene prezzi, orari o nomi di lidi. Nessun testo dipende
  dalla stagione.
- Se il lido scrive una propria descrizione (livello 2), la predefinita non
  si mostra insieme: la risoluzione è per campo (specifica §1), quindi
  descrizione, dotazione e consiglio si possono sostituire uno per uno.
- Dubbi dichiarati per l'esperto: (a) per la moto d'acqua il rimando a
  «norme» è volutamente generico, perché i requisiti (età, patente,
  documenti) variano e non vanno enunciati dalla piattaforma; (b) «tenda» e
  «tenda a telo» sono distinte solo dalla presenza di pareti: se il
  repertorio dei nomi in inglese («Tent» / «Canvas gazebo») risultasse
  confondibile, la differenza è già detta nella descrizione.
