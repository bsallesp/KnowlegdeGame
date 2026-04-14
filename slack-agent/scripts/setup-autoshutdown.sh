#!/usr/bin/env bash
set -euo pipefail

RG="rg-dystoppia-prod"
LOCATION="eastus"
VM_NAME="vm-dystoppia-dev"
AUTOMATION_ACCOUNT="auto-dystoppia"
RUNBOOK_NAME="shutdown-vm-if-idle"
ACTION_GROUP_NAME="ag-dystoppia-vm-idle"
ALERT_NAME="alert-dystoppia-vm-idle-cpu"

TMP_DIR="$(mktemp -d)"
RUNBOOK_FILE="${TMP_DIR}/${RUNBOOK_NAME}.ps1"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cat > "$RUNBOOK_FILE" <<'EOF'
Connect-AzAccount -Identity
$vm = Get-AzVM -ResourceGroupName "rg-dystoppia-prod" -Name "vm-dystoppia-dev" -Status
if ($vm.Statuses[1].Code -eq "PowerState/running") {
  Stop-AzVM -ResourceGroupName "rg-dystoppia-prod" -Name "vm-dystoppia-dev" -Force -NoWait
  Write-Output "VM sendo desligada por inatividade"
}
EOF

echo "Criando Automation Account se ainda nao existir..."
az automation account create \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --name "$AUTOMATION_ACCOUNT" \
  --sku Free >/dev/null

echo "Garantindo Managed Identity na Automation Account..."
az automation account update \
  --resource-group "$RG" \
  --name "$AUTOMATION_ACCOUNT" \
  --assign-identity >/dev/null

AUTOMATION_PRINCIPAL_ID="$(az automation account show \
  --resource-group "$RG" \
  --name "$AUTOMATION_ACCOUNT" \
  --query identity.principalId -o tsv)"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
VM_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"

echo "Atribuindo permissao para desligar VMs..."
az role assignment create \
  --assignee "$AUTOMATION_PRINCIPAL_ID" \
  --role "Virtual Machine Contributor" \
  --scope "$VM_SCOPE" >/dev/null || true

echo "Criando runbook PowerShell..."
az automation runbook create \
  --resource-group "$RG" \
  --automation-account-name "$AUTOMATION_ACCOUNT" \
  --name "$RUNBOOK_NAME" \
  --type PowerShell \
  --location "$LOCATION" >/dev/null || true

az automation runbook replace-content \
  --resource-group "$RG" \
  --automation-account-name "$AUTOMATION_ACCOUNT" \
  --name "$RUNBOOK_NAME" \
  --content "@${RUNBOOK_FILE}" >/dev/null

az automation runbook publish \
  --resource-group "$RG" \
  --automation-account-name "$AUTOMATION_ACCOUNT" \
  --name "$RUNBOOK_NAME" >/dev/null

AUTOMATION_ACCOUNT_ID="$(az automation account show \
  --resource-group "$RG" \
  --name "$AUTOMATION_ACCOUNT" \
  --query id -o tsv)"

RUNBOOK_RESOURCE_ID="${AUTOMATION_ACCOUNT_ID}/runbooks/${RUNBOOK_NAME}"
WEBHOOK_URI="https://management.azure.com${RUNBOOK_RESOURCE_ID}/start?api-version=2023-11-01"

echo "Criando Action Group para disparar o runbook via webhook ARM..."
az monitor action-group create \
  --resource-group "$RG" \
  --name "$ACTION_GROUP_NAME" \
  --short-name "vmidle" \
  --action webhook "$RUNBOOK_NAME" "$WEBHOOK_URI" usecommonalertschema >/dev/null || true

ACTION_GROUP_ID="$(az monitor action-group show \
  --resource-group "$RG" \
  --name "$ACTION_GROUP_NAME" \
  --query id -o tsv)"

VM_ID="$(az vm show --resource-group "$RG" --name "$VM_NAME" --query id -o tsv)"

echo "Criando regra de alerta para CPU < 5% por 30 minutos..."
if az monitor metrics alert show --resource-group "$RG" --name "$ALERT_NAME" >/dev/null 2>&1; then
  az monitor metrics alert update \
    --resource-group "$RG" \
    --name "$ALERT_NAME" \
    --description "Desliga a VM de desenvolvimento quando a CPU fica abaixo de 5% por 30 minutos." \
    --severity 3 \
    --evaluation-frequency 5m \
    --window-size 30m \
    --add-action "$ACTION_GROUP_ID" >/dev/null
else
  az monitor metrics alert create \
    --resource-group "$RG" \
    --name "$ALERT_NAME" \
    --scopes "$VM_ID" \
    --description "Desliga a VM de desenvolvimento quando a CPU fica abaixo de 5% por 30 minutos." \
    --severity 3 \
    --evaluation-frequency 5m \
    --window-size 30m \
    --condition "avg Percentage CPU < 5" \
    --action "$ACTION_GROUP_ID" >/dev/null
fi

cat <<EOF

Auto-shutdown por inatividade configurado.
Automation Account: ${AUTOMATION_ACCOUNT}
Runbook: ${RUNBOOK_NAME}
Action Group: ${ACTION_GROUP_NAME}
Alerta: ${ALERT_NAME}

Observacao: o Action Group acima usa um webhook ARM para iniciar o runbook.
Se a sua assinatura bloquear esse fluxo, finalize a associacao do runbook pelo portal Azure Monitor.

EOF
