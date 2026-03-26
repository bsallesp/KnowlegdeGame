#!/bin/bash
# Provision Dystoppia infrastructure — Azure Container Apps + Azure Files volume for PostgreSQL
#
# Run ONCE (or re-run safely — all steps are idempotent) to create/verify:
#   - Resource Group
#   - Key Vault + secrets
#   - Storage Account + Azure Files share (postgres data) + Blob (backups)
#   - Container Registry (ACR)
#   - Container Apps Environment + Azure Files storage binding
#   - Container App: dystoppia-db   (postgres, always-on, volume mounted)
#   - Container App: dystoppia-app  (placeholder image — CI/CD deploys real image)
#   - Container App Job: dystoppia-backup  (pg_dump daily → Blob Storage)
#
# App deployments (on every git push) are handled by .github/workflows/deploy.yml
#
# Usage: bash scripts/deploy-azure.sh
set -euo pipefail

# ─── Logging setup ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/infra-$(date +%Y%m%d-%H%M%S).log"

exec > >(tee -a "$LOG_FILE") 2>&1

log()     { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_ok()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ $*"; }
log_err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ $*" >&2; }

trap 'echo ""; log "Log salvo em: $LOG_FILE"' EXIT
trap 'log_err "Falhou na linha $LINENO. Veja o log: $LOG_FILE"' ERR

log "=== Infra provisioning iniciado ==="
log "Script:  $0"
log "Git SHA: $(git -C "$(dirname "$SCRIPT_DIR")" rev-parse HEAD 2>/dev/null || echo n/a)"
log "User:    $(az account show --query user.name -o tsv 2>/dev/null || echo n/a)"
log "Sub:     $(az account show --query name -o tsv 2>/dev/null || echo n/a)"
echo ""

# ─── Config ───────────────────────────────────────────────────────────────────
RG="rg-dystoppia-prod"
LOCATION="eastus"
ACR_NAME="dystoppiaacr"
KV_NAME="kv-dystoppia-prod"
ENV_NAME="dystoppia-env"
DB_APP="dystoppia-db"
APP_NAME="dystoppia-app"
BACKUP_JOB="dystoppia-backup"
STORAGE_ACCOUNT="dystoppiast"
FILES_SHARE="pg-data"
BACKUP_CONTAINER="pg-backups"
PG_DB="dystoppia"
PG_USER="dystoppia"
SP_NAME="sp-dystoppia-github"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ─── [1] Resource Group ───────────────────────────────────────────────────────
log "==> [1/9] Ensuring Resource Group: $RG"
az group create --name "$RG" --location "$LOCATION" -o none
log_ok "Resource group ready."

# ─── [2] Key Vault + secrets ─────────────────────────────────────────────────
log "==> [2/9] Ensuring Key Vault: $KV_NAME"
az keyvault create \
  --name "$KV_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --enable-rbac-authorization false 2>/dev/null || log "    Key Vault already exists."

# Generate secrets if they don't exist yet
for SECRET in postgres-password cookie-secret; do
  if ! az keyvault secret show --vault-name "$KV_NAME" --name "$SECRET" -o none 2>/dev/null; then
    log "    Generating $SECRET..."
    az keyvault secret set \
      --vault-name "$KV_NAME" \
      --name "$SECRET" \
      --value "$(openssl rand -base64 32)" \
      --query name -o tsv
  else
    log "    $SECRET already exists."
  fi
done

# Prompt for API keys if not set
for SECRET in anthropic-api-key openai-api-key azure-comm-connection-string; do
  if ! az keyvault secret show --vault-name "$KV_NAME" --name "$SECRET" -o none 2>/dev/null; then
    echo -n "    Enter value for $SECRET: "
    read -r SECRET_VALUE
    az keyvault secret set \
      --vault-name "$KV_NAME" \
      --name "$SECRET" \
      --value "$SECRET_VALUE" \
      --query name -o tsv
  else
    log "    $SECRET already exists."
  fi
done

# Read secrets
DB_PASS=$(az keyvault secret show       --vault-name "$KV_NAME" --name "postgres-password"            --query value -o tsv)
COOKIE_SEC=$(az keyvault secret show    --vault-name "$KV_NAME" --name "cookie-secret"                --query value -o tsv)
ANTHROPIC_KEY=$(az keyvault secret show --vault-name "$KV_NAME" --name "anthropic-api-key"            --query value -o tsv)
AZURE_COMM=$(az keyvault secret show    --vault-name "$KV_NAME" --name "azure-comm-connection-string" --query value -o tsv)
OPENAI_KEY=$(az keyvault secret show    --vault-name "$KV_NAME" --name "openai-api-key"               --query value -o tsv)

# ─── [3] Storage Account + Azure Files + Blob ────────────────────────────────
log "==> [3/9] Ensuring Storage Account: $STORAGE_ACCOUNT"
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 2>/dev/null || log "    Storage account already exists."

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --query "[0].value" -o tsv)

