# Specifica: carrello, conto dell'Ospite e accesso con Google

Iterazione del 18/11/2026 dal prompt del committente
([prompt-carrello-conto-ospite.md](prompt-carrello-conto-ospite.md)).
Ampliamento del lato pubblico: il carrello a più voci, il conto personale
dell'Ospite con lo storico, l'accesso con Google. La prenotazione rapida
senza conto resta identica. Decisioni D44–D48.

## 1. Il conto dell'Ospite (D44)

- **Modello**: l'Ospite con conto è una riga di `app_user` **senza
  appartenenze** (`membership`): chi non ha ruoli in uno stabilimento e non è
  amministratore è un Ospite. Nessuna tabella nuova per le persone.
- **Registrazione** (pubblica, `POST /v1/account/register`): nome ed email,
  nient'altro. La parola d'ordine la **genera il sistema** (casuale, mai
  mostrata nelle pagine) e parte l'email con account, parola d'ordine e
  collegamento d'accesso attraverso la coda esistente (D45). Se l'email ha già
  un conto, la risposta è identica a quella del conto nuovo (nessuna
  enumerazione) e in coda va un'email «hai già un conto».
- **Primo accesso**: la colonna nuova `app_user.must_change_password`
  (migrazione 019) obbliga al cambio: finché è vera, l'area mostra solo la
  pagina di cambio (vecchia parola d'ordine, nuova due volte, almeno 12
  caratteri) e tutte le altre pagine dell'area rimandano lì. Il cambio la
  azzera. `POST /v1/account/password` serve anche dopo, dal conto.
- **Difese**: le stesse di oggi — `auth_login` con blocco dei tentativi,
  limite di frequenza sull'accesso e sulla registrazione (10/min per
  indirizzo), parole d'ordine solo come impronte bcrypt. La verifica in due
  passaggi resta disponibile anche all'Ospite (le pagine esistono già).
