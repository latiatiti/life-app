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

## Varias cuentas en una sola base (2026-11-06, `supabase/multiusuario.sql`)
- **Aislamiento:** toda tabla tiene `user_id` obligatorio (por defecto `auth.uid()`), RLS e índice. La app además
  pide solo lo propio (`listar` filtra por `user_id`). Si en un navegador entra otra cuenta, se borra lo que quedó
  a medias de la anterior (`fijarDueno` en `core/db.ts`).
- **Compartir por áreas** (2026-11-08, `supabase/compartir.sql`, correr después de multiusuario.sql): cada lado
  marca qué comparte (`life_vinculos.que` / `que_otro`) y un área se comparte solo si la marcan los dos:
  gastos, casa (súper, compras, precios, tickets, stock), tareas (`dia_tareas` y futuras `tar_*`), comida
  (platos) y entreno (ejercicios propios; rutina, sesiones y series solo para ver). `life_areas` dice qué tabla es
  de qué área y si es "mezcla" (una sola lista, los dos editan) o "ver". Crear = fila propia; borrar = solo el
  dueño. La app trae lo compartido con `life_compartido_conmigo()` (`cargarCompartido` en `core/db.ts`) y el
  conector con `duenosDe` (leer marca `de` en lo ajeno; modificar alcanza a lo "mezcla").
  Ojo: en Casa, "para quién" (Yo / Ulises / Los dos) todavía está pensado desde la cuenta de ella.
- **Compartir (base):** solo lo que dos cuentas aceptan. `life_vinculos` (invitar por usuario, aceptar, cortar:
  `life_invitar`, `life_responder_vinculo`, `life_mis_vinculos`). `eco_compartidos.con_user_id` = la otra cuenta
  (se enlaza sola si `persona` coincide con su nombre o usuario). Cada uno ve lo que cargó y lo que el otro cargó
  con él; la vista `eco_compartidos_mios` lo da "desde mi lado" (`monto_mio` > 0 = me deben). Solo quien cargó una
  fila la cambia o la borra.
- **Planes y suscripciones:** `life_planes` (familia, básico, completo) y `life_suscripciones` (prueba, activa,
  cortesía, vencida, cancelada, hasta). Solo el superadmin los cambia (Ajustes → Cuentas → Editar). Vencida o
  cancelada = solo lectura en la app y en el conector. Sin cobro real.
- **Cuentas nuevas:** con Google la cuenta se crea sola, **activa** y vacía (plan Completo · de prueba; tope de 20
  por día). Por correo sin pasar por el superadmin nace **pausada** (tope de 5 esperando). La función `aviso-cuenta` le manda un mail
  al superadmin (secretos `RESEND_API_KEY`, `AVISO_MAIL`, `APP_URL`; el mail no va en el repo). Se autoriza o
  rechaza en Ajustes → Cuentas. Las que crea el superadmin nacen activas (`app_metadata.life_admin`).
- **Google en una cuenta que ya existe:** Ajustes → Cómo entrás → Conectar Google (`linkIdentity`; requiere
  "Manual linking" activado en Supabase Auth). Si se entra con Google sin conectarlo antes, se crea otra cuenta.
- **Encuesta de bienvenida** (`ajustes/Bienvenida.tsx`): la primera vez que entra una cuenta nueva. Secciones,
  plata, cobros, fijos, semana, cuerpo/entreno, comida y con quién comparte. Carga cuentas, categorías, ingresos,
  pagos, semana tipo (así no ve la de ejemplo), metas de comida e invitación; guarda las respuestas en
  `perfiles.bienvenida` (`life_guardar_bienvenida`). Las secciones elegidas filtran el menú (`veModulo`).

## Conexión con Claude (`supabase/functions/life-mcp`)
Servidor MCP por HTTP. En Ajustes → Conexión con Claude se crea un link personal
(`.../functions/v1/life-mcp?k=life_...`); en claude.ai → Configuración → Conectores →
Agregar conector personalizado se pega ese link.

**Con varias cuentas:** cada link (clave) es de una sola cuenta; Claude sabe de quién es por la clave, no por la
computadora. Cada persona crea su link en SU Ajustes y lo agrega en SU Claude. Si las dos usan el mismo Claude,
agregar dos conectores con nombre ("LIFE Titi", "LIFE Ulises"): el conector se presenta como `LIFE · <nombre>`,
`quien_soy` lo confirma, cada respuesta trae `cuenta` y Claude pregunta si no queda claro para quién es.
Lo compartido: `cuenta_compartida` y `anotar_compartido`. Cuenta pausada o sin perfil = el link no anda;
suscripción vencida = solo lectura.

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
