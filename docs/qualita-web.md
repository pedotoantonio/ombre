# Ombrè — Requisiti web: design, accessibilità, prestazioni, SEO, AEO e GEO

Applicazione al progetto Ombrè del prompt di miglioramento dei siti
([prompt-qualita-web.md](prompt-qualita-web.md)), fatta l'11/11/2026: ogni criterio del
prompt è tradotto in un requisito e in una prova di accettazione. Le prime sei pagine
pubbliche sono state costruite secondo questi requisiti; per le pagine successive lo
stesso prompt si riesegue sul codice come verifica.

Come leggere il documento: **Requisito** = da realizzare e provare sulle pagine reali;
**Verificato oggi** = controllato in questa stesura (calcoli e coerenza con gli altri
documenti); **Proposta** = scelta nuova, non presente nel progetto v3.0, da confermare.

## 1. Pubblico, azioni e priorità

Ombrè è insieme un **sito locale** (i siti dei bagni: offerta, sede, orari, contatti,
prenotazione) e un **SaaS** (la pagina per gli stabilimenti: funzioni, piani,
attivazione). Valgono entrambe le liste di controllo del prompt.

| Pubblico | Cosa cerca | Azione da completare | Pagine che contano |
|---|---|---|---|
| Ospite occasionale | Un ombrellone per un giorno, con prezzo finale e condizioni | Prenotare e ricevere il pass | Home, esplora, località, scheda del bagno, prenota |
| Stagionale | Sapere se e come può proporre le giornate in cui non c'è | Chiedere l'accesso al proprio bagno | Pagina per gli stagionali, FAQ |
| Gestore | Capire se conviene, quanto costa, se resta lui a decidere | Richiedere l'adesione | Pagina per gli stabilimenti, come funziona |

### Pagine pubbliche e aree riservate

- **Pubbliche e indicizzabili**: home, esplora, pagine di località, come funziona, per
  gli stabilimenti, per gli stagionali, assistenza/FAQ, chi siamo, schede e siti dei
  bagni attivi, offerte valide.
- **Pubbliche ma non indicizzabili**: passo di prenotazione, ricerche con data e ospiti
  nei parametri, pagina di accesso.
- **Riservate, protette dall'autenticazione**: area ospite, area stagionale, gestione e
  reception, console centrale, checkout, anteprime delle bozze.

### Priorità

Ordinate per gravità, beneficio atteso e sforzo. Sono lacune della documentazione
rispetto al prompt, non difetti di un sito esistente.

| # | Lacuna trovata | Gravità | Sforzo | Dove è risolta |
|---|---|---|---|---|
| 1 | La SEO era descritta in tre righe: mancavano title, H1, canonical, robots, sitemap e dati strutturati pagina per pagina | Alta | Basso | §5 |
| 2 | Nessun elenco delle domande dei clienti né della pagina che deve rispondere | Alta | Basso | §6 |
| 3 | Chi pubblica il sito non è definito (marchio e soggetto venditore aperti): senza questo dato `Organization` e la pagina «Chi siamo» non si possono scrivere | Alta | Esterno | §7, §8 |
| 4 | Prezzi e disponibilità sono dinamici: non era scritto cosa deve stare nell'HTML servito | Alta | Medio | §5 |
| 5 | Nessun limite di prestazione per le pagine pubbliche oltre alla ricerca sotto i 2 secondi | Media | Basso | §4 |
| 6 | Token grafici definiti, ma nessuna regola per animazioni e stati di interazione | Media | Basso | §2 |
| 7 | Il grigio `#7A8B93` usato nei materiali non raggiunge il contrasto AA su Sabbia per testo normale | Bassa | Fatto | §3 |

## 2. Design e interazioni

