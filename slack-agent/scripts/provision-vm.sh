#!/usr/bin/env bash
set -euo pipefail

RG="rg-dystoppia-prod"
LOCATION="eastus"
VM_NAME="vm-dystoppia-dev"
VM_SIZE="Standard_B2s"
ADMIN_USER="azureuser"
VNET_NAME="vnet-dystoppia-dev"
SUBNET_NAME="default"
NSG_NAME="nsg-dystoppia-dev"
KV_NAME="kv-dystoppia-prod"
AUTOMATION_ACCOUNT="auto-dystoppia"
FUNCTION_APP_NAME="${FUNCTION_APP_NAME:-}"
ALLOW_FUNCTION_3333="${ALLOW_FUNCTION_3333:-false}"
FUNCTION_PORT_RULE_NAME="Allow-FunctionApp-3333"

CURRENT_IP="$(curl -s https://api.ipify.org)"

if [[ -z "${CURRENT_IP}" ]]; then
  echo "Nao foi possivel descobrir o IP publico atual."
  exit 1
fi

echo "Criando VNet e subnet..."
az network vnet create \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --name "$VNET_NAME" \
  --address-prefixes "10.0.0.0/16" \
  --subnet-name "$SUBNET_NAME" \
  --subnet-prefixes "10.0.1.0/24"

echo "Criando NSG e regra SSH restrita ao IP atual (${CURRENT_IP})..."
az network nsg create \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --name "$NSG_NAME"

if az network nsg rule show --resource-group "$RG" --nsg-name "$NSG_NAME" --name "Allow-SSH-Current-IP" >/dev/null 2>&1; then
  az network nsg rule update \
    --resource-group "$RG" \
    --nsg-name "$NSG_NAME" \
    --name "Allow-SSH-Current-IP" \
    --source-address-prefixes "${CURRENT_IP}/32" \
    --destination-port-ranges 22 >/dev/null
else
  az network nsg rule create \
    --resource-group "$RG" \
    --nsg-name "$NSG_NAME" \
    --name "Allow-SSH-Current-IP" \
    --priority 1000 \
    --direction Inbound \
    --access Allow \
    --protocol Tcp \
    --source-address-prefixes "${CURRENT_IP}/32" \
    --source-port-ranges "*" \
    --destination-address-prefixes "*" \
    --destination-port-ranges 22 >/dev/null
fi

echo "Criando VM Ubuntu 22.04..."
if az vm show --resource-group "$RG" --name "$VM_NAME" >/dev/null 2>&1; then
  echo "VM ja existe, pulando criacao."
else
  az vm create \
    --resource-group "$RG" \
    --location "$LOCATION" \
    --name "$VM_NAME" \
    --image Ubuntu2204 \
    --size "$VM_SIZE" \
    --admin-username "$ADMIN_USER" \
    --authentication-type ssh \
    --generate-ssh-keys \
    --vnet-name "$VNET_NAME" \
    --subnet "$SUBNET_NAME" \
    --nsg "$NSG_NAME" \
    --public-ip-sku Standard >/dev/null
fi

echo "Instalando extensao de login AAD..."
az vm extension set \
  --resource-group "$RG" \
  --vm-name "$VM_NAME" \
  --publisher Microsoft.Azure.ActiveDirectory \
  --name AADSSHLoginForLinux

echo "Garantindo abertura da porta 22 no NSG..."
az vm open-port \
  --resource-group "$RG" \
  --name "$VM_NAME" \
  --port 22 \
  --priority 1010 \
  --source-address-prefixes "${CURRENT_IP}/32"

VM_PUBLIC_IP="$(az vm show -d -g "$RG" -n "$VM_NAME" --query publicIps -o tsv)"
VM_PRIVATE_IP="$(az vm show -d -g "$RG" -n "$VM_NAME" --query privateIps -o tsv)"

echo "Salvando IPs no Key Vault..."
az keyvault secret set --vault-name "$KV_NAME" --name "VM-PUBLIC-IP" --value "$VM_PUBLIC_IP" >/dev/null
az keyvault secret set --vault-name "$KV_NAME" --name "VM-PRIVATE-IP" --value "$VM_PRIVATE_IP" >/dev/null

echo "Criando Automation Account..."
az automation account create \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --name "$AUTOMATION_ACCOUNT" \
  --sku Free >/dev/null

echo "Configurando auto-shutdown diario para 23:00 UTC..."
az vm auto-shutdown \
  --resource-group "$RG" \
  --name "$VM_NAME" \
  --time 2300

if [[ "$ALLOW_FUNCTION_3333" == "true" ]]; then
  if [[ -z "$FUNCTION_APP_NAME" ]]; then
    echo "ALLOW_FUNCTION_3333=true, mas FUNCTION_APP_NAME nao foi definido."
    exit 1
  fi

  echo "Configurando regra opcional da porta 3333 para os outbound IPs da Function App..."
  FUNCTION_OUTBOUND_IPS="$(az functionapp show \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RG" \
    --query outboundIpAddresses -o tsv | tr ',' ' ')"

  if [[ -z "$FUNCTION_OUTBOUND_IPS" ]]; then
    echo "Nao foi possivel descobrir os outbound IPs da Function App."
    exit 1
  fi

  if az network nsg rule show --resource-group "$RG" --nsg-name "$NSG_NAME" --name "$FUNCTION_PORT_RULE_NAME" >/dev/null 2>&1; then
    az network nsg rule update \
      --resource-group "$RG" \
      --nsg-name "$NSG_NAME" \
      --name "$FUNCTION_PORT_RULE_NAME" \
      --source-address-prefixes $FUNCTION_OUTBOUND_IPS \
      --destination-port-ranges 3333 >/dev/null
  else
    az network nsg rule create \
      --resource-group "$RG" \
      --nsg-name "$NSG_NAME" \
      --name "$FUNCTION_PORT_RULE_NAME" \
      --priority 1020 \
      --direction Inbound \
      --access Allow \
      --protocol Tcp \
      --source-address-prefixes $FUNCTION_OUTBOUND_IPS \
      --source-port-ranges "*" \
      --destination-address-prefixes "*" \
      --destination-port-ranges 3333 >/dev/null
  fi
fi

cat <<EOF

Provisionamento concluido.

IP publico: ${VM_PUBLIC_IP}
IP privado: ${VM_PRIVATE_IP}
SSH:
ssh ${ADMIN_USER}@${VM_PUBLIC_IP}

Proximo passo:
1. Copiar a pasta slack-agent/vm-agent para a VM
2. Rodar scripts/setup-vm.sh dentro da VM

EOF
