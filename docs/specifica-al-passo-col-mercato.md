# Specifica: al passo con il mercato — filtri, zone, recensioni, acconto e fiducia

Iterazione del 19/11/2026 dal prompt del committente
([prompt-al-passo-col-mercato.md](prompt-al-passo-col-mercato.md)), nato
dalla perizia comparativa sui concorrenti (Spiagge.it/Zucchetti, MySunbed).
Sei funzioni, decisioni D49–D54. Nessuna funzione esistente cambia:
prenotazione rapida, carrello, conto, Google di prova, pass, reception,
Stagionale e registro economico restano validi e i collaudi esistenti
restano verdi.

## 1. Servizi dello stabilimento e filtri in ricerca (D49)

- **Catalogo fisso e traducibile** in `packages/shared` (`amenities`):
  dodici voci con identificatori stabili — `bar` (bar e chiosco),
  `restaurant` (ristorante), `parking` (parcheggio), `hot_showers`
  (docce calde), `playground` (area giochi), `accessible` (accesso
  disabili), `pets` (animali ammessi), `wifi` (Wi-Fi), `lifeguard`
  (salvataggio), `cabins` (cabine), `sunset_bar` (aperitivo al tramonto),
  `card_payments` (pagamenti con carta). Le etichette vivono nei dizionari
  it/en (`amenities`), mai nel database.
- **Modello** (migrazione 021): tabella `beach_amenity (beach_id, amenity)`
  con chiave primaria doppia e `CHECK` sull'elenco fisso; GRANT e RLS come
  per la tabella `beach` (lettura pubblica degli stabilimenti attivi,
  scrittura del Gestore nel contesto dello stabilimento).