La skill `/apple-design` non è installata, ma il suo testo è nel repository
(`docs/riferimento-apple-design.md`, fuori da questa cartella) ed è stato applicato al sito:
risposta immediata alla pressione, intestazione traslucida con alternative per chi riduce
trasparenze o chiede più contrasto, spaziatura delle lettere diversa per titoli e testo.
L'ispirazione riguarda i **principi** (chiarezza,
contenuto prima dell'interfaccia, gerarchia leggibile, risposta immediata ai gesti), non
l'aspetto: l'identità di Ombrè resta quella definita in
[progetto.md](progetto.md#identità-visiva-e-accessibilità).

**Requisiti**

- **Una proposta, un'azione.** Nella prima schermata di ogni pagina pubblica si leggono
  senza scorrere: cosa offre la pagina, per chi, e un'unica azione principale (pulsante
  Sole con testo Laguna). Le azioni secondarie sono collegamenti o pulsanti a contorno.
- **Ogni sezione risponde a una domanda** dell'elenco in §6 o aiuta a completare
  un'azione. Una sezione che non fa né l'una né l'altra cosa si toglie.
- **Navigazione breve**: al massimo cinque voci nel portale e sette nel sito del bagno,
  come già previsto; la voce «Prenota» resta sempre raggiungibile su mobile.
- **Un solo sistema**: tipografia, spazi (scala 4/8/12/16/24/32/48), raggi, bordi, colori
  e stati vivono nel pacchetto `ui` come token. Nessun valore scritto a mano nelle pagine.
  I tre template dei bagni cambiano la presentazione, non i token di accessibilità.
- **Gerarchia tipografica**: un solo H1 per pagina; al massimo tre livelli visibili per
  schermata; righe di testo tra 45 e 75 caratteri su desktop.
- **Stati completi**: ogni componente interattivo ha normale, hover, focus, premuto,
  selezionato, disabilitato, caricamento ed errore. Il caricamento usa segnaposto con le
  dimensioni finali, così la pagina non salta.
- **Animazioni con uno scopo.** Si anima solo per mostrare una relazione o un cambio di
  stato:

  | Momento | Animazione | Durata |
  |---|---|---|
  | Selezione di una postazione in planimetria | Evidenziazione e comparsa della barra di riepilogo dal basso | 150–200 ms |
  | Apertura di un pannello (filtri, dettaglio) | Scorrimento dal bordo da cui proviene | 250–300 ms |
  | Conferma della prenotazione | Segno di spunta che compare una volta | 300–400 ms |
  | Riserva in scadenza | Nessuna animazione continua: il conto alla rovescia è testo | — |

  Si animano solo `transform` e `opacity`. Con `prefers-reduced-motion: reduce` ogni
  movimento diventa un cambio immediato o una dissolvenza breve; nessuna informazione
  dipende dall'animazione.
- **Mobile prima**: i percorsi di acquisto si progettano a 360 px di larghezza e poi si
  estendono. Nessuno scorrimento orizzontale della pagina; la barra di riepilogo non copre
  contenuti né tastiera (già in progetto).

## 3. Accessibilità

Obiettivo confermato: WCAG 2.2 AA, verificato sulle pagine reali.

> La tabella che segue riguarda la palette della v3.0. Per la palette in uso dall'11/11/2026
> i contrasti sono in [progetto-grafico.md](progetto-grafico.md).

**Verificato oggi** — contrasti della palette, calcolati con la formula WCAG:

| Coppia (testo su fondo) | Rapporto | Uso consentito |
|---|---|---|
| Laguna `#023047` su Sabbia `#FFF8E7` | 13,08:1 | Qualsiasi testo |
| Laguna su Sole `#FFB703` | 7,93:1 | Qualsiasi testo (pulsante principale) |
| Sabbia su Laguna | 13,08:1 | Qualsiasi testo |
| Sabbia o bianco su Mare `#126777` | 6,14:1 / 6,50:1 | Qualsiasi testo |
| Mare su Sabbia | 6,14:1 | Qualsiasi testo, collegamenti |
| Secondario `#3E5C6B` su Sabbia | 6,73:1 | Qualsiasi testo |
| Libero `#23644B` su Sabbia | 6,62:1 | Qualsiasi testo |
| Errore `#A34336` su Sabbia | 5,81:1 | Qualsiasi testo |
| Mare su Sole | 3,72:1 | Solo testo grande o icone |
| Grigio `#7A8B93` su Sabbia | 3,34:1 | Solo testo grande: **non** per note e metadati |
| Sole su Sabbia | 1,65:1 | Mai come testo né come unico segnale |

