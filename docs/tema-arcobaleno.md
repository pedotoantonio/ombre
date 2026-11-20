# Tema arcobaleno — la tavola dei gettoni

Documento del **direttore artistico** (D65), 20/11/2026. Va letto prima di
toccare una riga di CSS: qui ci sono tutti i valori, i ruoli e i contrasti
misurati. Frontend e illustratore non devono decidere nulla di cromatico da
soli; se un valore manca, si torna qui, non si inventa.

Tutti i rapporti di contrasto sono **calcolati** con la formula WCAG della
luminanza relativa (script usa-e-getta nello scratchpad, sRGB, due decimali),
non stimati. Soglie: **4,5:1** testo normale, **3:1** testo grande (≥ 24 px, o
≥ 18,5 px in grassetto) e componenti grafici.

Fondi di riferimento: **bianco** `#ffffff` (`--carta`), **fondo pagina**
`#f8f9fa` (`--avorio`), **spuma nuova** `#e3f1fa` (`--spuma`, vedi §3),
**fondo scuro del piè di pagina** `#1d3557` (`--abisso`).

## 1. Censimento: le variabili del tema com'è oggi

I gettoni del tema **non stanno in testa a portal.css**: vivono in
`packages/ui/src/tokens.css` (tema «Solar & Fresh») e, per la planimetria, in
`packages/ui/src/beach-art.css`. In `portal.css` restano solo gettoni di
layout (`--plan-cell`, `--plan-need`, `--barra-gestione`) e il velo di zona
`--zona-velo` che la pagina imposta in linea (`hsl(h 55% 88%)`, D59): nessuno
di questi cambia.

### tokens.css — colori

