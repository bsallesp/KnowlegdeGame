# Control Web (Static)

Static frontend (fora da VM) para ligar/desligar a VM e, no futuro, interagir com recursos distribuídos.

## Como funciona

- Autenticação via Azure Entra ID (MSAL).
- O browser pega um token de ARM (`https://management.azure.com/user_impersonation`).
- As chamadas de start/stop/status vão direto pro Azure Management REST API.

Isso mantém o painel disponível mesmo se a VM estiver desligada.

## Pré-requisitos (uma vez)

1. Criar um App Registration (SPA) no Entra ID.
2. Configurar Redirect URIs:
   - Dev: `http://localhost:5173`
   - Prod: o domínio onde você publicar (ex.: `https://control.seudominio.com`)
3. Dar RBAC pro(s) usuário(s) que vão operar:
   - no mínimo `Contributor` no scope do resource group/VM (ex.: `rg-dystoppia-prod`).

## Config

Copie `control-web/.env.example` para `control-web/.env.local` e preencha.

## Rodar local

```bash
cd control-web
npm install
npm run dev
```

## Build estático

```bash
cd control-web
npm run build
```

Saída em `control-web/dist/` (publique em qualquer hosting estático).
