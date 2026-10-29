# LIFE · instalador de la copia en tu compu (Windows).
# 1) Elige el disco con más espacio libre y crea la carpeta LIFE ahí.
# 2) Guarda (cifrado) el link de tu conector de "solo lectura".
# 3) Programa la copia todos los días a las 22 h y al prender la compu.
# 4) Crea en el escritorio: "LIFE" (abre la app) y "LIFE respaldo" (hace una copia ya y abre la carpeta).

$ErrorActionPreference = 'Stop'
$aca = Split-Path -Parent $MyInvocation.MyCommand.Path
$APP = 'https://life-app-latiatiti.netlify.app'

Write-Host ''
Write-Host '  LIFE · copia de tus datos en esta compu' -ForegroundColor Cyan
Write-Host ''

$disco = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Sort-Object FreeSpace -Descending | Select-Object -First 1
$carpeta = Join-Path "$($disco.DeviceID)\" 'LIFE'
Write-Host "  Disco elegido: $($disco.DeviceID) ($([math]::Round($disco.FreeSpace / 1GB)) GB libres)"
New-Item -ItemType Directory -Force -Path (Join-Path $carpeta 'respaldos') | Out-Null
Copy-Item (Join-Path $aca 'respaldo.ps1') $carpeta -Force

Write-Host ''
Write-Host '  En LIFE: Ajustes > Conexion con Claude > permiso "Solo puede leer" > Crear.'
Write-Host '  Copia el link que aparece y pegalo aca (clic derecho pega):'
$link = (Read-Host '  Link').Trim()
if ($link -notmatch '^https://.+(life-mcp|/mcp)\?k=life_') { throw 'Ese no parece el link del conector de LIFE (tiene que terminar en mcp?k=life_...).' }
ConvertTo-SecureString $link -AsPlainText -Force | ConvertFrom-SecureString | Set-Content (Join-Path $carpeta 'clave.txt')

$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$script = Join-Path $carpeta 'respaldo.ps1'
$accion = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$cuando = @((New-ScheduledTaskTrigger -Daily -At 22:00), (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME))
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'LIFE respaldo' -Action $accion -Trigger $cuando -Settings $opciones -Description 'Copia diaria de los datos de LIFE' -Force | Out-Null

$escritorio = [Environment]::GetFolderPath('Desktop')
Set-Content -Path (Join-Path $escritorio 'LIFE.url') -Value "[InternetShortcut]`r`nURL=$APP`r`n"
$wsh = New-Object -ComObject WScript.Shell
$acceso = $wsh.CreateShortcut((Join-Path $escritorio 'LIFE respaldo.lnk'))
$acceso.TargetPath = $ps
$acceso.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"& '$script' -ver; Start-Process '$carpeta\respaldos'; Start-Sleep 4`""
$acceso.WorkingDirectory = $carpeta
$acceso.IconLocation = "$env:WINDIR\System32\imageres.dll,30"
$acceso.Description = 'Hace una copia de LIFE ahora y abre la carpeta'
$acceso.Save()

Write-Host ''
Write-Host '  Haciendo la primera copia...'
& $script -ver
Write-Host ''
Write-Host "  Listo. Tus copias quedan en $carpeta\respaldos (se guardan los ultimos 90 dias)." -ForegroundColor Green
Write-Host '  En el escritorio tenes "LIFE" (la app) y "LIFE respaldo" (copia ya y abre la carpeta).'
Write-Host '  Para volver a cargar una copia: LIFE > Ajustes > Importar respaldo > elegir el archivo.'
Read-Host '  Enter para cerrar'