Conseguenza: per note, metadati e piè di pagina si usa `#3E5C6B`, non il grigio
`#7A8B93`. Lo schema [struttura-logica.svg](struttura-logica.svg) è stato corretto.

**Requisiti**

- Tutti i percorsi pubblici e di acquisto si completano da sola tastiera, con ordine di
  tabulazione logico, focus sempre visibile (contorno di almeno 2 px con contrasto 3:1) e
  collegamento «Salta al contenuto».
- Ogni campo ha un'etichetta visibile e associata; gli errori si mostrano vicino al
  campo, dicono cosa correggere e vengono annunciati ai lettori di schermo; nessun errore
  comunicato solo con il colore.
- Area di tocco minima 44×44 px con almeno 8 px tra bersagli vicini.
- La planimetria ha sempre la vista a elenco equivalente (già in progetto); la mappa
  dell'esplorazione ha la lista sulla stessa selezione.
- Immagini con testo alternativo obbligatorio nell'editor; quelle decorative con
  alternativa vuota. Lingua della pagina dichiarata e coerente con la traduzione servita.
- La pagina regge lo zoom al 200% e il testo ingrandito senza perdita di contenuti.

## 4. Prestazioni

**Requisiti** per le pagine pubbliche, misurati su mobile al 75° percentile:

| Misura | Soglia |
|---|---|
| LCP (comparsa del contenuto principale) | ≤ 2,5 s |
| INP (risposta alle interazioni) | ≤ 200 ms |
| CLS (salti di layout) | ≤ 0,1 |

Sono le soglie «buono» dei Core Web Vitals. Per rispettarle:

- **Immagini**: formati moderni (AVIF o WebP) in più larghezze, dimensioni dichiarate,
  caricamento differito sotto la prima schermata, priorità alta alla sola immagine
  principale. L'elaborazione dei media caricati dal gestore produce le varianti: il
  gestore non deve ottimizzare a mano.
- **Carattere**: Plus Jakarta Sans servito dal dominio di Ombrè in formato variabile,
  con `font-display: swap` e fallback di sistema dalle metriche simili.
- **Script**: le pagine pubbliche si leggono e si navigano anche prima che lo script sia
  pronto; mappa e planimetria interattiva si caricano quando servono, non all'apertura.
- **Terze parti**: nessuno script esterno bloccante; ogni aggiunta (mappe, analisi,
  pagamenti) si valuta contro le soglie sopra.
- Resta valido l'obiettivo del pilota: ricerca sotto i 2 secondi al 95° percentile.

## 5. SEO tecnica delle pagine pubbliche

### Regole generali

- **Contenuto nell'HTML servito.** Le pagine pubbliche sono renderizzate dal server o
  prerenderizzate. Devono essere già nell'HTML: titolo, H1, descrizione del bagno,
  indirizzo, servizi, orari e periodo di apertura, condizioni generali, FAQ, collegamenti
  interni. Possono arrivare dopo, via script: disponibilità per data, prezzo calcolato
  per i parametri scelti, planimetria interattiva.
- **Prezzi**: un prezzo compare nell'HTML e nei dati strutturati solo se è lo stesso che
  il visitatore vede e può acquistare (regola già valida per il prezzo «da»).
- **Canonical**: ogni pagina dichiara un solo indirizzo canonico, assoluto, sull'host
  principale. Un bagno con dominio personalizzato verificato ha canonical su quel
  dominio, e `/bagni/{slug}` sul portale punta allo stesso; senza dominio personalizzato
  vale `/bagni/{slug}`. Mai due indirizzi indicizzabili per lo stesso contenuto.
- **Host**: il nome con accento e la forma punycode `xn--ombr-8oa.com` rispondono con un
  reindirizzamento 301 a un unico host scelto; lo stesso per `www` e per HTTP verso HTTPS.
