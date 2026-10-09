#!/usr/bin/env bash
#
# Nightly backup. Install as a cron job for the postgres user:
#
#   sudo -u postgres crontab -e
#   15 1 * * *  /srv/bellcell/app/deploy/backup.sh >> /var/log/bellcell-backup.log 2>&1
#
# A backup nobody has restored is a hope, not a backup. deploy/restore-drill.sh
# proves this file can actually be read back, and the runbook asks for that
# drill once a quarter.

set -euo pipefail

DB_NAME="${DB_NAME:-bellcell}"
BACKUP_DIR="${BACKUP_DIR:-/srv/bellcell/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/bellcell-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

# Custom format: compressed, and pg_restore can pull out a single table
# when somebody deletes one row and needs it back without a full restore.
pg_dump --format=custom --no-owner --no-privileges --dbname="$DB_NAME" --file="$OUT"

# Fail loudly on an empty or truncated file rather than writing a useless
# backup and exiting 0.
SIZE=$(stat -c%s "$OUT")
if [ "$SIZE" -lt 10000 ]; then
  echo "$(date -Is) FAILED: ${OUT} is only ${SIZE} bytes" >&2
  exit 1
fi

# Verify the archive is readable before trusting it.
pg_restore --list "$OUT" > /dev/null

echo "$(date -Is) ok ${OUT} ($(numfmt --to=iec "$SIZE"))"

find "$BACKUP_DIR" -name 'bellcell-*.dump' -mtime "+${KEEP_DAYS}" -delete

# A backup that never leaves the server does not survive the server. Copy
# it off-box — fill in the institute's own destination and uncomment:
# rclone copy "$OUT" remote:bellcell-backups/
