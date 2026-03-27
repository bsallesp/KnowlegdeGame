#!/bin/sh
set -e

echo "[startup] Node: $(node --version)"
echo "[startup] PWD: $(pwd)"
echo "[startup] DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "[startup] server.js exists: $([ -f server.js ] && echo YES || echo NO)"

echo "[startup] Running database migrations..."
node node_modules/.bin/prisma migrate deploy \
  || node node_modules/.bin/prisma db push --skip-generate \
  || echo "[startup] WARNING: migration failed, continuing anyway"

echo "[startup] Starting Next.js..."
node server.js
EXIT_CODE=$?
echo "[startup] server.js exited with code: $EXIT_CODE"
exit $EXIT_CODE
