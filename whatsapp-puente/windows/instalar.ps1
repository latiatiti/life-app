# LIFE · instalador del puente de WhatsApp en tu compu (Windows).
# 1) Se fija que esté Node (si no está, lo instala con winget).
# 2) Copia el puente a la carpeta LIFE\whatsapp (en el disco con más espacio) e instala lo que necesita.
# 3) Guarda las claves CIFRADAS con tu usuario de Windows (nadie más las puede leer):
#    - la del puente (viene en clave-puente.txt al lado de este archivo, o la pegás),
#    - la que cifra tu sesión de WhatsApp (se crea acá y no sale nunca de esta compu).
# 4) Lo deja arrancando solo cada vez que entrás a Windows, y si se cae vuelve a arrancar.

$ErrorActionPreference = 'Stop'
$aca = Split-Path -Parent $MyInvocation.MyCommand.Path
$origen = Split-Path -Parent $aca   # carpeta con puente.mjs y package.json
if (-not (Test-Path (Join-Path $origen 'puente.mjs'))) { $origen = $aca }
$FUNCION = 'https://jxnlgszmywoebjjpacod.supabase.co/functions/v1/whatsapp-puente'

Write-Host ''
Write-Host '  LIFE · WhatsApp en esta compu' -ForegroundColor Cyan
Write-Host ''

# 1) Node
function VersionNode { try { [int]((node -v) -replace '^v(\d+).*', '$1') } catch { 0 } }
if ((VersionNode) -lt 20) {
  Write-Host '  Instalando Node.js (el motor que corre el puente)...'
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent | Out-Null
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if ((VersionNode) -lt 20) { throw 'No se pudo instalar Node.js. Instalalo desde https://nodejs.org (LTS) y volvé a abrir este instalador.' }
}
Write-Host "  Node $(node -v) listo."

# 2) Carpeta y dependencias
$disco = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Sort-Object FreeSpace -Descending | Select-Object -First 1
$carpeta = Join-Path "$($disco.DeviceID)\" 'LIFE\whatsapp'
New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
foreach ($f in 'puente.mjs', 'package.json', 'package-lock.json') { Copy-Item (Join-Path $origen $f) $carpeta -Force }
foreach ($f in 'arrancar.ps1', 'cambiar-clave.ps1', 'Cambiar clave del puente.bat') { Copy-Item (Join-Path $aca $f) $carpeta -Force }
Write-Host "  Carpeta: $carpeta"
Write-Host '  Bajando lo que necesita (un minuto)...'
Push-Location $carpeta
npm ci --omit=dev --no-audit --no-fund --loglevel=error
Pop-Location
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar lo que necesita el puente (¿hay internet?).' }

# 3) Claves cifradas con tu usuario de Windows (DPAPI)
function Guardar($nombre, $valor) {
  ConvertTo-SecureString $valor -AsPlainText -Force | ConvertFrom-SecureString | Set-Content (Join-Path $carpeta $nombre)
}
$archivoClave = Join-Path $aca 'clave-puente.txt'
if (Test-Path $archivoClave) { $clave = (Get-Content $archivoClave -Raw).Trim() }
else { $clave = (Read-Host '  Pegá la clave del puente (te la da Claude en LIFE X CLAUDE)').Trim() }
if ($clave.Length -lt 32) { throw 'La clave del puente es muy corta.' }
Guardar 'clave-puente.sec' $clave
Set-Content (Join-Path $carpeta 'funcion.txt') $FUNCION
if (-not (Test-Path (Join-Path $carpeta 'cifrado.sec'))) {
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Guardar 'cifrado.sec' (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}
# Que solo tu usuario pueda entrar a la carpeta.
icacls $carpeta /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" /grant:r 'SYSTEM:(OI)(CI)F' | Out-Null

# 4) Arranca solo al entrar a Windows y se reinicia si se cae
$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$script = Join-Path $carpeta 'arrancar.ps1'
$accion = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $carpeta
$cuando = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'LIFE WhatsApp' -Action $accion -Trigger $cuando -Settings $opciones -Description 'Mantiene tu WhatsApp conectado a LIFE' -Force | Out-Null
Start-ScheduledTask -TaskName 'LIFE WhatsApp'

Write-Host ''
$r = Read-Host '  ¿Querés que la compu NO se suspenda sola mientras está enchufada? (así el puente sigue andando) [S/N]'
if ($r -match '^[sS]') { powercfg /change standby-timeout-ac 0; Write-Host '  Hecho: enchufada no se suspende (la pantalla se puede apagar igual).' }

Write-Host ''
Write-Host '  Listo. El puente ya está andando.' -ForegroundColor Green
Write-Host '  Ahora en LIFE: WhatsApp > Conexión > "Conectar mi WhatsApp" y escaneá el QR con el celular.'
Write-Host "  Registro (por si algo falla): $carpeta\puente.log"
Write-Host '  Para sacarlo: borrar la tarea "LIFE WhatsApp" del Programador de tareas y la carpeta.'
if (Test-Path $archivoClave) { Remove-Item $archivoClave -Force; Write-Host '  (Borré clave-puente.txt: ya quedó guardada cifrada.)' }
Read-Host '  Enter para cerrar'
