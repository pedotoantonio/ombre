# Testi di «Al passo con il mercato»

Scritti da un esperto di usabilità e UX writing, il 19/11/2026, per le sei
funzioni di [specifica-al-passo-col-mercato.md](specifica-al-passo-col-mercato.md).
Una proposta sola per voce, pronta da incollare nei dizionari it/en.

**Regole seguite.** Lessico della [perizia](perizia-usabilita.md): «periodo»,
«Ricerca ombrellone», «postazione», e i tre nomi per esteso: Ospite /
Stagionale / Gestore stabilimento (Guest / Season holder / Beach manager).
Si dice «stabilimento», non «lido» (la perizia ha già corretto «lidi»).
«Password», mai «parola d'ordine». Segnaposto tra graffe: `{n}`, `{amount}`,
`{date}`, `{name}`. Gli importi arrivano già formattati («34,50 €»); la
virgola decimale e il plurale sono responsabilità della funzione che
costruisce la frase, qui sotto sono date le due forme dove servono.

---

## 1. Servizi e filtri

Etichette da distintivo: 1–3 parole, sostantivi, senza verbi. Nelle carte dei
risultati si leggono sotto una foto, quindi niente frasi.

| id | Italiano | Inglese |
|---|---|---|
| `amenities.bar` | Bar e chiosco | Bar and kiosk |
| `amenities.restaurant` | Ristorante | Restaurant |
| `amenities.parking` | Parcheggio | Parking |
| `amenities.hot_showers` | Docce calde | Hot showers |
| `amenities.playground` | Area giochi | Playground |
| `amenities.accessible` | Accesso disabili | Wheelchair access |
| `amenities.pets` | Animali ammessi | Pets welcome |
| `amenities.wifi` | Wi-Fi | Wi-Fi |
| `amenities.lifeguard` | Salvataggio | Lifeguard |
| `amenities.cabins` | Cabine | Changing cabins |
| `amenities.sunset_bar` | Aperitivo al tramonto | Sunset drinks |
| `amenities.card_payments` | Pagamenti con carta | Card payments |

| id | Italiano | Inglese |
|---|---|---|
| `amenities.filterLegend` | Servizi | Services |
| `amenities.filterHint` | Mostra solo gli stabilimenti che hanno tutti i servizi scelti. | Show only beach clubs that offer every service you tick. |
| `amenities.listTitle` | Servizi dello stabilimento | Services at this beach club |
| `amenities.overflow` | +{n} | +{n} |
| `amenities.none` | Lo stabilimento non ha ancora indicato i suoi servizi. | This beach club has not listed its services yet. |

Motivazione. «Accesso disabili» è la voce della specifica e dell'uso
comune sui cartelli; in inglese «Wheelchair access» dice la cosa concreta,
mentre «Accessible» da solo non dice a chi. «Pets welcome» e non «Pets
allowed»: tono di accoglienza, stessa lunghezza. «Servizi» come legenda è
già parola dell'utente; la frase d'aiuto dice **tutti** perché è la
regola vera del filtro (se fosse «uno qualsiasi» i risultati sarebbero
altri) e chi la ignora resta sorpreso quando la lista si svuota.
Il titolo della scheda dice «dello stabilimento» per non confondersi con
i «servizi extra» a pagamento del riepilogo.

---

## 2. Recensioni

| id | Italiano | Inglese |
|---|---|---|
| `reviews.title` | Le recensioni degli Ospiti | Guest reviews |
| `reviews.average` | {avg} su 5 · {n} recensioni | {avg} out of 5 · {n} reviews |
| `reviews.averageOne` | {avg} su 5 · 1 recensione | {avg} out of 5 · 1 review |
| `reviews.none` | Ancora nessuna recensione. | No reviews yet. |
| `reviews.verified` | Recensione verificata: soggiorno reale. | Verified review: a real stay. |
| `reviews.by` | di {name} | by {name} |
| `reviews.stayOf` | soggiorno del {period} | stay on {period} |
| `reviews.replyLabel` | Risposta dello stabilimento | Reply from the beach club |
| `reviews.flaggedNote` | Segnalata alla piattaforma. | Reported to the platform. |

Modulo dal conto dell'Ospite:

