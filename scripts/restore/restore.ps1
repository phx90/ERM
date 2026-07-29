param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = "Stop"
$resolved = (Resolve-Path -LiteralPath $BackupFile).Path
Get-Content -Raw -LiteralPath $resolved | docker compose exec -T postgres psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB
Write-Output "Restauração concluída a partir de: $resolved"
