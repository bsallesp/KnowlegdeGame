[CmdletBinding()]
param(
  [string]$VmHost,
  [string]$VmUser = "azureuser",
  [string]$SshKeyPath = "$HOME\\.ssh\\id_rsa",
  [string]$WorkDir = "/opt/dystoppia",
  [string]$EnvFilePath,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

if (-not $VmHost) {
  throw "Use -VmHost with the VM DNS name or IP."
}

if (-not $EnvFilePath) {
  throw "Use -EnvFilePath with the local .env.vm file to upload."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "dystoppia"
$tempTar = Join-Path $env:TEMP "dystoppia-vm-src.tar.gz"

if (-not $SkipTests) {
  Push-Location $appDir
  try {
    npm test -- __tests__/api/auth/login.test.ts __tests__/api/auth/verify-email.test.ts __tests__/api/auth/reset-password.test.ts __tests__/api/users.test.ts
    if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
  } finally {
    Pop-Location
  }
}

if (Test-Path $tempTar) {
  Remove-Item -LiteralPath $tempTar -Force
}

Push-Location $repoRoot
try {
  tar -czf $tempTar `
    --exclude ".git" `
    --exclude "dystoppia/node_modules" `
    --exclude "dystoppia/.next" `
    --exclude "dystoppia/coverage" `
    dystoppia
  if ($LASTEXITCODE -ne 0) { throw "Failed to create source tarball." }
} finally {
  Pop-Location
}

ssh -i $SshKeyPath -o StrictHostKeyChecking=no "${VmUser}@${VmHost}" "sudo mkdir -p $WorkDir && sudo chown -R $VmUser`:$VmUser $WorkDir"
if ($LASTEXITCODE -ne 0) { throw "Failed to prepare remote directory." }

scp -i $SshKeyPath -o StrictHostKeyChecking=no $tempTar "${VmUser}@${VmHost}:$WorkDir/dystoppia-vm-src.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "Failed to upload source tarball." }

scp -i $SshKeyPath -o StrictHostKeyChecking=no $EnvFilePath "${VmUser}@${VmHost}:$WorkDir/.env.vm"
if ($LASTEXITCODE -ne 0) { throw "Failed to upload environment file." }

$remoteCommand = @"
set -e
cd $WorkDir
rm -rf current
mkdir -p current
tar -xzf dystoppia-vm-src.tar.gz -C current --strip-components=1
cp .env.vm current/.env.vm
cd current
docker compose --env-file .env.vm -f docker-compose.vm.yml down || true
docker compose --env-file .env.vm -f docker-compose.vm.yml up -d --build
"@

ssh -i $SshKeyPath -o StrictHostKeyChecking=no "${VmUser}@${VmHost}" $remoteCommand
if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed." }

Write-Host "Deploy completed on $VmHost" -ForegroundColor Green
