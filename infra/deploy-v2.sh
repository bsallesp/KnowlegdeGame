#!/bin/bash
# Dystoppia v2 — full deployment to a fresh Azure resource group.
#
# What this script does (in order):
#   1.  Validates prerequisites (az login, correct subscription)
#   2.  Creates rg-dystoppia-v2
#   3.  Generates a PG password and seeds DYSTOPPIA-DATABASE-URL in kv-bsall-shared
#       (must happen BEFORE Bicep so the KV secret exists when the app boots)
#   4.  Runs main-v2.bicep  →  creates ACR, Postgres, App Service, monitoring
#   5.  Builds and pushes the Docker image to the new ACR via `az acr build`
#   6.  Updates the App Service to use the new image tag
#   7.  Restarts the app so KV references and new image take effect
#
# USAGE (run from KnowlegdeGame/dystoppia):
#   bash ../infra/deploy-v2.sh
#
# The script is idempotent: re-running it after a partial failure is safe.
# Bicep uses incremental mode, az acr build is additive, and KV secret upserts.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

RG="rg-dystoppia-v2"
LOCATION="eastus"
SHARED_KV="kv-bsall-shared"
SHARED_KV_RG="rg-shared-credentials"
ACR_NAME="dystoppiaacr"
APP_NAME="dystoppia-v2-app"
PG_SERVER="psql-shared-bsall"
PG_DB="db_dystoppia"
PG_ADMIN="pgadmin"
IMAGE_TAG="v2-$(date +%Y%m%d%H%M)"
SUBSCRIPTION="39b8497a-8d94-42aa-b43a-ae9ac3ae9932"

# Resolve script and app directories regardless of where the script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../dystoppia" && pwd)"

log()  { echo "[deploy-v2] $*"; }
fail() { echo "[deploy-v2] ERROR: $*" >&2; exit 1; }

# ── Step 0: Preflight ─────────────────────────────────────────────────────────

log "Checking az CLI login..."
CURRENT_SUB=$(az account show --query id -o tsv 2>/dev/null) || fail "Not logged in. Run: az login"

if [ "$CURRENT_SUB" != "$SUBSCRIPTION" ]; then
  log "Switching to subscription $SUBSCRIPTION"
  az account set --subscription "$SUBSCRIPTION"
fi

log "Subscription: $SUBSCRIPTION"
log "App directory: $APP_DIR"

[ -f "${APP_DIR}/Dockerfile" ] || fail "Dockerfile not found at ${APP_DIR}/Dockerfile"

# ── Step 1: Resource Group ────────────────────────────────────────────────────

log "Creating resource group: $RG ($LOCATION)"
az group create --name "$RG" --location "$LOCATION" --output none

# ── Step 2: Generate PG password and seed DATABASE-URL into shared KV ─────────
# We do this BEFORE Bicep so the secret exists on first app boot.
# If re-running after a successful first deploy, skip password regeneration
# to avoid DB connection breakage — detect by checking if server already exists.

PG_SERVER_EXISTS=$(az postgres flexible-server show \
  --name "$PG_SERVER" --resource-group "$RG" \
  --query "name" -o tsv 2>/dev/null || true)

if [ -z "$PG_SERVER_EXISTS" ]; then
  log "Generating new PostgreSQL password..."
  PG_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)

  DATABASE_URL="postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_SERVER}.postgres.database.azure.com/${PG_DB}?sslmode=require"

  log "Seeding DYSTOPPIA-DATABASE-URL in $SHARED_KV..."
  az keyvault secret set \
    --vault-name "$SHARED_KV" \
    --name "DYSTOPPIA-DATABASE-URL" \
    --value "$DATABASE_URL" \
    --output none

  log "DATABASE-URL secret set. Saving password for Bicep parameter..."
  # Write to a temp file so we can pass it to az deployment without exposing in process list
  PG_PASSWORD_FILE=$(mktemp)
  echo "$PG_PASSWORD" > "$PG_PASSWORD_FILE"
  trap 'rm -f "$PG_PASSWORD_FILE"' EXIT
else
  log "PostgreSQL server already exists — reading password from existing KV secret..."
  EXISTING_URL=$(az keyvault secret show \
    --vault-name "$SHARED_KV" \
    --name "DYSTOPPIA-DATABASE-URL" \
    --query "value" -o tsv)
  # Extract password from postgresql://user:PASSWORD@host/db
  PG_PASSWORD=$(echo "$EXISTING_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
  PG_PASSWORD_FILE=$(mktemp)
  echo "$PG_PASSWORD" > "$PG_PASSWORD_FILE"
  trap 'rm -f "$PG_PASSWORD_FILE"' EXIT
  log "Reusing existing PostgreSQL password."
fi

# ── Step 3: Deploy Bicep ──────────────────────────────────────────────────────

log "Deploying main-v2.bicep to $RG..."
az deployment group create \
  --name "dystoppia-v2-$(date +%Y%m%d%H%M)" \
  --resource-group "$RG" \
  --template-file "${SCRIPT_DIR}/main-v2.bicep" \
  --parameters \
      appName="$APP_NAME" \
      acrName="$ACR_NAME" \
      pgServerName="$PG_SERVER" \
      pgAdminUser="$PG_ADMIN" \
      pgAdminPassword="$(cat "$PG_PASSWORD_FILE")" \
      pgDatabaseName="$PG_DB" \
      sharedKvName="$SHARED_KV" \
      sharedKvRg="$SHARED_KV_RG" \
      imageTag="$IMAGE_TAG" \
  --mode Incremental \
  --output none

log "Bicep deployment complete."

# ── Step 4: Build and push Docker image ───────────────────────────────────────

log "Building and pushing image: ${ACR_NAME}.azurecr.io/dystoppia:${IMAGE_TAG}"
az acr build \
  --registry "$ACR_NAME" \
  --image "dystoppia:${IMAGE_TAG}" \
  --image "dystoppia:latest" \
  --file "${APP_DIR}/Dockerfile" \
  "$APP_DIR"

log "Image pushed successfully."

# ── Step 5: Update App Service to the new image tag ──────────────────────────

log "Updating App Service image tag to: $IMAGE_TAG"
az webapp config set \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --linux-fx-version "DOCKER|${ACR_NAME}.azurecr.io/dystoppia:${IMAGE_TAG}" \
  --output none

# ── Step 6: Restart so all settings + new image take effect ───────────────────

log "Restarting App Service..."
az webapp restart \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --output none

# ── Done ──────────────────────────────────────────────────────────────────────

APP_URL=$(az webapp show \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --query "defaultHostName" -o tsv)

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Dystoppia v2 — deployment complete"
echo "════════════════════════════════════════════════════════════"
echo "  App URL        : https://${APP_URL}"
echo "  Resource Group : $RG"
echo "  App Service    : $APP_NAME"
echo "  PostgreSQL     : ${PG_SERVER}.postgres.database.azure.com / $PG_DB"
echo "  ACR            : ${ACR_NAME}.azurecr.io"
echo "  Image          : ${ACR_NAME}.azurecr.io/dystoppia:${IMAGE_TAG}"
echo "  Shared KV      : $SHARED_KV ($SHARED_KV_RG)"
echo ""
echo "  On first boot, startup.sh will run:"
echo "    1. prisma migrate deploy   (schema)"
echo "    2. seed-ged.mjs            (GED topic)"
echo "    3. seed-hit.mjs            (Health Informatics topic)"
echo ""
echo "  Tail logs:"
echo "  az webapp log tail --name $APP_NAME --resource-group $RG"
echo "════════════════════════════════════════════════════════════"
