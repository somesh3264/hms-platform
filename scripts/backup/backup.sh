#!/usr/bin/env bash
# Nightly HMS backup: the database, its roles, and the uploads volume (prescription scans, logos,
# UPI QR codes), with a manifest of row and file counts — bundled, encrypted to an age public key,
# uploaded to Google Drive, old copies pruned. Read-only towards HMS: pg_dump and a read-only mount
# of the uploads volume; no container is stopped, restarted or changed.
#
# Run from the repository root on the server, by cron. Settings in .env.backup (never committed):
#   BACKUP_AGE_RECIPIENT     the age public key (age1…). Required. The private key is NOT on the server.
#   BACKUP_REMOTE            rclone destination, default "gdrive:hms-backups"
#   BACKUP_HEALTHCHECK_URL   optional: pinged on success, /fail on failure
#   BACKUP_LOCAL_DAYS        encrypted copies kept on the server, default 7
#   HMS_DB_CONTAINER         default hms-postgres
#   HMS_UPLOADS_VOLUME       default hms-platform_hms_uploads
set -euo pipefail
umask 077

cd "$(dirname "$0")/../.."
set -a; [ -f .env.backup ] && . ./.env.backup; set +a

: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (the age public key) in .env.backup}"
REMOTE="${BACKUP_REMOTE:-gdrive:hms-backups}"
LOCAL_DAYS="${BACKUP_LOCAL_DAYS:-7}"
DB="${HMS_DB_CONTAINER:-hms-postgres}"
UPLOADS="${HMS_UPLOADS_VOLUME:-hms-platform_hms_uploads}"
RCLONE_CONFIG_DIR="${BACKUP_RCLONE_CONFIG_DIR:-$HOME/.config/rclone}"
IMAGE=hms-backup
DIR="$PWD/backups"
STAMP="$(TZ=Asia/Kolkata date +%Y%m%d-%H%M%S)"
NAME="hms-$STAMP.tar.age"
LOG="$DIR/backup.log"
mkdir -p "$DIR"
WORK="$(mktemp -d "$DIR/.work-XXXXXX")"

log() { echo "$(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S IST') $*" | tee -a "$LOG"; }
ping() { [ -n "${BACKUP_HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "$BACKUP_HEALTHCHECK_URL$1" >/dev/null || true; }
cleanup() { rm -rf "$WORK"; }
fail() { log "FAILED: $*"; ping /fail; cleanup; exit 1; }
trap 'fail "line $LINENO"' ERR
trap cleanup EXIT

rclone() {
  docker run --rm -u "$(id -u):$(id -g)" -v "$RCLONE_CONFIG_DIR:/config/rclone" -v "$DIR:/data" "$IMAGE" rclone -q "$@"
}
psql_db() { docker exec -i "$DB" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA' ; }

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -q -t "$IMAGE" scripts/backup >/dev/null

# 1. The database. Dumped as the admin role, which bypasses row-level security — a role that did
#    not would silently dump only the rows its policies allow.
[ "$(echo "select rolsuper or rolbypassrls from pg_roles where rolname = current_user" | psql_db)" = "t" ] \
  || fail "the dump role does not bypass row-level security; the backup would be incomplete"
docker exec "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$WORK/db.dump"
docker exec -i "$DB" pg_restore --list < "$WORK/db.dump" > /dev/null || fail "database dump does not read back"

# 2. Roles and their memberships (RLS policies name them), without password hashes.
docker exec "$DB" sh -c 'pg_dumpall -U "$POSTGRES_USER" --globals-only --no-role-passwords' > "$WORK/globals.sql"

# 3. Exact row counts per table, for the restore drill to compare against.
echo "select json_object_agg(table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint)
      from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'" | psql_db > "$WORK/rows.json"

# 4. Uploads, from a read-only mount of the volume.
docker run --rm -v "$UPLOADS:/u:ro" "$IMAGE" tar -cf - -C /u . > "$WORK/uploads.tar"
FILES="$(docker run --rm -i "$IMAGE" sh -c 'tar -tf - | grep -vc "/$" || true' < "$WORK/uploads.tar")"
printf '{"created":"%s","database":%s,"uploadFiles":%s}\n' "$STAMP" "$(cat "$WORK/rows.json")" "$FILES" > "$WORK/manifest.json"
TABLES="$(docker run --rm -i "$IMAGE" jq 'length' < "$WORK/rows.json")"

# 5. Bundle and encrypt. Plaintext stays in the private work folder, removed on exit.
tar -cf "$WORK/bundle.tar" -C "$WORK" manifest.json globals.sql db.dump uploads.tar
docker run --rm -i "$IMAGE" age -r "$BACKUP_AGE_RECIPIENT" < "$WORK/bundle.tar" > "$DIR/$NAME"

# 6. Upload: every night to daily/, on the 1st of the month to monthly/ too.
rclone mkdir "$REMOTE/daily"
rclone mkdir "$REMOTE/monthly"
rclone copyto "/data/$NAME" "$REMOTE/daily/$NAME"
if [ "$(TZ=Asia/Kolkata date +%d)" = "01" ]; then rclone copyto "/data/$NAME" "$REMOTE/monthly/$NAME"; fi

# 7. Prune: 30 nightly and 12 monthly off-site (deleted for good, not to the Drive trash), a week here.
rclone delete "$REMOTE/daily" --min-age 30d --drive-use-trash=false
rclone delete "$REMOTE/monthly" --min-age 366d --drive-use-trash=false
find "$DIR" -maxdepth 1 -name 'hms-*.tar.age' -mtime +"$LOCAL_DAYS" -delete

log "OK $NAME ($(du -h "$DIR/$NAME" | cut -f1), $TABLES tables, $FILES upload files) → $REMOTE"
ping ""
