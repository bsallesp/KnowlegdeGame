#!/bin/bash
# Popula o Key Vault com os secrets de produção
# Uso: bash infra/seed-keyvault.sh

KV="kv-dystoppia-prod"
RG="rg-dystoppia-prod"

# Gera COOKIE_SECRET se não existir
COOKIE_SECRET=$(openssl rand -hex 32)

echo "Setando secrets no Key Vault: $KV"

az keyvault secret set --vault-name $KV --name "DATABASE-URL" \
  --value "postgresql://pgadmin:yl2jI!ivp0stJSOuMIzFf@psql-shared-bsall.postgres.database.azure.com/db_dystoppia?sslmode=require" \
  --output none

az keyvault secret set --vault-name $KV --name "COOKIE-SECRET" \
  --value "$COOKIE_SECRET" \
  --output none

# Preencher manualmente (não commitar no repo):
echo ""
echo "Faltam preencher manualmente:"
echo "  az keyvault secret set --vault-name $KV --name ANTHROPIC-API-KEY --value <valor>"
echo "  az keyvault secret set --vault-name $KV --name OPENAI-API-KEY --value <valor>"
echo "  az keyvault secret set --vault-name $KV --name AZURE-COMM-CONNECTION-STRING --value <valor>"
echo "  az keyvault secret set --vault-name $KV --name AZURE-SPEECH-KEY --value <valor>"
echo "  az keyvault secret set --vault-name $KV --name AZURE-SPEECH-REGION --value <valor>"

echo ""
echo "COOKIE_SECRET gerado: $COOKIE_SECRET"
echo "Guarde em lugar seguro!"
