#!/bin/sh
# Runs every test, including those that need PostgreSQL, against a throwaway server
# kept in memory and removed at the end.
set -eu
name="ombre-test-db-$$"
port="${OMBRE_TEST_DB_PORT:-54329}"

docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test_only -p "127.0.0.1:$port:5432" \
  --tmpfs /var/lib/postgresql postgres:18 >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT

tries=0
until docker exec "$name" pg_isready -q -h 127.0.0.1 -U postgres; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { echo "PostgreSQL did not start" >&2; exit 1; }
  sleep 0.5
done

OMBRE_TEST_DB_ADMIN_URL="postgres://postgres:test_only@127.0.0.1:$port/postgres" pnpm -r --workspace-concurrency=1 test