| id | Italiano | Inglese |
|---|---|---|
| `reviews.formTitle` | Come è andato il soggiorno? | How was your stay? |
| `reviews.ratingLabel` | Voto, da 1 a 5 | Rating, from 1 to 5 |
| `reviews.ratingScale` | 1 = pessimo · 5 = ottimo | 1 = poor · 5 = excellent |
| `reviews.bodyLabel` | Racconta, se vuoi (facoltativo) | Tell us more, if you like (optional) |
| `reviews.bodyHint` | Al massimo 600 caratteri. Il testo non si può modificare dopo l'invio. | 600 characters at most. You cannot edit the text after sending. |
| `reviews.submit` | Pubblica la recensione | Publish your review |
| `reviews.thanks` | Grazie, la tua recensione è stata pubblicata. | Thank you, your review has been published. |
| `reviews.onlyCompleted` | Puoi recensire solo un soggiorno concluso. | You can only review a stay that has ended. |
| `reviews.alreadyDone` | Hai già recensito questo soggiorno. | You have already reviewed this stay. |
| `reviews.publicName` | Comparirà il nome del tuo conto, mai la tua email. | Your account name will be shown, never your email. |

Pannello di moderazione del Gestore stabilimento:

| id | Italiano | Inglese |
|---|---|---|
| `reviews.manageTitle` | Recensioni degli Ospiti | Guest reviews |
| `reviews.manageLead` | Puoi rispondere a ogni recensione e segnalare alla piattaforma quelle che non rispettano le regole. | You can reply to any review and report to the platform those that break the rules. |
| `reviews.flagButton` | Segnala alla piattaforma | Report to the platform |
| `reviews.flagReason` | Motivo della segnalazione (da 3 a 200 caratteri) | Reason for the report (3 to 200 characters) |
| `reviews.flagWarning` | Una recensione segnalata resta visibile finché la piattaforma non decide. | A reported review stays visible until the platform decides. |
| `reviews.flagged` | Segnalata il {date}. | Reported on {date}. |
| `reviews.replyField` | La tua risposta (fino a 600 caratteri) | Your reply (up to 600 characters) |
| `reviews.replyButton` | Pubblica la risposta | Publish the reply |
| `reviews.replied` | Risposta pubblicata. | Reply published. |

Motivazione. Titolo «Le recensioni degli Ospiti» tiene il ruolo per
esteso e dice subito chi scrive. La media usa «su 5» (è una scala, non
una frazione) e «·» come nel resto del sito; il singolare va gestito a
parte perché «1 recensioni» è l'errore più visibile che si possa fare.
«Verificata: soggiorno reale» spiega il perché della fiducia in cinque
parole, senza gergo («certificata» promette troppo). Il modulo dice
**prima** che il testo non si modifica, e che compare il nome: sono le
due sorprese che fanno pentire. «Pubblica» e non «Invia»: la
recensione va su una pagina pubblica, il verbo lo dice. La replica si
chiama «dello stabilimento», non «del Gestore»: la scrive una persona ma
parla il locale. L'avvertenza sulla segnalata resta visibile è onesta
fino al disagio, e il Gestore deve poterla leggere **prima** di premere,
non dopo.

---

## 3. Caparra

| id | Italiano | Inglese |
|---|---|---|
| `deposit.now` | Caparra adesso | Deposit now |
| `deposit.balance` | Saldo al lido | Balance at the beach |
| `deposit.total` | Totale | Total |
| `deposit.explain` | Paghi {amount} adesso per confermare; i restanti {balance} li saldi allo stabilimento. | You pay {amount} now to confirm; you settle the remaining {balance} at the beach club. |
| `deposit.paidNow` | Pagato adesso | Paid now |
| `deposit.paidInFull` | Pagato | Paid |

Email di conferma (righe, da sommare al testo esistente):

| id | Italiano | Inglese |
|---|---|---|
| `email.total` | Totale: {amount} | Total: {amount} |
| `email.paidNow` | Pagato adesso: {amount} | Paid now: {amount} |
| `email.toSettle` | Da saldare all'arrivo: {amount} | To pay on arrival: {amount} |
| `email.toCollect` | Da incassare all'arrivo: {amount} | To be collected on arrival: {amount} |
| `email.nothingDue` | Nulla da saldare. | Nothing left to pay. |

Pannello impostazioni del Gestore stabilimento:

| id | Italiano | Inglese |
|---|---|---|
| `paySettings.title` | Pagamento online | Online payment |
| `paySettings.full` | Pagamento intero online | Full payment online |
| `paySettings.deposit` | Caparra online, saldo all'arrivo | Deposit online, balance on arrival |
| `paySettings.percent` | Percentuale della caparra (da 10 a 90) | Deposit percentage (10 to 90) |
| `paySettings.percentHint` | Vale solo con la caparra. L'importo si arrotonda al centesimo. | Applies only with a deposit. The amount is rounded to the cent. |
| `paySettings.save` | Salva il pagamento | Save payment settings |

