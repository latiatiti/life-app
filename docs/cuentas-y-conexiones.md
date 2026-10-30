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
(`.../functions/v1/life-mcp?k=life_...`; si Claude Desktop muestra "No se pudo registrar con el servicio de inicio de sesión", volver a intentar: el 2026-10-29 conectó con una clave nueva); en claude.ai → Configuración → Conectores →
Agregar conector personalizado se pega ese link.

Herramientas: `que_hay` (tablas, columnas y cantidades; toda tabla nueva con `user_id` aparece sola),
`leer`, `crear`, `modificar`, `borrar`, `historial`, `deshacer`.
Cada cambio queda en `api_registro` con el antes y el después. La clave se guarda solo como sha-256;
se puede cortar desde Ajustes. Desplegar con verificación de JWT **desactivada** (la autoriza la clave).

## Mercado Pago (investigación, sin implementar)
- Una cuenta personal puede crear una "aplicación" en mercadopago.com.ar/developers y obtener su
  *access token* de producción. Con eso se puede consultar por API:
  - `/v1/payments/search`: pagos **recibidos** (cobros, transferencias que entran).
  - `/v1/account/release_report` y `settlement_report`: reportes CSV de movimientos de la cuenta
    (dinero liberado, retiros, saldo). Están pensados para vendedores; hay que probar con su cuenta si
    también muestran lo que ella paga con QR o transfiere.
- No hay API oficial para ver los pagos que uno hace como comprador desde la billetera.
- Plan propuesto: función `mercadopago` con su token guardado como secreto en Supabase, que cada día
  traiga los movimientos y los deje como "a revisar" en Economía (no como gastos firmes).
- Alternativa sin API: Mercado Pago manda un correo por cada pago y transferencia; con el conector de
  Gmail se pueden leer esos avisos y proponer los movimientos.

Fuentes: https://mercadopago.cl/developers/es/docs/reports/released-money/api ,
https://www.mercadopago.com.ar/developers/en/docs/subscriptions/additional-content/payment-management.md
