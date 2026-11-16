# Ambiente dimostrativo: cosa c'è e cosa provare

L'ambiente dimostrativo contiene due stabilimenti di fantasia. Nessun dato è reale:
nomi, prezzi, persone e immagini sono esempi, e il pagamento passa da un fornitore di
prova che non muove denaro.

| Stabilimento | A cosa serve |
|---|---|
| **Lido Aurora**, Marina Azzurra | La spiaggia finta completa: 40 postazioni in cinque file, immagini, abbonamenti, proposte in attesa, prenotazioni in ogni stato. È quello da usare per provare la gestione |
| **Bagno delle Dune**, Lido di Pomposa | L'esempio dei documenti di progetto: 8 postazioni il 17/06/2027 a €30 con la promozione MARE10. Lo usano i collaudi automatici |

## Accessi

La password è la stessa per tutti ed è quella scelta all'avvio (`OMBRE_DEMO_PASSWORD`).
L'accesso è in fondo a ogni pagina, «Area riservata».

| Ruolo | Email | Cosa vede |
|---|---|---|
| Gestore | `gestore@bagnodelledune.example` | Tutto, per entrambi gli stabilimenti |
| Reception | `reception@bagnodelledune.example` | Verifica dei pass, banco, spostamenti, blocchi. Non i prezzi né l'economia |
| Contabilità | `contabilita@bagnodelledune.example` | Solo il riepilogo economico |
| Stagionale Anna | `anna@lidoaurora.example` | Postazioni B03 e B04 di Lido Aurora |
| Stagionale Bruno | `bruno@lidoaurora.example` | Postazioni C02 e C05 di Lido Aurora |
| Stagionale | `stagionale@bagnodelledune.example` | B02 del Bagno delle Dune, D01 e D06 di Lido Aurora |
| Titolare di cabina | `cabina@lidoaurora.example` | Solo le proprie cabine del mare di Lido Aurora, con proposte di subaffitto |

## Lido Aurora in breve

- **Postazioni**: file A–E, otto per fila. Prezzi per fila: A €45, B €40, C €35, D €30,
  E €28. Le file D ed E hanno più lettini e accolgono più ospiti.
- **Lettini singoli**: sei in zona riva (`R01`–`R06`, a una fila dagli ombrelloni) e
  quattro sul lato monte (`M01`–`M04`, a due file), in vendita come le altre postazioni.
- **Tipi di postazione**: oltre ai tre tipi di base (Ombrellone, Lettino singolo,
  Gazebo) c'è il tipo personalizzato «Tenda araba». Nella fila 6 degli ombrelloni:
  due gazebo `G01`–`G02` (4 ospiti, prezzo predefinito 60 €) e la tenda `T01` (50 €).
  Il prezzo del tipo vale alla pubblicazione delle giornate nuove; per gli altri vale
  il prezzo base.
- **Disegno della spiaggia**: mare in alto, una passerella verticale dopo la colonna 4,
  una passerella orizzontale dopo la fila C, la struttura «Bar» sul lato monte e un
  blocco di cabine disegnato in fila 2 del lato monte. Tutto si modifica dalla sezione
  «Disegno» della pagina «Spiaggia», senza JavaScript.
- **Cabine del mare**: quattro cabine `CAB1`–`CAB4` agganciate al blocco disegnato.
  `CAB1` è affidata al titolare dimostrativo con accesso (`cabina@lidoaurora.example`),
  con un subaffitto approvato in corso e una proposta in attesa; `CAB2` è affidata a un
  titolare senza accesso, che esiste solo nei registri del gestore.
- **Tipi di affitto d'esempio** (annotazioni del gestore, mai pubbliche): `A07`
  «Albergo» con nota sulla convenzione, `B03` «Stagionale» (coerente con il contratto di
  Anna), `E05` «Animazione bimbi» con nota, per mostrare anche un'etichetta
  personalizzata.
- **Posizione sulla mappa**: coordinate di fantasia ma plausibili per entrambi i lidi
  (Lido Aurora 44.2618, 12.3519; Bagno delle Dune 44.7131, 12.2421), dichiarate
  dimostrative: i segnaposti della pagina iniziale e di «Esplora» vengono da qui.
