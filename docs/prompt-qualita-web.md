# Prompt di qualità web

Prompt fornito dal committente l'11/11/2026, conservato così com'è. La sua applicazione
al progetto è in [qualita-web.md](qualita-web.md). Quando esisteranno le pagine di Ombrè
si copia in Claude Code dalla cartella del progetto: è pensato per migliorare un sito
esistente e funziona anche su un progetto nuovo, se gli si dà un brief.

---

Agisci come un team senior di sviluppo web con competenze in UX/UI, accessibilità, performance, SEO tecnica, AEO e GEO. Analizza il progetto aperto in Claude Code e applica direttamente al codice i miglioramenti che puoi verificare.

OBIETTIVO

Rendi il sito più chiaro, coerente e veloce, con un'interfaccia ispirata ai principi di design e interazione dei prodotti Apple. Migliora la reperibilità delle pagine pubbliche su Google e la possibilità che motori di risposta e assistenti AI comprendano, estraggano e citino le informazioni pubblicate.

1. ANALIZZA IL PROGETTO E SCEGLI LE PRIORITÀ

Leggi le istruzioni del repository e individua stack, struttura, rotte pubbliche, aree riservate, componenti condivisi, design system, contenuti e comandi di verifica disponibili.

Ricava dal progetto o dal brief chi è il pubblico, cosa cerca e quale azione dovrebbe poter completare. Su un SaaS, controlla prima homepage, pagine funzionalità, prezzi, demo e percorsi di registrazione, quando presenti. Su un sito locale, controlla prima offerta, sede, orari, contatti e prenotazione.

Individua i problemi con maggiore impatto e ordinali per gravità, beneficio atteso e sforzo. Scrivi un piano breve e procedi con le modifiche. Rispetta le convenzioni del progetto, preserva le modifiche locali già presenti e riusa i componenti esistenti. Se parti da zero, imposta la struttura minima coerente con il brief.

2. USA IL MODELLO ADATTO AL COMPITO

Verifica quali modelli e capacità di delega sono realmente disponibili nella sessione e nella configurazione di Claude Code. Usa i nomi e gli identificativi effettivamente supportati.

- Affida al modello più leggero disponibile attività circoscritte come inventario delle rotte, raccolta dei metadati, verifica di testi duplicati e riepilogo dei risultati dei test.
- Usa un modello intermedio, se disponibile, per implementazioni ben definite, revisione del copy e interventi su componenti esistenti.
- Riserva il modello più capace per architettura, diagnosi complesse, modifiche trasversali e revisione finale delle aree critiche.

Se puoi scegliere il modello solo per i subagenti, applica la selezione a quelli e usa la sessione principale per le decisioni e l'integrazione. Se la scelta non è disponibile, prosegui con il modello attivo. Limita le letture ripetute, assegna responsabilità distinte e verifica le conclusioni delegate prima di modificare il codice.

3. MIGLIORA DESIGN, INTERAZIONI E ACCESSIBILITÀ

Se nel progetto è già installata una skill chiamata `/apple-design`, leggine le istruzioni e applica quelle pertinenti. Altrimenti usa questi criteri direttamente.

- Rendi immediatamente leggibili proposta di valore, azione principale e navigazione. Ogni sezione deve rispondere a una domanda o aiutare a completare un'azione.
- Uniforma tipografia, spaziature, griglie, colori, bordi e stati interattivi attraverso il design system. Mantieni riconoscibile l'identità del progetto.
- Usa le animazioni per mostrare relazioni o cambi di stato, ad esempio apertura di un pannello, cambio di selezione o conferma di un'azione. Riusa le soluzioni già adottate nel progetto e rispetta `prefers-reduced-motion`.
- Controlla contrasto, navigazione da tastiera, focus visibile, etichette dei campi, messaggi di errore e usabilità touch.
- Verifica le pagine su mobile e desktop. Correggi overflow, salti di layout, immagini troppo pesanti e blocchi che rallentano il caricamento.

