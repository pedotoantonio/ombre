# Prompt di ampliamento — «La spiaggia illustrata e il pianificatore del Gestore»

**Committente:** il proprietario di Ombrè (19 novembre 2026), con quattro immagini di
riferimento in `~/craft-anything-projects/riferimenti-spiaggia/`:
`spiaggeit-pannello-gestore.png` (il pannello gestore di Spiagge.it PRO),
`legenda-elementi-stati.png`, `oggetti-spiaggia-1.jpg`, `oggetti-spiaggia-2.jpg`.
**Origine:** perizia visiva del pannello concorrente (progetto Craft Anything
`pannello-gestore.cany`, reperti fnd_1–fnd_3). La richiesta del committente: migliorare il
pannello del Gestore di Ombrè — «soprattutto la grafica degli ombrelloni e la possibilità di
poter spostare, creare, modificare… Tutta la spiaggia con grafica nuova».

## Sequenza
Questa commessa parte **dopo** la chiusura di «Al passo con il mercato» (in corso). Le zone
con nome (punto 2 di quella commessa) sono un prerequisito: il pianificatore le disegna.

## Che cosa insegna il riferimento (reperti)
- La mappa del concorrente è **un'illustrazione viva**: fascia mare con onde, sabbia,
  passerelle, torretta del bagnino, chioschi, palme; gli ombrelloni sono icone dall'alto con
  la tela colorata per stato e la dotazione (lettini) visibile a colpo d'occhio.
- La **legenda** abbina a ogni stato un glifo oltre al colore (✓ ✗ 📅 🎫 🔧): leggibile anche
  per chi non distingue i colori.
- Lo **stile**: illustrazione piatta, contorni morbidi, palette pastello, vista dall'alto.

## Le funzioni, una per una

### 1. Il nuovo linguaggio grafico della spiaggia (ovunque)
Una sola famiglia di **SVG originali, disegnati a mano in codice** (sprite di simboli
riusabili, vista dall'alto, stile piano con contorni morbidi, palette coerente con Solar &
Fresh), usata **dappertutto**: planimetria pubblica (scheda del lido e ricerca), pagina
«Spiaggia» del gestionale, banco della reception, pass dove compare la postazione.
- **Postazioni**: ombrellone (tela a spicchi), lettino, sdraio, cabina, gazebo, tavolo.
- **Scenografia**: fascia mare con onde e riva, sabbia con grana leggera, passerelle, palme
  e vegetazione, dune, chiosco/bar, docce, torretta del bagnino, bandiera, cestini,
  campo da beach volley / bocce, area giochi, natanti a riva (pedalò, canoa, SUP).
- Le immagini di riferimento sono **solo ispirazione di stile e di impianto**: nessun asset
  copiato o ricalcato da Spiagge.it, niente raster generati: solo vettori nostri.
- Dimensioni su **griglia** coerente; la planimetria resta leggibile a 390 px.

### 2. Stati e legenda
- Stati della postazione: **disponibile / prenotato / occupato / Stagionale / manutenzione**,
  ciascuno con **colore + glifo** (mai solo colore), lessico unico nelle due lingue
  (si dice «Stagionale», non «abbonamento»).
- **Legenda** compatta e uguale su pubblico e gestionale (sul telefono si apre da un tasto).
- Sulla mappa del gestionale ogni postazione mostra il numero e, dove c'è, la zona.

### 3. Il pianificatore del Gestore («Spiaggia» nel gestionale)
Il committente **revoca l'esclusione** di spostare/creare dalla mappa, decisa in passato:
ora si costruisce, con giudizio e senza riscritture del framework.
- **Creare**: postazioni singole oppure file e griglie in un colpo (es. «4 file × 8, passo 3 m,
  a partire da B1»), con numerazione automatica coerente (A1, A2… B1…).
- **Spostare**: con JavaScript, trascinamento con aggancio alla griglia; **senza JavaScript**,
  selezione della postazione e modulo (riga/colonna o coordinate): ogni operazione del
  pianificatore ha la sua strada a moduli — il trascinamento è una scorciatoia, mai l'unica via.
- **Modificare**: tipo (ombrellone/gazebo/cabina…), dotazione (n° lettini e sdraio), nome,
  zona, stato di manutenzione.
- **Eliminare** solo postazioni senza prenotazioni future; altrimenti si spiega perché no.
- **Scenografia**: aggiungere/spostare/togliere gli elementi decorativi (palme, passerelle,
  chiosco, docce, torretta…), che non sono prenotabili e non toccano il registro.
- **Zone**: disegnare e colorare le zone con nome sul pianificatore (coerenti con la commessa
  in corso).
- **Salvataggio esplicito** con riepilogo delle modifiche prima di confermare, annulla
  dell'ultima operazione, registro delle azioni per ogni salvataggio; l'anteprima pubblica
  rispecchia subito la spiaggia salvata.
- Le prenotazioni esistenti **non si rompono mai**: una postazione spostata resta la stessa
  postazione (stesso codice, stesse prenotazioni, stesso pass).

## Vincoli (invariati)
- Tutto funziona anche senza JavaScript (il pianificatore per intero, via moduli); italiano e
  inglese allo stesso livello; tre nomi di ruolo; lessico unico.
- Nessuna funzione esistente si rompe; i collaudi delle commesse precedenti restano verdi.
- Niente librerie canvas pesanti (Konva resta escluso): SVG + HTML + il poco JS progressivo
  che serve per il trascinamento.
- Specifica e decisioni numerate prima del codice; squadra di agenti con ruoli (analista,
  **illustratore SVG**, backend, frontend, collaudatore); commit a ogni incremento;
  **nessun push**.
- Al termine: schermate nuove (planimetria pubblica nuova a 1366 e 390, pianificatore con
  trascinamento e con moduli, legenda, reception), stato.md aggiornato, demo sullo stesso
  tunnel, seed con una spiaggia dimostrativa ricca (scenografia compresa).

## Criteri di accettazione
1. Tutta la spiaggia — pubblico, gestionale, reception — usa la nuova grafica SVG originale, con mare, sabbia e scenografia.
2. Ogni stato di postazione ha colore + glifo e la legenda è identica nelle due lingue.
3. Il Gestore crea postazioni singole e in file/griglia con numerazione automatica.
4. Il Gestore sposta una postazione sia col trascinamento (JS) sia col modulo (senza JS), e il codice/prenotazioni della postazione restano gli stessi.
5. Il Gestore modifica tipo, dotazione, nome, zona e manutenzione; elimina solo postazioni senza prenotazioni future.
6. La scenografia si aggiunge, si sposta e si toglie senza toccare prenotazioni e registro.
7. Il salvataggio mostra il riepilogo, finisce nel registro delle azioni e l'anteprima pubblica si aggiorna.
8. Planimetria leggibile e usabile a 390 px; tutto collaudato nelle due lingue, anche senza JavaScript, con i collaudi precedenti ancora verdi.