- **Calendario**: in vendita da oggi per tre settimane. La postazione A08 è bloccata per
  manutenzione oggi e domani.
- **Promozioni**: `MARE10` (10%), `ESTATE5` (5%, al massimo 20 utilizzi), `AUTUNNO15`
  non attiva, per provare un codice rifiutato.
- **Condivisione**: al massimo 6 giornate condivise al giorno, a €32. Sei abbonamenti
  stagionali: B04 e D06 hanno l'autorizzazione automatica, gli altri giornata per giornata.
- **Ripartizione illustrativa**: 50% stagionale, 40% stabilimento, 10% piattaforma.
- **Sito**: modello Riviera, testi in italiano e inglese, copertina e galleria con
  illustrazioni di esempio.

## Cosa trovi già pronto

| Dove | Cosa |
|---|---|
| Oggi | Quattro prenotazioni online e una al banco. Due ospiti sono dentro, uno è uscito e può rientrare, due sono attesi |
| Domani e dopodomani | Vendite ordinarie e condivise, una con `ESTATE5` |
| Domani | Una prenotazione annullata dallo stabilimento, con il rimborso da eseguire |
| Fra tre giorni | Una prenotazione «in verifica»: l'ospite non ha ancora pagato |
| Ieri e l'altro ieri | Cinque prenotazioni concluse, con le quote già maturate |
| Proposte | Quattro proposte degli stagionali aspettano la decisione del gestore; una è stata rifiutata |

Convenzioni hotel, servizi extra e richieste di pagamento non hanno dati dimostrativi
pronti: si creano in pochi passi dalle pagine del gestore («Convenzioni», «Extra») e
della reception («Incassi e richieste»), come nei percorsi 13–15 qui sotto.

## Percorsi da provare

1. **Ospite**. «Esplora» → Lido Aurora → scegli una postazione di oggi → prova `MARE10`
   → riserva → i tuoi dati → «Simula pagamento riuscito» → pass con il codice QR.
2. **Reception**. Entra come reception → Lido Aurora → scrivi il codice breve (`OM-…`)
   della prenotazione appena fatta in «Verifica del pass» → registra l'ingresso, poi
   l'uscita. Prova la prenotazione al banco e lo spostamento in un'altra postazione.
3. **Gestore**. Autorizza o rifiuta le proposte in attesa, cambia un prezzo, blocca una
   postazione, annulla una prenotazione e guarda il rimborso nel riepilogo economico.
   Apri «Sito dello stabilimento», modifica un testo, guarda l'anteprima e pubblica.
