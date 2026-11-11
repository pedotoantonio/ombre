#!/bin/sh
# Proves that a backup can be restored: loads it into a throwaway PostgreSQL and compares
# the number of rows of every table with the running database. Usage:
#   sh scripts/restore-check.sh <backup file> [compose project]
set -eu
file="$1"
project="${2:-ombre}"
name="ombre-restore-check-$$"
counts='SELECT string_agg(t || $$=$$ || n, $$ $$ ORDER BY t) FROM (SELECT c.relname AS t, (xpath($$/row/c/text()$$, query_to_xml(format($$SELECT count(*) AS c FROM %I$$, c.relname), false, true, $$$$)))[1]::text AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = $$public$$ AND c.relkind = $$r$$) x'

docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=restore_only --tmpfs /var/lib/postgresql postgres:18 >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT
tries=0
until docker exec "$name" pg_isready -q -h 127.0.0.1 -U postgres; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { echo "PostgreSQL did not start" >&2; exit 1; }
  sleep 0.5
done

# The application role is part of the server, not of the backup.
docker exec "$name" psql -q -U postgres -c "CREATE ROLE ombre_app NOLOGIN" -c "CREATE DATABASE ombre"
docker exec -i "$name" pg_restore -U postgres -d ombre --no-owner --exit-on-error < "$file"

restored=$(docker exec "$name" psql -At -U postgres -d ombre -c "$counts")
live=$(docker compose -p "$project" exec -T db psql -At -U ombre_owner -d ombre -c "$counts")
policies=$(docker exec "$name" psql -At -U postgres -d ombre -c "SELECT count(*) FROM pg_policies")

echo "Restored: $restored"
if [ "$restored" != "$live" ]; then
  echo "Live:     $live" >&2
  echo "The restored database differs from the live one (rows written after the backup also show up here)." >&2
  exit 1
fi
[ "$policies" -gt 0 ] || { echo "Row level security policies were not restored" >&2; exit 1; }
echo "Restore check passed: same rows in every table, $policies security policies restored."
