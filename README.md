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
| [docs/decisioni.md](docs/decisioni.md) | Registro delle decisioni (ADR brevi) |
| [docs/stato.md](docs/stato.md) | Stato del progetto e prossimo risultato da costruire |

## Codice

Monorepo TypeScript (pnpm + Turborepo) sul modello SweetHost. L'app è bilingue dalla
base: italiano senza prefisso, inglese sotto `/en/`.

| Cartella | Contenuto |
|---|---|
| `apps/web` | Sito pubblico (Next.js, pagine prerenderizzate): home, esplora, come funziona, per gli stabilimenti, per gli stagionali, assistenza |
| `packages/shared` | Configurazione, dizionari it/en, indirizzi delle pagine, calcoli in centesimi (preventivo, sconto, ripartizione), macchine a stati |
| `packages/ui` | Token grafici, stili di base, logo e illustrazione |
| `scripts/smoke.ts` | Controllo delle pagine come le riceve un crawler: title, H1, canonical, hreflang, dati strutturati, codici di stato |

Comandi, dalla cartella `ombre/`:

```bash
pnpm install          # dipendenze
pnpm dev              # sviluppo su http://localhost:3210
pnpm check            # lint, tipi, test e build
docker compose up -d --build   # app in container su 127.0.0.1:3210
pnpm smoke            # controlli sulle pagine servite
```

Il container gira come utente non root, con file system in sola lettura e senza
privilegi aggiuntivi. Le variabili `OMBRE_*` (vedi `.env.example`) si fissano alla build
dell'immagine: nome, indirizzo pubblico, indicizzazione, apertura delle prenotazioni,
contatto. Finché `OMBRE_INDEXABLE` non è `true` ogni pagina chiede di non essere
indicizzata.

Non ancora presenti: API, database, worker, aree riservate. Vedi [docs/stato.md](docs/stato.md).

## Entità del dominio (rinomina dal template)

| Nel template SweetHost | In Ombrè |
|---|---|
| Tenant (gestore B&B) | Stabilimento balneare (bagno) |
| Risorsa vendibile: alloggio | Postazione × giornata (`InventoryDay`) |
| Evento: prenotazione | Prenotazione di giornata (`Booking`) |
| Persona servita: ospite | Ospite occasionale |
| Partner: proprietario | Stagionale (titolare di abbonamento) |

## Stato

Progetto di prodotto e sviluppo (v3.0 del 10/11/2026) con tavole dimostrative. Dall'11/11/2026
esistono le fondamenta del codice e il sito pubblico bilingue, in ambiente di prova.
**Nessun backend operativo, pagamento reale, dominio registrato o app pubblicata.**
Nomi, importi e disponibilità degli esempi sono fittizi. Il prossimo risultato è un
incremento operativo verificabile in ambiente di prova: sito personale → autorizzazione
stagionale → acquisto → inventario → reception → rendiconto.
