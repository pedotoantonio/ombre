import type { Dictionary } from './it';

export function makeEn(brand: string): Dictionary {
  return {
    meta: {
      siteDescription: `${brand} is a service for booking a day at a beach club online, and for letting season pass holders share the days they do not use their spot, with the manager's approval.`,
    },
    nav: {
      label: 'Main navigation',
      skip: 'Skip to content',
      home: 'Home page',
      explore: 'Explore',
      howItWorks: 'How it works',
      forBeachClubs: 'For beach clubs',
      forSeasonHolders: 'For season holders',
      help: 'Help',
      languageLabel: 'Language',
      switchLanguage: 'Italiano',
      breadcrumb: 'Breadcrumb',
    },
    notice: {
      preLaunch: 'Service in preparation: bookings are not open yet.',
    },
    footer: {
      tagline: 'Your place in the sun.',
      status: `${brand} is a project in development. Names and content may change before launch.`,
      pagesTitle: 'Pages',
    },
    contact: {
      title: 'Contact',
      withEmail: 'For information write to',
      missing: 'Contact details will be published here when the pilot phase starts.',
    },
    pages: {
      home: {
        title: `${brand}: book a beach umbrella for a day`,
        description: `With ${brand} you book a day at an Italian beach club online: a specific spot, the final price before you pay, a pass to show on arrival.`,
        h1: 'Your place in the sun, even for a single day',
        lead: `With ${brand} you book a day at a beach club online. Pick your spot, see the final price before you pay and get a pass to show on arrival.`,
        ctaExplore: 'Find a beach club',
        ctaHowItWorks: 'See how it works',
        ctaBeachClubs: 'For beach clubs',
        stepsTitle: 'Three steps, from your phone',
        steps: [
          {
            title: 'Pick your spot',
            text: 'Search by place, day and number of guests. Each spot shows what it includes, for example one umbrella and two sunbeds.',
          },
          {
            title: 'Check the summary',
            text: 'Final price, any discount and the cancellation terms are stated before you pay.',
          },
          {
            title: 'Walk in with your pass',
            text: 'On confirmation you get a pass with a QR code and a short code. Show it at the front desk.',
          },
        ],
        ideaTitle: 'Where the available days come from',
        ideaText: `Many spots stay empty on the days their season pass holders do not go to the beach. With ${brand} the season holder offers those days, the manager approves them and a guest books them.`,
        audiencesTitle: 'Who it is for',
        audiences: [
          {
            title: 'Guests',
            text: 'A day at the beach with a reserved spot and a clear price before you pay.',
            link: 'How booking works',
          },
          {
            title: 'Season holders',
            text: 'Have a season pass? You can offer the days you do not use your spot, if your beach club takes part.',
            link: 'How sharing works',
          },
          {
            title: 'Beach clubs',
            text: 'Website, direct bookings and front desk on the same inventory. The manager decides prices, spots and rules.',
            link: 'What is included',
          },
        ],
      },
      explore: {
        title: `Beach clubs with day umbrellas | ${brand}`,
        description: `Beach clubs that accept day bookings with ${brand}, with availability and price for the date you choose.`,
        h1: 'Find a beach club',
        lead: 'Beach clubs that accept day bookings appear here, with availability and price for the date you choose.',
        emptyTitle: 'No active beach clubs yet',
        emptyText: 'The service is in preparation and will start from a pilot area. Beach clubs will appear here once bookings are open.',
        emptyLink: 'In the meantime, see how it works',
      },
      howItWorks: {
        title: `How ${brand} works: from search to pass`,
        description: `How to book a day at the beach with ${brand}: search, choice of spot, summary with the final price, payment and entry pass.`,
        h1: `How ${brand} works`,
        lead: 'You book a full day on a specific spot at a beach club. The price you read in the summary is the price you pay.',
        stepsTitle: 'From search to pass',
        steps: [
          {
            title: 'Search',
            text: 'Enter the place, the day and the number of guests. You do not need an account to search.',
          },
          {
            title: 'Pick your spot',
            text: 'On the beach map or in the list you see the free spots, with row, number and what they include.',
          },
          {
            title: 'Read the summary',
            text: 'You find the final price, the discounts applied and the cancellation terms with a deadline date and time.',
          },
          {
            title: 'Pay',
            text: 'While you complete the payment the spot stays held for a limited time, shown on screen.',
          },
          {
            title: 'Show your pass',
            text: 'On confirmation you receive the pass. At the front desk you show the QR code or the short code.',
          },
        ],
        termsTitle: 'The words we use',
        terms: [
          {
            term: 'Spot',
            text: 'A specific place on the beach, identified by row and number, with a stated set of equipment.',
          },
          {
            term: 'Shared day',
            text: 'A day on a season pass spot, offered by the season holder and approved by the manager.',
          },
          {
            term: 'Hold',
            text: 'The temporary lock on the spot while you complete the payment. It is not a confirmation.',
          },
          {
            term: 'Pass',
            text: 'The credential of a confirmed booking: a QR code and a short code.',
          },
        ],
        notesTitle: 'Good to know before you book',
        notes: [
          'You book full days. Time slots and cabins are not part of the first release.',
          'Cancellation terms are set by the beach club. The ones saved in your booking apply.',
          'If you see “Payment under review” you do not need to pay again: the outcome is checked and your booking updated.',
        ],
      },
      forBeachClubs: {
        title: `${brand} for beach clubs: website and bookings`,
        description: `${brand} for beach clubs: website, direct booking, sharing of season pass spots and front desk on the same inventory.`,
        h1: 'The website and bookings of your beach club',
        lead: `${brand} is designed for beach clubs with fixed spots sold by the full day. Website, direct booking and front desk work on the same inventory.`,
        controlTitle: 'You stay in control',
        controlText: 'You choose which season passes can be shared, how many spots to publish, on which dates and at what price. You can set a daily cap on shared days and pause sales without touching confirmed bookings.',
        includesTitle: 'What the first release includes',
        includes: [
          'The beach club website, with three design templates and controlled publishing.',
          'Direct booking from your website and from the portal.',
          'Sharing of season holders’ days, always with your approval.',
          'Front desk: walk-in bookings and pass checks on the same inventory as the website.',
          'Promotions with a code, a period and a usage cap.',
          'Reports on sales and shares.',
        ],
        limitsTitle: 'What it does not include yet',
        limits: [
          `Integrations with other management systems. If you already use one, before activation we agree which system governs the spots sold with ${brand}.`,
          'Time slots, cabins and combined resources.',
          'Automatic gates and passes in digital wallets.',
        ],
        activationTitle: 'How activation works',
        activation: [
          'Request to join.',
          'Check of details and agreements.',
          'Setup of spots and beach map.',
          'Import of season passes.',
          'Prices and terms.',
          'Website setup.',
          'Full test of purchase and cancellation.',
          'Front desk training.',
          'Controlled opening.',
        ],
        pricingTitle: 'Costs',
        pricingText: 'Plans and fees will be published here at the end of the pilot phase.',
      },
      forSeasonHolders: {
        title: `Sharing your season umbrella with ${brand}`,
        description: `Have a season pass? With ${brand} you offer the days you do not use your spot: the manager approves them and a guest books them.`,
        h1: 'Share the days you are away',
        lead: `If you have a season pass and your beach club takes part in ${brand}, you can offer the days you do not use your spot. The manager approves them and a guest can book them.`,
        stepsTitle: 'How sharing works',
        steps: [
          {
            title: 'Ask for access',
            text: 'You join by invitation from your beach club or by sending a request. The manager checks contract, period and spot.',
          },
          {
            title: 'Offer your dates',
            text: 'Single days or recurring ones, for example every Tuesday. Before saving you see a summary of the dates.',
          },
          {
            title: 'The manager approves',
            text: 'Once for the whole season pass or day by day, according to the rules of the beach club.',
          },
          {
            title: 'Follow your statement',
            text: 'Every day sold appears in your statement with the status of your share.',
          },
        ],
        rulesTitle: 'The rules in short',
        rules: [
          'You can withdraw a date until it is held or sold. After that, contact support.',
          'Your share is the one set in the agreement with your beach club. Percentages and payment times are stated before you join.',
          'You do not see the guest’s personal data: only what the statement needs.',
        ],
      },
      help: {
        title: `Help and frequently asked questions | ${brand}`,
        description: `Answers to the most common questions about ${brand}: booking a day, final price, cancellation, pass and beach entry.`,
        h1: 'Help',
        lead: 'Answers to the questions we receive most often.',
        faqTitle: 'Frequently asked questions',
        faq: [
          {
            q: 'Can I book a beach umbrella for a single day?',
            a: 'Yes. You book a full day on a specific spot, with the equipment listed on its page.',
          },
          {
            q: 'When do I see the final price?',
            a: 'In the summary, before you pay, with any discounts already applied. The price is set by the beach club.',
          },
          {
            q: 'Can I cancel a booking?',
            a: 'It depends on the terms of the beach club, which you read in the summary with a deadline date and time. The ones saved in your booking apply.',
          },
          {
            q: 'How do I get onto the beach?',
            a: 'With the pass you receive on confirmation: at the front desk you show the QR code or the short code.',
          },
          {
            q: 'I paid but I do not see the confirmation. What should I do?',
            a: 'If you see “Payment under review” do not pay again: the outcome is checked and your booking updated.',
          },
          {
            q: 'Where is the service available?',
            a: 'The service is in preparation and will start from a pilot area. Active beach clubs will appear on the Explore page.',
          },
        ],
      },
    },
  };
}
