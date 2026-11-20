# Prompt di ampliamento — «Il tema arcobaleno: il portale ricolorato sul nuovo logo»

**Committente:** il proprietario di Ombrè (20 novembre 2026, mattina).
**Natura:** rifacimento **puramente visivo** del portale. Il committente ha approvato la prova
del logo arcobaleno e chiede di ricolorare tutto il portale con la stessa palette. Nessuna
funzione cambia: cambia il vestito, non il corpo.

## I materiali del committente

In `/home/sysadmin/consegne-ombre/logo-arcobaleno/` (copiarli nel repository, non modificarli lì):
- `logo-arcobaleno-verticale.svg` — logo verticale con motto, già pronto;
- `logo-arcobaleno-orizzontale.svg` — logo orizzontale, già pronto;
- `anteprima.png` — l'anteprima approvata dal committente.

La ricetta del gradiente (id `arc`, orizzontale, per ogni forma sul proprio riquadro):

| Fermata | Colore | Nome |
|---|---|---|
| 0% | `#e63946` | rosso corallo |
| 20% | `#f77f00` | arancio |
| 40% | `#fcbf49` | giallo sole |
| 60% | `#2a9d8f` | verde acqua |
| 80% | `#0077b6` | blu mare |
| 100% | `#7b2cbf` | viola |

Nel logo restano **arancio `#ee9b00`** il sole sulla «è» e l'onda sotto l'ombrello: così è
stato approvato e così resta.

## Il backup (già fatto — non rifarlo, non toccarlo)

- Tag git **`ombre-tema-originale-20261120`** sul commit `3bcd7e9`: il ripristino del tema
  attuale è `git checkout ombre-tema-originale-20261120 -- <file del tema>`.
- Archivio completo **`/home/sysadmin/backup-ombre/ombre-tema-originale-20261120.tar.gz`**
  (sorgenti senza node_modules). La procedura di ripristino va **scritta in stato.md**.
- I file attuali di `docs/marchio/` **non si cancellano**: i nuovi logo si aggiungono accanto
  e diventano quelli attivi; `marchio.md` spiega quali sono in uso e come tornare indietro.

## Le regole del colore (il cuore della commessa)

La palette arcobaleno è festosa ma indisciplinata: serve un **direttore artistico** che la
trasformi in **gettoni di tema (design token)** documentati, prima di toccare una riga di CSS.

1. **Il gradiente intero è del logo e delle grandi superfici decorative** (fascia dell'eroe,
   bordi decorativi, sottolineature spesse): mai su testo corrente, mai su componenti piccoli.
2. **I colori funzionali si scelgono dalla palette, uno per ruolo**, con varianti scurite
   dove serve il contrasto: ad esempio blu mare `#0077b6` per azioni e collegamenti, verde
   acqua `#2a9d8f` per conferme/disponibile, rosso corallo `#e63946` per errori/occupato,
   arancio per avvisi. Il giallo `#fcbf49` **mai come testo su chiaro**.
3. **Contrasto WCAG AA misurato** (4.5:1 testo normale, 3:1 testo grande e componenti):
   l'esperto di accessibilità verifica ogni coppia testo/fondo con i rapporti calcolati e
   li mette a verbale; dove un colore della palette non basta, si usa la variante scurita
   e la tabella dei gettoni lo documenta.
4. **Il colore non è mai l'unico segnale**: gli stati della planimetria (colore + glifo),
   gli esiti dei moduli, i distintivi restano leggibili anche in bianco e nero.
5. **La planimetria illustrata resta serena**: mare, sabbia e scenografia conservano il loro
   carattere pastello; la palette arcobaleno entra negli accenti (tele degli ombrelloni,
   legenda, cornici), non stravolge l'illustrazione.
6. Una pagina di **specifica dei gettoni** (`docs/tema-arcobaleno.md` o dentro la specifica):
   ogni gettone con nome, valore, ruolo, contrasto misurato sui fondi previsti.

## Dove si applica

Dappertutto, con lo stesso lessico visivo: portale pubblico (home, Ricerca ombrellone,
scheda del lido, planimetria, carrello, riepilogo, conto dell'Ospite, schede delle
postazioni), gestionale (Spiaggia/pianificatore, Sito, Postazioni, registro), reception,
pass, email transazionali (se portano colori), pagine di Assistenza e di errore. Il
**favicon** e ogni posto dove compare il logo passano al logo arcobaleno.

## Vincoli (invariati)

- **Nessuna funzione cambia e nessuna si rompe**: niente modifiche a rotte, moduli, testi
  (se non dove un testo nomina un colore), dati o seed; i collaudi esistenti (287 test,
  135 rotte a contratto, 1186 controlli fumo) restano verdi.
- Tutto funziona anche senza JavaScript; italiano e inglese allo stesso livello; i tre nomi
  di ruolo; lessico unico.
- Specifica e **decisioni numerate prima del codice**; commit a ogni incremento; **nessun push**.
- **Squadra di agenti con specialità diverse**: direttore artistico (gettoni e gerarchia del
  colore), illustratore SVG (logo nel portale, accenti della planimetria, favicon),
  frontend (applicazione dei gettoni nel CSS, senza duplicare regole), esperto di
  accessibilità (contrasti misurati, verifica senza colore), collaudatore (regressione
  completa + prove visive).
- Al termine: schermate nuove (home, ricerca, scheda del lido, planimetria pubblica,
  pianificatore, reception, riepilogo/carrello, una scheda di postazione — a 1366 e 390,
  it dove basta), stato.md aggiornato con la **procedura di ripristino**, demo sullo stesso
  tunnel già attivo.

## Criteri di accettazione

1. Il logo arcobaleno (verticale e orizzontale) è quello attivo nel portale, nel gestionale, nella reception e nel favicon; i file originali del marchio restano nel repository e `marchio.md` spiega come ripristinarli.
2. Esiste la tabella dei gettoni del tema con nome, valore, ruolo e contrasto misurato; nessuna coppia testo/fondo sotto WCAG AA.
3. Il portale pubblico, il gestionale e la reception usano la palette arcobaleno in modo coerente: gradiente solo su logo e superfici decorative, colori funzionali per ruolo.
4. La planimetria illustrata adotta gli accenti della palette senza perdere leggibilità: stati sempre con colore + glifo, legenda invariata nei contenuti.
5. Il giallo non compare mai come testo su fondo chiaro; gli esiti e gli stati restano comprensibili anche in bianco e nero.
6. Nessuna regressione: tutti i collaudi precedenti verdi, prenotazione rapida, carrello, caparra, pianificatore e schede delle postazioni funzionano come prima, nelle due lingue e senza JavaScript.
7. stato.md documenta il backup (tag `ombre-tema-originale-20261120` e archivio in `/home/sysadmin/backup-ombre/`) e la procedura di ripristino del tema originale.
