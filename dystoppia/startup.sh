#!/bin/sh
set -e

echo "[startup] Running database migrations..."
node node_modules/.bin/prisma migrate deploy \
  || node node_modules/.bin/prisma db push --skip-generate \
  || echo "[startup] WARNING: migration failed, continuing anyway"

echo "[startup] Starting Next.js..."
exec node server.js
