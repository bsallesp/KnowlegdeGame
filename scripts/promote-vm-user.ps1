[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$VmHost,
  [Parameter(Mandatory = $true)]
  [string]$Email,
  [string]$VmUser = "azureuser",
  [string]$SshKeyPath = "$HOME\\.ssh\\id_rsa"
)

$ErrorActionPreference = "Stop"

$escapedEmail = $Email.Replace("'", "''").ToLowerInvariant().Trim()

$remote = @"
set -e
cd /opt/dystoppia/current
docker compose --env-file .env.vm -f docker-compose.vm.yml exec -T db psql -v ON_ERROR_STOP=1 -U dystoppia -d dystoppia <<'SQL'
UPDATE "User"
SET
  role = 'master',
  status = 'active',
  "isInternal" = true,
  "emailVerified" = true
WHERE lower(email) = '$escapedEmail';

SELECT id, email, role, status, "isInternal", "emailVerified"
FROM "User"
WHERE lower(email) = '$escapedEmail';
SQL
"@

ssh -i $SshKeyPath -o StrictHostKeyChecking=no "${VmUser}@${VmHost}" "bash -lc ""$remote"""

if ($LASTEXITCODE -ne 0) {
  throw "Failed to promote user."
}

Write-Host "Promotion command completed for $Email on $VmHost" -ForegroundColor Green
