#!/usr/bin/env bash
# Self-test for the HMS backup and restore drill, with no real data: a throwaway Postgres 16 shaped
# like HMS (an admin superuser, an app role, tables with FORCE ROW LEVEL SECURITY and policies that
# name that role) and a throwaway uploads volume; a throwaway age key; a local folder for Drive.
# Then a drill against a bundle with one row removed, which must fail.
set -euo pipefail
cd "$(dirname "$0")/../.."
T="hms-selftest-$$"
WORK="$(mktemp -d -t hms-backup-selftest)"
cleanup() { docker rm -f "$T-db" >/dev/null 2>&1 || true; docker volume rm "$T-uploads" >/dev/null 2>&1 || true; rm -rf "$WORK" backups/selftest-remote; }
trap cleanup EXIT

docker build -q -t hms-backup scripts/backup >/dev/null
docker run --rm hms-backup age-keygen > "$WORK/key.txt" 2>/dev/null
PUBLIC="$(grep -o 'age1[a-z0-9]*' "$WORK/key.txt")"

docker run -d --name "$T-db" -e POSTGRES_USER=hms_admin -e POSTGRES_PASSWORD=x -e POSTGRES_DB=hms postgres:16-alpine >/dev/null
for i in $(seq 60); do docker exec "$T-db" pg_isready -U hms_admin -d hms >/dev/null 2>&1 && break; sleep 1; done
sleep 2; for i in $(seq 30); do docker exec "$T-db" psql -U hms_admin -d hms -c "select 1" >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$T-db" psql -U hms_admin -d hms -q -v ON_ERROR_STOP=1 <<'SQL'
create role hms_app login password 'not-in-backup';
create table "Hospital" (id serial primary key, name text);
create table "Patient" (id serial primary key, "hospitalId" int references "Hospital", name text);
alter table "Patient" enable row level security;
alter table "Patient" force row level security;
create policy tenant on "Patient" to hms_app using ("hospitalId" = current_setting('app.hospital_id', true)::int);
grant select, insert on "Patient", "Hospital" to hms_app;
insert into "Hospital" (name) values ('A'), ('B');
insert into "Patient" ("hospitalId", name) select 1 + (g % 2), 'p' || g from generate_series(1, 25) g;
SQL
docker volume create "$T-uploads" >/dev/null
docker run --rm -v "$T-uploads:/u" hms-backup sh -c 'mkdir -p /u/1/rx /u/2/logo && for i in 1 2 3 4 5; do echo scan$i > /u/1/rx/$i.jpg; done && echo l > /u/2/logo/logo.png'

echo "== backup"
BACKUP_AGE_RECIPIENT="$PUBLIC" BACKUP_REMOTE=":local:/data/selftest-remote" BACKUP_RCLONE_CONFIG_DIR="$WORK/rclone" \
  HMS_DB_CONTAINER="$T-db" HMS_UPLOADS_VOLUME="$T-uploads" scripts/backup/backup.sh
FILE="$(ls -t backups/hms-*.tar.age | head -1)"
test -s "backups/selftest-remote/daily/$(basename "$FILE")" && echo "uploaded: $(basename "$FILE")"
! ls -d backups/.work-* >/dev/null 2>&1 && echo "no plaintext left behind"
! grep -aq "PGDMP" "$FILE" && echo "encrypted (no pg_dump header)"
docker run --rm -i -v "$WORK/key.txt:/key:ro" hms-backup age -d -i /key < "$FILE" | tar -xOf - globals.sql > "$WORK/globals.sql"
grep -q "CREATE ROLE hms_app" "$WORK/globals.sql" && ! grep -qi "password 'not-in-backup'\|SCRAM-SHA-256\|md5" "$WORK/globals.sql" && echo "roles saved, without password hashes"

echo "== restore drill"
scripts/backup/restore-drill.sh "$FILE" "$WORK/key.txt"

echo "== a drill against a backup that lost a row must fail"
docker run --rm -i -v "$WORK/key.txt:/key:ro" hms-backup age -d -i /key < "$FILE" > "$WORK/b.tar"
mkdir "$WORK/b" && tar -xf "$WORK/b.tar" -C "$WORK/b"
docker run --rm -i hms-backup jq -c '.database.Patient += 1' < "$WORK/b/manifest.json" > "$WORK/b/m" && mv "$WORK/b/m" "$WORK/b/manifest.json"
tar -cf "$WORK/bad.tar" -C "$WORK/b" manifest.json globals.sql db.dump uploads.tar
docker run --rm -i hms-backup age -r "$PUBLIC" < "$WORK/bad.tar" > "$WORK/bad.tar.age"
if scripts/backup/restore-drill.sh "$WORK/bad.tar.age" "$WORK/key.txt" > "$WORK/bad.log" 2>&1; then echo "SELFTEST FAILED: the drill passed a mismatched backup"; exit 1; fi
grep -q "differ" "$WORK/bad.log" && echo "the drill caught the missing row"
rm -f "$FILE"
echo "SELFTEST PASSED"
