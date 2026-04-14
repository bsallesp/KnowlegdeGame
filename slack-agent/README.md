# Slack -> Claude Code VM -> Deploy automatico

Esta pasta adiciona um fluxo operacional para receber mensagens do Slack, acordar uma VM Ubuntu na Azure, executar `claude --print` no repositorio dentro da VM e devolver o resultado no thread do Slack.

## Estrutura

```text
slack-agent/
├── azure-function/
├── scripts/
└── vm-agent/
```

## Visao geral da arquitetura

1. O Slack envia eventos para a Azure Function em `POST /api/slack/events`.
2. A Function valida a assinatura, liga a VM se necessario e encaminha a tarefa para o agente Node na VM.
3. O agente da VM responde `202` imediatamente, roda `claude --print --dangerously-skip-permissions` em background e posta os blocos de resposta no thread do Slack.
4. O slash command `/vm` chama `POST /api/slack/commands` para ligar, desligar ou consultar o status da VM.
5. Um alerta do Azure Monitor pode desligar a VM com `deallocate` quando a CPU fica abaixo de 5% por 30 minutos.

## Fase 1: Provisionar a VM

Rode a partir da raiz do repositorio:

```bash
cd slack-agent/scripts
chmod +x provision-vm.sh
./provision-vm.sh
```

Se quiser abrir a porta `3333` apenas para os outbound IPs da Function App ja na criacao da VM:

```bash
cd slack-agent/scripts
FUNCTION_APP_NAME=func-dystoppia-slack \
ALLOW_FUNCTION_3333=true \
./provision-vm.sh
```

O script:

- cria `vnet-dystoppia-dev` com `10.0.0.0/16` e subnet `10.0.1.0/24`
- cria o NSG `nsg-dystoppia-dev` e libera SSH apenas para o seu IP publico atual
- cria a VM `vm-dystoppia-dev` em Ubuntu 22.04
- instala a extensao `AADSSHLoginForLinux`
- salva `VM-PUBLIC-IP` e `VM-PRIVATE-IP` no Key Vault `kv-dystoppia-prod`
- cria a Automation Account `auto-dystoppia`
- configura auto-shutdown diario as `23:00` UTC
- opcionalmente cria uma regra NSG para `3333/TCP` limitada aos outbound IPs da Function App

Depois do script, copie o `vm-agent/` para a VM e rode o bootstrap interno:

```bash
scp -r ../vm-agent azureuser@<VM_PUBLIC_IP>:/home/azureuser/
scp setup-vm.sh azureuser@<VM_PUBLIC_IP>:/home/azureuser/vm-agent/
ssh azureuser@<VM_PUBLIC_IP>
cd /home/azureuser/vm-agent
chmod +x setup-vm.sh
./setup-vm.sh "<ANTHROPIC_API_KEY>" "<AGENT_TOKEN>"
```

## Fase 2: Agente Claude na VM

O `vm-agent/` expose:

- `GET /health`: usado pela Function para saber se a VM esta pronta
- `POST /task`: recebe `{ message, thread_ts, channel, slack_bot_token }`, responde `202` e processa em background

Detalhes importantes do runtime:

- timeout do `claude --print`: 10 minutos
- historico de conversa em memoria por `thread_ts`
- limite de contexto salvo: ultimas 10 trocas por thread
- limpeza automatica de conversas antigas a cada 30 minutos

Para atualizar secrets depois:

```bash
ssh azureuser@<VM_PUBLIC_IP>
echo "SLACK_BOT_TOKEN=xoxb-..." >> /home/azureuser/vm-agent/.env
sudo systemctl restart claude-agent
sudo systemctl status claude-agent --no-pager
```

## Fase 3: Auto-shutdown por inatividade

Rode:

```bash
cd slack-agent/scripts
chmod +x setup-autoshutdown.sh
./setup-autoshutdown.sh
```

O script:

- garante a Automation Account `auto-dystoppia`
- cria e publica o runbook PowerShell `shutdown-vm-if-idle`
- cria um Action Group
- cria uma Metric Alert para `Average Percentage CPU < 5` por 30 minutos, avaliando a cada 5 minutos

Observacao operacional:

- a integracao Action Group -> Automation Runbook por CLI muda com frequencia
- este script usa um webhook ARM para iniciar o runbook
- se a sua assinatura ou politica bloquear esse fluxo, termine a vinculacao do runbook manualmente no portal Azure Monitor

## Fase 4: Criar e publicar a Azure Function App

Criacao inicial:

```bash
az functionapp create \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --storage-account dystoppiast \
  --consumption-plan-location eastus \
  --runtime node --runtime-version 22 \
  --functions-version 4 \
  --assign-identity [system]
```

Permissao da Managed Identity da Function para controlar a VM:

