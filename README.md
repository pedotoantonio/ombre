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
| [docs/decisioni.md](docs/decisioni.md) | Registro delle decisioni (ADR brevi) |
| [docs/stato.md](docs/stato.md) | Stato del progetto e prossimo risultato da costruire |

## Entità del dominio (rinomina dal template)

| Nel template SweetHost | In Ombrè |
|---|---|
| Tenant (gestore B&B) | Stabilimento balneare (bagno) |
| Risorsa vendibile: alloggio | Postazione × giornata (`InventoryDay`) |
| Evento: prenotazione | Prenotazione di giornata (`Booking`) |
| Persona servita: ospite | Ospite occasionale |
| Partner: proprietario | Stagionale (titolare di abbonamento) |

## Stato

Progetto di prodotto e sviluppo (v3.0 del 10/11/2026) con tavole dimostrative.
**Nessun backend operativo, pagamento reale, dominio registrato o app pubblicata.**
Nomi, importi e disponibilità degli esempi sono fittizi. Il prossimo risultato è un
incremento operativo verificabile in ambiente di prova: sito personale → autorizzazione
stagionale → acquisto → inventario → reception → rendiconto.
