# LIFE · arranca el puente de WhatsApp con las claves guardadas (cifradas con tu usuario de Windows).
# Lo corre la tarea "LIFE WhatsApp" al entrar a Windows. Si node se cae, vuelve a arrancar a los 10 s.
$ErrorActionPreference = 'Stop'
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $carpeta
function Leer($nombre) {
  $s = Get-Content (Join-Path $carpeta $nombre) | ConvertTo-SecureString
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
$env:WA_PUENTE_CLAVE = Leer 'clave-puente.sec'
$env:WA_CIFRADO = Leer 'cifrado.sec'
$env:LIFE_FUNCION = (Get-Content (Join-Path $carpeta 'funcion.txt') -Raw).Trim()
$env:DATOS = Join-Path $carpeta 'datos'
$log = Join-Path $carpeta 'puente.log'
$ErrorActionPreference = 'Continue'
while ($true) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item $log "$log.anterior" -Force }
  cmd /c "node puente.mjs >> puente.log 2>&1"
  Add-Content $log "$(Get-Date -Format s) El puente se cerró; vuelvo a arrancar en 10 s."
  Start-Sleep 10
}
