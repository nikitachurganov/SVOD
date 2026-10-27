#!/usr/bin/env bash
# Daily dump of the database with rotation. Run it from cron on the VPS (see docs/LAUNCH_CHECKLIST.md):
#
#   15 3 * * *  cd /opt/svod && ./scripts/backup-db.sh >> /var/log/svod-backup.log 2>&1
#
# Environment (all optional):
#   BACKUP_DIR   where the dumps go                       (default /opt/svod-backups)
#   KEEP_DAYS    how long a dump is kept                  (default 14)
#   DUMP_CMD     the command that writes a dump to stdout (default: pg_dump inside the db container)
#   POSTGRES_USER / POSTGRES_DB                           (default postgres / myapp)
#
# A dump is written to a temporary name and renamed only when pg_dump finished and the file is not
# empty, so a half-written file is never taken for a backup.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/svod-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-myapp}"
DUMP_CMD="${DUMP_CMD:-docker compose -f docker-compose.production.yml exec -T db pg_dump -U ${PG_USER} ${PG_DB}}"

mkdir -p "${BACKUP_DIR}"
stamp="$(date +%F_%H%M)"
tmp="${BACKUP_DIR}/.dump-${stamp}.sql.gz.part"
final="${BACKUP_DIR}/svod-${stamp}.sql.gz"

trap 'rm -f "${tmp}"' EXIT

# shellcheck disable=SC2086
${DUMP_CMD} | gzip -9 > "${tmp}"

if [ ! -s "${tmp}" ] || ! gzip -t "${tmp}"; then
  echo "$(date -Is) backup FAILED: the dump is empty or broken" >&2
  exit 1
fi

mv "${tmp}" "${final}"
trap - EXIT
find "${BACKUP_DIR}" -maxdepth 1 -name 'svod-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
echo "$(date -Is) backup ok: ${final} ($(du -h "${final}" | cut -f1))"
