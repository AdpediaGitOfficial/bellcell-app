#!/usr/bin/env bash
#
# Restore the most recent backup into a scratch database and check it holds
# real rows. Run quarterly. It never touches the live database.
#
#   sudo -u postgres /srv/bellcell/app/deploy/restore-drill.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/bellcell/backups}"
SCRATCH="${SCRATCH:-bellcell_restore_drill}"

LATEST="$(ls -1t "${BACKUP_DIR}"/bellcell-*.dump 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo "No backup found in ${BACKUP_DIR}" >&2
  exit 1
fi

echo "Restoring ${LATEST} into ${SCRATCH}…"
dropdb --if-exists "$SCRATCH"
createdb "$SCRATCH"
pg_restore --no-owner --no-privileges --dbname="$SCRATCH" "$LATEST"

# Count what matters. A restore that produces an empty schema "succeeds".
psql --dbname="$SCRATCH" --tuples-only --no-align <<'SQL'
SELECT 'students      ' || count(*) FROM students;
SELECT 'payments      ' || count(*) FROM payments;
SELECT 'ledger_entries' || ' ' || count(*) FROM ledger_entries;
SELECT 'payslips      ' || count(*) FROM payslips;
SELECT 'users         ' || count(*) FROM users;
SQL

# The ledger is the thing that must balance. If this disagrees with the
# live Day Book the backup is not trustworthy.
psql --dbname="$SCRATCH" --tuples-only --no-align <<'SQL'
SELECT 'ledger net (paise): ' || COALESCE(sum("debitPaise") - sum("creditPaise"), 0) FROM ledger_entries;
SQL

dropdb "$SCRATCH"
echo "Restore drill passed. Scratch database removed."
