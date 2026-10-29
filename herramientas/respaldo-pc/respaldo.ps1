# LIFE · copia de tus datos en esta compu.
# Baja todas tus tablas de la nube con tu clave de "solo lectura" del conector y las guarda en un archivo
# con el mismo formato que "Descargar respaldo" de Ajustes (se puede volver a importar desde ahí).
# Lo corre solo la tarea programada "LIFE respaldo" (todos los días y al prender la compu) o el acceso directo.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ver = $args -contains '-ver'   # el acceso directo lo pide para mostrar el resultado
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$destino = Join-Path $carpeta 'respaldos'
$registro = Join-Path $carpeta 'respaldo.log'
New-Item -ItemType Directory -Force -Path $destino | Out-Null

function Anotar($texto) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm')  $texto" | Add-Content -Path $registro -Encoding UTF8 }

# El link del conector está guardado cifrado para tu usuario de Windows (nadie más lo puede leer).
$cifrado = Get-Content (Join-Path $carpeta 'clave.txt') -Raw
$seguro = ConvertTo-SecureString $cifrado.Trim()
$link = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))

$script:n = 0
function Llamar($herramienta, $argumentos) {
  $script:n++
  $cuerpo = @{ jsonrpc = '2.0'; id = $script:n; method = 'tools/call'; params = @{ name = $herramienta; arguments = $argumentos } } | ConvertTo-Json -Depth 10 -Compress
  $resp = Invoke-WebRequest -UseBasicParsing -Uri $link -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) -TimeoutSec 120
  $r = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) | ConvertFrom-Json
  if ($r.error) { throw "LIFE: $($r.error.message)" }
  $texto = $r.result.content[0].text
  if ($r.result.isError) { throw "LIFE ($herramienta): $texto" }
  return ($texto | ConvertFrom-Json)
}

try {
  $info = Llamar 'que_hay' @{}
  $datos = [ordered]@{}
  $total = 0
  foreach ($t in $info.tablas) {
    $filas = [ordered]@{}
    $desde = $null
    while ($true) {
      $pedido = @{ tabla = $t.tabla; orden = 'created_at'; limite = 500 }
      if ($desde) { $pedido.desde = $desde }
      $pagina = Llamar 'leer' $pedido
      $nuevas = 0
      foreach ($f in $pagina.filas) { if (-not $filas.Contains($f.id)) { $filas[$f.id] = $f; $nuevas++ } }
      if ($pagina.filas.Count -lt 500 -or $nuevas -eq 0) { break }
      $ult = $pagina.filas[-1].created_at
      $desde = if ($ult -is [datetime]) { $ult.ToString('yyyy-MM-dd') } else { ([string]$ult).Substring(0, 10) }
    }
    $datos[$t.tabla] = @($filas.Values)
    $total += $filas.Count
  }
  $hoy = Get-Date -Format 'yyyy-MM-dd'
  $archivo = Join-Path $destino "life-respaldo-$hoy.json"
  $salida = [ordered]@{ app = 'LIFE'; version = 1; fecha = $hoy; datos = $datos } | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($archivo, $salida, [Text.UTF8Encoding]::new($false))
  Copy-Item $archivo (Join-Path $destino 'ultimo.json') -Force
  # Guarda los últimos 90 días.
  Get-ChildItem $destino -Filter 'life-respaldo-*.json' | Sort-Object Name -Descending | Select-Object -Skip 90 | Remove-Item -Force
  Anotar "OK: $total registros en $($info.tablas.Count) tablas -> $archivo"
  if ($ver) { Write-Host "Listo: $total registros guardados en $archivo" -ForegroundColor Green }
} catch {
  Anotar "ERROR: $($_.Exception.Message)"
  if ($ver) { Write-Host "No se pudo hacer la copia: $($_.Exception.Message)" -ForegroundColor Red }
  exit 1
}
