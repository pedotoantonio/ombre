# Fotografia della costa (sfondo dell'apertura)

## Da dove viene

La fotografia è ritagliata dal bozzetto inviato dal committente, conservato in
`docs/grafica/icone-e-sfondo-riferimento.jpg` (JPEG, 2816×1536). Non abbiamo
l'originale: esiste solo dentro il bozzetto.

- Ritaglio nel bozzetto: x 427–2386, y 823–1535 (estremi compresi), cioè
  **1960×713 pixel**. È la dimensione nativa: non c'è più dettaglio di così.
- Il ritaglio esclude la barra bianca in alto e il fondo grigio ai lati.

## Perché è morbida sugli schermi grandi

1960 pixel di larghezza bastano fino a uno schermo di circa 1900 punti a
densità normale. Oltre (schermi da 2560, schermi ad alta densità) il browser
la ingrandisce e la fotografia perde nitidezza. In più viene da un JPEG già
compresso. Non è stata resa più nitida né ingrandita artificialmente: non
aggiungerebbe dettaglio vero.

## Che cosa è stato ricostruito

Nel bozzetto, sopra il mare a sinistra, erano stampati il titolo su due righe
(«Il tuo posto al sole, / anche per un giorno solo», con la sua ombra) e il
pulsante corallo «Cerca il tuo posto». Sono stati tolti ricostruendo il cielo
e il mare che stavano sotto:

| Zona ricostruita | In `costa-2100` (1960×713) | In `costa-1400` (1400×509) |
| --- | --- | --- |
| Titolo | x 117–882, y 215–388 | x 84–630, y 153–277 |
| Pulsante | x 121–482, y 405–512 | x 86–344, y 289–366 |

Con la sfumatura dei bordi i pixel toccati stanno in x 108–888, y 210–525
(circa l'11% della fotografia). Il colore di fondo è interpolato riga per riga
da sinistra a destra; le increspature sono copiate dal mare pulito accanto,
alle stesse righe. In quelle zone quindi **le onde non sono quelle vere**: sono
verosimili, non autentiche. Il resto della fotografia (scogliera, riva,
ombrelloni) non è stato toccato, e nemmeno `costa-mobile`, che è ritagliata
tutta dalla parte destra.

## File

| File | Pixel | Byte | Uso |
| --- | --- | --- | --- |
| `costa-1400.jpg` | 1400×509 | 120 097 | schermi medi (riduzione della nativa) |
| `costa-1400.webp` | 1400×509 | 86 098 | |
| `costa-1400.avif` | 1400×509 | 66 824 | |
| `costa-2100.jpg` | 1960×713 | 197 969 | schermi grandi (dimensione nativa) |
| `costa-2100.webp` | 1960×713 | 159 350 | |
| `costa-2100.avif` | 1960×713 | 122 678 | |
| `costa-mobile.jpg` | 780×585 | 106 064 | telefoni, formato 4:3 (ombrelloni e riva) |
| `costa-mobile.webp` | 780×585 | 85 372 | |
| `costa-mobile.avif` | 780×585 | 63 509 | |

Attenzione al nome: `costa-2100` contiene **1960** pixel di larghezza, non
2100. Un ingrandimento a 2100 non si distingueva dalla stessa immagine
allargata dal browser, quindi non è stato fatto. In `srcset` va dichiarata
come `1960w`.

`costa-mobile` è il ritaglio x 1009–1959 della fotografia nativa (altezza
intera), ridotto a 780×585.

Tutti i file sono sRGB, senza metadati; i JPEG sono progressivi.

Colori medi, utili come fondo CSS mentre l'immagine si carica: mare a sinistra
`#0d89b2`, cielo in alto `#199be0`.

## Da fare

- **Diritti**: il committente deve confermare di avere il diritto di
  pubblicare questa fotografia (e dirci da dove viene: fotografo, banca
  d'immagini, immagine generata). Va chiarito prima di andare in produzione.
- **Originale**: appena arriva la fotografia originale ad alta risoluzione,
  senza scritte, questi file vanno sostituiti (stessi nomi, `costa-2100`
  davvero a 2100 pixel o più).
