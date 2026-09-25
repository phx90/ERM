[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupFile,
  [string]$ProjectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Import-DotEnv([string]$Path) {
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

$project = (Resolve-Path -LiteralPath $ProjectDirectory).Path
$backup = (Resolve-Path -LiteralPath $BackupFile).Path
if (-not $Force) {
  $confirmation = Read-Host "A restauração substituirá o banco atual. Digite RESTAURAR para continuar"
  if ($confirmation -ne "RESTAURAR") { throw "Restauração cancelada." }
}

$hashFile = "$backup.sha256"
if (Test-Path -LiteralPath $hashFile) {
  $expected = (Get-Content -LiteralPath $hashFile -Raw).Trim()
  $actual = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
  if ($expected -ne $actual) { throw "O arquivo de backup falhou na verificação SHA-256." }
}

Import-DotEnv (Join-Path $project ".env")
$database = [Environment]::GetEnvironmentVariable("POSTGRES_DB", "Process")
$databaseUser = [Environment]::GetEnvironmentVariable("POSTGRES_USER", "Process")
if (-not $database) { $database = "compras" }
if (-not $databaseUser) { $databaseUser = "compras" }
$working = Join-Path ([IO.Path]::GetTempPath()) ("erm-restore-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $working | Out-Null

try {
  Expand-Archive -LiteralPath $backup -DestinationPath $working
  foreach ($required in @("database.dump", "files.tar.gz", "manifest.json")) {
    if (-not (Test-Path -LiteralPath (Join-Path $working $required))) {
      throw "Backup inválido: $required não encontrado."
    }
  }

  Push-Location $project
  try {
    docker compose up -d postgres
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível iniciar o PostgreSQL." }
    $postgresContainer = ([string](docker compose ps -q postgres)).Trim()
    if (-not $postgresContainer) { throw "Contêiner PostgreSQL não encontrado." }

    docker compose stop api web | Out-Null
    docker cp (Join-Path $working "database.dump") "${postgresContainer}:/tmp/erm-database.dump"
    docker exec $postgresContainer pg_restore -U $databaseUser -d $database --clean --if-exists --no-owner --no-acl --exit-on-error /tmp/erm-database.dump
    if ($LASTEXITCODE -ne 0) { throw "Falha ao restaurar o banco de dados." }
    docker exec $postgresContainer rm -f /tmp/erm-database.dump | Out-Null

    docker compose up -d api
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível iniciar a API." }
    $apiContainer = ([string](docker compose ps -q api)).Trim()
    if (-not $apiContainer) { throw "Contêiner da API não encontrado." }
    docker cp (Join-Path $working "files.tar.gz") "${apiContainer}:/tmp/erm-files.tar.gz"
    docker exec $apiContainer tar -xzf /tmp/erm-files.tar.gz -C /app
    docker exec $apiContainer rm -f /tmp/erm-files.tar.gz | Out-Null
    docker compose up -d
    Write-Output "Restauração concluída a partir de: $backup"
  } catch {
    docker compose up -d | Out-Null
    throw
  } finally { Pop-Location }
} finally {
  if (Test-Path -LiteralPath $working) { Remove-Item -LiteralPath $working -Recurse -Force }
}
