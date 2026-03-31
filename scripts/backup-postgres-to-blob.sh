#!/usr/bin/env bash
set -euo pipefail

# Required env vars:
# - PROD_DATABASE_URL (e.g. postgresql://user:pass@host:5432/db?sslmode=require)
# - STORAGE_ACCOUNT_NAME
# - STORAGE_ACCOUNT_KEY
# - BACKUP_CONTAINER

for var in PROD_DATABASE_URL STORAGE_ACCOUNT_NAME STORAGE_ACCOUNT_KEY BACKUP_CONTAINER; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required environment variable: $var" >&2
    exit 1
  fi
done

WORKDIR="$(mktemp -d)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE_NAME="db_dystoppia-${STAMP}.dump.gz"
FILE_PATH="${WORKDIR}/${FILE_NAME}"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "Creating compressed PostgreSQL dump..."
pg_dump --dbname "$PROD_DATABASE_URL" --format=custom --compress=9 | gzip > "$FILE_PATH"

echo "Uploading backup to Azure Blob Storage..."
az storage blob upload \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --account-key "$STORAGE_ACCOUNT_KEY" \
  --container-name "$BACKUP_CONTAINER" \
  --name "$FILE_NAME" \
  --file "$FILE_PATH" \
  --overwrite false \
  --only-show-errors 1>/dev/null

echo "Backup completed: ${BACKUP_CONTAINER}/${FILE_NAME}"