| Variabile | Valore oggi | Ruolo oggi | Sorte |
|---|---|---|---|
| `--oceano` | `#005f73` | Primario: pulsanti, collegamenti, bordi attivi | **cambia** |
| `--oceano-scuro` | `#004a5a` | Primario al passaggio; testi primari su fondi velati | **cambia** |
| `--spuma` | `#e0f2f1` | Superfici tenui, sezioni alternate, righe evidenziate | **cambia** |
| `--ambra` | `#ee9b00` | Accento caldo: bottone d'accento, anello «risultato», avvisi | **cambia** |
| `--ambra-chiara` | `#f5ae2e` | Accento al passaggio (testo abisso sopra) | **cambia** |
| `--abisso` | `#1d3557` | Testi; fondo del piè di pagina e delle superfici scure | resta |
| `--avorio` | `#f8f9fa` | Fondo delle pagine | resta |
| `--carta` | `#ffffff` | Superfici bianche (schede, pannelli) | resta |
| `--bordo` | `#cfdedd` | Bordi decorativi di schede e pannelli | **cambia** |
| `--bordo-campo` | `#71839a` | Bordo dei campi e dei controlli (≥ 3:1 sui fondi) | resta |
| `--testo` | `var(--abisso)` | Testo corrente | resta |
| `--testo-secondario` | `#4a5a73` | Testo secondario, didascalie | resta |
| `--mare-foto` | `#0d89b2` | Mare della fotografia d'apertura; `--arte-mare` | resta (D66) |
| `--errore` | `#b42318` | Testo e bordi d'errore | **cambia** |
| `--errore-tenue` | `#fdeeec` | Fondo degli avvisi d'errore | **cambia** |
| `--libero` | `#2a9d8f` | Stato libero: riempimenti grafici (pallino) | resta |
| `--libero-testo` | `#1b6f65` | Stato libero come testo su fondi chiari | resta |
| `--condiviso` | `#3a86ff` | Stato condiviso/prenotato: riempimenti grafici | resta |
| `--condiviso-testo` | `#1f5fcc` | Stato condiviso come testo; tinta «prenotato» | resta |
| `--occupato` | `#e76f51` | Stato occupato: riempimenti grafici | **cambia** |
| `--occupato-testo` | `#b5432a` | Stato occupato come testo; errori accanto ai campi | **cambia** |
| `--su-scuro` | `#ffffff` | Testo su abisso e su oceano | resta |
| `--su-scuro-secondario` | `#d3deea` | Testo secondario su abisso | resta |
| `--fuoco` | `var(--abisso)` | Anello di fuoco su fondi chiari | resta |
| `--fuoco-su-scuro` | `var(--ambra)` | Anello di fuoco su fondi scuri | resta (segue l'ambra) |

Tutti i gettoni non di colore (spazi, raggi, ombre `--ombra-*` tinte abisso,
tocco, caratteri, pesi, scala, lettere, tempi) **restano identici**.

### beach-art.css — planimetria (D55/D56)

Terreni e materiali — **tutti invariati** (D66: la planimetria resta serena):
`--arte-sabbia #f7eedc`, `--arte-sabbia-grana #e7d9bc`, `--arte-sabbia-riva
#fdf8ee`, `--arte-mare var(--mare-foto)`, `--arte-mare-basso #7fcde0`,
`--arte-legno #dca968`, `--arte-legno-scuro #a97a3f`, `--arte-verde #5ea873`,
`--arte-verde-scuro #3e7e54`, `--arte-contorno`, `--arte-neve #ffffff`.

Stati (tinta piena + velo): `--stato-disponibile #2e7d5b` / `#d3e8db`,
`--stato-prenotato var(--condiviso-testo)` / `#d9e6fa`, `--stato-occupato
var(--occupato-testo)` / `#f8ddd4`, `--stato-stagionale #4f46b8` / `#e1dff6`,
`--stato-manutenzione var(--ambra)` / `#fbe7c2`, `--stato-non-disponibile
#5d6b7a` / `#e4e8ec`, `--stato-condivisa var(--condiviso)` / `#dbe9ff`,
`--stato-scelta var(--oceano)` / `#cfe6ea`, `--stato-proposta var(--ambra)` /
`#fbe7c2`. Che cosa cambia: §5.

## 2. La palette arcobaleno e le sue varianti

I sei colori del committente più l'arancio del sole/onda del logo. Per ogni
colore: la tinta piena, la **variante scurita** (per il testo su fondi
chiari) e il **velo** (per i fondi). Valori esatti, non negoziabili.

| Colore | Piena | Scurita (testo) | Velo (fondo) |
|---|---|---|---|
| Rosso corallo | `#e63946` | `#b3202c` | `#fce8ea` (avvisi) / `#fadde0` (tela) |
| Arancio | `#f77f00` | `#a85600` | `#fde7cd` |
| Giallo sole | `#fcbf49` | — mai come testo (§6) | `#fef2d2` |
| Verde acqua | `#2a9d8f` | `#1b6f65` | `#d9efec` |
| Blu mare | `#0077b6` | `#00557f` | `#d6ecf8` |
| Viola | `#7b2cbf` | — già scuro: 7,11:1 su bianco | `#ece0f7` |
| Arancio del logo | `#ee9b00` | — | — solo logo e illustrazione |

Perché le scurite sono necessarie (misure sui fondi chiari):

- rosso corallo pieno su bianco **4,17:1** (< 4,5) → testo in `#b3202c`
  (6,65:1 su bianco, 6,30 su avorio, 5,77 su spuma);
- arancio pieno su bianco **2,63:1** → testo in `#a85600` (5,26 / 4,99 /
  4,56:1 su bianco / avorio / spuma);
- verde acqua pieno su bianco **3,32:1** (solo grafica) → testo in `#1b6f65`
  (5,99 / 5,68 / 5,20:1);
- blu mare pieno su bianco **4,87:1** e su avorio **4,62:1** (passa), ma su
  spuma **4,23:1** (< 4,5) → sui fondi velati il testo blu usa `#00557f`
  (8,06 / 7,65 / 7,00:1);
- viola passa ovunque come testo (7,11 / 6,74 / 6,17:1).

## 3. La tabella dei gettoni nuovi

I **nomi restano quelli di oggi**: il frontend cambia solo i valori. Le righe
«(nuovo)» sono gli unici gettoni da aggiungere, in coda a tokens.css.

| Gettone | Valore nuovo | Ruolo | Contrasti misurati |
|---|---|---|---|
| `--oceano` | `#0077b6` | Azioni e collegamenti: pulsante primario (testo bianco), link, bordi attivi, `accent-color` | bianco sopra **4,87**; come testo: 4,87 su bianco, 4,62 su avorio, ~~4,23 su spuma~~ → lì `--oceano-scuro` |
| `--oceano-scuro` | `#00557f` | Primario al passaggio; testo/link blu sui fondi velati | bianco sopra **8,06**; come testo: 8,06 / 7,65 / **7,00** su bianco / avorio / spuma |
| `--spuma` | `#e3f1fa` | Superfici tenui (velo di blu mare al posto del velo verdeacqua) | abisso sopra **10,73**; secondario sopra **6,07**; `--bordo-campo` sopra **3,37** |
| `--ambra` | `#f77f00` | Avvisi e accento caldo: bottone d'accento (testo abisso), barra di `layout-warn`, anello «risultato della ricerca» | abisso sopra **4,70**; bianco sopra 2,63 → **mai testo bianco**; su abisso (fuoco su scuro) **4,70** |
| `--ambra-chiara` | `#ff8f1f` | Accento al passaggio | abisso sopra **5,42** |
| `--ambra-testo` (nuovo) | `#a85600` | Arancio come testo su fondi chiari, dove serve | **5,26 / 4,99 / 4,56** su bianco / avorio / spuma; **4,72** su `--giallo-velo`; su `#fde7cd` 4,38 → lì testo abisso |
| `--errore` | `#b3202c` | Testo e bordi d'errore (rosso corallo scurito) | **6,65 / 6,30 / 5,77** su bianco / avorio / spuma; su `--errore-tenue` **5,66**; bianco sopra **6,65** |
| `--errore-tenue` | `#fce8ea` | Fondo degli avvisi d'errore | abisso sopra **10,52**; `--errore` sopra **5,66** |
| `--occupato` | `#e63946` | Occupato/errore come riempimento grafico (≥ 3:1) | **4,17 / 3,95 / 3,62** su bianco / avorio / spuma; bianco sopra 4,17 (grafica sì, testo normale no) |
| `--occupato-testo` | `#b3202c` | Occupato come testo; errori accanto ai campi (= `--errore`: un solo rosso per ruolo) | come `--errore` |
| `--libero` | `#2a9d8f` (invariato) | Disponibile/conferme come riempimento grafico | **3,32 / 3,15** su bianco / avorio; su spuma **2,89 → vietato come componente su spuma**, lì `--libero-testo` |
| `--libero-testo` | `#1b6f65` (invariato) | Disponibile/conferme come testo | **5,99 / 5,68 / 5,20**; bianco sopra **5,99** |
| `--condiviso` | `#3a86ff` (invariato) | Prenotato/condiviso come riempimento grafico — azzurro conservato fuori palette per non confondersi col blu mare della scelta | bianco sopra **3,48** (grafica) |
| `--condiviso-testo` | `#1f5fcc` (invariato) | Prenotato/condiviso come testo | **5,89 / 5,58 / 5,11**; bianco sopra **5,89** |
| `--bordo` | `#ccdeeb` | Bordi decorativi, ora intonati al velo blu | decorativo (nessuna soglia); i controlli restano su `--bordo-campo` |
| `--bordo-campo` | `#71839a` (invariato) | Bordo dei campi | **3,88 / 3,68 / 3,37** su bianco / avorio / spuma |
| `--abisso`, `--avorio`, `--carta`, `--testo`, `--testo-secondario` | invariati | Neutri: restano freddi com'erano — il calore lo portano spuma e bordo già velati di blu; scaldarli romperebbe 60 rapporti già a verbale | abisso: **12,36 / 11,72 / 10,73**; secondario: **7,00 / 6,64 / 6,07** |
| `--su-scuro` | `#ffffff` (invariato) | Testo sul piè di pagina e sui bottoni scuri | su abisso **12,36**; su oceano **4,87** |
| `--su-scuro-secondario` | `#d3deea` (invariato) | Testo secondario su abisso | **9,07** |
| `--fuoco` | `var(--abisso)` (invariato) | Fuoco su chiaro | ≥ 10,73 su tutti i fondi chiari |
| `--fuoco-su-scuro` | `var(--ambra)` (riferimento invariato) | Fuoco su scuro — ora arancio | su abisso **4,70** (≥ 3) |
| `--giallo` (nuovo) | `#fcbf49` | Solo fondi con testo abisso e decorazione (§6) | abisso sopra **7,47**; bianco sopra 1,66 → mai |
| `--giallo-velo` (nuovo) | `#fef2d2` | Fondo di avviso leggero | abisso sopra **11,09**; `--ambra-testo` sopra **4,72** |
| `--viola` (nuovo) | `#7b2cbf` | Stagionale; decorazione | bianco sopra **7,11**; come testo 7,11 / 6,74 / 6,17 |
| `--viola-velo` (nuovo) | `#ece0f7` | Tela/fondo del viola | abisso sopra **9,75**; `--viola` sopra **5,61** |
| `--sole` (nuovo) | `#ee9b00` | Il sole sulla «è» e l'onda del logo; accenti d'illustrazione. Mai testo (2,25 su bianco), mai componenti | abisso sopra **5,49**; su abisso **5,49** (decorazione) |
| `--arcobaleno` (nuovo) | vedi §4 | Il gradiente: solo i posti dell'elenco chiuso | — |

Sul piè di pagina scuro (`--abisso`) restano ammessi: bianco (12,36),
`--su-scuro-secondario` (9,07), arancio `#f77f00` per il solo anello di fuoco
(4,70), giallo `#fcbf49` come decorazione o testo (7,47).

### Coppie sotto soglia e rimedi (a verbale)

| Coppia | Misura | Rimedio |
|---|---|---|
| `#0077b6` su spuma `#e3f1fa` | 4,23 | testo blu sui fondi velati sempre `--oceano-scuro` (7,00); nel CSS odierno il caso è `.portal-role:hover` e l'etichetta `.plan__sea`; il verbale del 20/11 ne ha trovati altri sette (v. in fondo) |
| `#e63946` su bianco | 4,17 | testo rosso sempre `#b3202c` |
| `#f77f00` su bianco | 2,63 | mai testo arancio pieno, mai bianco su arancio: testo `#a85600` o abisso sul velo |
| `#2a9d8f` su spuma | 2,89 | il pallino «libero» vive su carta (3,32 ✓); su spuma si usa `--libero-testo` |
| `#fcbf49` su bianco | 1,66 | §6: mai testo su chiaro |
| anello `--ambra` di `.ops-tile--hit` su carta | 2,63 | resta: è decorazione ridondante (la riga di tabella corrispondente è già marcata con fondo `--spuma`), com'era l'ambra di oggi (2,25) |

## 4. Il gradiente

Definizione esatta, da scrivere **una sola volta** in tokens.css:

```css
--arcobaleno: linear-gradient(90deg,
  #e63946 0%, #f77f00 20%, #fcbf49 40%,
  #2a9d8f 60%, #0077b6 80%, #7b2cbf 100%);
```

Le fermate sono quelle del committente (id `arc` del logo). Elenco **chiuso**
dei posti dove può comparire:

1. **il logo** (dentro gli SVG del committente, a cura dell'illustratore);
2. **la fascia dell'eroe della prima pagina**: una riga decorativa alta
   `0.375rem` sul bordo superiore di `.portal-hero` (pseudo-elemento);
3. **il bordo decorativo del piè di pagina**: una riga alta `0.25rem` sul
   bordo superiore di `.site-footer`, al posto dell'attuale stacco;
4. **le sottolineature spesse dei titoli di sezione della prima pagina**:
   barretta `3rem × 0.25rem`, raggio pillola, sotto gli `h2` della home.

Fine dell'elenco. **Vietato** ovunque altro, in particolare: testo (niente
`background-clip: text`), bottoni, distintivi e badge, tessere della console,
schede, planimetria e tutto `beach-art`, bordi di campi, anelli di fuoco,
icone. Il gradiente non si anima (rimandato a verbale, D65).

## 5. La planimetria (D66): pastello, con accenti

Mare, sabbia, legno e verde **non cambiano**: tutti i gettoni `--arte-*` dei
terreni restano come al §1. I veli di zona del pianificatore
(`--zona-velo`, hsl pastello dalla pagina) restano. Cambiano solo le tinte di
stato, allineate ai gettoni del §3:

| Variabile (beach-art.css) | Oggi | Nuovo | Contrasti ricalcolati |
|---|---|---|---|
| `--stato-disponibile` | `#2e7d5b` | `#1b6f65` (= `--libero-testo`) | glifo bianco sopra **5,99**; tratto sul velo **4,99** |
| `--stato-disponibile-velo` | `#d3e8db` | `#d9efec` | abisso sopra 10,30 |
| `--stato-prenotato` / `-velo` | `var(--condiviso-testo)` / `#d9e6fa` | **invariati** | glifo bianco **5,89**; tratto sul velo **4,67** |
| `--stato-occupato` | `var(--occupato-testo)` | invariato il riferimento → segue `#b3202c` | glifo bianco **6,65**; tratto sul velo **5,22** |
| `--stato-occupato-velo` | `#f8ddd4` | `#fadde0` | abisso sopra 9,70 |
| `--stato-stagionale` | `#4f46b8` | `#7b2cbf` (viola della palette) | glifo bianco **7,11**; tratto sul velo **5,61** |
| `--stato-stagionale-velo` | `#e1dff6` | `#ece0f7` | abisso sopra 9,75 |
| `--stato-manutenzione` | `var(--ambra)` | invariato il riferimento → segue `#f77f00` | glifo **abisso** sopra **4,70** (mai bianco); tratto sul velo 2,19: sotto 3 come oggi, l'informazione sta nel glifo abisso (10,29 sul velo) e nell'etichetta |
| `--stato-manutenzione-velo` | `#fbe7c2` | `#fde7cd` | abisso sopra 10,29 |
| `--stato-non-disponibile` / `-velo` | `#5d6b7a` / `#e4e8ec` | **invariati** | glifo bianco 5,46; tratto sul velo 4,43 |
| `--stato-condivisa` / `-velo` | `var(--condiviso)` / `#dbe9ff` | **invariati** | glifo bianco 3,48 (grafica, come oggi) |
| `--stato-scelta` | `var(--oceano)` | invariato il riferimento → segue `#0077b6` | glifo bianco **4,87**; tratto sul velo **3,99** |
| `--stato-scelta-velo` | `#cfe6ea` | `#d6ecf8` | abisso sopra 10,13 |
| `--stato-proposta` / `-velo` | `var(--ambra)` / `#fbe7c2` | riferimento invariato / `#fde7cd` | come manutenzione: glifo abisso |

Accenti **ammessi** (elenco chiuso):

- le **tele degli ombrelloni «disponibile»** possono alternare il velo della
  tela fra quattro coppie, tenendo **tratto, spicchio e distintivo sempre in
  `--stato-disponibile`** (`#1b6f65`): velo verde `#d9efec` (4,99), velo blu
  `#d6ecf8` (4,91), velo giallo `#fef2d2` (5,37), velo viola `#ece0f7`
  (4,72) — tutti i tratti sopra 3:1, lo stato resta leggibile dal
  distintivo colore+glifo e dall'etichetta;
- la **cornice della legenda** può usare il nuovo `--bordo` (`#ccdeeb`) e il
  titolo `--oceano-scuro`; contenuti e righe della legenda invariati (D56);
- il **sole della scenografia** può usare `--sole` `#ee9b00`.

**Nulla che tocchi i glifi o la leggibilità**: i glifi D56 restano bianchi (o
abisso su manutenzione/proposta), le etichette restano abisso su gettone
carta, niente gradiente in planimetria, niente nuove tinte sugli stati oltre
a quelle della tabella.

## 6. Il giallo `#fcbf49`, nero su bianco

**Ammesso**:

- fondo di avviso leggero (`--giallo-velo` `#fef2d2`) con testo **abisso**:
  11,09:1; o fondo pieno `--giallo` con testo abisso: 7,47:1;
- accento decorativo: fermata del gradiente, velo di tela «disponibile»
  (§5), decorazioni su fondo abisso (7,47:1).

**Vietato**:

- **mai come testo su fondo chiaro**: su bianco 1,66:1, su avorio 1,57:1 —
  nemmeno in grassetto o in corpo grande;
- mai testo bianco sopra il giallo: 1,66:1;
- mai come riempimento di bottone primario o di distintivo con testo bianco;
- mai come unico segnale di stato (il glifo c'è sempre, D56).

## 7. Email transazionali

Guardato `packages/comms/src/index.ts`: le email sono **solo testo**
(`subject` + corpo testuale, nessun HTML, nessun colore). **Niente da
toccare** per il frontend. Se un domani nascesse un modello HTML, i colori
verranno da questa tavola (blu mare per i collegamenti, abisso per il testo).

## Indicazioni per l'illustratore

1. **Logo nel componente**: `Logo`/`LogoLockup` di `packages/ui` ridisegnati
   sui file del committente in `docs/marchio/`
   (`logo-arcobaleno-verticale.svg`, `logo-arcobaleno-orizzontale.svg`),
   fedeli, mai ricostruiti a occhio. Gradiente id `arc` orizzontale, per
   forma sul proprio riquadro, fermate del §4; il sole sulla «è» e l'onda
   restano `#ee9b00` pieno. Versione su scuro per il piè di pagina: la
   scritta passa a `--su-scuro`, il simbolo resta a colori.
2. **Favicon a 16 px** (`apps/web/app/icon.svg`): niente gradiente a sei
   fermate — a quella taglia diventa fango. Ombrellone a **spicchi piatti**
   nei sei colori pieni (`#e63946`, `#f77f00`, `#fcbf49`, `#2a9d8f`,
   `#0077b6`, `#7b2cbf`), onda/sole `#ee9b00`, su fondo `--carta`; niente
   contorni più sottili di 1/16 del lato.
3. **Accenti planimetria**: solo quelli del §5 (tele «disponibile» a velo
   alternato con tratto fisso `#1b6f65`, cornice legenda, sole `--sole`).
   Glifi, etichette, legenda e terreni non si toccano.

## Indicazioni per il frontend

Ordine dei lavori (tutto in `packages/ui/src`, nessun markup):

1. **tokens.css**: cambiare i valori dei gettoni del §3 (`--oceano`,
   `--oceano-scuro`, `--spuma`, `--ambra`, `--ambra-chiara`, `--bordo`,
   `--errore`, `--errore-tenue`, `--occupato`, `--occupato-testo`) e
   aggiungere in coda i nuovi (`--giallo`, `--giallo-velo`, `--viola`,
   `--viola-velo`, `--sole`, `--ambra-testo`, `--arcobaleno`). Aggiornare i
   commenti dei contrasti con i numeri di questa tavola.
2. **beach-art.css**: i valori del §5 (disponibile, stagionale e i cinque
   veli nuovi; gli altri sono riferimenti `var()` che seguono da soli).
3. **Le due eccezioni puntuali** (uniche regole da ritoccare):
   `.portal-role:hover { color: var(--oceano-scuro) }` e
   `.plan__sea { color: var(--oceano-scuro) }` — il blu pieno su fondo
   velato sta a 4,23.
4. **Il gradiente**: le tre comparse del §4 (fascia dell'eroe, bordo del piè
   di pagina, sottolineature dei titoli della home), sempre e solo
   `var(--arcobaleno)`.

Dove **non** duplicare regole: mai un esadecimale nei fogli dei componenti —
solo `var()`; il gradiente si definisce una volta sola in tokens.css; non
toccare i veli di zona in `apps/web/components/beach-layout.tsx` (restano
hsl pastello, D59/D66); non ridefinire i gettoni di stato dentro portal.css
(le tessere `ops-tile--*` seguono già le variabili); niente stili in linea.
`--fuoco-su-scuro`, `--stato-occupato`, `--stato-manutenzione`,
`--stato-scelta`, `--stato-proposta`, `--stato-prenotato`, `--stato-condivisa`
sono riferimenti `var()`: **non** vanno riscritti in esadecimale.

## Verbale d'accessibilità (20/11/2026)

Verifica **indipendente** dell'esperto di accessibilità sul tema arcobaleno
consegnato (tokens.css, portal.css, base.css, beach-art.css, logo, favicon).

### Metodo

- Ambiente usa-e-getta `ombre-a11y-dev` (compose del progetto, porte
  3310/3311, seed demo + vetrina), **buttato con `down -v` a fine verifica**.
- Playwright 1.49.1 nel contenitore ufficiale (`--network host`): per **ogni
  nodo di testo visibile** delle pagine sotto, colore effettivo e fondo
  effettivo risalendo i genitori con `getComputedStyle` (composizione degli
  alfa; i fondi con immagine o gradiente sono segnalati a parte), poi il
  rapporto WCAG. Soglie: 4,5:1 testo normale, 3:1 testo grande (≥ 24 px, o
  ≥ 18,7 px in grassetto) e componenti grafici. Script usa-e-getta nello
  scratchpad, non nel repo.
- Tutti i rapporti dichiarati nella tavola del direttore sono stati
  **ricalcolati con uno script proprio**: confermati al centesimo, nessuna
  discrepanza.

### Pagine misurate (italiano; l'inglese usa gli stessi gettoni)

A 1280 px, e a 390 px dove indicato «(+tel)»: prima pagina (+tel), «Ricerca
ombrellone» con filtri attivi, le tre guide «come funziona», scheda di Lido
Aurora con planimetria e recensioni (+tel), scheda di Cala del Moro — modello
Boutique — (+tel), riepilogo con caparra di Cala del Moro (+tel), carrello con
una voce, accesso con errore, conto dell'ospite, console «Oggi» (anche con
ricerca attiva e con la scheda di postazione aperta), pianificatore (anche con
ricerca), console della reception, pagina «Incassi» del banco, scheda pubblica
di un tipo di postazione, pagina di pagamento `/paga/{token}`, Assistenza.
**5.456 nodi di testo misurati in tutto.**

### Coppie sotto soglia e correzioni

Una sola famiglia sotto soglia: **blu pieno `#0077b6` su spuma `#e3f1fa`
(4,23:1)**, la coppia già a verbale del direttore, in sette regole. Correzione
unica e minima: il testo passa a `--oceano-scuro` `#00557f` (**7,00:1** sulla
spuma). Prima/dopo:

| Regola | Prima | Dopo | Rapporto |
|---|---|---|---|
| `.button--secondary:hover` (base.css) | `--oceano` | `--oceano-scuro` | 4,23 → 7,00 |
| `.button--secondary[aria-pressed='true']` / `[aria-current]` (base.css) | ereditava `--oceano` sul fondo spuma dello stato selezionato (misurato vivo sul bottone «Oggi» della console) | `color: var(--oceano-scuro)` aggiunto | 4,23 → 7,00 |
| `.account-link:hover` (base.css) | `--oceano` | `--oceano-scuro` | 4,23 → 7,00 |
| `.badge` (base.css) | `--oceano` | `--oceano-scuro` | 4,23 → 7,00 |
| `.tpl-boutique .site-tagline` (base.css) | `--oceano` | `--oceano-scuro` | 4,23 → 7,00 |
| `.alert--info a` (base.css, regola nuova) | il collegamento «togli la ricerca» di console e planner ereditava `--oceano` sul velo spuma dell'avviso | `--oceano-scuro` | 4,23 → 7,00 |
| `.is-hit a` (portal.css, regola nuova) | i collegamenti «scheda» e «sposta al banco» della riga evidenziata ereditavano `--oceano` sul fondo spuma della riga | `--oceano-scuro` | 4,23 → 7,00 |

Dopo le correzioni la misura è stata **ripetuta su tutte le pagine: zero
coppie sotto soglia**. Unico «falso positivo» a verbale: il bianco dell'eroe
del modello Riviera sta su un gradiente (`--abisso` → `--oceano`), che lo
strumento non compone; la fermata peggiore è `#0077b6`, bianco sopra
**4,87 ≥ 4,5** ✓.

### Le quattro segnalazioni del frontend

1. **`.button--secondary:hover`** — testo di bottone a 16 px/600: testo
   normale, 4,23 < 4,5 → **corretto** a `--oceano-scuro`. Stessa sorte per lo
   stato selezionato (`aria-pressed`/`aria-current`), trovato vivo in console.
2. **`.account-link:hover`** — 15 px/600: testo normale → **corretto**.
3. **`.badge`** — 14 px/600: testo da distintivo ma sotto i 18,7 px in
   grassetto, quindi soglia 4,5 → **corretto** a `--oceano-scuro` sul proprio
   velo spuma. Il bordo (`--oceano` al 28%) è decorativo e resta.
4. **`.tpl-boutique .site-tagline`** — il `clamp` va da 22 a 32 px a peso
   normale: sopra ~460 px di viewport è testo grande (4,23 ≥ 3 basterebbe),
   ma **sugli schermi stretti scende sotto i 24 px** a peso 400 → testo
   normale → **corretto** a `--oceano-scuro` (misurato a 4,23 su telefono
   prima della correzione, su Cala del Moro). Il filetto `::after` resta blu
   pieno: è grafica, 4,23 ≥ 3 ✓.

### Giallo `#fcbf49` e gradiente

- **Giallo**: censiti tutti i CSS e gli SVG — compare solo come fermata del
  gradiente (tokens.css, logo), spicchio del favicon e velo di tela «disponibile»
  in beach-art; i gettoni `--giallo`/`--giallo-velo` non sono ancora usati da
  nessuna regola. **Mai colore di testo su fondo chiaro** ✓.
- **Gradiente `--arcobaleno`**: definito una volta in tokens.css e usato solo
  nei posti dell'elenco chiuso del §4 — logo (SVG, id `arc`), fascia dell'eroe
  (`.portal-hero::before`), bordo del piè di pagina (`.site-footer`),
  sottolineature dei titoli della home. Nessun'altra comparsa ✓.

### Prova senza colore (filtro grayscale sugli screenshot)

- **Planimetria pubblica** (Lido Aurora): gli stati restano leggibili dai
  glifi D56 dei distintivi (spunta = libera, mezzaluna = condivisa, × = non
  disponibile, scudo = scelta), dai codici e dalla legenda; tipi distinti
  dalla forma del simbolo ✓.
- **Console «Oggi»**: lo stato è sempre **in parole** accanto al distintivo
  colore+glifo, nella scena e nella tabella; il riepilogo del giorno è in
  parole e numeri ✓.
- **Modulo con errore** (accesso): l'avviso ha l'icona «!», il bordo pieno e
  il testo «Email o password non valide.» — comprensibile senza colore ✓.

### Favicon e logo (giudizio motivato, guardando i campionari)

- **Favicon** (`apps/web/app/icon.svg`), guardato a 16/32/64/160 px su bianco
  e su abisso: su **abisso** il disco bianco di fondo (12,36:1) stacca il
  segno nettamente ✓. Su **bianco** il disco si fonde col fondo e il segno è
  il solo ventaglio + onda: lo spicchio giallo (1,66) e l'onda `#ee9b00`
  (2,25) da soli sarebbero deboli, ma stanno **adiacenti a spicchi che
  passano** (rosso 4,17, verde 3,32, blu 4,87, viola 7,11) e la sagoma del
  ventaglio resta riconoscibile anche a 16 px. Giudizio: **accettabile** come
  contrasto non testuale sull'insieme del segno; nessun intervento.
- **Logo** (componenti `Logo`/`LogoLockup`): su fondo chiaro la scritta è
  abisso (12,36:1) e il simbolo arcobaleno è decorativo; sul piè di pagina la
  scritta passa a `--su-scuro` (12,36:1 su abisso) e il simbolo a colori si
  stacca bene dal blu scuro. Giudizio: **a posto su entrambi i fondi**;
  nessun intervento.

### Esito

Sette correzioni, tutte della stessa famiglia (blu pieno → blu scurito sui
fondi spuma), nessun gettone cambiato, nessun markup toccato. Dopo le
correzioni: **0 coppie sotto soglia su 5.456 nodi misurati**.

## I pulsanti del menu (D68)

Aggiunta del **direttore artistico**, 20/11/2026, per la specifica della
home arcobaleno (§2) e la decisione D68: le sei voci del menu come pulsanti
colorati nell'ordine dell'arcobaleno. Tutti i rapporti sono **misurati**
(script usa-e-getta nello scratchpad, formula WCAG, due decimali) sui tre
fondi chiari su cui i pulsanti possono posare: carta `#ffffff`, avorio
`#f8f9fa` (fondo pagina), spuma `#e3f1fa`. Il fondo proprio della barra dei
menu (D67) deve essere **uno di questi tre**: la tavola regge su tutti.

**Motivazione (una riga).** Scelta la via del **fondo pieno, scurito dove il
colore pieno non regge, con testo bianco** (giallo sole, unica eccezione
obbligata, con testo abisso): misurata, tiene l'AA su ogni fondo chiaro con
margini uniformi (testi da 4,87:1 in su, componenti da 3,18:1), mentre la via
dei veli con testo scuro e bordo colorato cade su tre coppie misurate — testo
arancio `#a85600` sul suo velo `#fde7cd` **4,38**, bordo arancio pieno
`#f77f00` su avorio **2,49**, bordo giallo `#fcbf49` su avorio **1,57**.

### Il sistema (uguale per i sei pulsanti)

- **Fondo pieno** nel colore della voce; dove il pieno non regge il bianco
  sopra, si usa la **variante scurita già a verbale** (§2): corallo
  `#b3202c`, arancio `#a85600`, verde acqua `#1b6f65`. Blu `#0077b6` e viola
  `#7b2cbf` reggono da pieni. Giallo sole resta pieno `#fcbf49` **solo con
  testo abisso** (§6).
- **Testo bianco** (`--su-scuro`), raggio pillola, peso medio; sul giallo il
  testo è **abisso**.
- **Bordo**: `1px` dello stesso colore del fondo (il fondo stesso è il
  confine del componente, ≥ 4,56:1 ovunque). Solo il **giallo** ha un bordo
  proprio **`#a85600`** (= `--ambra-testo`), obbligatorio: il giallo sul
  chiaro sta a 1,44–1,66 e non può fare da confine.
- **Passaggio (hover)**: il fondo si scurisce di un passo, **testo
  invariato**. Il passo è quello già a verbale di `--oceano` →
  `--oceano-scuro` (canali ×0,72 circa); i tre scuriti nuovi sono
  `#811720`, `#793e00`, `#135049`, `#59208a` (sotto). Il giallo al passaggio
  diventa `--sole` `#ee9b00` (abisso sopra 5,49), col bordo `#a85600` fermo
  a fare da confine.
- **Voce corrente (`aria-current="page"`)**: fondo di riposo **+
  sottolineatura spessa `3px` nel colore del testo + peso forte (800)** —
  segno **non di solo colore**, leggibile anche in bianco e nero (stessa
  resa in italiano e in inglese).
- **Anello di fuoco**: `outline 3px var(--fuoco)` (abisso) con **scarto
  (`outline-offset`) di `2px`**, così il fondo pagina separa anello e fondo
  del pulsante: 12,36 / 11,72 / 10,73 su carta / avorio / spuma (≥ 3).
- Il **cambio lingua resta neutro** (strumento, non voce): nessun gettone
  `--menu-*` lo riguarda.

### La tavola dei sei pulsanti (rapporti misurati)

| # | Voce | Fondo (riposo) | Testo | Bordo | Passaggio | Corrente | Fuoco | Rapporti misurati |
|---|---|---|---|---|---|---|---|---|
| 1 | Ricerca ombrellone | corallo scurito `#b3202c` | bianco | = fondo | `#811720` | sottolineatura 3px bianca + 800 | `--fuoco`, scarto 2px | testo **6,65** (riposo), **10,11** (passaggio); componente su carta/avorio/spuma **6,65 / 6,30 / 5,77**, al passaggio 10,11 / 9,59 / 8,78 |
| 2 | Ospite: come funziona | arancio scurito `#a85600` | bianco | = fondo | `#793e00` | sottolineatura 3px bianca + 800 | `--fuoco`, scarto 2px | testo **5,26** / **8,39**; componente **5,26 / 4,99 / 4,56**, al passaggio 8,39 / 7,96 / 7,29 |
| 3 | Stagionale: come funziona | giallo sole pieno `#fcbf49` | **abisso** `#1d3557` | **`#a85600`** (obbligatorio) | `--sole` `#ee9b00` | sottolineatura 3px **abisso** + 800 | `--fuoco`, scarto 2px | testo **7,47** / **5,49**; bordo su carta/avorio/spuma **5,26 / 4,99 / 4,56**, sul fondo giallo **3,18**; il fondo da solo sta a 1,66 / 1,57 / 1,44 e al passaggio a 2,25 / 2,14 / 1,96 → **il confine è il bordo**, mai il fondo |
| 4 | Gestore: come funziona | verde acqua scurito `#1b6f65` | bianco | = fondo | `#135049` | sottolineatura 3px bianca + 800 | `--fuoco`, scarto 2px | testo **5,99** / **9,25**; componente **5,99 / 5,68 / 5,20**, al passaggio 9,25 / 8,77 / 8,03 |
| 5 | Assistenza | blu mare pieno `#0077b6` | bianco | = fondo | `--oceano-scuro` `#00557f` | sottolineatura 3px bianca + 800 | `--fuoco`, scarto 2px | testo **4,87** / **8,06**; componente **4,87 / 4,62 / 4,23**, al passaggio 8,06 / 7,65 / 7,00 |
| 6 | Area riservata (riga del marchio) | viola pieno `#7b2cbf` | bianco | = fondo | `#59208a` | sottolineatura 3px bianca + 800 | `--fuoco`, scarto 2px | testo **7,11** / **10,51**; componente **7,11 / 6,74 / 6,17**, al passaggio 10,51 / 9,97 / 9,12 |

Nessuna coppia vincolata sotto soglia; la più bassa è **3,18** (bordo
`#a85600` sul fondo giallo, soglia 3), il testo più basso **4,87** (bianco
su blu mare, soglia 4,5).

### I gettoni `--menu-*` (da aggiungere in coda a tokens.css)

Il frontend applica **questi nomi e basta**, niente esadecimali nei fogli
dei componenti:

```css
/* I pulsanti del menu (D68): fondo pieno, testo bianco (giallo: abisso).
   Passaggio = fondo scurito di un passo; i rapporti sono nella tavola. */
--menu-corallo-fondo: #b3202c;          /* = il rosso di --errore: bianco sopra 6,65 */
--menu-corallo-passaggio: #811720;      /* nuovo scurito: bianco sopra 10,11 */
--menu-corallo-testo: var(--su-scuro);
--menu-arancio-fondo: #a85600;          /* = --ambra-testo: bianco sopra 5,26 */
--menu-arancio-passaggio: #793e00;      /* nuovo scurito: bianco sopra 8,39 */
--menu-arancio-testo: var(--su-scuro);
--menu-giallo-fondo: var(--giallo);     /* #fcbf49: abisso sopra 7,47; mai testo bianco (§6) */
--menu-giallo-passaggio: var(--sole);   /* #ee9b00: abisso sopra 5,49 */
--menu-giallo-testo: var(--abisso);
--menu-giallo-bordo: var(--ambra-testo);/* #a85600, obbligatorio: il confine del pulsante (≥ 4,56 sui chiari) */
--menu-verde-fondo: #1b6f65;            /* = --libero-testo: bianco sopra 5,99 */
--menu-verde-passaggio: #135049;        /* nuovo scurito: bianco sopra 9,25 */
--menu-verde-testo: var(--su-scuro);
--menu-blu-fondo: var(--oceano);        /* #0077b6: bianco sopra 4,87 */
--menu-blu-passaggio: var(--oceano-scuro); /* #00557f: bianco sopra 8,06 */
--menu-blu-testo: var(--su-scuro);
--menu-viola-fondo: var(--viola);       /* #7b2cbf: bianco sopra 7,11 */
--menu-viola-passaggio: #59208a;        /* nuovo scurito: bianco sopra 10,51 */
--menu-viola-testo: var(--su-scuro);
```

Corrispondenza voce → gettone: 1 Ricerca ombrellone `corallo`, 2 Ospite
`arancio`, 3 Stagionale `giallo`, 4 Gestore `verde`, 5 Assistenza `blu`,
6 Area riservata `viola`. I quattro scuriti nuovi (`#811720`, `#793e00`,
`#135049`, `#59208a`) esistono **solo** per il passaggio di questi pulsanti:
non vanno riusati altrove senza tornare a questa tavola. Il gradiente
`--arcobaleno` resta **vietato** sui pulsanti (§4): l'arcobaleno qui lo fa
la fila dei sei colori, non il gradiente.
