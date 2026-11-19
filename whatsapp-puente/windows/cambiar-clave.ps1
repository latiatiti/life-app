# LIFE · cambiar la clave del puente de WhatsApp (si se filtró o para renovarla).
# 1) En LIFE: Ajustes > Seguridad > "Cambiar clave del puente" y copiá la clave nueva.
# 2) Doble clic en "Cambiar clave del puente.bat" (en la carpeta LIFE\whatsapp) y pegala.
# La guarda CIFRADA con tu usuario de Windows y reinicia el puente. Tu WhatsApp sigue vinculado.
$ErrorActionPreference = 'Stop'
$aca = Split-Path -Parent $MyInvocation.MyCommand.Path
$carpeta = $aca
if (-not (Test-Path (Join-Path $carpeta 'arrancar.ps1'))) {
  $disco = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { Join-Path "$($_.DeviceID)\" 'LIFE\whatsapp' } | Where-Object { Test-Path (Join-Path $_ 'arrancar.ps1') } | Select-Object -First 1
  if (-not $disco) { throw 'No encontré la carpeta LIFE\whatsapp. ¿Está instalado el puente?' }
  $carpeta = $disco
}
Write-Host ''
Write-Host '  LIFE · cambiar la clave del puente de WhatsApp' -ForegroundColor Cyan
Write-Host "  Carpeta: $carpeta"
$clave = (Read-Host '  Pegá la clave nueva (la de LIFE > Ajustes > Seguridad)').Trim()
if ($clave.Length -lt 32) { throw 'La clave es muy corta: copiala entera.' }
ConvertTo-SecureString $clave -AsPlainText -Force | ConvertFrom-SecureString | Set-Content (Join-Path $carpeta 'clave-puente.sec')
$clave = $null
Stop-ScheduledTask -TaskName 'LIFE WhatsApp' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*puente.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName 'LIFE WhatsApp'
Write-Host ''
Write-Host '  Listo: el puente ya usa la clave nueva. En LIFE > WhatsApp > Conexion fijate que diga "conectado".' -ForegroundColor Green
Read-Host '  Enter para cerrar'
