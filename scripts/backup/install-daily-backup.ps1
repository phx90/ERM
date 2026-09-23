[CmdletBinding()]
param(
  [string]$ProjectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$Time = "02:00",
  [ValidateRange(1, 3650)][int]$RetentionDays = 30,
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$project = (Resolve-Path -LiteralPath $ProjectDirectory).Path
$backupScript = Join-Path $project "scripts\backup\backup.ps1"
if (-not (Test-Path -LiteralPath $backupScript)) { throw "Script de backup não encontrado." }

$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ProjectDirectory "{1}" -RetentionDays {2}' -f $backupScript, $project, $RetentionDays
if ($OutputDirectory) { $arguments += ' -OutputDirectory "{0}"' -f $OutputDirectory }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName "ERM-Backup-Diario" -Description "Backup diário completo do ERM" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Output "Tarefa ERM-Backup-Diario instalada para $Time, com retenção de $RetentionDays dias."
Write-Output "O usuário precisa estar conectado e o Docker Desktop em execução."
