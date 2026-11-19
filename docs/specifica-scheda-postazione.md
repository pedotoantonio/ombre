# Specifica: la scheda della postazione — sapere cosa si prenota

Iterazione del 19/11/2026 (sera) dal prompt del committente
([prompt-scheda-postazione.md](prompt-scheda-postazione.md)). Ogni **tipo**
di postazione ha una scheda illustrativa con fotografie, nel percorso
d'acquisto, senza JavaScript, it/en. Decisioni D61–D63.

## 1. La scheda del tipo, due livelli (D61)

- **La scheda è del tipo, non della singola postazione**: i tipi sono le
  righe di `spot_type` (migrazione 012), ciascuna con un **segno** del
  repertorio (`spotMarks`, 11 segni: ombrellone, lettino, sdraio, gazebo,
  tenda, lettone/daybed, tenda a telo/canopy, canoa, SUP, pedalò, moto
  d'acqua). **Interpretazione scritta**: «cabina» e «tavolo» del prompt
  non sono tipi di postazione — le cabine del mare hanno il loro sistema
  (D26) e il tavolo è scenografia — quindi le schede predefinite coprono
  gli 11 segni del repertorio.
- **Livello 1 — predefinita di piattaforma**: per ogni segno esiste in
  `packages/shared/src/domain/type-cards.ts` una scheda scritta in codice
  (testo it/en del redattore, vagliato dall'esperto di usabilità, e una
  fotografia di repertorio a licenza registrata, `/demo/tipi/{segno}.jpg`).
  Esiste sempre: il lido che non cura nulla ha una scheda dignitosa. Il
  titolo predefinito è il nome del tipo del lido.
- **Livello 2 — personalizzata del lido** (migrazione 025): tabella
  `spot_type_card (type_id PK/FK, beach_id FK, content jsonb, updated_by,
  updated_at)`; `content` validato in shared: `title?`, `descriptionIt?`,
  `descriptionEn?` (ripiego sull'italiano come per il sito), `photos?`
  (1–6 voci `{id, captionIt?, captionEn?}` dalla **libreria di immagini
  vere del sito** — mai altri indirizzi), `equipmentNote?`, `capacityNote?`,
  `details?` (fino a 6 coppie etichetta/valore it/en).
- **Risoluzione per campo**: la scheda resa = personalizzata dove il campo
  c'è, predefinita altrove (le sue foto sul testo predefinito, o
  viceversa). La dotazione e la capienza di base arrivano comunque dal
  tipo (`umbrellas/sunbeds/maxGuests`), i testi le completano.

## 2. Le fotografie dei tipi (D62)

- Solo fotografie **vere, con licenza verificata alla fonte** e registrate
  in [immagini-reali.md](immagini-reali.md) (regole D43: preferenza
  PD/CC0/Pexels, niente persone riconoscibili in primo piano, niente
  insegne leggibili, niente immagini generate). L'agente fotografico
  procura le foto mancanti per i segni scoperti; ritagli 3:2 1200×800
  (come D43) in `apps/web/public/demo/tipi/{segno}.jpg`, più l'ingresso
  nel repertorio della libreria del sito (`demoMedia`) così il Gestore può
  sceglierle anche per le schede personalizzate.
- La libreria delle schede personalizzate è la stessa del sito dello
  stabilimento: chiavi del repertorio `demoMedia`, nessun caricamento di
  file (il caricamento di foto proprie resta rimandato, com'è per il sito).

## 3. Dove si vede e dove si gestisce (D63)

- **Pagina pubblica** `/bagni/{slug}/postazioni/{typeId}` (segmento it
  `postazioni`, en `spot-types`): titolo, fotografie con didascalia
  facoltativa, descrizione, dotazione tipica, capienza, dettagli; in fondo
  **il ritorno esatto al punto d'acquisto** via parametro `torna`
  (solo percorso relativo interno, convalidato; senza parametro si torna
  alla scheda del lido). Senza JavaScript, it/en.
- **Ingressi**: planimetria e barra di selezione (il nome del tipo diventa
  collegamento), elenco delle postazioni, riepilogo prima di pagare, voci
  del carrello, e un riquadro «I tipi di postazione» (titolo dal vaglio
  d'usabilità: non si confonde con l'elenco delle postazioni libere)
  sulla scheda del lido coi tipi offerti, miniatura e collegamento.
- **API**: `GET /v1/beaches/{slug}/spot-types` (tipi offerti con la scheda
  risolta e lo stato predefinita/personalizzata); di gestione
  `GET /v1/manage/beaches/{slug}/type-cards`,
  `PUT /v1/manage/beaches/{slug}/type-cards/{typeId}`,
  `DELETE …/type-cards/{typeId}` (ripristino alla predefinita). Permesso:
  quello del sito (`site.edit`): la scheda è racconto pubblico del lido.
  Contratto da 131 a 135.
- **Gestionale**: sottopagina nuova «Postazioni» (slug it `postazioni`,
  en `spot-types`, accanto a Spiaggia/Sito): elenco dei tipi del lido con
  lo stato della scheda; per ogni tipo modulo di modifica (titolo,
  descrizioni it/en, foto dalla libreria con didascalie, dotazione,
  capienza, dettagli), **anteprima identica al pubblico** (stesso
  componente della pagina pubblica) e «Torna alla predefinita» in un
  tocco. RLS e GRANT sul modello delle tabelle del sito.

## 4. Vincoli di sempre

Senza JavaScript; it/en pari (inglese facoltativo con ripiego); i tre
nomi; lessico unico («la scheda della postazione», una «postazione» ha un
«tipo»); nessun dato personale nelle schede; niente rotture (prenotazione
rapida, carrello, caparra, conto, pianificatore, planimetria illustrata);
migrazione SQL a mano con GRANT/RLS; contratto e OpenAPI aggiornati; test
con database; commit a ogni incremento; **mai push**.

## 5. Rimandati (scritti)

Caricamento di fotografie proprie (vale anche per il sito); schede della
singola postazione (la scheda è del tipo); video; schede per le cabine
del mare; traduzioni oltre it/en.

## 6. Criteri di accettazione (numerazione del committente)

1. Ogni tipo di postazione ha una scheda raggiungibile da planimetria,
   elenco, riepilogo e carrello, anche senza JavaScript, nelle due lingue.
2. Senza alcuna cura del Gestore la scheda predefinita del tipo esiste
   comunque, con testo onesto e fotografia a licenza registrata.
3. Il Gestore personalizza titolo, descrizione, foto, dotazione e dettagli
   dal gestionale, con anteprima identica al pubblico e ripristino alla
   predefinita.
4. Nel seed un lido ha schede personalizzate con più foto e uno usa le
   predefinite, e la differenza si vede.
5. Le fotografie nuove sono registrate in `docs/immagini-reali.md` con
   fonte, autore e licenza; nessuna immagine generata.
6. La prenotazione rapida, il carrello e il pianificatore funzionano come
   prima; i collaudi precedenti restano verdi.
7. Tutto collaudato, in italiano e inglese, con criteri e verbale.
