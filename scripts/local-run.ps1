[CmdletBinding()]
param(
	[int]$Port = 3000,
	[string]$AppDir = "dystoppia"
)

$ErrorActionPreference = "Stop"

# Resolve app directory relative to this script location.
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedAppDir = Join-Path $repoRoot $AppDir

if (-not (Test-Path $resolvedAppDir)) {
	throw "Diretorio do app nao encontrado: $resolvedAppDir"
}

Write-Host "[local-run] Procurando processo na porta $Port..." -ForegroundColor Cyan

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
	Select-Object -ExpandProperty OwningProcess -Unique

$lockPid = $null
$lockPort = $null
$lockFile = Join-Path $resolvedAppDir ".next\\dev\\lock"

if (Test-Path $lockFile) {
	try {
		$lockInfo = Get-Content -Raw $lockFile | ConvertFrom-Json
		$lockPid = $lockInfo.pid
		$lockPort = $lockInfo.port
		Write-Host "[local-run] Lock do Next detectado: PID $lockPid, porta $lockPort" -ForegroundColor DarkCyan
	}
	catch {
		$message = $_.Exception.Message
		if ($message -like "*being used by another process*") {
			Write-Host "[local-run] Lock do Next em uso no momento; seguindo com deteccao por processo." -ForegroundColor DarkGray
		}
		else {
			Write-Warning "Nao foi possivel ler lock do Next: $message"
		}
	}
}

$nextDevPids = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
	Where-Object {
		$_.Name -ieq "node.exe" -and
		$_.CommandLine -like "*next*dev*" -and
		$_.CommandLine -like "*$resolvedAppDir*"
	} |
	Select-Object -ExpandProperty ProcessId -Unique

$lockPortListeners = @()
if ($lockPort) {
	$lockPortListeners = Get-NetTCPConnection -LocalPort $lockPort -State Listen -ErrorAction SilentlyContinue |
		Select-Object -ExpandProperty OwningProcess -Unique
}

$targetPids = @(
	@($listeners)
	@($nextDevPids)
	@($lockPid)
	@($lockPortListeners)
) |
	Where-Object { $_ -ne $null -and $_ -ne "" } |
	ForEach-Object { [int]$_ } |
	Sort-Object -Unique

if ($targetPids) {
	foreach ($processId in $targetPids) {
		if ($processId -gt 0) {
			try {
				$proc = Get-Process -Id $processId -ErrorAction Stop
				Write-Host "[local-run] Encerrando PID $processId ($($proc.ProcessName))" -ForegroundColor Yellow
				Stop-Process -Id $processId -Force -ErrorAction Stop
			}
			catch {
				Write-Warning "Nao foi possivel encerrar PID ${processId}: $($_.Exception.Message)"
			}
		}
	}

	Start-Sleep -Milliseconds 700
}
else {
	Write-Host "[local-run] Nenhum processo do app encontrado para encerrar." -ForegroundColor DarkGray
}

Write-Host "[local-run] Iniciando app em $resolvedAppDir..." -ForegroundColor Green

Push-Location $resolvedAppDir
try {
	npm run dev
}
finally {
	Pop-Location
}
