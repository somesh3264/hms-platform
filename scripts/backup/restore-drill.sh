#!/usr/bin/env bash
# Restore drill: decrypt an HMS backup, restore it into a clean Postgres 16 container, and prove
# it is complete — every table's row count must equal the count recorded when the backup was
# taken, and the uploads archive must read end to end with the recorded number of files. Prints
# counts only, never patient data. Everything is in throwaway containers and a private temporary
# folder, removed at the end; nothing touches the live server.
#
#   scripts/backup/restore-drill.sh <hms-….tar.age> <age private key file>
set -euo pipefail
umask 077

BACKUP="${1:?usage: restore-drill.sh <hms-….tar.age> <age private key file>}"
KEY="${2:?usage: restore-drill.sh <hms-….tar.age> <age private key file>}"
[ -f "$BACKUP" ] || { echo "No such backup: $BACKUP"; exit 1; }
[ -f "$KEY" ] || { echo "No such key file: $KEY"; exit 1; }
cd "$(dirname "$0")/../.."

RUN="hms-drill-$$"
WORK="$(mktemp -d -t hms-drill)"
cleanup() { docker rm -f "$RUN" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
step() { echo "── $*"; }
docker image inspect hms-backup >/dev/null 2>&1 || docker build -q -t hms-backup scripts/backup >/dev/null
tool() { docker run --rm -i hms-backup "$@"; }

step "Decrypting $(basename "$BACKUP")"
docker run --rm -i -v "$(cd "$(dirname "$KEY")" && pwd)/$(basename "$KEY"):/key:ro" hms-backup age -d -i /key < "$BACKUP" > "$WORK/bundle.tar"
tar -xf "$WORK/bundle.tar" -C "$WORK"
for f in manifest.json globals.sql db.dump uploads.tar; do [ -s "$WORK/$f" ] || { echo "FAILED: $f missing from the bundle"; exit 1; }; done
echo "   taken $(tool jq -r .created < "$WORK/manifest.json")"

step "Restoring into a clean Postgres 16 container"
docker run -d --name "$RUN" -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:16-alpine >/dev/null
for i in $(seq 60); do docker exec "$RUN" pg_isready -U drill -d drill >/dev/null 2>&1 && break; sleep 1; done
sleep 2; for i in $(seq 30); do docker exec "$RUN" psql -U drill -d drill -c "select 1" >/dev/null 2>&1 && break; sleep 1; done
# Roles first: the row-level security policies and grants name them. Errors are not fatal here so
# that a role the drill container already has cannot stop the rest; pg_restore below is strict.
docker exec -i "$RUN" psql -U drill -d drill -q -v ON_ERROR_STOP=0 < "$WORK/globals.sql" > /dev/null 2>&1
docker exec -i "$RUN" pg_restore -U drill -d drill --exit-on-error < "$WORK/db.dump"

step "Comparing every table's row count with the backup's manifest"
docker exec -i "$RUN" psql -U drill -d drill -tA > "$WORK/restored.json" <<'SQL'
select json_object_agg(table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint)
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
SQL
tool jq -S .database < "$WORK/manifest.json" > "$WORK/expected.json"
tool jq -S . < "$WORK/restored.json" > "$WORK/actual.json"
if ! cmp -s "$WORK/expected.json" "$WORK/actual.json"; then
  echo "FAILED: restored row counts differ from the backup's:"; diff "$WORK/expected.json" "$WORK/actual.json" || true; exit 1
fi
TABLES="$(tool jq length < "$WORK/actual.json")"
ROWS="$(tool jq '[.[]] | add // 0' < "$WORK/actual.json")"
echo "   $TABLES tables, $ROWS rows — all equal to the manifest"

step "Reading the uploads archive end to end"
FILES="$(tool sh -c 'tar -tf - | grep -vc "/$" || true' < "$WORK/uploads.tar")"
EXPECTED="$(tool jq .uploadFiles < "$WORK/manifest.json")"
[ "$FILES" = "$EXPECTED" ] || { echo "FAILED: $FILES upload files in the archive, the manifest says $EXPECTED"; exit 1; }
echo "   $FILES files — equal to the manifest"

step "PASSED: the backup restores completely ($TABLES tables, $ROWS rows, $FILES upload files)"
