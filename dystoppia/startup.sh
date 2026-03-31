#!/bin/sh
set -e

echo "[startup] Node: $(node --version)"
echo "[startup] PWD: $(pwd)"
echo "[startup] DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "[startup] server.js exists: $([ -f server.js ] && echo YES || echo NO)"

echo "[startup] Running database migrations..."
if ! node node_modules/.bin/prisma migrate deploy; then
  echo "[startup] FATAL: prisma migrate deploy failed — fix DB / migrations before the app can start."
  exit 1
fi

echo "[startup] Starting Next.js..."
node server.js
EXIT_CODE=$?
echo "[startup] server.js exited with code: $EXIT_CODE"
exit $EXIT_CODE