```bash
PRINCIPAL_ID=$(az functionapp identity show \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --query principalId -o tsv)

SUB_ID=$(az account show --query id -o tsv)

az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Virtual Machine Contributor" \
  --scope /subscriptions/$SUB_ID/resourceGroups/rg-dystoppia-prod
```

App Settings com referencias ao Key Vault:

```bash
az functionapp config appsettings set \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --settings \
    "SLACK_BOT_TOKEN=@Microsoft.KeyVault(VaultName=kv-dystoppia-prod;SecretName=SLACK-BOT-TOKEN)" \
    "SLACK_SIGNING_SECRET=@Microsoft.KeyVault(VaultName=kv-dystoppia-prod;SecretName=SLACK-SIGNING-SECRET)" \
    "AGENT_TOKEN=@Microsoft.KeyVault(VaultName=kv-dystoppia-prod;SecretName=AGENT-TOKEN)" \
    "AZURE_SUBSCRIPTION_ID=$SUB_ID" \
    "VM_RESOURCE_GROUP=rg-dystoppia-prod" \
    "VM_NAME=vm-dystoppia-dev" \
    "VM_AGENT_URL=http://<VM_PRIVATE_IP>:3333"
```

Dar acesso ao Key Vault:

```bash
az keyvault set-policy \
  --name kv-dystoppia-prod \
  --object-id $PRINCIPAL_ID \
  --secret-permissions get
```

Deploy do codigo:

```bash
cd slack-agent/azure-function
npm install
func azure functionapp publish func-dystoppia-slack
```

Opcionalmente, use o script de apoio para criar/configurar/publicar em uma passada:

```bash
cd slack-agent/scripts
chmod +x deploy-function.sh
VM_AGENT_URL=http://<VM_PRIVATE_IP>:3333 ./deploy-function.sh
```

Para desenvolvimento local, copie `local.settings.json.example` para `local.settings.json`.
O arquivo real fica ignorado por [azure-function/.gitignore](/C:/Users/bsall/OneDrive/Área%20de%20Trabalho/Dystoppia%201.0/KnowlegdeGame/slack-agent/azure-function/.gitignore).

## Fase 5: Configurar o Slack App

1. Acesse `https://api.slack.com/apps` e crie um app novo via `From scratch`.
2. Nomeie como `Dystoppia Dev Bot` e escolha o workspace.
3. Em `OAuth & Permissions`, adicione os scopes `chat:write`, `app_mentions:read`, `commands`, `channels:history` e `groups:history`.
4. Instale o app no workspace e copie o Bot User OAuth Token.
5. Em `Event Subscriptions`, habilite eventos e use `https://func-dystoppia-slack.azurewebsites.net/api/slack/events`.
6. Em `Subscribe to bot events`, adicione `app_mention`.
7. Em `Slash Commands`, crie `/vm` apontando para `https://func-dystoppia-slack.azurewebsites.net/api/slack/commands`.
8. Salve os secrets no Key Vault:

```bash
az keyvault secret set --vault-name kv-dystoppia-prod \
  --name SLACK-BOT-TOKEN --value "xoxb-..."

az keyvault secret set --vault-name kv-dystoppia-prod \
  --name SLACK-SIGNING-SECRET --value "..."

az keyvault secret set --vault-name kv-dystoppia-prod \
  --name AGENT-TOKEN --value "$(openssl rand -hex 32)"
```

## Fase 6: Preparar o repositorio na VM

Via SSH:

```bash
ssh azureuser@<VM_PUBLIC_IP>

git clone https://github.com/<user>/dystoppia.git /home/azureuser/dystoppia
cd /home/azureuser/dystoppia
npm install

git config user.email "bsallesp@gmail.com"
git config user.name "Bruno"

az login --identity
docker login dystoppiaacr.azurecr.io \
  --username dystoppiaacr \
  --password <ACR_PASSWORD>

echo "SLACK_BOT_TOKEN=xoxb-..." >> /home/azureuser/vm-agent/.env
sudo systemctl restart claude-agent
```

## Rede e seguranca

Para o MVP, ha duas opcoes para o `VM_AGENT_URL`:

- `IP privado`: usar peering ou conectividade interna entre a Function e a VNet
- `IP publico`: mais simples no comeco, abrindo a porta `3333` apenas para os outbound IPs da Function App

Para descobrir os outbound IPs da Function:

```bash
az functionapp show \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --query outboundIpAddresses -o tsv
```

Se optar por IP publico, atualize `VM_AGENT_URL` com o IP publico da VM e crie uma regra NSG que permita `3333/TCP` apenas para esses IPs.
O `provision-vm.sh` ja consegue fazer isso quando chamado com `ALLOW_FUNCTION_3333=true` e `FUNCTION_APP_NAME=func-dystoppia-slack`.

## Observacoes importantes