- **Codici di stato**: 200 per le pagine attive; 404 per bagni e offerte inesistenti (non
  una pagina 200 con messaggio di errore); 301 verso la scheda del bagno per un'offerta
  scaduta; 410 per un bagno che ha lasciato la piattaforma; 503 con `Retry-After` in
  manutenzione. Un host sconosciuto risponde 404, non apre un bagno a caso.
- **robots.txt**: consente le pagine pubbliche; esclude `/account`, `/stagionale`,
  `/gestione`, la console, il checkout e le anteprime; indica la sitemap. Le aree
  riservate sono protette dall'autenticazione: robots.txt non è una protezione.
- **Sitemap**: generata dai dati, contiene solo pagine pubbliche indicizzabili con
  canonical su sé stesse (bagni attivi, offerte valide, pagine editoriali), con data di
  ultima modifica reale. Un bagno sospeso esce dalla sitemap alla sospensione.
- **Ricerche con parametri**: `/esplora?data=…&ospiti=…` non è indicizzabile e ha
  canonical sulla pagina di località o su `/esplora`.
- **Anteprime social**: titolo, descrizione e immagine (Open Graph) per ogni pagina
  pubblica; per il bagno, la sua immagine principale.
- **Collegamenti interni**: home → località → bagno → offerta, con briciole di pane; ogni
  scheda rimanda alla località e ai bagni vicini; le pagine editoriali rimandano alle
  schede. Nessuna pagina pubblica raggiungibile solo dalla ricerca interna.

### Pagina per pagina

Gli indirizzi senza riferimento nel progetto v3.0 sono **proposte**.

| Pagina | Indirizzo | Indicizzabile | Title | H1 | Dati strutturati |
|---|---|---|---|---|---|
| Home | `/` | Sì | Ombrè: prenota un ombrellone per un giorno | Il tuo posto al sole, anche per un giorno solo | `Organization`, `WebSite` |
| Esplora | `/esplora` | Sì, senza parametri | Stabilimenti con ombrelloni giornalieri \| Ombrè | Trova uno stabilimento | `BreadcrumbList` |
| Località (proposta) | `/esplora/{località}` | Sì | Ombrelloni giornalieri a {località} \| Ombrè | Ombrelloni per un giorno a {località} | `ItemList`, `BreadcrumbList` |
| Come funziona (proposta) | `/come-funziona` | Sì | Come funziona Ombrè: dalla ricerca al pass | Come funziona Ombrè | `BreadcrumbList` |
| Per gli stabilimenti (proposta) | `/per-gli-stabilimenti` | Sì | Ombrè per gli stabilimenti balneari: sito e prenotazioni | Il sito e le prenotazioni del tuo stabilimento | `SoftwareApplication` solo con piani confermati |
| Per gli stagionali (proposta) | `/per-gli-stagionali` | Sì | Condividere l'ombrellone stagionale con Ombrè | Condividi le giornate in cui non ci sei | `BreadcrumbList` |
| Assistenza e FAQ (proposta) | `/assistenza` | Sì | Assistenza e domande frequenti \| Ombrè | Assistenza | `FAQPage` |
| Chi siamo (proposta) | `/chi-siamo` | Sì | Chi c'è dietro Ombrè | Chi siamo | `Organization` |
| Scheda del bagno | `/bagni/{slug}` | Sì, se attivo | {Bagno} a {località}: ombrelloni e prenotazione | {Bagno} | `LocalBusiness`, `BreadcrumbList` |
| Offerta | `/bagni/{slug}/offerte/{offerta}` | Sì, finché valida | {Offerta} — {Bagno}, {località} | {Offerta} | `Offer` nel `LocalBusiness` |
| Prenota | `/bagni/{slug}/prenota` | No (`noindex, follow`) | Prenota a {Bagno} | Scegli la tua postazione | — |
| Aree riservate e checkout | `/account`, `/stagionale`, `/gestione` | No, con accesso | — | — | — |

