#!/bin/sh
# Saves the database of a running stack to a file. Usage:
#   sh scripts/backup.sh [compose project] [output directory]
# The file can be restored with pg_restore; scripts/restore-check.sh proves it.
set -eu
project="${1:-ombre}"
directory="${2:-backups}"
mkdir -p "$directory"
file="$directory/ombre-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose -p "$project" exec -T db pg_dump -U ombre_owner -d ombre --format=custom --no-owner > "$file"
[ -s "$file" ] || { echo "The backup is empty" >&2; rm -f "$file"; exit 1; }
chmod 600 "$file"
echo "$file"
