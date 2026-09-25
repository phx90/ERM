[CmdletBinding()]
param(
  [string]$ProjectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$OutputDirectory = "",
  [ValidateRange(1, 3650)][int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Arquivo .env não encontrado em $Path"
  }
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
Import-DotEnv (Join-Path $project ".env")
$database = [Environment]::GetEnvironmentVariable("POSTGRES_DB", "Process")
$databaseUser = [Environment]::GetEnvironmentVariable("POSTGRES_USER", "Process")
if (-not $database) { $database = "compras" }
if (-not $databaseUser) { $databaseUser = "compras" }

if (-not $OutputDirectory) { $OutputDirectory = Join-Path $project "backups" }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $output "erm-backup-$stamp.zip"
$working = Join-Path $output (".working-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $working | Out-Null
$webWasRunning = $false

Push-Location $project
try {
  $postgresContainer = ([string](docker compose ps -q postgres)).Trim()
  $apiContainer = ([string](docker compose ps -q api)).Trim()
  if (-not $postgresContainer) {
    throw "O PostgreSQL do ERM não está em execução. Inicie o sistema com: docker compose up -d"
  }
  if (-not $apiContainer) {
    throw "A API do ERM não está em execução. Inicie o sistema com: docker compose up -d"
  }
  $webWasRunning = [bool](docker compose ps -q web)
  if ($webWasRunning) { docker compose stop web | Out-Null }

  $remoteDatabase = "/tmp/erm-database.dump"
  docker exec $postgresContainer pg_dump -U $databaseUser -d $database --format=custom --no-owner --no-acl --file=$remoteDatabase
  if ($LASTEXITCODE -ne 0) { throw "Falha ao exportar o banco de dados." }
  docker cp "${postgresContainer}:$remoteDatabase" (Join-Path $working "database.dump")
  docker exec $postgresContainer rm -f $remoteDatabase | Out-Null

  $remoteFiles = "/tmp/erm-files.tar.gz"
  docker exec $apiContainer tar -czf $remoteFiles -C /app attachments reports
  if ($LASTEXITCODE -ne 0) { throw "Falha ao exportar anexos e relatórios." }
  docker cp "${apiContainer}:$remoteFiles" (Join-Path $working "files.tar.gz")
  docker exec $apiContainer rm -f $remoteFiles | Out-Null

  $gitCommit = "indisponível"
  try {
    $currentCommit = ([string](git rev-parse HEAD 2>$null)).Trim()
    if ($currentCommit) { $gitCommit = $currentCommit }
  } catch {}
  [ordered]@{
    formatVersion = 1
    createdAt = (Get-Date).ToString("o")
    computer = $env:COMPUTERNAME
    database = $database
    gitCommit = $gitCommit
    contents = @("database.dump", "files.tar.gz")
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $working "manifest.json") -Encoding utf8

  Compress-Archive -Path (Join-Path $working "*") -DestinationPath $archive -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  Set-Content -LiteralPath "$archive.sha256" -Value $hash -Encoding ascii

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $names = $zip.Entries.Name
    foreach ($required in @("database.dump", "files.tar.gz", "manifest.json")) {
      if ($required -notin $names) { throw "Backup inválido: $required não foi incluído." }
    }
  } finally { $zip.Dispose() }

  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $output -Filter "erm-backup-*.zip" -File |
    Where-Object LastWriteTime -lt $cutoff |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
      $oldHash = "$($_.FullName).sha256"
      if (Test-Path -LiteralPath $oldHash) { Remove-Item -LiteralPath $oldHash -Force }
    }

  Write-Output "Backup completo e validado: $archive"
  Write-Output "SHA-256: $hash"
} finally {
  if ($webWasRunning) { docker compose start web | Out-Null }
  Pop-Location
  if (Test-Path -LiteralPath $working) { Remove-Item -LiteralPath $working -Recurse -Force }
}
