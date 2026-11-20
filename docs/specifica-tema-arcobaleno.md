# Specifica: il tema arcobaleno — il portale ricolorato sul nuovo logo

Iterazione del 20/11/2026 dal prompt del committente
([prompt-tema-arcobaleno.md](prompt-tema-arcobaleno.md)). Rifacimento
**puramente visivo**: cambia il vestito, non il corpo. Nessuna funzione,
rotta, modulo, testo (salvo dove un testo nomina un colore) o dato
cambia; i collaudi esistenti (287 test, 135 rotte, 1186 controlli fumo)
restano verdi. Decisioni D64–D66.

## 1. Il logo arcobaleno e il ripristino (D64)

- I file approvati dal committente sono copiati in `docs/marchio/`
  (`logo-arcobaleno-verticale.svg`, `logo-arcobaleno-orizzontale.svg`,
  `logo-arcobaleno-anteprima.png`) **accanto** ai file del marchio
  attuale, che non si cancellano. `marchio.md` dice quali sono in uso e
  come tornare indietro.
- Il gradiente del logo (id `arc`, orizzontale, per forma sul proprio
  riquadro): `#e63946` 0% → `#f77f00` 20% → `#fcbf49` 40% → `#2a9d8f`
  60% → `#0077b6` 80% → `#7b2cbf` 100%. Restano **arancio `#ee9b00`** il
  sole sulla «è» e l'onda sotto l'ombrello.
- L'**illustratore** porta il logo nel portale: componente `Logo`/
  `LogoLockup` di `packages/ui` ridisegnato sul file del committente
  (fedele, mai ricostruito a occhio), favicon `apps/web/app/icon.svg`
  in versione arcobaleno leggibile a 16 px, versioni su scuro dove il
  piè di pagina le usa.
- **Backup già fatto, non si rifà**: tag git
  `ombre-tema-originale-20261120` (commit `3bcd7e9`) e archivio
  `/home/sysadmin/backup-ombre/ombre-tema-originale-20261120.tar.gz`.
  La procedura di ripristino va scritta in stato.md:
  `git checkout ombre-tema-originale-20261120 -- <file del tema>`.

## 2. I gettoni del tema (D65)

- Prima del CSS, il **direttore artistico** scrive
  `docs/tema-arcobaleno.md`: la tabella dei gettoni (nome, valore,
  ruolo, contrasto misurato sui fondi previsti) e la gerarchia del
  colore. Regole ferree del committente:
  1. il **gradiente intero** è del logo e delle grandi superfici
     decorative (fascia dell'eroe, bordi decorativi, sottolineature
     spesse): mai su testo corrente, mai su componenti piccoli;
  2. **colori funzionali uno per ruolo**, varianti scurite dove serve il
     contrasto: blu mare `#0077b6` azioni e collegamenti, verde acqua
     `#2a9d8f` conferme/disponibile, rosso corallo `#e63946`
     errori/occupato, arancio avvisi; il giallo `#fcbf49` **mai come
     testo su chiaro**;
  3. **WCAG AA misurato** (4.5:1 testo normale, 3:1 testo grande e
     componenti) per ogni coppia testo/fondo, a verbale; dove il colore
     puro non basta, variante scurita documentata;
  4. il colore **mai unico segnale**: stati, esiti e distintivi
     leggibili anche in bianco e nero (i glifi D56 restano).
- Il **frontend** applica i gettoni nelle variabili CSS esistenti di
  `packages/ui` (portal.css e fogli collegati), senza duplicare regole
  né toccare markup, moduli o testi. Email transazionali: solo se
  portano colori.

## 3. La planimetria resta serena (D66)

La planimetria illustrata conserva il carattere pastello di D55: mare,
sabbia e scenografia non si stravolgono; la palette arcobaleno entra
negli **accenti** (tele degli ombrelloni, legenda, cornici) per mano
dell'illustratore, in accordo coi gettoni del direttore artistico. Gli
stati restano colore + glifo con la legenda invariata nei contenuti.

## 4. Squadra e ordine dei lavori

1. **Direttore artistico**: gettoni e gerarchia (documento, nessun
   codice). 2. **Illustratore SVG**: logo nel portale, favicon, accenti
   della planimetria. 3. **Frontend**: applicazione dei gettoni nel CSS.
   (2 e 3 in parallelo su file disgiunti.) 4. **Esperto di
   accessibilità**: contrasti misurati sulle pagine rese, prova senza
   colore, verbale e correzioni minime documentate. 5. **Collaudatore**:
   regressione completa (tutte le suite) e prove visive.

## 5. Rimandati (scritti)

Tema scuro; scelta del tema per stabilimento; animazioni del gradiente;
stampa a colori calibrata.

## 6. Criteri di accettazione (numerazione del committente)

1. Il logo arcobaleno (verticale e orizzontale) è quello attivo nel
   portale, nel gestionale, nella reception e nel favicon; i file
   originali del marchio restano nel repository e `marchio.md` spiega
   come ripristinarli.
2. Esiste la tabella dei gettoni del tema con nome, valore, ruolo e
   contrasto misurato; nessuna coppia testo/fondo sotto WCAG AA.
3. Il portale pubblico, il gestionale e la reception usano la palette
   arcobaleno in modo coerente: gradiente solo su logo e superfici
   decorative, colori funzionali per ruolo.
4. La planimetria illustrata adotta gli accenti della palette senza
   perdere leggibilità: stati sempre con colore + glifo, legenda
   invariata nei contenuti.
5. Il giallo non compare mai come testo su fondo chiaro; gli esiti e
   gli stati restano comprensibili anche in bianco e nero.
6. Nessuna regressione: tutti i collaudi precedenti verdi, prenotazione
   rapida, carrello, caparra, pianificatore e schede delle postazioni
   funzionano come prima, nelle due lingue e senza JavaScript.
7. stato.md documenta il backup (tag `ombre-tema-originale-20261120` e
   archivio in `/home/sysadmin/backup-ombre/`) e la procedura di
   ripristino del tema originale.
