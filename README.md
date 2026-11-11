# Ombrè — Il tuo posto al sole

Ecosistema per la prenotazione di giornate al mare: un portale nazionale, i siti personali
dei bagni, la prenotazione diretta, l'area dello stagionale e la reception sullo stesso
inventario. Il progetto nasce dal concept **Beach Sharing Network** e adotta il
[template funzionalità da SweetHost](docs/catalogo-moduli.md) per la parte di piattaforma.

## L'idea in una frase

Lo stagionale propone le giornate in cui non usa il suo ombrellone, il gestore le autorizza
e ne mantiene il controllo, l'ospite occasionale le compra online a prezzo chiaro, la
reception lavora sullo stesso inventario del sito: nessuna agenda parallela.

## Documenti

| Documento | Contenuto |
|---|---|
| [docs/progetto.md](docs/progetto.md) | Stesura completa del progetto: visione, perimetro, ruoli, flussi, economia, architettura, dati, API, sicurezza, roadmap e collaudo |
| [docs/catalogo-moduli.md](docs/catalogo-moduli.md) | Template SweetHost applicato a Ombrè: catalogo dei 35 moduli con la decisione per ciascuno, requisiti trasversali e checklist di adozione |
| [docs/schede-moduli.md](docs/schede-moduli.md) | Schede dei moduli adottati nel primo rilascio, con il campo "cosa resta manuale" |
| [docs/qualita-web.md](docs/qualita-web.md) | Requisiti di design, accessibilità, prestazioni, SEO, AEO e GEO: pagine pubbliche, domande dei clienti, dati da confermare, verifiche |
| [docs/prompt-qualita-web.md](docs/prompt-qualita-web.md) | Il prompt di qualità web del committente, da rieseguire sul codice quando esisteranno le pagine |
| [docs/struttura-logica.png](docs/struttura-logica.png) | Schema della struttura logica: attori, superfici, API e moduli, dati (sorgente in `struttura-logica.svg`) |
| [docs/collaudo.md](docs/collaudo.md) | Esito del collaudo: i 15 scenari di accettazione, cosa li verifica, cosa resta aperto |
| [docs/decisioni.md](docs/decisioni.md) | Registro delle decisioni (ADR brevi) |
| [docs/stato.md](docs/stato.md) | Stato del progetto e prossimo risultato da costruire |

## Codice

Monorepo TypeScript (pnpm + Turborepo) sul modello SweetHost. L'app è bilingue dalla
base: italiano senza prefisso, inglese sotto `/en/`.

| Cartella | Contenuto |
|---|---|
| `apps/web` | Sito (Next.js): pagine pubbliche prerenderizzate, scheda e sito del bagno, percorso di prenotazione con pass, aree riservate per stagionale, gestione e reception |
| `apps/worker` | Lavori in coda: notifiche, pulizia delle riserve scadute, chiusura delle giornate |
| `apps/api` | API `/v1` (Hono): stabilimenti attivi, disponibilità di una giornata, preventivo, riserva con chiave di idempotenza |
| `packages/db` | Migrazioni SQL, schema tipizzato (Drizzle), isolamento tra stabilimenti con RLS e tutta la logica: inventario, prenotazioni, accessi, condivisione stagionale, economia, sito, coda |
| `packages/comms` | Messaggi di posta in italiano e inglese |
| `packages/shared` | Configurazione, dizionari it/en, indirizzi delle pagine, calcoli in centesimi (preventivo, sconto, ripartizione), macchine a stati |
| `packages/ui` | Token grafici, stili di base, logo e illustrazione |
| `scripts/smoke.ts` | Controllo delle pagine come le riceve un crawler: title, H1, canonical, hreflang, dati strutturati, codici di stato |
| `scripts/smoke-api.ts` | Prova dell'API in esecuzione: preventivo MARE10 e dieci acquisti simultanei sulla stessa giornata |

Comandi, dalla cartella `ombre/`:

```bash
pnpm install          # dipendenze
pnpm dev              # sviluppo su http://localhost:3210
pnpm collaudo         # collaudo completo: controlli, test, container, percorsi, backup e ripristino
pnpm check            # lint, tipi, test e build
pnpm test:db          # tutti i test, compresi quelli su un PostgreSQL usa e getta
docker compose up -d --build   # sito su 127.0.0.1:3210, API su 127.0.0.1:3211, database interno
pnpm smoke            # controlli sulle pagine servite
pnpm smoke:api        # controlli sull'API (serve OMBRE_SEED_DEMO=true all'avvio)
pnpm smoke:flow       # percorso di riserva sul sito
pnpm smoke:booking    # prenotazione, pagamento di prova, quote e ruoli sull'API
pnpm smoke:areas      # aree riservate sul sito
pnpm smoke:site       # editor del sito dello stabilimento
sh scripts/backup.sh ombre backups              # salva il database
sh scripts/restore-check.sh backups/FILE ombre  # prova che il salvataggio si ripristina
```

Il documento dell'API è servito su `/v1/openapi.json`.

All'avvio il servizio `migrate` applica le migrazioni e prepara il ruolo dell'applicazione;
con `OMBRE_SEED_DEMO=true` crea anche lo stabilimento dimostrativo «Bagno delle Dune».
L'API si collega con un ruolo senza privilegi, a cui il database mostra solo le righe
dello stabilimento della transazione in corso. Il database non è pubblicato fuori dalla
rete Docker. Le password del compose sono segnaposto per lo sviluppo: in produzione si
usano i Docker secrets.

Sito e API girano come utente non root, con file system in sola lettura e senza
privilegi aggiuntivi. Le variabili `OMBRE_*` (vedi `.env.example`) si fissano alla build
dell'immagine: nome, indirizzo pubblico, indicizzazione, apertura delle prenotazioni,
contatto. Finché `OMBRE_INDEXABLE` non è `true` ogni pagina chiede di non essere
indicizzata.

Non ancora presenti: pagamenti e liquidazioni reali, invio reale della posta, inviti e
recupero password, console della piattaforma, annullamento da parte dell'ospite, immagini e
dominio personalizzato nel sito del bagno. Vedi [docs/stato.md](docs/stato.md) e
[docs/collaudo.md](docs/collaudo.md).

## Entità del dominio (rinomina dal template)

| Nel template SweetHost | In Ombrè |
|---|---|
| Tenant (gestore B&B) | Stabilimento balneare (bagno) |
| Risorsa vendibile: alloggio | Postazione × giornata (`InventoryDay`) |
| Evento: prenotazione | Prenotazione di giornata (`Booking`) |
| Persona servita: ospite | Ospite occasionale |
| Partner: proprietario | Stagionale (titolare di abbonamento) |

## Stato

Progetto di prodotto e sviluppo (v3.0 del 10/11/2026). Dall'11/11/2026 il primo rilascio
è costruito e collaudato in ambiente di prova: sito bilingue, prenotazione con pagamento
di prova e pass, reception, condivisione stagionale, economia, sito dello stabilimento.
**Nessun pagamento reale, dominio registrato o app pubblicata; nessun dato reale di
stabilimenti o clienti.** Nomi, importi e disponibilità degli esempi sono fittizi. Il prossimo risultato è un
incremento operativo verificabile in ambiente di prova: sito personale → autorizzazione
stagionale → acquisto → inventario → reception → rendiconto.