4. **Spiaggia** (gestore). Da «Gestione» di Lido Aurora apri «Spiaggia»: l'anteprima
   mostra riva, ombrelloni e lato monte con i corridoi. Cambia le distanze e guarda la
   planimetria seguire; aggiungi una fila o un lettino singolo; imposta tipo di affitto
   e note su una postazione o su una fila intera (prova «Stagionale» su una postazione
   senza contratto per vedere l'avviso di incoerenza); ritira una postazione e rimettila
   in vendita; elimina solo quelle mai usate. In «Gestione», sotto «Posizione sulla
   mappa», imposta o svuota le coordinate e guarda la mappa della pagina iniziale.
5. **Mappa** (ospite). Dalla pagina iniziale naviga la mappa, apri la scheda di un lido
   dal segnaposto e prenota un lettino di riva (`R01`–`R06`) come ogni altra
   postazione, fino al pass.
6. **Disegno** (gestore). In «Spiaggia», sezione «Disegno»: scegli il lato del mare
   (in basso si inverte solo la disposizione visiva), poi uno strumento — passerella
   orizzontale o verticale, struttura con etichetta, blocco cabine, gomma — e tocca le
   celle libere della griglia, in due passi per gli elementi estesi; oppure usa il
   modulo a coordinate. Una sovrapposizione è rifiutata con il motivo accanto alla
   griglia, e la planimetria pubblica rispecchia subito il disegno.
7. **Tipi** (gestore). In «Spiaggia», sezione «Tipi di postazione»: crea un tipo con
   segno dal repertorio, dotazione e prezzo predefinito; aggiungi una fila con quel
   tipo e ritrova il nome del tipo nell'etichetta pubblica; prova a eliminare un tipo
   usato o uno di base per vedere il rifiuto.
8. **Cabine** (gestore). Dalla gestione di Lido Aurora apri «Cabine»: autorizza o
   rifiuta la proposta in attesa, affida una cabina libera per un periodo (titolare
   con o senza accesso), chiudi un affidamento prima della scadenza e guarda il
   troncamento dei subaffitti. Gli affidamenti sovrapposti sono rifiutati.
9. **Titolare di cabina**. Entra come `cabina@lidoaurora.example`: vedi solo le tue
   cabine, i periodi e le tue proposte; proponi un subaffitto dentro il periodo (fuori
   periodo o sovrapposto a uno approvato è rifiutato). La reception vede «Cabine di
   oggi» nella sua pagina e non decide nulla; al pubblico le cabine non compaiono mai.
10. **Stagionale**. Entra come Anna → postazione B03 → proponi i martedì e i giovedì delle
   prossime due settimane → guarda nel rendiconto la quota maturata sulla B04.
11. **Ruoli**. Entra come contabilità: vedi solo l'economia. Entra come reception: i
   prezzi non si possono cambiare.
12. **Due lingue**. Ripeti un percorso dall'indirizzo inglese, con «English» in alto.
13. **Convenzioni hotel** (gestore). Il seed non ne crea: dalla gestione apri
   «Convenzioni» e registrane una, a sconto percentuale o a prezzo fisso a giornata
   (sopra il listino vale comunque il listino). L'ospite scrive il codice nel campo
   del riepilogo, lo stesso delle promozioni; al banco la reception la sceglie da un
   elenco. Nella stessa pagina c'è il rendiconto per struttura su un periodo; prova
   anche a crearne una col codice `MARE10` per vedere il rifiuto (codice già usato da
   una promozione).
14. **Servizi extra** (gestore e ospite). Anche questi si creano dalla gestione, pagina
   «Extra» (nome, prezzo a unità, ordine). Poi compra online una giornata scegliendo le
   quantità nel riepilogo: preventivo per voce, totale comprensivo, extra sul pass;
   la reception li ritrova nell'elenco del giorno e nell'esito della verifica del pass
   («Da consegnare»). Al banco si aggiungono anche a vendita già fatta, con incasso
   subito o lasciato nel residuo.
15. **Incasso rinviato e richieste di pagamento** (reception). Al banco conferma una
   prenotazione «Da incassare» (pass subito, residuo pari al totale), poi da «Incassi e
   richieste» chiedi un acconto: nasce un link temporaneo `/paga/{token}` da aprire
   anche senza accesso, con il fornitore di prova. Dopo il pagamento lo stato passa a
   «Parziale» e poi a «Saldata»; un link scaduto o annullato risponde con la stessa
   pagina cortese. I testi pronti da copiare (WhatsApp/email a mano) sono nella pagina
   «Comunicazioni» del gestore.

## Avvio

Nel file dell'ambiente (`.env.demo`):

```
OMBRE_SEED_DEMO=true
OMBRE_SEED_SHOWCASE=true
OMBRE_DEMO_PASSWORD=una-password-di-almeno-12-caratteri
OMBRE_DEMO_MODE=true
```

`OMBRE_DEMO_MODE=true` cambia l'avviso in cima alle pagine: dice che l'ambiente è
dimostrativo, con dati di esempio e nessun pagamento reale. Come gli altri valori delle
pagine pubbliche è letto quando si costruisce l'immagine del sito: dopo averlo cambiato
serve `up -d --build`.

Lido Aurora viene creato una sola volta: i riavvii non lo modificano. Per ripartire da
capo si ricrea il volume del database (`docker compose -p ombre-demo down -v`, poi di
nuovo `up`). Le date sono calcolate dal giorno della creazione.

## Immagini

Le immagini in `apps/web/public/demo/` sono illustrazioni originali fatte per la demo,
non fotografie di luoghi reali. Il caricamento di foto proprie arriverà con la gestione
dei media.
