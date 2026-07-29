param([string]$OutputDirectory = ".\backups")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path (Resolve-Path $OutputDirectory) "compras-$stamp.sql"
docker compose exec -T postgres pg_dump -U $env:POSTGRES_USER -d $env:POSTGRES_DB --clean --if-exists | Set-Content -Encoding utf8 $file
Write-Output "Backup criado: $file"