Ogni pagina ha title sotto i 60 caratteri circa, una descrizione propria di 140–160
caratteri che dice cosa si può fare lì, e un H1 diverso da quello delle altre pagine. Sul
dominio personalizzato del bagno il title non porta il marchio Ombrè.

### Dati strutturati (JSON-LD)

- Contengono solo informazioni **visibili nella pagina** e vere in quel momento.
- `LocalBusiness` del bagno: nome, indirizzo, coordinate, telefono, orari e periodo di
  apertura stagionale, immagine, indirizzo web. I dati vengono dai campi validati
  dell'editor: se un campo manca, la proprietà si omette.
- `Offer`: solo con prezzo reale e acquistabile, con valuta e validità.
- `FAQPage`: solo per domande e risposte effettivamente pubblicate. Serve alla
  comprensione da parte di motori e assistenti; non garantisce risultati arricchiti.
- `Organization`: nome, logo, indirizzo web, contatti e profili ufficiali del soggetto
  che pubblica. **Bloccato** finché marchio e soggetto non sono definiti (§8).
- **Mai** `Review` o `AggregateRating` senza recensioni reali e verificabili: il progetto
  esclude le recensioni generate.
- Ogni tipo si valida in automatico a ogni rilascio (§9).

### Multilingua

Italiano e inglese hanno indirizzi distinti e stabili (inglese sotto `/en/`, decisione
D12), con
canonical su sé stessi e `hreflang` reciproci più `x-default`. Per i siti dei bagni
`hreflang` compare solo per le lingue con una `Translation` pubblicata: una pagina non
tradotta non dichiara una versione inglese e non mostra testo misto.

## 6. AEO: le domande dei clienti e la pagina che risponde

Regola di scrittura: la risposta diretta sta nelle prime due frasi della sezione, poi
vengono condizioni, limiti ed esempi. Le FAQ si usano solo per domande che il resto della
pagina lascia aperte.

| Domanda del cliente | Pagina che risponde | Risposta diretta da pubblicare | Dato ancora mancante |
|---|---|---|---|
| Posso prenotare un ombrellone per un solo giorno? | Home, come funziona | Sì: giornata intera, postazione fissa, dotazione dichiarata (per esempio un ombrellone e due lettini) | Zona in cui il servizio è attivo |
| Quanto costa una giornata? | Scheda del bagno | Il prezzo lo decide il bagno; la scheda mostra il totale per data e ospiti prima del pagamento, sconti inclusi | Prezzi reali dei bagni pilota |
| Posso annullare e riavere i soldi? | Scheda del bagno, passo di prenotazione | Le condizioni del bagno, con data e ora limite, scritte prima del pagamento e salvate nell'ordine | Condizioni definitive di annullamento |
| Come entro in spiaggia? | Come funziona | Con il pass ricevuto alla conferma: un QR o un codice breve mostrato alla reception | — |
| Cosa succede se piove o il bagno chiude? | Assistenza | Maltempo, annullamento e chiusura sono casi distinti, ciascuno con la sua regola | Regole per maltempo e chiusura |
| Dove si trova il bagno, quando è aperto, cosa offre? | Scheda del bagno | Indirizzo, periodo e orari di apertura, servizi, contatti nella prima parte della pagina | Dati dei bagni pilota |
| Posso mettere a disposizione il mio ombrellone quando non ci sono? | Per gli stagionali | Sì, se il tuo bagno aderisce e ti abilita: proponi le date, il gestore le autorizza | Bagni aderenti |
| Quanto ricevo e quando? | Per gli stagionali | La quota prevista dall'accordo con il bagno, visibile nel rendiconto con il suo stato | Percentuali, tempi di liquidazione, trattamento fiscale |
| Posso ritirare una data che ho proposto? | Per gli stagionali, assistenza | Sì finché non è riservata o venduta; dopo, si passa dall'assistenza | — |
| Ombrè è adatto al mio stabilimento? | Per gli stabilimenti | È pensato per stabilimenti con postazioni fisse vendute a giornata intera; fasce orarie e cabine non sono nel primo rilascio | Zona e criteri del pilota |
| Perdo il controllo su prezzi e posti? | Per gli stabilimenti | No: il gestore decide abbonamenti abilitati, postazioni, date, prezzi e limite giornaliero | — |
| Quanto costa per lo stabilimento? | Per gli stabilimenti | I piani e le commissioni in vigore | Piani confermati: A e B sono ipotesi |
| Funziona con il gestionale che uso già? | Per gli stabilimenti | Nel primo rilascio non ci sono integrazioni: si sceglie quale sistema governa le postazioni vendute su Ombrè | — |
| Come si attiva? | Per gli stabilimenti | I passi di adesione, dalla richiesta all'apertura controllata | Tempi reali di attivazione |
| Come funziona l'assistenza? | Assistenza, per gli stabilimenti | Canali, orari e tempi di risposta | Canali e orari dell'assistenza |

