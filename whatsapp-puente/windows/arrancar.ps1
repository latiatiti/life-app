﻿# LIFE · arranca el puente de WhatsApp con las claves guardadas (cifradas con tu usuario de Windows).
# Lo corre la tarea "LIFE WhatsApp" al entrar a Windows. Corre en segundo plano, sin ventanas,
# con un ícono en los íconos ocultos (al lado del reloj): verde = andando, naranja = arrancando de nuevo.
# Si node se cae, vuelve a arrancar a los 10 s.
$ErrorActionPreference = 'Stop'

# Esconder la ventana de PowerShell (si alguien la cierra, se apaga el puente).
try {
  Add-Type -Name Ventana -Namespace Life -MemberDefinition '[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);'
  [Life.Ventana]::ShowWindow([Life.Ventana]::GetConsoleWindow(), 0) | Out-Null
} catch { }

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

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Punto($color) {
  $bmp = New-Object System.Drawing.Bitmap 16, 16
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $color), 2, 2, 12, 12)
  $g.Dispose()
  [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$verde = Punto ([System.Drawing.Color]::FromArgb(62, 230, 160))
$naranja = Punto ([System.Drawing.Color]::FromArgb(255, 160, 40))

$script:node = $null
function Arrancar {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item $log "$log.anterior" -Force }
  $script:node = Start-Process cmd.exe -ArgumentList '/c node puente.mjs >> puente.log 2>&1' -WorkingDirectory $carpeta -WindowStyle Hidden -PassThru
}
function Parar {
  if ($script:node -and -not $script:node.HasExited) { taskkill /PID $script:node.Id /T /F | Out-Null }
}

$icono = New-Object System.Windows.Forms.NotifyIcon
$icono.Icon = $verde
$icono.Text = 'LIFE WhatsApp: andando'
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menu.Items.Add('WhatsApp de LIFE: andando en segundo plano').Enabled = $false
$menu.Items.Add('Ver registro', $null, { Start-Process notepad.exe $log }) | Out-Null
$menu.Items.Add('Reiniciar el puente', $null, { Parar }) | Out-Null
$icono.ContextMenuStrip = $menu
$icono.Visible = $true

Arrancar
$script:caido = $null
$reloj = New-Object System.Windows.Forms.Timer
$reloj.Interval = 2000
$reloj.Add_Tick({
  if ($script:node.HasExited) {
    if (-not $script:caido) {
      $script:caido = Get-Date
      Add-Content $log "$(Get-Date -Format s) El puente se cerró; vuelvo a arrancar en 10 s."
      $icono.Icon = $naranja; $icono.Text = 'LIFE WhatsApp: arrancando de nuevo'
    } elseif (((Get-Date) - $script:caido).TotalSeconds -ge 10) {
      $script:caido = $null
      Arrancar
      $icono.Icon = $verde; $icono.Text = 'LIFE WhatsApp: andando'
    }
  }
})
$reloj.Start()

try { [System.Windows.Forms.Application]::Run() }
finally { $icono.Visible = $false; Parar }
