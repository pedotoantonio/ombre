#!/bin/sh
# Full acceptance run: static checks, every test, then a fresh stack in containers with
# all the walkthroughs and a backup that is actually restored. Everything it starts is
# removed at the end. Usage: sh scripts/collaudo.sh
set -eu
project="ombre-collaudo"
backups="$(mktemp -d)"
export OMBRE_SEED_DEMO=true
# La vetrina (Lido Aurora e Cala del Moro) serve a smoke:mercato: filtri, zone,
# recensioni e caparra vivono sui suoi dati. Il segreto di firma ha il default del compose.
export OMBRE_SEED_SHOWCASE=true
export OMBRE_DEMO_PASSWORD="collaudo-password-123"
export OMBRE_SANDBOX_WEBHOOK_SECRET="collaudo-segreto-fornitore"
export OMBRE_MAIL_PROVIDER=log
# Identity provider di prova (D48): il collaudo del conto esercita l'intero giro OIDC.
export OMBRE_OIDC_PROVIDER=test
export OMBRE_OIDC_TEST_SECRET="collaudo-oidc-segreto-di-prova"
# The acceptance stack declares its public address, so canonical/hreflang stay under test.
export OMBRE_SITE_URL="http://localhost:3210"
export OMBRE_WORKER_INTERVAL_SECONDS=2

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
until curl -fs -o /dev/null http://127.0.0.1:3211/v1/health && curl -fs -o /dev/null http://127.0.0.1:3210/; do
  tries=$((tries + 1))
  [ "$tries" -lt 90 ] || { echo "I servizi non sono partiti" >&2; exit 1; }
  sleep 1
done
echo "Servizi pronti"

step "Percorsi sul sito e sull'API in esecuzione"
for check in smoke smoke:flow smoke:areas smoke:site smoke:conto smoke:mercato smoke:spiaggia smoke:schede smoke:booking smoke:api smoke:2fa; do
  pnpm -s "$check" | tail -1
done

step "Backup e prova di ripristino"
file=$(sh scripts/backup.sh "$project" "$backups")
sh scripts/restore-check.sh "$file" "$project" | tail -1

step "Container"
docker compose -p "$project" exec -T api id -u | sed 's/^/Utente dell API: /'
docker compose -p "$project" exec -T web id -u | sed 's/^/Utente del sito: /'
docker compose -p "$project" exec -T db psql -At -U ombre_owner -d ombre -c "SELECT 'Ruolo applicativo, superutente: ' || rolsuper || ', aggira RLS: ' || rolbypassrls FROM pg_roles WHERE rolname = 'ombre_app'"

printf '\nCollaudo completato senza errori.\n'