Le righe con un dato mancante non si pubblicano con valori di esempio: la sezione resta
fuori dalla pagina finché il dato non è confermato.

## 7. GEO: contenuti che un assistente può capire e attribuire

- **Chi pubblica.** Ogni pagina pubblica dichiara il soggetto (piè di pagina con
  denominazione e contatti, pagina «Chi siamo», `Organization`). Sul sito del bagno il
  soggetto è il bagno; Ombrè compare come «Prenotazioni con Ombrè».
- **Una descrizione sola.** Nome, descrizione breve, dominio e contatti sono scritti in
  un punto unico della configurazione e riusati ovunque (pagine, metadati, dati
  strutturati, email). Descrizione di lavoro, da confermare: «Ombrè è un servizio per
  prenotare online una giornata in uno stabilimento balneare e per permettere agli
  abbonati stagionali di condividere le giornate in cui non usano la postazione, con
  l'autorizzazione del gestore.»
- **Il nome.** Si scrive sempre «Ombrè», con l'accento grave; l'indirizzo si cita nella
  forma scelta come host principale.
- **Pagine con una data.** Guide, condizioni, piani e FAQ mostrano la data dell'ultimo
  aggiornamento reale.
- **Formati estraibili.** Passaggi numerati per le procedure (prenotare, proporre una
  data, aderire), tabelle per confronti e condizioni, definizioni in una frase per i
  termini propri (postazione, giornata condivisa, pass, riserva).
- **Contenuti di approfondimento, solo dove l'informazione c'è.**

  | Contenuto | Si può scrivere? |
  |---|---|
  | Come funziona la condivisione dell'ombrellone stagionale | Sì: regole definite nel progetto |
  | Come prenotare un ombrellone per un giorno | Sì, con schermate reali dopo lo sviluppo |
  | Piano A o Piano B: quale conviene | Solo dopo la conferma dei piani |
  | Guide alle località | Solo con bagni attivi nella località e informazioni verificate |
  | Confronti con altri servizi | No: nessuna informazione verificata |
  | Casi d'uso e risultati dei bagni | Solo dopo il pilota, con dati reali e consenso |

- **Affermazioni da non pubblicare finché non sono confermate** (oggi presenti nei
  documenti interni come ipotesi): i piani a €490 + 5% e €0 + 10%; la ripartizione
  50/40/10; le cifre della simulazione; «portale nazionale» (il pilota è locale);
  conformità WCAG, tempi di risposta e disponibilità del servizio (sono obiettivi, non
  attestazioni); recensioni, numero di bagni o di clienti; integrazioni con gestionali o
  varchi.
- **Crawler degli assistenti AI** (proposta, vedi [decisioni.md D11](decisioni.md)): le
  pagine pubbliche restano leggibili dai crawler dei motori di risposta; un blocco in
  robots.txt le renderebbe non citabili.

## 8. Dati e decisioni che servono dal proprietario

