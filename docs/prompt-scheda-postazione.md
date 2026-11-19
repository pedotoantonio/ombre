# Prompt di ampliamento — «La scheda della postazione: sapere cosa si prenota»

**Committente:** il proprietario di Ombrè (19 novembre 2026, sera).
**Natura:** ampliamento del percorso d'acquisto. Oggi l'Ospite sceglie «A03 · Ombrellone ·
1 ombrellone e 2 lettini» ma nessuno gli racconta <i>che cosa</i> sta prenotando: com'è fatta
la postazione, che comfort offre, perché sceglierla. Questa commessa dà a ogni <b>tipo di
postazione</b> una <b>scheda illustrativa con foto</b>, che compare durante l'acquisto.

## Principio guida

La scheda è **del tipo, non della singola postazione**: un lido racconta una volta sola i suoi
«Ombrelloni», i suoi «Lettini in riva», i suoi «Gazebo», le sue «Tende», le sue «Cabine» — e
ogni postazione di quel tipo eredita il racconto. Due livelli, a scelta del Gestore:

1. **La scheda predefinita di piattaforma**: per ogni tipo del repertorio esiste già un testo
   generico, onesto e ben scritto, nelle due lingue, con una fotografia di repertorio a
   licenza libera — il lido che non vuole curare nulla ha comunque una scheda dignitosa.
2. **La scheda personalizzata del lido**: il Gestore la arricchisce per attirare l'acquisto —
   titolo proprio, descrizione propria (it/en), più fotografie, dotazione dettagliata,
   eventuali misure e capienza — oppure la personalizza solo in parte (le sue foto sul testo
   predefinito, o viceversa).

## Le funzioni, una per una

### 1. La scheda nel percorso d'acquisto
- Dalla **planimetria** e dall'**elenco delle postazioni**: accanto al tipo, un collegamento
  sobrio («Che cos'è un ombrellone qui?» / il nome del tipo) apre la scheda — pagina o
  dettaglio ancorato, **funzionante anche senza JavaScript**.
- Nel **riepilogo prima di pagare** e nel **carrello**: il tipo della voce è un collegamento
  alla sua scheda; chi compra sa sempre cosa sta pagando.
- La scheda mostra: titolo, fotografie (una o più, con didascalia facoltativa), descrizione,
  dotazione tipica, capienza, e — se il Gestore li ha scritti — i dettagli in più. In fondo,
  il ritorno esatto al punto dell'acquisto da cui si è arrivati.
- Sulla **scheda del lido**, un riquadro «Le postazioni» elenca i tipi offerti con la loro
  miniatura e il collegamento alla scheda.

### 2. La gestione dal gestionale
- Nuova sottopagina del gestionale (accanto a Spiaggia/Sito): **«Postazioni»** — l'elenco dei
  tipi usati dal lido, ciascuno con lo stato della scheda: «predefinita di piattaforma» o
  «personalizzata».
- Per ogni tipo: modifica di titolo e descrizione nelle due lingue (l'inglese facoltativo con
  ripiego sull'italiano, come per il sito), scelta delle fotografie, dotazione, capienza,
  dettagli; **anteprima** identica a ciò che vedrà l'Ospite; ripristino alla predefinita in
  un tocco.
- Le **fotografie** vengono dalla stessa libreria di immagini vere già in uso per il sito
  dello stabilimento (le nove Pexels registrate e le eventuali nuove): **solo fotografie con
  licenza verificata e registrata in `docs/immagini-reali.md`, niente immagini generate**.
  Se servono foto nuove per tipi scoperti (gazebo, tenda, cabina), l'agente fotografico le
  procura con le stesse regole di licenza della commessa «fotografie vere».

### 3. I testi predefiniti di piattaforma
- Un **redattore** scrive le schede predefinite dei tipi del repertorio (ombrellone, lettino
  singolo, sdraio, gazebo, tenda, cabina, tavolo), nelle due lingue: concrete, brevi, senza
  iperboli — raccontano cosa l'Ospite trova, non promesse.
- I testi passano il vaglio dell'**esperto di usabilità** con le cinque domande della perizia
  (vero oggi? serve qui? semplice? lessico unico? duplica?).

## Vincoli (invariati)
- Tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello; i tre nomi
  di ruolo; lessico unico (una «postazione» ha un «tipo»; la scheda è «la scheda della
  postazione»).
- **Nessuna funzione esistente si rompe**: prenotazione rapida, carrello, conto, caparra,
  pianificatore e planimetria illustrata restano validi; i collaudi precedenti (267 test,
  1044 controlli) restano verdi e si ampliano.
- Le fotografie rispettano il registro delle licenze; nessun dato personale nelle schede.
- Specifica e decisioni numerate prima del codice; **squadra di agenti con specialità
  diverse**: analista, redattore dei testi, agente fotografico, esperto di usabilità,
  backend, frontend, collaudatore; commit a ogni incremento; **nessun push**.
- Al termine: schermate nuove (scheda di un tipo personalizzata e una predefinita, il punto
  d'ingresso dalla planimetria, il riepilogo col collegamento, la pagina «Postazioni» del
  gestionale con l'anteprima), stato.md aggiornato, demo sullo stesso tunnel, seed con
  almeno un lido con schede personalizzate (foto e dettagli) e uno con le predefinite.

## Criteri di accettazione
1. Ogni tipo di postazione ha una scheda raggiungibile da planimetria, elenco, riepilogo e carrello, anche senza JavaScript, nelle due lingue.
2. Senza alcuna cura del Gestore la scheda predefinita del tipo esiste comunque, con testo onesto e fotografia a licenza registrata.
3. Il Gestore personalizza titolo, descrizione, foto, dotazione e dettagli dal gestionale, con anteprima identica al pubblico e ripristino alla predefinita.
4. Nel seed un lido ha schede personalizzate con più foto e uno usa le predefinite, e la differenza si vede.
5. Le fotografie nuove sono registrate in `docs/immagini-reali.md` con fonte, autore e licenza; nessuna immagine generata.
6. La prenotazione rapida, il carrello e il pianificatore funzionano come prima; i collaudi precedenti restano verdi.
7. Tutto collaudato, in italiano e inglese, con criteri e verbale.
