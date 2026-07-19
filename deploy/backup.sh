#!/usr/bin/env bash
# Nightly logical backup of the Postgres database.
# Local by default (keeps 7 days). Set S3_BUCKET to also copy off-box (requires
# the AWS CLI + credentials on the instance with s3:PutObject to that bucket).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/helm}"
BACKUP_DIR="/var/backups/helm"
mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/helm-${STAMP}.sql.gz"

cd "${APP_DIR}/deploy"
docker compose exec -T db pg_dump -U postgres helm | gzip > "${FILE}"

# Retention: drop dumps older than 7 days.
find "${BACKUP_DIR}" -name 'helm-*.sql.gz' -mtime +7 -delete

# Optional off-box copy.
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "${FILE}" "s3://${S3_BUCKET}/helm/$(basename "${FILE}")"
fi

echo "backup written: ${FILE}"