Motivazione. «Saldo al lido» è la formula della specifica e ha il pregio
di essere letterale, ma è l'unico punto dove si dice «lido»: in
paragrafo e email ho scritto «allo stabilimento» e «all'arrivo». Se la
direzione vuole rigore assoluto, le due etichette di riga diventano
«Caparra adesso / Saldo allo stabilimento»; lo segnalo, non lo decido
due volte. Con «Pagato adesso» l'email smette di dire «Totale pagato»
quando non è vero; la riga «Da incassare all'arrivo» (caso banco) si
distingue da «Da saldare» perché il primo verbo è di chi riceve, il
secondo di chi paga, e la stessa email arriva all'Ospite in entrambi i
casi: chi legge «da incassare» capisce che è un conto aperto dello
stabilimento, non un debito suo da sollecitare. Il Gestore non vede
«acconto» ma «caparra», la parola che usa col cliente.

---

## 4. Condizioni di annullamento

Testo PREDEFINITO di piattaforma, valido quando lo stabilimento non ne
ha scritto uno proprio. `{hours}` è il termine in ore.

| id | Italiano | Inglese |
|---|---|---|
| `cancel.defaultPolicy` | Puoi annullare gratis fino a {hours} ore prima dell'arrivo, contate dalla mezzanotte del giorno d'arrivo: ti rimborsiamo tutto quello che hai pagato. Dopo quel termine rivolgiti allo stabilimento, che decide caso per caso. Se lo stabilimento ha condizioni sue, le trovi pubblicate qui. | You can cancel for free up to {hours} hours before arrival, counted back from midnight at the start of your arrival day: everything you paid is refunded. After that deadline, contact the beach club, which decides case by case. If the beach club has its own conditions, you will find them published here. |
| `cancel.deadline` | Annullamento gratuito fino al {date} | Free cancellation until {date} |
| `cancel.deadlinePassed` | Il termine per annullare gratis è passato il {date}. | The free-cancellation deadline passed on {date}. |

Il gesto dal conto dell'Ospite:

| id | Italiano | Inglese |
|---|---|---|
| `cancel.button` | Annulla la prenotazione | Cancel the booking |
| `cancel.confirm` | Annullare davvero? Perdi le postazioni e ti rimborsiamo {amount}. | Cancel for real? You lose the spots and we refund {amount}. |
| `cancel.confirmYes` | Sì, annulla | Yes, cancel |
| `cancel.confirmNo` | No, tienila | No, keep it |
| `cancel.done` | Prenotazione annullata. Ti rimborsiamo {amount}: il rimborso arriva con lo stesso mezzo del pagamento. | Booking cancelled. We refund {amount}: the refund goes back by the same method as the payment. |
| `cancel.doneNoRefund` | Prenotazione annullata. Non c'era nulla da rimborsare. | Booking cancelled. There was nothing to refund. |
| `cancel.tooLate` | Il termine per annullare gratis è passato. Rivolgiti allo stabilimento: è lui che può annullare. | The free-cancellation deadline has passed. Contact the beach club: only it can cancel now. |

Pannello del Gestore stabilimento:

| id | Italiano | Inglese |
|---|---|---|
| `cancelSettings.title` | Condizioni di annullamento | Cancellation conditions |
| `cancelSettings.hours` | Termine, in ore prima dell'arrivo (da 0 a 336) | Deadline, in hours before arrival (0 to 336) |
| `cancelSettings.hoursHint` | Si conta dalla mezzanotte del giorno d'arrivo. Oltre il termine l'Ospite non può annullare da solo. | Counted from midnight at the start of the arrival day. After the deadline the Guest cannot cancel alone. |
| `cancelSettings.textIt` | Testo in italiano (facoltativo, fino a 600 caratteri) | Text in Italian (optional, up to 600 characters) |
| `cancelSettings.textEn` | Testo in inglese (facoltativo, fino a 600 caratteri) | Text in English (optional, up to 600 characters) |
| `cancelSettings.textHint` | Lascia vuoto per usare il testo di Ombrè. Scrivi in entrambe le lingue: l'Ospite legge quella del suo schermo. | Leave empty to use Ombrè's text. Write in both languages: the Guest reads the one on their screen. |
| `cancelSettings.save` | Salva le condizioni | Save the conditions |

