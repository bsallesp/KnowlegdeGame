# Deploy manual: build Docker, push to ACR, atualiza App Service Linux container.
# O az CLI no Windows as vezes falha com ConnectionReset; este script reintenta.
#
# Uso (na raiz do repo ou de qualquer lugar):
#   .\scripts\deploy-manual.ps1
#   .\scripts\deploy-manual.ps1 -SkipBuild   # so push + webapp (imagem ja existe localmente)

[CmdletBinding()]
param(
	[string]$AcrName = "dystoppiaacr",
	[string]$AppName = "dystoppia-prod-app",
	[string]$ResourceGroup = "rg-dystoppia-prod",
	[string]$ImageName = "dystoppia",
	[string]$NextPublicAppUrl = "https://www.dystoppia.com",
	[bool]$EnableResearchExecutor = $false,
	[int]$MaxAttempts = 6,
	[int]$DelaySeconds = 10,
	[switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "dystoppia"

function Invoke-WithRetry {
	param([string]$Label, [scriptblock]$Action)
	for ($i = 1; $i -le $MaxAttempts; $i++) {
		Write-Host "[$Label] tentativa $i/$MaxAttempts"
		try {
			& $Action
			if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
			Write-Host "[$Label] OK" -ForegroundColor Green
			return
		} catch {
			Write-Host "[$Label] falhou: $_" -ForegroundColor Yellow
			if ($i -eq $MaxAttempts) { throw }
			Start-Sleep -Seconds $DelaySeconds
		}
	}
}

Set-Location $repoRoot
$tag = (git rev-parse --short=7 HEAD).Trim()
$registry = "${AcrName}.azurecr.io"
$fullImage = "${registry}/${ImageName}:${tag}"

Write-Host "Tag: $tag | Imagem: $fullImage" -ForegroundColor Cyan

Invoke-WithRetry -Label "az account show" -Action { az account show | Out-Host; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

if (-not $SkipBuild) {
	Set-Location $appDir
	$env:NEXT_TELEMETRY_DISABLED = "1"
	Write-Host "docker build..." -ForegroundColor Cyan
	docker build -t $fullImage -t "${registry}/${ImageName}:latest" .
	if ($LASTEXITCODE -ne 0) { throw "docker build falhou" }
	Set-Location $repoRoot
}

Invoke-WithRetry -Label "az acr login" -Action { az acr login --name $AcrName }
Invoke-WithRetry -Label "docker push (tag)" -Action { docker push $fullImage }
Invoke-WithRetry -Label "docker push (latest)" -Action { docker push "${registry}/${ImageName}:latest" }

$acrUser = $null
$acrPass = $null
for ($i = 1; $i -le $MaxAttempts; $i++) {
	$raw = az acr credential show --name $AcrName -o json 2>&1
	if ($LASTEXITCODE -eq 0) {
		$cred = $raw | ConvertFrom-Json
		$acrUser = $cred.username
		$acrPass = $cred.passwords[0].value
		break
	}
	Start-Sleep -Seconds $DelaySeconds
}
if (-not $acrUser) { throw "Nao foi possivel obter credenciais do ACR (az acr credential show)." }

Invoke-WithRetry -Label "webapp registry appsettings" -Action {
	az webapp config appsettings set `
		--name $AppName `
		--resource-group $ResourceGroup `
		--settings `
			"DOCKER_REGISTRY_SERVER_URL=https://$registry" `
			"DOCKER_REGISTRY_SERVER_USERNAME=$acrUser" `
			"DOCKER_REGISTRY_SERVER_PASSWORD=$acrPass" `
			"NEXT_PUBLIC_APP_URL=$NextPublicAppUrl" `
			"DYSTOPPIA_ENABLE_RESEARCH_EXECUTOR=$EnableResearchExecutor"
}
Invoke-WithRetry -Label "webapp container image" -Action {
	az webapp config container set `
		--name $AppName `
		--resource-group $ResourceGroup `
		--container-image-name $fullImage `
		--container-registry-url "https://$registry" `
		--container-registry-user $acrUser `
		--container-registry-password $acrPass
}

Invoke-WithRetry -Label "webapp restart" -Action { az webapp restart --name $AppName --resource-group $ResourceGroup }

$fqdn = (az webapp show --name $AppName --resource-group $ResourceGroup --query "defaultHostName" -o tsv).Trim()
Write-Host ""
Write-Host "Host: https://$fqdn" -ForegroundColor Green
Write-Host "Health: https://$fqdn/api/health" -ForegroundColor Green
Write-Host "Se ainda aparecer Application Error, veja Log stream no Portal (erros de prisma migrate / DATABASE_URL)." -ForegroundColor DarkYellow