- **Area**: per chi non ha appartenenze la panoramica dell'area diventa «Il
  mio conto»: carrello, «Le mie prenotazioni», dati personali (nome,
  cambio parola d'ordine, accesso Google agganciato o no). Chi ha
  appartenenze vede l'area di oggi, invariata.

## 2. Comunicazioni di piattaforma (D45)

Le email del conto (credenziali, benvenuto, «hai già un conto») non
appartengono a uno stabilimento: `notification.beach_id` e `outbox.beach_id`
diventano **annullabili** (migrazione 019). Le righe senza stabilimento sono
«di piattaforma»: la RLS le mostra solo al di fuori del contesto di uno
stabilimento (nessuna pagina di gestione le elenca oggi; la console della
piattaforma resta tra i rimandati). Finché manca il fornitore di posta reale
il testo è pronto e copiabile dalla coda, come oggi: il worker col fornitore
`log` lo scrive per intero nel registro, e il collaudo lo legge dalla coda.
Generi nuovi nell'`outbox`: `account.created`, `account.exists`. Il registro
delle azioni accetta eventi di piattaforma (`audit_event.beach_id`
annullabile): registrazione, cambio parola d'ordine, aggancio Google.

## 3. Il carrello e l'ordine (D46)

- **Modello** (migrazione 020): `cart` (id, stabilimento, `user_id`
  annullabile, creato/aggiornato) e `cart_item` (postazione, dal, al,
  intestatario «per chi è» — testo libero, predefinito vuoto —, codice
  promozionale, extra per voce come righe `cart_item_extra`). Un carrello
  appartiene a **uno stabilimento** (il carrello su più stabilimenti è
  rimandato); vale il tetto dei 31 giorni per voce (D38) e un tetto di **10
  voci** per carrello.
- **Senza conto**: il carrello vive nel server e il navigatore porta solo il
  biglietto `ombre_cart` (cookie HttpOnly: id + firma HMAC, stessa via del
  pass). All'accesso o alla registrazione il carrello del biglietto si fonde
  con quello del conto (voci del primo aggiunte al secondo, doppioni per
  postazione+periodo scartati); dal conto il carrello si ritrova da ogni
  navigatore. Sopravvive alla navigazione perché è nel database, senza
  JavaScript.
- **Niente riserve in carrello**: mettere nel carrello non blocca nulla e non
  ha scadenza. I prezzi mostrati si ricalcolano a ogni resa della pagina; se
  una voce non è più disponibile la pagina la segna e la conferma è negata
  finché non la si toglie o cambia.
- **Conferma tutta o niente**: «Conferma e paga» prende le riserve di tutte
  le voci in **una transazione** (famiglie di hold come oggi, D38): se una
  sola giornata non è libera, nessuna riserva, messaggio con la voce
  colpevole. Nasce l'**ordine** (`order_group`, migrazione 020: id, codice
  `ORD-AAMMGG-NNN` unico per stabilimento, email e nome di chi ordina,
  `user_id` se c'è, totale): **una prenotazione (gruppo D38) per voce,
  ciascuna col suo codice e il suo pass** e con l'intestatario della voce
  come `guest_name`; l'email di chi ordina va su ogni gruppo. Il gruppo
  acquista `order_id` annullabile; l'ordine di una prenotazione rapida non
  esiste (resta tutto come oggi).
- **Un pagamento solo**: `payment` acquista `order_id` annullabile; per un
  ordine il pagamento riferisce l'ordine (e `group_id` resta nullo).
  `applyPaymentOutcome` su un pagamento d'ordine conferma **tutti i gruppi
  insieme** (o annulla tutto se l'esito è negativo o una giornata è stata
  persa nel frattempo, con rimborso registrato, come oggi per il singolo).
  La ripartizione contabile non cambia: `recordSale` per giornata e per
  gruppo, nello stesso stabilimento. La scadenza della riserva è unica per
  l'ordine.
- **Annullamento per voce**: `cancelByBeachClub` resta per gruppo (D40) e
  quindi per voce; i rimborsi attingono ai pagamenti riusciti dell'ordine,
  dal più recente, fino alla quota della voce. L'annullamento dell'intero
  ordine non esiste come gesto a sé (si annullano le voci).
- **Riepilogo d'ordine**: pagina pubblica col biglietto firmato
  (`/bagni/{slug}/ordine/{id}?t=…`, stessa via del biglietto di
  prenotazione): le voci con stato, codici e pass, il totale, il pagamento.
  Dal conto, l'ordine è nello storico.

## 4. Lo storico: «Le mie prenotazioni» (D47)

- **Ricollegamento scritto**: `booking_group.user_id` (annullabile,
  migrazione 020). Si valorizza: (a) alla conferma di un ordine o di una
  prenotazione fatta da connessi; (b) alla registrazione e a ogni accesso,
  per i gruppi con `guest_email` uguale all'email del conto (già minuscola)
  e `user_id` ancora nullo. Il ricollegamento non si disfa se l'email del
  gruppo era un refuso: non c'è smentita dell'Ospite (rimandata).
- **Lettura attraverso gli stabilimenti**: lo storico attraversa gli
  stabilimenti, quindi nasce la via del **proprietario**: con
  `app.user_id` impostato (via `withUser`), una politica RLS nuova su
  `booking_group`, `booking`, `pass`, `payment`, `order_group`,
  `booking_extra` mostra in sola lettura le righe con `user_id` del gruppo
  (o dell'ordine) uguale al proprio. `GET /v1/account/bookings` elenca i
  gruppi (stabilimento, postazione, periodo, intestatario, extra, totale,
  stato, pass se valido), divisi tra prossimi e passati, con in testa i
  prossimi arrivi e la spesa complessiva.
- **Riservatezza**: gestore e reception vedono ciò che vedono oggi; lo
  storico è solo dell'Ospite; nessun dato di altri intestatari oltre il nome
  libero che l'Ospite stesso ha scritto.

## 5. Aggiungere dal posto giusto (D46)

- Nella **scheda dello stabilimento** e nel **riepilogo** (pagina `prenota`),
  accanto al percorso di oggi: «Aggiungi al carrello» (modulo POST con gli
  stessi campi nascosti di oggi). Il percorso rapido «Riserva la postazione»
  resta identico, parola per parola.
- Da una prenotazione dello storico: «Aggiungi un altro periodo» porta alla
  scheda dello stabilimento con postazione e giorno precompilati;
  «Aggiungi servizi» porta al carrello con la postazione e il periodo della
  prenotazione precompilati per una voce nuova di soli extra legata a quella
  prenotazione (`addExtrasToBooking` oggi è solo del banco: si apre
  all'Ospite per le proprie prenotazioni confermate non maturate, pagamento
  col fornitore di prova).

## 6. L'accesso con Google (D48)

- **OpenID Connect, flusso code** accanto alle credenziali: sulla pagina
  d'accesso un collegamento (àncora, non modulo: la CSP `form-action 'self'`
  resta) «Entra con Google» → `/azioni/oidc-avvio` → 303 al fornitore con
  `state` firmato in un cookie temporaneo; ritorno su
  `/azioni/oidc-ritorno?code&state` → l'API scambia il codice, verifica
  l'`id_token` (firma, `iss`, `aud`, scadenza, `email_verified` vero) e
  risponde con la sessione; il sito posa il cookie di oggi.
- **Aggancio per email**: `user_identity` (migrazione 019: utente,
  fornitore, `subject`, email al momento dell'aggancio; unico per
  fornitore+subject). Se esiste un conto con quell'email, l'identità si
  aggancia e si entra in quel conto (stesso storico); altrimenti il conto
  nasce lì, con parola d'ordine casuale sconosciuta e
  `must_change_password` falso: chi entra con Google non ha parola d'ordine
  locale da gestire, e la pagina d'accesso lo dice.
- **Fornitore di prova**: con `OMBRE_OIDC_PROVIDER=test` (strada del
  fornitore di prova dei pagamenti) l'avvio rimanda a una pagina locale di
  consenso che chiede l'email e rimanda al ritorno con un codice firmato
  (HMAC su segreto dedicato); il collaudo esercita l'intero giro. Con
  `google`, servono `OMBRE_GOOGLE_CLIENT_ID`/`OMBRE_GOOGLE_CLIENT_SECRET`
  del committente (dipendenza esterna aperta in stato.md); senza
  configurazione il collegamento non compare.

## 7. Vincoli di sempre

Tutto senza JavaScript; it/en speculari; i tre nomi di ruolo; RLS e permessi
per tutto il nuovo; migrazioni SQL a mano con GRANT/RLS; contratto delle
rotte e OpenAPI aggiornati; test con database per ogni funzione nuova;
commit a ogni incremento; mai push. La prenotazione rapida, i gruppi, i
pass, la reception e il registro economico non cambiano di una virgola.

## 8. Rimandati (scritti)

Carrello su più stabilimenti; smentita del ricollegamento per email;
recupero della parola d'ordine dimenticata (oggi passa dal nuovo invio
dell'amministratore); console della piattaforma che elenca le comunicazioni
di piattaforma; eliminazione del conto; altri fornitori OIDC (Apple,
Facebook); spostamento o annullamento dell'ordine intero in un gesto.

## 9. Criteri di accettazione (numerazione del committente)

1. Il carrello accetta più postazioni, periodi diversi, extra e intestatari
   diversi, e mostra il totale complessivo.
2. La conferma produce una prenotazione per voce, ciascuna col suo pass, e
   un riepilogo d'ordine unico.
3. La registrazione crea il conto e mette nella coda l'email con account e
   parola d'ordine; al primo accesso il cambio è obbligato.
4. «Le mie prenotazioni» mostra passato e futuro con stati, totali e pass, e
   ricollega le prenotazioni precedenti fatte con la stessa email.
5. Dal conto e dalla scheda del lido si aggiungono altri periodi e servizi
   senza rifare la ricerca.
6. «Entra con Google» completa registrazione e accesso sul fornitore di
   prova e aggancia lo storico per email.
7. La prenotazione rapida senza conto funziona esattamente come prima.
8. Tutto collaudato, in italiano e inglese, anche senza JavaScript.