Motivazione. Il predefinito dice tre cose vere e non promette di più:
rimborso pieno entro il termine, «caso per caso» dopo, e che le
condizioni proprie hanno la precedenza. «Contate dalla mezzanotte del
giorno d'arrivo» è la regola esatta (l'ora d'arrivo non esiste nel
modello) e va detta, altrimenti «48 ore prima» sembra riferita all'ora
in cui si arriva. La conferma mostra l'importo perché è la cosa che
l'Ospite vuole sapere premendo; «Sì, annulla / No, tienila» non
ripete la domanda e non si confonde con «Annulla» del modulo (che già
nel sito vuol dire «lascia perdere»). Il messaggio dopo il termine
non dice «non puoi»: dice a chi rivolgersi. Nel pannello, «Annulla da
solo» è la conseguenza che il Gestore deve capire prima di mettere 0.
I testi definitivi li deciderà il committente.

---

## 5. Niente profilazione

| id | Italiano | Inglese |
|---|---|---|
| `footer.privacy` | Niente cookie di profilazione né pubblicità: solo cookie tecnici, per sessione, carrello e lingua. | No profiling cookies and no advertising: only technical cookies, for your session, cart and language. |
| `faq.privacy.q` | Ombrè mi traccia o mi mostra pubblicità? | Does Ombrè track me or show ads? |
| `faq.privacy.a` | No. Non usiamo cookie di profilazione né pubblicità e non ti seguiamo da un sito all'altro. Usiamo solo cookie tecnici, quelli che servono perché il sito funzioni: ricordano la tua sessione, il carrello e la lingua. Per questo non vedi nessun banner dei cookie. | No. We use no profiling cookies and no advertising, and we do not follow you from site to site. We only use technical cookies, the ones the site needs to work: they remember your session, your cart and your language. That is why you see no cookie banner. |

Motivazione. «Per sessione, carrello e lingua» è l'elenco completo dei
cookie, e vale come impegno: se un giorno ne nasce un quarto la riga va
cambiata, non allargata. L'ultima frase della risposta spiega l'assenza
del banner, la domanda che chiunque si fa subito. «Ombrè mi traccia?» è
la domanda con le parole dell'utente, non quelle del garante.

---

## 6. Zone

Il nome della zona è un nome proprio scritto dal Gestore («Palme»,
«Piscina»): identico nelle due lingue. Dove compare accanto a una
postazione serve una parola, perché «Palme» da solo potrebbe essere un
tipo di postazione; la fascia fisica (riva, ombrelloni, monte) è un
concetto diverso e non si tocca.

| id | Italiano | Inglese |
|---|---|---|
| `zone.badge` | Zona {name} | Zone {name} |
| `zone.label` | Zona | Zone |
| `zone.proposedSpot` | Postazione proposta, in zona {name} | Suggested spot, in zone {name} |

Pannello del Gestore stabilimento nella planimetria:

| id | Italiano | Inglese |
|---|---|---|
| `zone.manageTitle` | Zone con nome | Named zones |
| `zone.manageLead` | Raggruppa le postazioni con un nome tuo, come «Palme» o «Vicino al bar». Gli Ospiti lo vedono accanto alla postazione. | Group spots under a name of your own, such as "Palme" or "Near the bar". Guests see it next to the spot. |
| `zone.nameField` | Nome della zona (da 2 a 40 caratteri) | Zone name (2 to 40 characters) |
| `zone.nameWarning` | Il nome compare identico in italiano e in inglese: non viene tradotto. | The name appears exactly the same in Italian and English: it is not translated. |
| `zone.create` | Crea la zona | Create zone |
| `zone.rename` | Rinomina | Rename |
| `zone.delete` | Elimina la zona | Delete zone |
| `zone.deleteWarning` | Le postazioni di questa zona restano, ma senza zona. | The spots in this zone stay, but without a zone. |
| `zone.assignRow` | Assegna tutta la fila a una zona | Assign the whole row to a zone |
| `zone.assignRowNone` | Nessuna zona | No zone |
| `zone.limit` | Al massimo 20 zone per stabilimento. | At most 20 zones per beach club. |
| `zone.nameTaken` | Esiste già una zona con questo nome. | A zone with this name already exists. |

Motivazione. «Zona Palme» in italiano è naturale; in inglese «Zone
Palme» è accettabile con un nome proprio italiano, e la stessa forma
nelle due lingue evita che il Gestore debba pensare a una traduzione.
Dove la riga ha già un'etichetta (riepilogo, pass, reception) si usa
`zone.label` + nome, senza ripetere «Zona» due volte. L'avvertenza sulla
traduzione sta sul campo, non nell'intestazione: è lì che il Gestore
sta decidendo se scrivere «Near the bar» o «Vicino al bar». L'avvertenza
di eliminazione dice che le postazioni non spariscono: è la paura che
frena il gesto.
