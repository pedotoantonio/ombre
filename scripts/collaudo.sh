#!/bin/sh
# Full acceptance run: static checks, every test, then a fresh stack in containers with
# all the walkthroughs and a backup that is actually restored. Everything it starts is
# removed at the end. Usage: sh scripts/collaudo.sh
set -eu
# La pila usa-e-getta ha un progetto compose tutto suo: «ombre-collaudo» senza suffisso
# è l'ambiente fisso di collaudo (web :3232) che resta acceso e non va mai spento da qui.
project="${OMBRE_COLLAUDO_PROJECT:-ombre-collaudo-pila}"
# Anche le porte si possono spostare: il 3210 può essere occupato da un `next dev`.
web_port="${OMBRE_WEB_PORT:-3210}"
api_port="${OMBRE_API_PORT:-3211}"
export OMBRE_WEB_PORT="$web_port" OMBRE_API_PORT="$api_port"
backups="$(mktemp -d)"
export OMBRE_SEED_DEMO=true
# La pila di collaudo è dimostrativa come quella fissa (.env.collaudo): l'avviso in testa
# è quello demo e smoke.ts lo pretende (OMBRE_DEMO_MODE è letto anche dalla suite).
export OMBRE_DEMO_MODE=true
# La vetrina (Lido Aurora e Cala del Moro) serve a smoke:mercato: filtri, zone,
# recensioni e caparra vivono sui suoi dati. Il segreto di firma ha il default del compose.
export OMBRE_SEED_SHOWCASE=true
export OMBRE_DEMO_PASSWORD="collaudo-password-123"
# L'amministratore di piattaforma (D71) nasce dal servizio migrate, come negli altri
# ambienti: serve alla suite della richiamata per l'elenco riservato e la marcatura.
export OMBRE_ADMIN_EMAIL="amministrazione@collaudo.example"
export OMBRE_ADMIN_PASSWORD="$OMBRE_DEMO_PASSWORD"
export OMBRE_SANDBOX_WEBHOOK_SECRET="collaudo-segreto-fornitore"
export OMBRE_MAIL_PROVIDER=log
# Identity provider di prova (D48): il collaudo del conto esercita l'intero giro OIDC.
export OMBRE_OIDC_PROVIDER=test
export OMBRE_OIDC_TEST_SECRET="collaudo-oidc-segreto-di-prova"
# The acceptance stack declares its public address, so canonical/hreflang stay under test.
export OMBRE_SITE_URL="http://localhost:$web_port"
export OMBRE_WORKER_INTERVAL_SECONDS=2
# Prova che i minuti della riserva vengono dalla configurazione (gruppo A, criterio 4):
# con 15 la pila deve mostrare «15 minuti», non il predefinito 10.
export OMBRE_HOLD_MINUTES=15

step() { printf '\n== %s ==\n' "$1"; }
cleanup() {
  docker compose -p "$project" down -v >/dev/null 2>&1 || true
  rm -rf "$backups"
}
trap cleanup EXIT

step "Lint e tipi"
pnpm -s lint
pnpm -s typecheck >/dev/null
echo "Superati"

step "Test, compresi quelli su PostgreSQL"
sh scripts/test-db.sh | grep -E "Tests|FAIL" || true

step "Immagini e avvio dei container"
docker compose -p "$project" build >/dev/null 2>&1
docker compose -p "$project" up -d db migrate api worker web >/dev/null 2>&1
tries=0
until curl -fs -o /dev/null "http://127.0.0.1:$api_port/v1/health" && curl -fs -o /dev/null "http://127.0.0.1:$web_port/"; do
  tries=$((tries + 1))
  [ "$tries" -lt 90 ] || { echo "I servizi non sono partiti" >&2; exit 1; }
  sleep 1
done
echo "Servizi pronti"

step "Percorsi sul sito e sull'API in esecuzione"
web="http://127.0.0.1:$web_port"
api="http://127.0.0.1:$api_port"
# La scia di audit si legge dalla PILA SOTTO PROVA, non dal progetto cablato nella suite.
export OMBRE_COLLAUDO_PSQL="docker compose -p $project exec -T db psql -At -U ombre_owner -d ombre -c"
# Il `| tail -1` di prima inghiottiva l'uscita non-zero delle suite (l'esito della
# pipeline è quello di tail): qui l'esito si conserva e un rosso ferma il collaudo.
run_smoke() {
  if out=$(pnpm -s "$@" 2>&1); then
    printf '%s\n' "$out" | tail -1
  else
    printf '%s\n' "$out" >&2
    return 1
  fi
}
for check in smoke smoke:flow smoke:areas smoke:site smoke:richiamata smoke:conto smoke:mercato smoke:spiaggia smoke:schede smoke:booking smoke:api smoke:2fa; do
  case "$check" in
    smoke:booking | smoke:api) run_smoke "$check" "$api" ;;
    smoke:mercato | smoke:spiaggia | smoke:schede) run_smoke "$check" "$web" "$api" ;;
    # La suite della richiamata (D71) non ha voce in package.json: si lancia col node di pnpm.
    smoke:richiamata) run_smoke exec node scripts/smoke-richiamata.ts "$web" ;;
    *) run_smoke "$check" "$web" ;;
  esac
done

step "Backup e prova di ripristino"
file=$(sh scripts/backup.sh "$project" "$backups")
sh scripts/restore-check.sh "$file" "$project" | tail -1

step "Container"
docker compose -p "$project" exec -T api id -u | sed 's/^/Utente dell API: /'
docker compose -p "$project" exec -T web id -u | sed 's/^/Utente del sito: /'
docker compose -p "$project" exec -T db psql -At -U ombre_owner -d ombre -c "SELECT 'Ruolo applicativo, superutente: ' || rolsuper || ', aggira RLS: ' || rolbypassrls FROM pg_roles WHERE rolname = 'ombre_app'"

printf '\nCollaudo completato senza errori.\n'
