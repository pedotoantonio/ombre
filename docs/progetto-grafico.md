# Progetto grafico «Solar & Fresh»

Sintesi del progetto dell'interfaccia fornito dal committente l'11/11/2026 e di come
viene applicato. L'immagine di riferimento è in
[grafica/riferimento-portale.png](grafica/riferimento-portale.png).

## Identità

- **Principio**: «Solar & Fresh Design». Freschezza, affidabilità, facilità d'uso;
  leggibile sotto il sole.
- **Logo**: un ombrellone visto dall'alto, con un'onda stilizzata che è anche un sorriso.
  Nome sempre minuscolo: «ombrè». Motto: «Il tuo posto al sole, senza pensieri.»
- **Carattere**: Plus Jakarta Sans, pesi Regular, SemiBold, ExtraBold.

| Colore | Valore | Token | Uso |
|---|---|---|---|
| Deep Ocean Teal | `#005F73` | `--oceano` | Primario: pulsanti, collegamenti, intestazioni di spicco |
| Seafoam Tint | `#E0F2F1` | `--spuma` | Superfici tenui, sezioni alternate |
| Sand Amber | `#EE9B00` | `--ambra` | Accento: azioni di rilievo, dettagli del logo |
| Slate Abyss | `#1D3557` | `--abisso` | Testi, superfici scure |
| Ivory Sand | `#F8F9FA` | `--avorio` | Fondo delle pagine |

Stati della planimetria: libero ordinario `#2A9D8F`, libero condiviso `#3A86FF`,
occupato `#E76F51`.

### Contrasti calcolati (WCAG)

| Coppia (testo su fondo) | Rapporto | Uso consentito |
|---|---|---|
| Bianco su Oceano | 7,28:1 | Qualsiasi testo: pulsante primario |
| Abisso su Avorio / Spuma / bianco | 11,72 / 10,68 / 12,36:1 | Qualsiasi testo |
| Oceano su Avorio / Spuma | 6,91 / 6,29:1 | Qualsiasi testo, collegamenti |
| Abisso su Ambra | 5,49:1 | Qualsiasi testo: pulsante d'accento |
| Bianco su Ambra | 2,25:1 | **Mai** |
| Ambra su Avorio | 2,14:1 | Mai come testo: solo decorazione |
| Secondario `#4A5A73` su Avorio / Spuma | 6,64 / 6,04:1 | Qualsiasi testo |
| Bianco o Abisso sui tre colori di stato | da 3,09 a 4,00:1 | **Mai testo normale**: i colori di stato riempiono segni grafici |
| `#1B6F65`, `#1F5FCC`, `#B5432A` su fondi chiari | da 4,77 a 5,99:1 | Testo degli stati |

Lo stato di una postazione non si comunica mai con il solo colore: serve sempre anche
un'etichetta, una forma o un'icona.

## Cosa chiede il progetto, pilastro per pilastro

**Portale centrale**
- Apertura ispirazionale con immagini della costa e barra di ricerca in evidenza.
- Ricerca per data, ospiti e servizi; schede degli stabilimenti con anteprima, prezzo di
  partenza, distanza dalla spiaggia e punteggio da recensioni verificate.
- Mappa interattiva con segnaposto per disponibilità.

**Web app dello stabilimento**
- Intestazione con marchio dello stabilimento; banner promozionale «Dritta Ombrè».
- Planimetria interattiva a colori; barra inferiore che riepiloga la selezione e porta
  al pagamento.

**Console di reception «Ombrè Skipper»**
- Vista a griglia della spiaggia, pass, cruscotto economico.

**Editor del sito**
- Tre modelli, bozza e pubblicazione esplicita, anteprima.

## Limiti onesti

Il progetto mostra elementi che oggi non hanno dati veri dietro. Finché non ci sono,
non compaiono:

| Elemento del progetto | Stato |
|---|---|
| Fotografie della costa e degli stabilimenti | Non fornite. Al loro posto illustrazioni vettoriali originali. Le foto arriveranno con il caricamento dei media |
| Punteggio da recensioni | Nessuna recensione esiste: non si mostra alcun punteggio |
| Distanza dalla spiaggia | Dato non raccolto: non si mostra |
| Mappa interattiva | Richiede un fornitore di mappe e le coordinate degli stabilimenti: rimandata |
| Filtri «Accesso disabili», «Area giochi» | I servizi sono testo libero: il filtro arriverà con i servizi strutturati |
| Apple Pay e Google Pay | Dipendono dal fornitore di pagamento reale |
| Colori scelti dal gestore, logo e galleria nell'editor | Rimandati con il caricamento dei media |
| Console della reception come vista a griglia della spiaggia («Ombrè Skipper») | Non realizzata. Per ora la console è una tabella, che sul telefono diventa un elenco di schede |
| Banner promozionale «Dritta Ombrè» | Richiede il concetto di «promozione pubblica», che oggi non esiste: le promozioni sono solo codici da inserire nel riepilogo |
| Fascia di stabilimenti nella pagina iniziale | Non c'è: la pagina iniziale è prerenderizzata e non legge dati. Gli stabilimenti sono elencati in «Esplora» |
