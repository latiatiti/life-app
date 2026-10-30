# Cuentas, roles y conexiones

## Inicio de sesión
- La app publicada ya trae la conexión a la nube de LIFE (`NUBE_LIFE` en `src/core/config.ts`): no hay que pegar URL ni clave.
- Se entra con **usuario** + contraseña. Un usuario sin `@` se completa con `@life.com` (la primera cuenta es `mauro@life.com`, así que entra como `mauro` con la misma contraseña de siempre).
- Ya no hay "crear cuenta" público: las cuentas las crea el superadmin desde Ajustes → Cuentas y roles.
- Si el navegador tiene datos de cuando la app andaba en modo local, aparece "Subir a mi cuenta" (no duplica y no borra la copia local).
- El archivo de un solo clic (`npm run build:single`) sigue en modo local.

## Roles (`supabase/cuentas.sql`)
| Rol | Qué puede |
|---|---|
| superadmin | Todo, y administra cuentas (crear, pausar, rol, módulos, contraseña). |
| usuario | Usa la app con sus propios datos. |
| lector | Ve sus datos, no puede cambiarlos (lo bloquea la base, no solo la pantalla). |

Además: `modulos` limita qué módulos ve cada cuenta y `activo = false` la pausa.
Los datos siguen siendo de cada usuario (`user_id`); el SQL no mueve ni borra nada.
Las cuentas que se registren por fuera de la app nacen pausadas.

Función `cuentas` (con sesión de superadmin): listar, crear, cambiar contraseña.

## Conexión con Claude (`supabase/functions/life-mcp`)
Servidor MCP por HTTP. En Ajustes → Conexión con Claude se crea un link personal
(`.../functions/v1/life-mcp?k=life_...`); en claude.ai → Configuración → Conectores →
Agregar conector personalizado se pega ese link.

Herramientas: `que_hay` (tablas, columnas y cantidades; toda tabla nueva con `user_id` aparece sola),
`leer`, `crear`, `modificar`, `borrar`, `historial`, `deshacer`.
Cada cambio queda en `api_registro` con el antes y el después. La clave se guarda solo como sha-256;
se puede cortar desde Ajustes. Desplegar con verificación de JWT **desactivada** (la autoriza la clave).

## Mercado Pago (2026-10-30)
Elegido por ella: **API de Mercado Pago** con su propia clave, guardada solo en la nube.
- Función `supabase/functions/mercadopago` (JWT activado). Secretos: `MP_ACCESS_TOKEN` (Access Token
  de producción de una app creada en mercadopago.com.ar/developers → Tus integraciones) y `MP_DUENO`
  (el `user_id` de LIFE de ella: nadie más puede usarla). Solo hace consultas fijas de lectura:
  `/users/me`, saldo (`/users/{id}/mercadopago_account/balance`, no documentado: si no responde la app
  muestra "—"), y `/v1/payments/search` como cobradora (`collector.id`) y como pagadora (`payer.id`),
  aprobados, últimos 30 días.
- Ojo: el token de MP no se puede limitar a solo leer. Si se filtra: MP → la app → Renovar credenciales.
  Lo que paga con QR/servicios puede no venir completo por `payer.id`; para eso queda subir el resumen CSV.
- En la app: Plata → **Mercado Pago** (`#/economia/mercadopago`). Al abrirla pregunta sola a MP (cada 3 h)
  y muestra saldo en MP vs. en LIFE (avisa si no coinciden). Tabla `eco_mp_movimientos`
  (`supabase/economia-mercadopago.sql`): cada movimiento entra `nuevo` y ella lo confirma como pago de un
  vencimiento (`registrarPago`), cobro (`registrarCobro`), gasto/ingreso con categoría, o lo ignora.
  `externo = "mp:<id de operación>"` evita duplicados (igual en la API y en el CSV). Lo que se repite en
  2+ meses sin estar en Pagos se ofrece como recordatorio mensual.
- Otra entrada posible (no activa): Claude leyendo los avisos de MP del mail y creando filas con
  `origen: "mail"` por el conector LIFE. Los avisos le llegan a otro mail, no al conectado.