- **Gestionale**: nel pannello impostazioni della pagina di gestione, un
  modulo a caselle con le dodici voci → azione `gestione-servizi` →
  `PUT /v1/manage/beaches/{slug}/amenities` (sostituisce l'insieme).
- **Ricerca ombrellone**: caselle sotto il modulo (stesso nome `srv`,
  valori ripetuti: funziona senza JavaScript); l'API `GET /v1/beaches`
  accetta `amenities=bar,wifi` e tiene solo gli stabilimenti che li hanno
  **tutti**. Le carte dei risultati mostrano i servizi come **distintivi**
  sintetici (al più quattro, poi «+n»); la scheda del lido li elenca per
  esteso con icone sobrie (SVG in linea, niente librerie), stesso lessico
  nelle due lingue.
- I `services` liberi del sito pubblicato restano un testo del Gestore e
  non c'entrano col catalogo (lo dice la pagina del sito).

## 2. Zone con nome nella planimetria (D50)

- **Modello** (migrazione 021): tabella `beach_zone (id, beach_id, name)`
  — nome libero di 2–40 caratteri, unico per stabilimento, al più 20 zone —
  e colonna `spot.named_zone_id` annullabile. Il nome è un **nome proprio**
  scritto dal Gestore (come i codici delle postazioni): compare identico
  nelle due lingue; la fascia fisica (`riva|ombrelloni|monte`) resta un
  concetto distinto e invariato.
- **Gestionale** (pagina planimetria): pannello delle zone con creazione,
  rinomina ed eliminazione (`zona-crea`, `zona-rinomina`, `zona-elimina`;
  l'eliminazione stacca le postazioni); l'assegnazione passa dal modulo di
  modifica della postazione (tendina) e da un gesto per fila intera
  (`zona-fila`), come oggi l'affitto per fila. Rotte di gestione sotto
  `/v1/manage/beaches/{slug}/zones`.
- **Dove compare il nome** (sempre le stesse parole): planimetria pubblica
  (etichetta nella carta della postazione e nella barra di selezione),
  avviso e distintivo della **postazione proposta** nella scheda del lido
  (la proposta vive lì: le carte dei risultati di ricerca non propongono
  postazioni, e costruire la proposta per ogni carta è fuori misura —
  interpretazione scritta), riepilogo di prenotazione, carrello, riepilogo
  d'ordine, pass, «Le mie prenotazioni», verifica all'ingresso, tabella e
  scheda postazione della reception. In pratica: ovunque l'API dia
  `spotCode` arriva anche `zoneName` (annullabile).

## 3. Recensioni verificate degli Ospiti (D51)

- **Modello** (migrazione 022): tabella `review` — `id`, `beach_id`,
  `booking_group_id` **unico** (una recensione per soggiorno), `user_id`,
  `rating` 1–5, `body` facoltativo fino a 600 caratteri, `status`
  `published|flagged`, `flag_reason`, `flagged_at`, `reply` (replica del
  Gestore, fino a 600), `replied_at`, `created_at`. RLS: lettura pubblica
  sugli stabilimenti attivi; scrive solo il proprietario del gruppo (via
  `app.user_id`); segnala e replica il Gestore nel contesto dello
  stabilimento.
- **Chi può recensire**: solo l'Ospite col conto, per un proprio gruppo
  `completed` (confermato e con l'ultima giornata passata nel fuso dello
  stabilimento), non annullato. `POST /v1/account/bookings/{groupId}/review`
  {rating, body}. La recensione non si modifica né si elimina (rimandato).
  Il nome mostrato è il nome del conto, mai l'email.
- **Pubblico**: `GET /v1/beaches/{slug}/reviews` (le più recenti prima,
  al più 50) per l'elenco sulla scheda; media e numero entrano nelle
  risposte di `GET /v1/beaches` e della scheda, e compaiono sulle carte
  dei risultati e in testa alla scheda («4,6 · 12 recensioni»).
- **Moderazione**: sottopagina di gestione `recensioni`/`reviews`
  (permesso nuovo `reviews.moderate`, solo Gestore): elenco, segnalazione
  alla piattaforma con motivo scritto (3–200 caratteri) e replica. La
  recensione segnalata **resta visibile**, con la replica del Gestore ed
  eventuale nota «segnalata»; la decisione della piattaforma è rimandata
  con la console di piattaforma (scritto). Rotte
  `GET /v1/manage/beaches/{slug}/reviews`, `POST …/reviews/{id}/flag`,
  `POST …/reviews/{id}/reply`.
- Niente recensioni comprate o importate: solo soggiorni veri (vincolo di
  chiave sul gruppo), niente Google (rimandato, dipendenza esterna).

## 4. Caparra: «caparra adesso, saldo al lido» (D52)

- **Impostazione per stabilimento** (migrazione 022): colonne
  `beach.payment_mode` (`full|deposit`, predefinito `full`) e
  `beach.deposit_percent` (intero 10–90, predefinito 30, sensato solo con
  `deposit`); GRANT UPDATE sulle colonne. Nel pannello impostazioni del
  gestionale: azione `gestione-pagamenti` →
  `PUT /v1/manage/beaches/{slug}/payment-settings`.
- **Semantica**: con la caparra, il pagamento online alla conferma (rapida
  o d'ordine) vale **l'acconto** = arrotondamento alla moneta di
  `totale × percentuale / 100`, calcolato **per gruppo** (l'ordine somma
  gli acconti delle voci, così i conti per voce tornano sempre). All'esito
  positivo la conferma è piena come oggi: `recordSale` col **totale
  intero** (la via «da incassare» del banco già funziona così), pass
  emesso, stato del pagamento `partial`, **saldo = residuo** già calcolato
  da `paidCentsOfGroup`. La reception incassa il saldo con l'incasso al
  banco che esiste già (`banco-incassa`); il registro economico quadra
  perché le ripartizioni restano sul totale (invariante di oggi: somma
  delle `allocation` = totale della prenotazione).
- **Dove si vede**: riepilogo di prenotazione e carrello («Caparra adesso
  X · Saldo al lido Y», col totale), pagina di pagamento, riepilogo
  d'ordine, email di conferma, «Le mie prenotazioni», tabella e scheda
  della reception (già mostrano incassato e residuo). L'**email di
  conferma** smette di dire «Totale pagato» quando non è vero: mostra
  totale, pagato adesso e da saldare all'arrivo (vale anche per il banco
  «da incassare» di oggi, che mentiva — correzione scritta).
- Richieste di pagamento, extra e rimborsi non cambiano: lavorano già sul
  residuo. Tutto sul fornitore di prova.

## 5. Condizioni e termine di annullamento (D53)

- **Impostazione per stabilimento** (migrazione 022): colonne
  `beach.cancel_deadline_hours` (intero 0–336, predefinito di piattaforma
  **48**) e `beach.cancel_policy_it` / `beach.cancel_policy_en`
  (testi facoltativi fino a 600 caratteri; vuoti ⇒ vale il testo
  predefinito di piattaforma nei dizionari). Pannello impostazioni →
  azione `gestione-condizioni` →
  `PUT /v1/manage/beaches/{slug}/cancellation-policy`.
  **I testi e le percentuali definitivi li deciderà il committente**: i
  predefiniti di piattaforma sono segnaposto onesti, scritti qui.
- **Il termine** si misura all'indietro dalla **mezzanotte del giorno
  d'arrivo** nel fuso dello stabilimento (l'ora d'arrivo non è un dato del
  modello). Predefinito: «annullamento gratuito fino a 48 ore prima
  dell'arrivo».
- **Visibili prima di pagare**: il blocco «Condizioni di annullamento» del
  riepilogo (oggi dice «non ancora pubblicate») mostra testo e termine
  dello stabilimento; lo stesso blocco compare nel carrello prima di
  «Conferma e paga» e nel riepilogo d'ordine.
- **Annullamento dal conto** (gesto nuovo):
  `POST /v1/account/bookings/{groupId}/cancel` — solo il proprietario del
  gruppo, gruppo confermato, nessuna giornata maturata, **entro il
  termine**: annullamento con **rimborso pieno** di quanto pagato (acconto
  compreso), con la meccanica dei rimborsi di oggi (il cuore di
  `cancelByBeachClub` si estrae in una funzione condivisa; la via del
  Gestore non cambia di una virgola). **Oltre il termine** il gesto non
  compare: la pagina dice di rivolgersi allo stabilimento (che annulla
  come oggi) — è il predefinito di piattaforma, modificabile quando il
  committente deciderà le condizioni vere. Audit e coda (`booking.cancelled`)
  come per l'annullamento del Gestore.

## 6. «Niente profilazione» (D54)

- Una riga nel piè di pagina pubblico, nelle due lingue (chiave
  `footer.privacy`): Ombrè non usa cookie di profilazione né pubblicità;
  i soli cookie sono tecnici (sessione, carrello, lingua).
- Una voce nuova nelle domande di Assistenza (`pages.help.faq`) che lo
  spiega con parole piane, it/en.
- **Nessun banner**: non serve, e la sua assenza è il messaggio.

## 7. Vincoli di sempre

Tutto senza JavaScript (le caselle dei filtri sono un modulo GET); it/en
speculari; i tre nomi di ruolo e il lessico unico (periodo, Ricerca
ombrellone); dati minimi (le recensioni mostrano il nome del conto, mai
l'email); RLS e GRANT per ogni tabella e colonna nuova; migrazioni SQL a
mano (021, 022); contratto delle rotte e OpenAPI aggiornati; test con
database per ogni funzione nuova; un esperto di usabilità scrive i testi
di filtri, recensioni, caparra, condizioni e piè di pagina prima delle
pagine; commit a ogni incremento; **mai push**.

## 8. Rimandati (scritti)

Tariffe adulto/bambino e mezze giornate (cambiano il modello dei prezzi:
listini veri del committente); recensioni importate da Google (chiavi che
non abbiamo); modifica ed eliminazione della recensione da parte
dell'Ospite; decisione della piattaforma sulle recensioni segnalate (va
con la console di piattaforma); condizioni di annullamento oltre il
termine più fini del «rivolgiti allo stabilimento» (testi del
committente); proposta della postazione nelle carte dei risultati di
ricerca. Ferme le esclusioni già decise (Konva, drag-and-drop, cassa,
CRM, carrello multi-stabilimento).

## 9. Criteri di accettazione (numerazione del committente)

1. La Ricerca ombrellone filtra per servizi e i risultati mostrano i
   distintivi; la scheda li elenca nelle due lingue.
2. Le zone nominate compaiono in planimetria, riepilogo, carrello, pass e
   reception con le stesse parole.
3. Solo un Ospite con soggiorno concluso può recensire; media e numero
   compaiono su scheda e risultati; la segnalazione del Gestore con
   replica funziona.
4. Uno stabilimento con caparra mostra acconto e saldo in riepilogo,
   ordine, conto e reception, e il registro economico quadra.
5. Condizioni e termine di annullamento sono visibili prima del pagamento
   e applicati all'annullamento dal conto.
6. Il piè di pagina dichiara l'assenza di profilazione nelle due lingue e
   Assistenza lo spiega.
7. La prenotazione rapida, il carrello, il conto e l'accesso Google di
   prova funzionano come prima.
8. Tutto collaudato, in italiano e inglese, anche senza JavaScript, con i
   collaudi precedenti ancora verdi.
