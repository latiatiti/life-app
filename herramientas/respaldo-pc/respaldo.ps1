# LIFE · copia de tus datos en esta compu.
# Baja todas tus tablas de la nube con tu clave de "solo lectura" del conector y las guarda en un archivo
# con el mismo formato que "Descargar respaldo" de Ajustes (se puede volver a importar desde ahí).
# Lo corre sola la tarea programada "LIFE respaldo" (una vez por semana) o el acceso directo.

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
  # Una sola copia que se va actualizando (pedido de ella). La de la vez anterior queda como "anterior"
  # por si la nueva sale mal; no se acumulan archivos.
  $hoy = Get-Date -Format 'yyyy-MM-dd'
  $archivo = Join-Path $destino 'LIFE-datos.json'
  $temporal = Join-Path $destino 'LIFE-datos.nuevo'
  $salida = [ordered]@{ app = 'LIFE'; version = 1; fecha = $hoy; datos = $datos } | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($temporal, $salida, [Text.UTF8Encoding]::new($false))
  if (Test-Path $archivo) { Move-Item $archivo (Join-Path $destino 'LIFE-datos-anterior.json') -Force }
  Move-Item $temporal $archivo -Force
  $kb = [math]::Round((Get-Item $archivo).Length / 1KB)
  Anotar "OK: $total registros en $($info.tablas.Count) tablas, $kb KB -> $archivo"
  if ($ver) { Write-Host "Listo: $total registros ($kb KB) actualizados en $archivo" -ForegroundColor Green }
} catch {
  Anotar "ERROR: $($_.Exception.Message)"
  if ($ver) { Write-Host "No se pudo hacer la copia: $($_.Exception.Message)" -ForegroundColor Red }
  exit 1
}
