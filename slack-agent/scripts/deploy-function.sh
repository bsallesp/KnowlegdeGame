#!/usr/bin/env bash
set -euo pipefail

RG="rg-dystoppia-prod"
LOCATION="eastus"
FUNCTION_APP_NAME="func-dystoppia-slack"
STORAGE_ACCOUNT="dystoppiast"
KEY_VAULT_NAME="kv-dystoppia-prod"
VM_RESOURCE_GROUP="rg-dystoppia-prod"
VM_NAME="vm-dystoppia-dev"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
VM_AGENT_URL="${VM_AGENT_URL:-}"

if [[ -z "$VM_AGENT_URL" ]]; then
  echo "Defina VM_AGENT_URL antes de rodar o deploy, por exemplo:"
  echo "VM_AGENT_URL=http://<VM_PRIVATE_IP>:3333 ./deploy-function.sh"
  exit 1
fi

echo "Garantindo existencia da Function App..."
if az functionapp show --name "$FUNCTION_APP_NAME" --resource-group "$RG" >/dev/null 2>&1; then
  echo "Function App ja existe."
else
  az functionapp create \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RG" \
    --storage-account "$STORAGE_ACCOUNT" \
    --consumption-plan-location "$LOCATION" \
    --runtime node \
    --runtime-version 22 \
    --functions-version 4 \
    --assign-identity [system] >/dev/null
fi

echo "Obtendo principalId da Managed Identity..."
PRINCIPAL_ID="$(az functionapp identity show \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RG" \
  --query principalId -o tsv)"

echo "Garantindo permissao para controlar VMs..."
az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "Virtual Machine Contributor" \
  --scope "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}" >/dev/null || true

echo "Garantindo acesso ao Key Vault..."
az keyvault set-policy \
  --name "$KEY_VAULT_NAME" \
  --object-id "$PRINCIPAL_ID" \
  --secret-permissions get >/dev/null

echo "Atualizando app settings..."
az functionapp config appsettings set \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RG" \
  --settings \
    "SLACK_BOT_TOKEN=@Microsoft.KeyVault(VaultName=${KEY_VAULT_NAME};SecretName=SLACK-BOT-TOKEN)" \
    "SLACK_SIGNING_SECRET=@Microsoft.KeyVault(VaultName=${KEY_VAULT_NAME};SecretName=SLACK-SIGNING-SECRET)" \
    "AGENT_TOKEN=@Microsoft.KeyVault(VaultName=${KEY_VAULT_NAME};SecretName=AGENT-TOKEN)" \
    "AZURE_SUBSCRIPTION_ID=${SUBSCRIPTION_ID}" \
    "VM_RESOURCE_GROUP=${VM_RESOURCE_GROUP}" \
    "VM_NAME=${VM_NAME}" \
    "VM_AGENT_URL=${VM_AGENT_URL}" >/dev/null

echo "Instalando dependencias e publicando Function..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNCTION_DIR="$(cd "${SCRIPT_DIR}/../azure-function" && pwd)"

cd "$FUNCTION_DIR"
npm install
func azure functionapp publish "$FUNCTION_APP_NAME"

echo "Deploy concluido para ${FUNCTION_APP_NAME}"