4. SISTEMA LA SEO TECNICA DELLE PAGINE PUBBLICHE

- Controlla status HTTP, redirect, canonical, robots.txt, sitemap e direttive di indicizzazione. Applica canonical e metadati coerenti con il dominio e con il contenuto reale.
- Dai a ogni pagina strategica un title, una descrizione e un H1 specifici. Usa heading semantici e link interni che aiutino a capire come sono collegate le pagine.
- Verifica che i contenuti essenziali siano presenti nell'HTML servito o prerenderizzato, quando lo stack lo permette. Mantieni fuori dalla sitemap e dall'indicizzazione le aree riservate, che devono essere protette dall'autenticazione.
- Aggiungi o correggi i dati strutturati JSON-LD dove pertinenti, ad esempio Organization, LocalBusiness, SoftwareApplication, Article o BreadcrumbList. I dati devono corrispondere al contenuto visibile.
- Per siti multilingua, verifica URL, canonical e hreflang per ogni lingua effettivamente disponibile.

5. APPLICA AEO E GEO AI CONTENUTI

AEO — Parti dalle domande che un cliente farebbe prima di scegliere.
Per ciascuna pagina prioritaria, associa le domande alla sezione più utile e scrivi una risposta diretta nelle prime frasi. Aggiungi condizioni, limiti ed esempi verificabili quando servono. Usa FAQ solo se aiutano il lettore e coprono domande ancora aperte.

Per un gestionale, chiarisci ad esempio a chi si rivolge, come si attiva, cosa include, quali integrazioni sono effettivamente disponibili e come funziona l'assistenza. Per un'attività locale, rendi facili da trovare indirizzo, orari, servizi, prezzi pubblicati e modalità di prenotazione.

GEO — Crea contenuti che un assistente possa interpretare e attribuire correttamente.
- Rendi chiaro chi pubblica la pagina, quale prodotto o attività descrive e a quale pubblico si rivolge.
- Sviluppa guide, confronti, procedure e casi d'uso solo dove esistono informazioni sufficienti. Usa tabelle, passaggi numerati, fonti primarie e date di aggiornamento quando aiutano il lettore a verificare i fatti.
- Mantieni coerenti nome, descrizione, dominio, contatti e riferimenti ufficiali nelle pagine del sito. Indica nel report eventuali incoerenze sui canali esterni se emergono durante la verifica.
- Controlla prezzi, claim, recensioni, risultati, certificazioni e integrazioni rispetto al codice, alla documentazione o ai materiali forniti. Segnala i dati mancanti nel report e pubblica solo quelli confermati.
- Valuta quali pagine rispondono meglio a ricerche come «come funziona [prodotto]», «[prodotto] è adatto a [tipo di cliente]?», «quanto costa [servizio]?» e «come risolvere [problema del cliente]?». Usa espressioni naturali e specifiche del settore.

6. VERIFICA LE MODIFICHE E CONSEGNA

Esegui build, lint, typecheck e test previsti dal repository. Se puoi usare un browser, verifica le pagine principali su mobile e desktop, prova le azioni essenziali e controlla il contenuto HTML, i metadati e i dati strutturati. Rileggi il diff per individuare regressioni, modifiche estranee e testi che promettono più di quanto il progetto offra.

Chiudi con un riepilogo operativo che contenga:

- Pagine e file modificati e problema risolto per ciascun intervento.
- Controlli eseguiti, risultati e verifiche rimaste aperte.
- Una tabella con domanda del cliente, pagina che risponde e informazione resa più chiara.
- Cinque query realistiche da riprovare su Google, ChatGPT, Gemini o Perplexity dopo la pubblicazione, annotando data, risposta, URL citati ed eventuali errori.
- Dati o decisioni che servono al proprietario del sito per completare il lavoro.

Lavora sul repository e lascia le modifiche pronte da revisionare. Considera indicizzazione, posizionamento e citazioni AI come risultati da osservare dopo la pubblicazione. Riporta come verificati soltanto gli esiti effettivamente osservati.
