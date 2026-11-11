export function makeIt(brand: string) {
  return {
    meta: {
      siteDescription: `${brand} è un servizio per prenotare online una giornata in uno stabilimento balneare e per permettere agli abbonati stagionali di condividere le giornate in cui non usano la postazione, con l'autorizzazione del gestore.`,
    },
    nav: {
      label: 'Navigazione principale',
      skip: 'Salta al contenuto',
      home: 'Pagina iniziale',
      explore: 'Esplora',
      howItWorks: 'Come funziona',
      forBeachClubs: 'Per gli stabilimenti',
      forSeasonHolders: 'Per gli stagionali',
      help: 'Assistenza',
      languageLabel: 'Lingua',
      switchLanguage: 'English',
      breadcrumb: 'Percorso',
    },
    notice: {
      preLaunch: 'Servizio in preparazione: le prenotazioni non sono ancora attive.',
    },
    footer: {
      tagline: 'Il tuo posto al sole.',
      status: `${brand} è un progetto in sviluppo. Nomi e contenuti possono cambiare prima dell'avvio.`,
      pagesTitle: 'Pagine',
    },
    contact: {
      title: 'Contatti',
      withEmail: 'Per informazioni scrivi a',
      missing: "I contatti saranno pubblicati qui all'avvio della fase pilota.",
    },
    pages: {
      home: {
        title: `${brand}: prenota un ombrellone per un giorno`,
        description: `Con ${brand} prenoti online una giornata in uno stabilimento balneare: postazione precisa, prezzo finale prima di pagare, pass da mostrare all'arrivo.`,
        h1: 'Il tuo posto al sole, anche per un giorno solo',
        lead: `Con ${brand} prenoti online una giornata in uno stabilimento balneare. Scegli la postazione, vedi il prezzo finale prima di pagare e ricevi un pass da mostrare all'arrivo.`,
        ctaExplore: 'Trova uno stabilimento',
        ctaHowItWorks: 'Scopri come funziona',
        ctaBeachClubs: 'Per gli stabilimenti',
        stepsTitle: 'Tre passi, dal telefono',
        steps: [
          {
            title: 'Scegli la postazione',
            text: 'Cerchi per località, giorno e numero di ospiti. Ogni postazione mostra la sua dotazione, per esempio un ombrellone e due lettini.',
          },
          {
            title: 'Controlla il riepilogo',
            text: 'Prezzo finale, eventuale sconto e condizioni di annullamento sono scritti prima del pagamento.',
          },
          {
            title: 'Entra con il pass',
            text: 'Alla conferma ricevi un pass con codice QR e codice breve. Lo mostri alla reception.',
          },
        ],
        ideaTitle: 'Da dove arrivano le giornate disponibili',
        ideaText: `Molte postazioni restano vuote nei giorni in cui chi ha l'abbonamento stagionale non va al mare. Con ${brand} lo stagionale propone quelle giornate, il gestore le autorizza e un ospite le prenota.`,
        audiencesTitle: 'Per chi è',
        audiences: [
          {
            title: 'Ospiti',
            text: 'Una giornata al mare con il posto riservato e il prezzo chiaro prima di pagare.',
            link: 'Come si prenota',
          },
          {
            title: 'Stagionali',
            text: 'Hai un abbonamento? Puoi proporre le giornate in cui non usi la postazione, se il tuo stabilimento aderisce.',
            link: 'Come si condivide',
          },
          {
            title: 'Stabilimenti',
            text: 'Sito, prenotazioni dirette e reception sullo stesso inventario. Prezzi, posti e regole li decide il gestore.',
            link: 'Cosa comprende',
          },
        ],
      },
      explore: {
        title: `Stabilimenti con ombrelloni giornalieri | ${brand}`,
        description: `Gli stabilimenti balneari che accettano prenotazioni giornaliere con ${brand}, con disponibilità e prezzo per la data scelta.`,
        h1: 'Trova uno stabilimento',
        lead: 'Qui compaiono gli stabilimenti che accettano prenotazioni giornaliere, con disponibilità e prezzo per la data scelta.',
        emptyTitle: 'Nessuno stabilimento attivo, per ora',
        emptyText: 'Il servizio è in preparazione e partirà da una zona pilota. Gli stabilimenti compariranno qui quando le prenotazioni saranno attive.',
        emptyLink: 'Nel frattempo, guarda come funziona',
      },
      howItWorks: {
        title: `Come funziona ${brand}: dalla ricerca al pass`,
        description: `Come si prenota una giornata al mare con ${brand}: ricerca, scelta della postazione, riepilogo con prezzo finale, pagamento e pass per l'ingresso.`,
        h1: `Come funziona ${brand}`,
        lead: 'Prenoti una giornata intera su una postazione precisa di uno stabilimento. Il prezzo che leggi nel riepilogo è quello che paghi.',
        stepsTitle: 'Dalla ricerca al pass',
        steps: [
          {
            title: 'Cerca',
            text: 'Indichi località, giorno e numero di ospiti. Per cercare non serve registrarsi.',
          },
          {
            title: 'Scegli la postazione',
            text: 'Sulla planimetria o in elenco vedi le postazioni libere, con fila, numero e dotazione.',
          },
          {
            title: 'Leggi il riepilogo',
            text: 'Trovi il prezzo finale, gli sconti applicati e le condizioni di annullamento con data e ora limite.',
          },
          {
            title: 'Paga',
            text: 'Mentre completi il pagamento la postazione resta riservata per un tempo limitato, indicato a schermo.',
          },
          {
            title: 'Mostra il pass',
            text: 'Alla conferma ricevi il pass. Alla reception mostri il codice QR oppure il codice breve.',
          },
        ],
        termsTitle: 'Le parole che usiamo',
        terms: [
          {
            term: 'Postazione',
            text: 'Un posto preciso in spiaggia, identificato da fila e numero, con la dotazione dichiarata.',
          },
          {
            term: 'Giornata condivisa',
            text: 'Una giornata su una postazione in abbonamento, proposta dallo stagionale e autorizzata dal gestore.',
          },
          {
            term: 'Riserva',
            text: 'Il blocco temporaneo della postazione mentre completi il pagamento. Non è una conferma.',
          },
          {
            term: 'Pass',
            text: 'La credenziale della prenotazione confermata: un codice QR e un codice breve.',
          },
        ],
        notesTitle: 'Da sapere prima di prenotare',
        notes: [
          'Si prenotano giornate intere. Fasce orarie e cabine non fanno parte del primo rilascio.',
          'Le condizioni di annullamento le stabilisce lo stabilimento. Valgono quelle salvate nella tua prenotazione.',
          'Se compare «Pagamento in verifica» non serve pagare di nuovo: l\'esito viene controllato e la prenotazione aggiornata.',
        ],
      },
      forBeachClubs: {
        title: `${brand} per gli stabilimenti balneari: sito e prenotazioni`,
        description: `${brand} per gli stabilimenti balneari: sito, prenotazione diretta, condivisione delle postazioni stagionali e reception sullo stesso inventario.`,
        h1: 'Il sito e le prenotazioni del tuo stabilimento',
        lead: `${brand} è pensato per gli stabilimenti con postazioni fisse vendute a giornata intera. Sito, prenotazione diretta e reception lavorano sullo stesso inventario.`,
        controlTitle: 'Resti tu a decidere',
        controlText: 'Scegli quali abbonamenti abilitare alla condivisione, quante postazioni pubblicare, in quali date e a quale prezzo. Puoi fissare un numero massimo di giornate condivise al giorno e sospendere le vendite senza toccare le prenotazioni già confermate.',
        includesTitle: 'Cosa comprende il primo rilascio',
        includes: [
          'Il sito dello stabilimento, con tre modelli grafici e pubblicazione controllata.',
          'La prenotazione diretta dal tuo sito e dal portale.',
          'La condivisione delle giornate degli stagionali, sempre con la tua autorizzazione.',
          'La reception: inserimento al banco e verifica dei pass sullo stesso inventario del sito.',
          'Promozioni con codice, periodo e limite di utilizzi.',
          'Il rendiconto delle vendite e delle quote.',
        ],
        limitsTitle: 'Cosa non comprende, per ora',
        limits: [
          `Integrazioni con altri gestionali. Se ne usi già uno, prima dell'attivazione si decide quale sistema governa le postazioni vendute con ${brand}.`,
          'Fasce orarie, cabine e risorse composte.',
          'Varchi automatici e pass nei portafogli digitali.',
        ],
        activationTitle: 'Come si attiva',
        activation: [
          'Richiesta di adesione.',
          'Verifica dei dati e degli accordi.',
          'Configurazione di postazioni e planimetria.',
          'Importazione degli abbonamenti stagionali.',
          'Prezzi e condizioni.',
          'Configurazione del sito.',
          'Prova completa di acquisto e annullamento.',
          'Formazione della reception.',
          'Apertura controllata.',
        ],
        pricingTitle: 'Costi',
        pricingText: 'Piani e commissioni saranno pubblicati qui al termine della fase pilota.',
      },
      forSeasonHolders: {
        title: `Condividere l'ombrellone stagionale con ${brand}`,
        description: `Hai un abbonamento stagionale? Con ${brand} proponi le giornate in cui non usi la postazione: il gestore le autorizza e un ospite le prenota.`,
        h1: 'Condividi le giornate in cui non ci sei',
        lead: `Se hai un abbonamento stagionale e il tuo stabilimento aderisce a ${brand}, puoi proporre le giornate in cui non usi la postazione. Il gestore le autorizza e un ospite può prenotarle.`,
        stepsTitle: 'Come si condivide',
        steps: [
          {
            title: "Chiedi l'accesso",
            text: 'Entri su invito del tuo stabilimento oppure con una richiesta. Il gestore verifica contratto, periodo e postazione.',
          },
          {
            title: 'Proponi le date',
            text: 'Giornate singole o ricorrenze, per esempio tutti i martedì. Prima di salvare vedi il riepilogo delle date.',
          },
          {
            title: 'Il gestore autorizza',
            text: 'Una volta per tutto l\'abbonamento oppure giornata per giornata, secondo le regole dello stabilimento.',
          },
          {
            title: 'Segui il rendiconto',
            text: 'Ogni giornata venduta compare nel tuo rendiconto con lo stato della quota.',
          },
        ],
        rulesTitle: 'Le regole in breve',
        rules: [
          "Puoi ritirare una data finché non è riservata o venduta. Dopo, ti rivolgi all'assistenza.",
          'La quota è quella prevista dall\'accordo con il tuo stabilimento. Percentuali e tempi di pagamento ti vengono indicati prima dell\'adesione.',
          "Non vedi i dati personali dell'ospite: solo quanto serve al rendiconto.",
        ],
      },
      help: {
        title: `Assistenza e domande frequenti | ${brand}`,
        description: `Risposte alle domande più frequenti su ${brand}: prenotazione di una giornata, prezzo finale, annullamento, pass e ingresso in spiaggia.`,
        h1: 'Assistenza',
        lead: 'Le risposte alle domande che riceviamo più spesso.',
        faqTitle: 'Domande frequenti',
        faq: [
          {
            q: 'Posso prenotare un ombrellone per un solo giorno?',
            a: 'Sì. Si prenota una giornata intera su una postazione precisa, con la dotazione indicata nella scheda.',
          },
          {
            q: 'Quando vedo il prezzo finale?',
            a: 'Nel riepilogo, prima del pagamento, con gli eventuali sconti già applicati. Il prezzo lo stabilisce lo stabilimento.',
          },
          {
            q: 'Posso annullare una prenotazione?',
            a: 'Dipende dalle condizioni dello stabilimento, che leggi nel riepilogo con data e ora limite. Valgono quelle salvate nella tua prenotazione.',
          },
          {
            q: 'Come entro in spiaggia?',
            a: 'Con il pass ricevuto alla conferma: alla reception mostri il codice QR oppure il codice breve.',
          },
          {
            q: 'Ho pagato ma non vedo la conferma. Cosa faccio?',
            a: 'Se compare «Pagamento in verifica» non pagare di nuovo: l\'esito viene controllato e la prenotazione aggiornata.',
          },
          {
            q: 'Dove è attivo il servizio?',
            a: 'Il servizio è in preparazione e partirà da una zona pilota. Gli stabilimenti attivi compariranno nella pagina Esplora.',
          },
        ],
      },
    },
  };
}

export type Dictionary = ReturnType<typeof makeIt>;