- a Function responde ao Slack em ate 3 segundos e continua o processamento em `setImmediate(...)`
- o agente da VM responde `202` imediatamente no `POST /task`
- o desligamento da VM usa `deallocate`, nao apenas `powerOff`
- `claude --dangerously-skip-permissions` foi mantido porque o fluxo eh nao interativo
- o historico do agente fica apenas em memoria, entao se o processo reiniciar o contexto do thread sera perdido

## Testes rapidos

VM agent:

```bash
cd slack-agent/vm-agent
npm test
```

Azure Function:

```bash
cd slack-agent/azure-function
npm test
```

## Smoke test

Use esta sequencia depois do deploy para validar o fluxo completo.

### 1. Validar a Function App

Verifique se a app existe e esta com identidade:

```bash
az functionapp show \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --query "{name:name,state:state,identity:identity.principalId,host:defaultHostName}"
```

Confira os app settings principais:

```bash
az functionapp config appsettings list \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --query "[?name=='VM_AGENT_URL' || name=='VM_NAME' || name=='VM_RESOURCE_GROUP' || name=='AZURE_SUBSCRIPTION_ID']"
```

### 2. Validar a VM

Veja o status atual:

```bash
az vm get-instance-view \
  --resource-group rg-dystoppia-prod \
  --name vm-dystoppia-dev \
  --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus" \
  -o tsv
```

Se a VM estiver ligada, teste o health check:

```bash
curl http://<VM_PRIVATE_IP>:3333/health
```

Ou, se estiver usando IP publico temporariamente:

```bash
curl http://<VM_PUBLIC_IP>:3333/health
```

### 3. Validar o servico do agente na VM

Via SSH:

```bash
ssh azureuser@<VM_PUBLIC_IP>
sudo systemctl status claude-agent --no-pager
journalctl -u claude-agent -n 100 --no-pager
cat /home/azureuser/vm-agent/.env
```

Pontos para conferir:

- `claude-agent` ativo (`active (running)`)
- `ANTHROPIC_API_KEY`, `AGENT_TOKEN` e `SLACK_BOT_TOKEN` presentes no `.env`
- `REPO_PATH=/home/azureuser/dystoppia`

### 4. Validar permissao da Function para controlar VM

```bash
PRINCIPAL_ID=$(az functionapp identity show \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --query principalId -o tsv)

az role assignment list \
  --assignee $PRINCIPAL_ID \
  --scope /subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-dystoppia-prod \
  --query "[].roleDefinitionName"
```

Espere ver `Virtual Machine Contributor`.

### 5. Validar acesso ao Key Vault

```bash
PRINCIPAL_ID=$(az functionapp identity show \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod \
  --query principalId -o tsv)

az keyvault show \
  --name kv-dystoppia-prod \
  --query properties.enableRbacAuthorization

az keyvault set-policy \
  --name kv-dystoppia-prod \
  --object-id $PRINCIPAL_ID \
  --secret-permissions get
```

Se sua configuracao usar RBAC em vez de access policy, troque por role assignment apropriado no escopo do Key Vault.

### 6. Validar slash command `/vm`

No Slack:

```text
/vm status
/vm on
/vm off
```

Resultado esperado:

- `/vm status` responde com o estado atual
- `/vm on` inicia a VM se ela estiver desligada
- `/vm off` faz `deallocate`

### 7. Validar evento de mensagem

No canal onde o app esta instalado:

```text
@Dystoppia Dev Bot diga "ok"
```

Fluxo esperado:

1. Slack responde sem erro visivel
2. Se a VM estiver desligada, o bot posta `VM desligada. Ligando agora (~90s)...`
3. Depois o bot posta `Entendido, processando...`
4. O agente responde no mesmo thread com a saida do Claude

### 8. Validar logs se algo falhar

Logs da Function:

```bash
az webapp log tail \
  --name func-dystoppia-slack \
  --resource-group rg-dystoppia-prod
```

Logs da VM:

```bash
ssh azureuser@<VM_PUBLIC_IP>
journalctl -u claude-agent -f
```

### 9. Teste manual do endpoint da VM

Se quiser isolar Function de Slack, chame o agente direto:

```bash
curl -X POST http://<VM_PRIVATE_IP>:3333/task \
  -H "Authorization: Bearer <AGENT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "message":"responda apenas ok",
    "thread_ts":"manual-test-1",
    "channel":"C123456",
    "slack_bot_token":"xoxb-..."
  }'
```

O retorno HTTP esperado e:

```json
{"ok":true,"status":"processing"}
```

### 10. Checklist final

- Function publicada
- Managed Identity criada
- Role `Virtual Machine Contributor` aplicada
- Key Vault acessivel pela Function
- VM agent ativo
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` e `AGENT_TOKEN` configurados
- `VM_AGENT_URL` aponta para o IP correto
- Porta `3333` acessivel somente pela origem prevista
- `/vm status` funciona
- `@bot ...` retorna resposta no thread
