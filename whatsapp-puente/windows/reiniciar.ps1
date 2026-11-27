# LIFE · reinicia el puente de WhatsApp: cierra el que esté andando (aunque esté trabado) y arranca uno nuevo.
# Lo usa "Abrir WhatsApp de LIFE.bat". Deja lo que pasó en reiniciar.log (sin datos personales).
$ErrorActionPreference = 'SilentlyContinue'
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$registro = Join-Path $carpeta 'reiniciar.log'
function Anotar($t) { Add-Content $registro "$(Get-Date -Format s) $t" }

Anotar 'Reinicio pedido.'
schtasks /end /tn "LIFE WhatsApp" *> $null
$viejos = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $PID -and $_.CommandLine -and ($_.CommandLine -match 'puente\.mjs' -or $_.CommandLine -match 'arrancar\.ps1')
}
foreach ($p in $viejos) {
  Stop-Process -Id $p.ProcessId -Force
  if (Get-Process -Id $p.ProcessId) { Anotar "No pude cerrar $($p.Name) ($($p.ProcessId))." } else { Anotar "Cerré $($p.Name) ($($p.ProcessId))." }
}
Start-Sleep -Seconds 2

schtasks /run /tn "LIFE WhatsApp" *> $null
if ($LASTEXITCODE -eq 0) { Anotar 'Arranqué la tarea "LIFE WhatsApp".' }
else {
  $script = Join-Path $carpeta 'arrancar.ps1'
  Start-Process powershell.exe -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $carpeta -WindowStyle Hidden
  Anotar 'La tarea no arrancó; lo prendí directo.'
}
