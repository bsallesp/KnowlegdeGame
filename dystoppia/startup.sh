#!/bin/bash
set -e

mkdir -p /home/data 2>/dev/null || true
export DB_PATH=/home/data/dystoppia.db
export DATABASE_URL="file:/home/data/dystoppia.db"

echo "[startup] Running database migrations..."
# Run migrations (idempotent)
/home/site/wwwroot/node_modules/.bin/prisma migrate deploy \
  || /home/site/wwwroot/node_modules/.bin/prisma db push --skip-generate \
  || echo "[startup] WARNING: migration failed, continuing anyway"

echo "[startup] Starting Next.js..."
exec node /home/site/wwwroot/node_modules/.bin/next start -p "${PORT:-8080}"
