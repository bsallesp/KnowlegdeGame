#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Uso: ./setup-vm.sh <ANTHROPIC_KEY> <AGENT_TOKEN>"
  exit 1
fi

ANTHROPIC_API_KEY="$1"
AGENT_TOKEN="$2"
VM_USER="azureuser"
VM_HOME="/home/${VM_USER}"
VM_AGENT_DIR="${VM_HOME}/vm-agent"
REPO_DIR="${VM_HOME}/dystoppia"

echo "Atualizando pacotes..."
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y

echo "Instalando Node.js 22 via NodeSource..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

echo "Instalando git, docker.io e dependencias basicas..."
sudo apt install -y git docker.io ca-certificates curl gnupg lsb-release apt-transport-https
sudo usermod -aG docker "$VM_USER" || true

echo "Instalando Azure CLI via repositorio oficial da Microsoft..."
sudo mkdir -p /etc/apt/keyrings
curl -sLS https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | sudo tee /etc/apt/keyrings/microsoft.gpg >/dev/null
AZ_DIST_CODENAME="$(lsb_release -cs)"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ ${AZ_DIST_CODENAME} main" | sudo tee /etc/apt/sources.list.d/azure-cli.list
sudo apt update
sudo apt install -y azure-cli

echo "Instalando Claude Code globalmente..."
sudo npm install -g @anthropic-ai/claude-code

echo "Preparando diretorios do projeto..."
mkdir -p "$REPO_DIR"
mkdir -p "$VM_AGENT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/package.json" && -f "${SCRIPT_DIR}/server.js" && -f "${SCRIPT_DIR}/claude-runner.js" ]]; then
  if [[ "$SCRIPT_DIR" != "$VM_AGENT_DIR" ]]; then
    cp "${SCRIPT_DIR}/package.json" "${SCRIPT_DIR}/server.js" "${SCRIPT_DIR}/claude-runner.js" "$VM_AGENT_DIR/"
  else
    echo "Arquivos do vm-agent ja estao no diretorio final, pulando copia."
  fi
fi

echo "Instalando dependencias do vm-agent..."
cd "$VM_AGENT_DIR"
npm install

echo "Criando arquivo .env do agente..."
cat > "${VM_AGENT_DIR}/.env" <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
AGENT_TOKEN=${AGENT_TOKEN}
SLACK_BOT_TOKEN=placeholder
REPO_PATH=${REPO_DIR}
PORT=3333
EOF

sudo tee /etc/systemd/system/claude-agent.service >/dev/null <<EOF
[Unit]
Description=Claude Code Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${VM_USER}
WorkingDirectory=${VM_AGENT_DIR}
EnvironmentFile=${VM_AGENT_DIR}/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

echo "Habilitando e iniciando o servico systemd..."
sudo systemctl daemon-reload
sudo systemctl enable claude-agent
sudo systemctl start claude-agent
sudo systemctl status claude-agent --no-pager

echo "Agente rodando em http://localhost:3333"
