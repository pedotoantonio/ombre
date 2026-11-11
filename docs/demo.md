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

## Lido Aurora in breve

- **Postazioni**: file A–E, otto per fila. Prezzi per fila: A €45, B €40, C €35, D €30,
  E €28. Le file D ed E hanno più lettini e accolgono più ospiti.
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

## Percorsi da provare

1. **Ospite**. «Esplora» → Lido Aurora → scegli una postazione di oggi → prova `MARE10`
   → riserva → i tuoi dati → «Simula pagamento riuscito» → pass con il codice QR.
2. **Reception**. Entra come reception → Lido Aurora → scrivi il codice breve (`OM-…`)
   della prenotazione appena fatta in «Verifica del pass» → registra l'ingresso, poi
   l'uscita. Prova la prenotazione al banco e lo spostamento in un'altra postazione.
3. **Gestore**. Autorizza o rifiuta le proposte in attesa, cambia un prezzo, blocca una
   postazione, annulla una prenotazione e guarda il rimborso nel riepilogo economico.
   Apri «Sito dello stabilimento», modifica un testo, guarda l'anteprima e pubblica.
4. **Stagionale**. Entra come Anna → postazione B03 → proponi i martedì e i giovedì delle
   prossime due settimane → guarda nel rendiconto la quota maturata sulla B04.
5. **Ruoli**. Entra come contabilità: vedi solo l'economia. Entra come reception: i
   prezzi non si possono cambiare.
6. **Due lingue**. Ripeti un percorso dall'indirizzo inglese, con «English» in alto.

## Avvio

Nel file dell'ambiente (`.env.demo`):

```
OMBRE_SEED_DEMO=true
OMBRE_SEED_SHOWCASE=true
OMBRE_DEMO_PASSWORD=una-password-di-almeno-12-caratteri
```

Lido Aurora viene creato una sola volta: i riavvii non lo modificano. Per ripartire da
capo si ricrea il volume del database (`docker compose -p ombre-demo down -v`, poi di
nuovo `up`). Le date sono calcolate dal giorno della creazione.

## Immagini

Le immagini in `apps/web/public/demo/` sono illustrazioni originali fatte per la demo,
non fotografie di luoghi reali. Il caricamento di foto proprie arriverà con la gestione
dei media.
