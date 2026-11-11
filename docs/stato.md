# Stato del progetto

Aggiornato all'11/11/2026.

## Dove siamo

- **Documentazione**: concept Beach Sharing Network consolidato nel progetto
  professionale v3.0; template SweetHost applicato (catalogo dei moduli, schede,
  requisiti trasversali, checklist); stesura in [progetto.md](progetto.md); registro delle
  decisioni; schema della struttura logica ([struttura-logica.png](struttura-logica.png));
  requisiti di design, accessibilità, prestazioni, SEO, AEO e GEO in
  [qualita-web.md](qualita-web.md).
- **Codice, provato in container**: monorepo avviato; sito pubblico bilingue (italiano e
  inglese) con sei pagine per lingua; nucleo condiviso con calcoli in centesimi
  (preventivo, sconto, ripartizione) e le cinque macchine a stati; `Dockerfile` e compose.
- **Non fatto**: API, database, worker, autenticazione, aree riservate (ospite,
  stagionale, gestione, reception, console), ricerca reale, prenotazione, pagamenti. Nessun
  dominio registrato, nessuna pubblicazione. Il sito dichiara che il servizio è in
  preparazione e chiede di non essere indicizzato.

## Controlli eseguiti l'11/11/2026

| Controllo | Esito |
|---|---|
| Lint e controllo dei tipi | Superati |
| Test del nucleo condiviso (18) | Superati: esempio MARE10 da €30 a €27, ripartizione 13,50 / 10,80 / 2,70, parità dei dizionari, indirizzi |
| Build di produzione e immagine Docker | Riuscite; i test girano dentro la build dell'immagine |
| Pagine servite dal container (192 verifiche su 12 pagine) | Superate: un solo H1, title e descrizioni unici, canonical, hreflang reciproci, dati strutturati, 404 e reindirizzamenti |
| Container | Utente non root, file system in sola lettura, nessun privilegio aggiuntivo |
| Resa visiva | Controllata su schermate a 390 px e 1280 px |

Verifiche ancora aperte: Core Web Vitals misurati, prova con lettore di schermo e da sola
tastiera, controllo automatico di accessibilità, intestazione Content-Security-Policy,
immagine per le anteprime social, pagina 404 con la grafica del sito.

## Prossimo risultato da costruire

Un incremento operativo verificabile in ambiente di prova che colleghi:
sito personale → autorizzazione stagionale → acquisto → inventario → reception →
rendiconto. Il primo passo è il pacchetto `db` (schema, migrazioni, `tenant_id` e RLS) con
la riga unica `InventoryDay` e la prova dei due acquisti simultanei, poi l'API `/v1` per
preventivi e riserve.

## Passi successivi in ordine

1. Pacchetto `db` e API con inventario, preventivi e riserve (PostgreSQL in container).
2. Autenticazione, ruoli e isolamento tra stabilimenti, con i relativi test.
3. Stabilimento dimostrativo dal seed, scheda del bagno e percorso di prenotazione in
   ambiente di prova.
4. In parallelo, fuori dal codice: chiudere le decisioni di avvio (marchio e domini,
   soggetto venditore, provider pagamenti, condizioni) e scegliere i partner pilota.

## Dipendenze esterne aperte

- Verifica di disponibilità del marchio "Ombrè" e dei domini.
- Validazione del provider di pagamento sul modello a tre beneficiari.
- Pareri professionali: fiscalità delle quote, privacy, contratti degli stabilimenti.
- Selezione dei partner pilota e dei referenti.
- Dati per i contenuti pubblici: soggetto che pubblica, piani confermati, condizioni di
  annullamento, canali di assistenza, indirizzi proposti e scelta sui crawler AI (elenco
  completo in [qualita-web.md §8](qualita-web.md#8-dati-e-decisioni-che-servono-dal-proprietario)).