az storage share create \
  --name "$FILES_SHARE" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --quota 32 2>/dev/null || log "    Files share already exists."

az storage container create \
  --name "$BACKUP_CONTAINER" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" 2>/dev/null || log "    Backup container already exists."

az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "storage-account-key" \
  --value "$STORAGE_KEY" \
  --query name -o tsv

# ─── [4] ACR ─────────────────────────────────────────────────────────────────
log "==> [4/9] Ensuring ACR: $ACR_NAME"
az acr create \
  --resource-group "$RG" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true 2>/dev/null || log "    ACR already exists."

# ─── [5] Container Apps Environment ──────────────────────────────────────────
log "==> [5/9] Ensuring Container Apps environment: $ENV_NAME"
az containerapp env create \
  --name "$ENV_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" 2>/dev/null || log "    Environment already exists."

az containerapp env storage set \
  --name "$ENV_NAME" \
  --resource-group "$RG" \
  --storage-name pg-data \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$FILES_SHARE" \
  --access-mode ReadWrite

# ─── [6] PostgreSQL container ────────────────────────────────────────────────
log "==> [6/9] Deploying postgres: $DB_APP"
DB_URL="postgresql://$PG_USER:$DB_PASS@$DB_APP:5432/$PG_DB"

cat > /tmp/pg-app.yaml << YAML
properties:
  environmentId: $(az containerapp env show --name "$ENV_NAME" --resource-group "$RG" --query id -o tsv)
  configuration:
    ingress:
      targetPort: 5432
      transport: tcp
      external: false
  template:
    volumes:
      - name: pg-data
        storageType: AzureFile
        storageName: pg-data
    containers:
      - name: postgres
        image: postgres:16-alpine
        resources:
          cpu: 0.25
          memory: 0.5Gi
        env:
          - name: POSTGRES_DB
            value: "$PG_DB"
          - name: POSTGRES_USER
            value: "$PG_USER"
          - name: POSTGRES_PASSWORD
            value: "$DB_PASS"
          - name: PGDATA
            value: /var/lib/postgresql/data/pgdata
        volumeMounts:
          - volumeName: pg-data
            mountPath: /var/lib/postgresql/data
    scale:
      minReplicas: 1
      maxReplicas: 1
YAML

az containerapp create \
  --name "$DB_APP" \
  --resource-group "$RG" \
  --yaml /tmp/pg-app.yaml 2>/dev/null || \
az containerapp update \
  --name "$DB_APP" \
  --resource-group "$RG" \
  --yaml /tmp/pg-app.yaml

az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "database-url" \
  --value "$DB_URL" \
  --query name -o tsv

# ─── [7] App container (placeholder — CI/CD will update the image) ────────────
log "==> [7/9] Ensuring app container (placeholder): $APP_NAME"
az containerapp create \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
  --cpu 0.5 --memory 1.0Gi \
  --env-vars \
    "NODE_ENV=production" \
    "DATABASE_URL=$DB_URL" \
    "COOKIE_SECRET=$COOKIE_SEC" \
    "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" \
    "AZURE_COMM_CONNECTION_STRING=$AZURE_COMM" \
    "OPENAI_API_KEY=$OPENAI_KEY" \
  --ingress external \
  --target-port 8080 \
  --min-replicas 0 \
  --max-replicas 5 2>/dev/null || log "    App container already exists (CI/CD manages image updates)."

