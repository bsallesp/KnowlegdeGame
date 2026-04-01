#!/bin/sh
# Sem "set -e" global: comandos que falham no loop de migrate nao devem encerrar o script por engano.

# Diagnostico: STARTUP_NODE_ONLY=1 pula migrate
if [ "${STARTUP_NODE_ONLY:-0}" = "1" ]; then
  echo "[startup] STARTUP_NODE_ONLY=1 — iniciando apenas node server.js"
  exec node server.js
fi

echo "[startup] Node: $(node --version)"
echo "[startup] PWD: $(pwd)"
echo "[startup] DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "[startup] server.js exists: $([ -f server.js ] && echo YES || echo NO)"

case "${DATABASE_URL:-}" in
  @Microsoft.KeyVault*|*"@Microsoft.KeyVault"*)
    echo "[startup] WARN: DATABASE_URL parece referencia Key Vault nao resolvida."
    ;;
esac

if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q '\.postgres\.database\.azure\.com'; then
  export PGSSLMODE=require
  if ! echo "$DATABASE_URL" | grep -q 'sslmode='; then
    case "$DATABASE_URL" in
      *\?*) export DATABASE_URL="${DATABASE_URL}&sslmode=require" ;;
      *) export DATABASE_URL="${DATABASE_URL}?sslmode=require" ;;
    esac
  fi
  echo "[startup] Azure PG: PGSSLMODE=require e sslmode na URL"
fi

if [ "${SKIP_PRISMA_MIGRATE:-0}" = "1" ]; then
  echo "[startup] SKIP_PRISMA_MIGRATE=1 — migrate ignorado."
else
  echo "[startup] Running database migrations (ate 6 tentativas)..."
  migrate_ok=0
  i=0
  while [ "$i" -lt 6 ]; do
    i=$((i + 1))
    if node node_modules/.bin/prisma migrate deploy; then
      migrate_ok=1
      break
    fi
    echo "[startup] migrate tentativa $i falhou — aguardando 8s..."
    sleep 8
  done
  if [ "$migrate_ok" != "1" ]; then
    echo "[startup] migrate deploy nao concluiu com sucesso."
    if [ "${FAIL_ON_MIGRATE:-0}" = "1" ]; then
      echo "[startup] FAIL_ON_MIGRATE=1 — saindo."
      exit 1
    fi
    echo "[startup] Continuando para node server.js (defina FAIL_ON_MIGRATE=1 para bloquear)."
  fi
fi

echo "[startup] Starting Next.js (node server.js)..."
exec node server.js
