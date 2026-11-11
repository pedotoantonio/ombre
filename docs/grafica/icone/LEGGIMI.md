# Icone delle funzioni

Le cinque icone delle funzioni di Ombrè, in vettoriale. Riproducono le icone del
committente così come compaiono nella riga alta di
`../icone-e-sfondo-riferimento.jpg`: stessa composizione, stesse proporzioni,
stessi colori. Non sono un ridisegno.

| File            | Nome nel componente | Didascalia          |
| --------------- | ------------------- | ------------------- |
| `ricerca.svg`   | `search`            | Ricerca postazione  |
| `mappa.svg`     | `map`               | Mappa spiaggia      |
| `pass.svg`      | `pass`              | Il tuo pass QR      |
| `condividi.svg` | `share`             | Condividi giornate  |
| `gestore.svg`   | `manager`           | Area gestore        |

`provino.png` le mostra a 96 px e a 48 px su bianco.

Sul sito si usano con `FeatureIcon` di `@ombre/ui` (`packages/ui/src/icons.tsx`),
che disegna le stesse forme di questi file: se si ritocca un'icona vanno
aggiornati tutti e due. L'icona è decorativa (`aria-hidden`): la didascalia la
scrive sempre chi la usa.

## Misure

Tutte hanno `viewBox="0 0 300 300"`: un'unità corrisponde a un pixel
dell'immagine di riferimento (che è 2816 × 1536). Ogni icona occupa nel riquadro
la stessa posizione che ha nella sua piastrella, quindi affiancate mantengono le
proporzioni reciproche del bozzetto.

## Colori

Campionati dall'immagine, come media delle zone piene (non dei bordi) di tutte e
cinque le icone, e usati uguali dappertutto.

| Colore      | Valore    | Su bianco | Su `#F8F9FA` |
| ----------- | --------- | --------- | ------------ |
| Verde acqua | `#378192` | 4,45 : 1  | 4,22 : 1     |
| Corallo     | `#F47B60` | 2,68 : 1  | 2,54 : 1     |

Il corallo resta sotto 3 : 1: va bene per un disegno decorativo affiancato dalla
didascalia, non per testo o per un segno che debba reggersi da solo. Nella mappa
il fondo delle celle è lo stesso verde acqua al 24 % di opacità, non un terzo
colore. Questi due colori sono quelli del bozzetto e non coincidono con
`--oceano` e `--ambra` della tavolozza del sito.

I particolari chiari (schermo e moduli del QR, numeri sui lettini, porta e
finestra, aloni attorno al segnaposto, all'ingranaggio e all'ombrellone) non
sono dipinti di bianco: sono vuoti e lasciano vedere il fondo. Così l'icona è
identica su bianco e su avorio. Nella mappa e nel gestore gli aloni e le cifre
sono ritagliati con una `<mask>`.

## Come sono state ricavate

Ritaglio di ogni icona, una maschera per colore, tracciatura con `potrace`,
poi pulizia: le parti organiche (ombrelloni, freccia) sono state ricondotte a
poche curve, quelle geometriche ridisegnate con cerchi, rettangoli stondati e
tratti misurati sull'immagine. Ogni file è stato rasterizzato e sovrapposto al
ritaglio fino a far coincidere i bordi: lo scarto è in genere sotto il pixel
dell'originale, fino a due lungo gli aloni.

## Che cosa è stato semplificato

- **QR**: è decorativo. Griglia regolare di 21 × 21 moduli con i tre riquadri
  d'angolo esatti; gli altri moduli seguono la distribuzione dell'originale, che
  è irregolare. Non è un codice leggibile.
- **Numeri 1, 2, 3 sui lettini**: ridisegnati a tratto, perché nell'originale
  sono alti una dozzina di pixel. Si leggono a 96 px; a 48 px restano un segno
  chiaro nel riquadro, come nel bozzetto a quella misura.
- **Mappa**: i tre riquadri dei numeri hanno la stessa misura e i tre lettini lo
  stesso spessore; nell'originale variano di circa un pixel. La sfumatura del
  fondo delle celle è resa con una tinta piatta.
- **«1 > 2»**: cifre ridisegnate con lati dritti e curve regolari sulle misure
  dell'originale.
- **Ingranaggio**: otto denti uguali; nell'originale differiscono di poco.
- **Aloni**: larghezza costante (circa 9–10 unità); nell'originale è irregolare.
- **Sole, lente, telefono, calendario, casa**: geometria esatta al posto dei
  bordi leggermente ondulati dell'immagine.
- Le sfumature leggere del corallo e l'ombra delle piastrelle non sono riportate:
  solo tinte piatte.