# ─── [8] Daily backup job ─────────────────────────────────────────────────────
log "==> [8/9] Ensuring backup job: $BACKUP_JOB"
az containerapp job create \
  --name "$BACKUP_JOB" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --trigger-type Schedule \
  --cron-expression "0 3 * * *" \
  --replica-timeout 300 \
  --replica-retry-limit 1 \
  --image "postgres:16-alpine" \
  --cpu 0.25 --memory 0.5Gi \
  --env-vars \
    "PGPASSWORD=$DB_PASS" \
    "PGHOST=$DB_APP" \
    "PGUSER=$PG_USER" \
    "PGDATABASE=$PG_DB" \
    "AZURE_STORAGE_ACCOUNT=$STORAGE_ACCOUNT" \
    "AZURE_STORAGE_KEY=$STORAGE_KEY" \
    "BACKUP_CONTAINER=$BACKUP_CONTAINER" \
  --command "/bin/sh" \
  --args "-c" "apk add --no-cache curl && \
    BACKUP=backup-\$(date +%Y%m%d-%H%M).sql.gz && \
    pg_dump | gzip > /tmp/\$BACKUP && \
    curl -s -X PUT \
      -H 'x-ms-date: '\$(date -u +%a,\ %d\ %b\ %Y\ %H:%M:%S\ GMT) \
      -H 'x-ms-blob-type: BlockBlob' \
      --data-binary @/tmp/\$BACKUP \
      \"https://\$AZURE_STORAGE_ACCOUNT.blob.core.windows.net/\$BACKUP_CONTAINER/\$BACKUP\" && \
    echo \"Backup \$BACKUP concluído.\"" 2>/dev/null || log "    Backup job already exists."

# ─── [9] Service Principal for GitHub Actions ─────────────────────────────────
log "==> [9/9] Ensuring Service Principal for GitHub Actions: $SP_NAME"
SUB_ID=$(az account show --query id -o tsv)
ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$RG" --query id -o tsv)
APP_ID_RESOURCE=$(az containerapp show --name "$APP_NAME" --resource-group "$RG" --query id -o tsv)

SP_JSON=$(az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Contributor \
  --scopes "/subscriptions/$SUB_ID/resourceGroups/$RG" \
  --sdk-auth 2>/dev/null || echo "exists")

if [ "$SP_JSON" != "exists" ]; then
  # Grant AcrPush so the SP can push images
  SP_OBJ_ID=$(az ad sp list --display-name "$SP_NAME" --query "[0].id" -o tsv)
  az role assignment create \
    --assignee "$SP_OBJ_ID" \
    --role AcrPush \
    --scope "$ACR_ID" -o none

  log_ok "Service Principal criado. Configure estes secrets no GitHub:"
  echo ""
  echo "    Repository → Settings → Secrets and variables → Actions"
  echo ""
  echo "    AZURE_CREDENTIALS:"
  echo "$SP_JSON"
  echo ""
else
  log "    Service Principal já existe. Se precisar das credenciais, rode:"
  echo "    az ad sp create-for-rbac --name $SP_NAME --role Contributor --scopes /subscriptions/$SUB_ID/resourceGroups/$RG --sdk-auth"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
APP_FQDN=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv 2>/dev/null || echo "pending")

echo ""
log_ok "=== Infra pronta ==="
echo ""
echo "    App URL:   https://$APP_FQDN"
echo "    Postgres:  $DB_APP (interno, porta 5432)"
echo "    Backups:   diários às 03:00 UTC → blob $BACKUP_CONTAINER"
echo ""
echo "    Próximo passo: configure o secret AZURE_CREDENTIALS no GitHub"
echo "    e faça um push para main — o CI/CD irá fazer o build e deploy."
echo ""
echo "    Custo estimado/mês:"
echo "      Postgres (0.25vCPU/0.5GB, sempre ligado): ~\$4"
echo "      App (0.5vCPU/1GB, escala para 0):         ~\$3"
echo "      Azure Files 32GB Standard:                ~\$2"
echo "      ACR Basic:                                ~\$5"
echo "      Blob backups:                             ~\$0.10"
echo "      Total:                                    ~\$14/mês"
echo ""