| Serve | Sblocca |
|---|---|
| Disponibilità del marchio «Ombrè» e dominio principale | Host canonico, `Organization`, tutti i title |
| Soggetto che pubblica: denominazione, sede, contatti, partita IVA | Piè di pagina, «Chi siamo», dati strutturati |
| Zona del pilota e bagni aderenti | Pagine di località, schede dei bagni, query di controllo |
| Piani e commissioni confermati | Pagina per gli stabilimenti, `SoftwareApplication` |
| Condizioni di annullamento, maltempo e chiusura | Scheda del bagno, FAQ |
| Percentuali, tempi di liquidazione e inquadramento fiscale delle quote | Pagina per gli stagionali |
| Canali e orari dell'assistenza | Pagina di assistenza |
| Conferma degli indirizzi proposti in §5 | Mappa del sito, reindirizzamenti |
| Scelta sui crawler degli assistenti AI | robots.txt |
| Profili ufficiali esterni (social, schede su mappe) | Coerenza dei riferimenti |

## 9. Verifica alla consegna

Controlli da eseguire su ogni rilascio delle pagine pubbliche.

- Lint, controllo dei tipi, test e build previsti dal repository.
- HTML servito, letto senza eseguire script: presenza di title, descrizione, H1,
  canonical, contenuti essenziali e JSON-LD per ogni tipo di pagina della tabella in §5.
- Validazione automatica dei dati strutturati e corrispondenza con il testo visibile.
- robots.txt, sitemap e codici di stato per pagina attiva, inesistente, offerta scaduta,
  bagno sospeso, host sconosciuto, area riservata senza accesso.
- Controllo automatico di accessibilità più prova manuale da tastiera e con lettore di
  schermo sui percorsi di acquisto.
- Core Web Vitals su mobile contro le soglie di §4; prova visiva a 360 px e su desktop,
  senza scorrimento orizzontale né salti di layout.
- Ricerca di title, descrizioni e H1 duplicati tra le pagine.
- Rilettura dei testi contro l'elenco delle affermazioni non confermate (§7).

**Verificato l'11/11/2026**: contrasti della palette (§3); coerenza di questo documento
con progetto, schede, decisioni e stato. Sulle sei pagine pubbliche oggi esistenti, nelle
due lingue: lint, tipi, test, build, HTML servito, canonical, `hreflang`, dati strutturati,
codici di stato, robots.txt e sitemap (`pnpm smoke`, esiti in [stato.md](stato.md)). Le
pagine che dipendono dai dati (località, schede dei bagni, offerte, «Chi siamo») non
esistono ancora. Restano aperti: Core Web Vitals misurati, prove da tastiera e con lettore
di schermo, controllo automatico di accessibilità.

### Cinque ricerche da riprovare dopo la pubblicazione

Da provare su Google, ChatGPT, Gemini o Perplexity. Indicizzazione, posizionamento e
citazioni sono risultati da osservare, non da dichiarare.

1. «prenotare ombrellone per un giorno a {località del pilota}»
2. «Ombrè come funziona»
3. «posso affittare il mio ombrellone stagionale quando non lo uso»
4. «software prenotazioni online per stabilimenti balneari con sito incluso»
5. «quanto costa Ombrè per uno stabilimento balneare»

| Data | Strumento | Ricerca | Risposta ottenuta | Indirizzi citati | Errori o imprecisioni |
|---|---|---|---|---|---|
| | | | | | |

## 10. Uso dei modelli durante lo sviluppo

Scelte disponibili per i subagenti in Claude Code, verificate nella sessione
dell'11/11/2026: haiku, sonnet, opus e fable (il più capace, attivo nella sessione
principale). Gli identificativi si ricontrollano a ogni sessione.

| Lavoro | Modello |
|---|---|
| Inventario delle rotte, raccolta dei metadati, ricerca di testi duplicati, riepilogo dei test | Il più leggero (haiku) |
| Implementazioni ben definite, revisione dei testi, interventi su componenti esistenti | Intermedio (sonnet) |
| Architettura, diagnosi complesse, modifiche trasversali, revisione finale di inventario, pagamenti e permessi | Il più capace, nella sessione principale |

Ogni subagente ha una responsabilità distinta; le sue conclusioni si verificano prima di
modificare il codice. In questa stesura non è stata delegata alcuna attività: il lavoro
era di sola documentazione.
