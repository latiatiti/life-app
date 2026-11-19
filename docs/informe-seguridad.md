# Informe de seguridad de LIFE · Gonzalito · 31/10/2026

Este informe junta todo lo que se hizo para que tu información quede segura y privada, por qué, y lo
que queda en tus manos. Sigue a la auditoría del 29/10 (las reglas fijas están en `docs/seguridad.md`).

## Cómo está hoy, en una línea por pilar
- **Confidencialidad** (que nadie vea lo tuyo): la base de datos solo te muestra lo tuyo, la app se
  defiende de código ajeno y no hay claves secretas en el código. Lo que falta: el repo de GitHub es
  público (paso 1 de abajo).
- **Integridad** (que nadie cambie lo tuyo): sin cuenta activa no se escribe nada, todo cambio de
  Claude queda anotado y se puede deshacer, y cada guardado tiene DESHACER.
- **Disponibilidad** (que no lo pierdas): datos en la nube, respaldo en la PC y la app sigue andando
  sin señal. Lo que falta: cifrar la carpeta de respaldos de la PC (paso 6).

## Lo que ya quedó hecho

### Antes de hoy (29 y 30/10)
| Cambio | Por qué | Qué riesgo cubre |
|---|---|---|
| Encabezados de seguridad en Netlify (HSTS, sin marcos, sin referer, permisos limitados) | El navegador solo habla con LIFE por conexión segura y nadie puede meterla adentro de otra página | Robo de sesión por conexión insegura, páginas truchas que "envuelven" LIFE |
| El service worker no guarda páginas con error | Antes podía quedarse con una pantalla rota | App que no abre |
| Vite 8.3.5 | La versión anterior tenía fallas conocidas | Fallas del programa que arma la app |
| Reglas de la base (`seguridad.sql`, aplicado en la nube) | Una cuenta sin perfil podía escribir; ahora no | Que alguien que se cree una cuenta cargue o cambie datos |

### Hoy (31/10, este PR)
| Cambio | Por qué | Qué riesgo cubre |
|---|---|---|
| **La regla de contenido (CSP) ahora bloquea** (antes solo avisaba) | Probé las 25 pantallas de la app con la regla activa: cero avisos | Si algún día se cuela código ajeno (una librería con trampa, un ticket con código escondido), el navegador no lo deja correr ni mandar tus datos a otro lado. También fuerza conexiones seguras (`upgrade-insecure-requests`) |
| **La función `ticket` pide tu sesión de LIFE** | La "llave pública" de la app la puede ver cualquiera; con ella, cualquiera podía usar tu función para bajar páginas ajenas a tu nombre | Abuso de tu servidor (gasto de cuota, que lo usen de "puente" para atacar a otros) |
| `ticket` rechaza links con puertos raros, usuario/contraseña o direcciones numéricas | Son los trucos típicos para que un servidor pida cosas internas | Que alguien use la función para espiar la red de Supabase |
| **Links de Claude con nombre, fecha y aviso a los 90 días** (Ajustes → Conexión con Claude) | Hoy tenés 2 links activos que se llaman igual ("Claude") y no sabías cuál es cuál | Links viejos o olvidados que siguen abiertos. Ahora le ponés nombre (ej. "Claude celu"), ves cuándo lo creaste y la app te avisa cuándo cambiarlo |
| Revisión de todo el historial del repo | El repo es público: todo lo que alguna vez se subió se puede leer | Encontré **cero claves secretas** (solo la llave pública de la app, que está hecha para eso). Ni la clave maestra de Supabase, ni tokens de Mercado Pago, ni links de Claude |
| `npm audit` | Revisar las librerías que usa la app | 0 fallas conocidas |
| Revisión de la función de **Mercado Pago** (ya desplegada) | Maneja un token que da acceso a tu plata | Está bien hecha: el token vive solo como secreto en Supabase, la función solo lee, pide tu sesión y que seas la dueña. No hubo que cambiar nada |

## Lo que queda para vos (con pasos)

### 1. Pasar el repo de GitHub a privado — **lo más importante**
Hoy cualquiera puede leer el código y los documentos (que tienen montos, horarios y lugares tuyos).
1. Entrá a https://github.com/latiatiti/life-app/settings
2. Bajá hasta el final, a **Danger Zone**.
3. **Change repository visibility → Change to private** y confirmá escribiendo el nombre.

Netlify sigue publicando igual (tiene su propio permiso). Lo que ya se vio no se puede "des-ver", pero
no había claves secretas, así que no hace falta cambiar ninguna.

### 2. Publicar este PR y después redesplegar `ticket`
El orden importa: primero se publica la app nueva (que manda tu sesión) y después la función (que
la pide). Si se hace al revés, la pantalla Ticket deja de bajar links hasta publicar la app.
Cuando mergees el PR, decime **"redesplegá ticket"** y lo hago yo.

### 3. Pausar la cuenta `mauro2@life.com`
Se creó sola el 15/10 cuando el registro estaba abierto, no tiene datos y tiene una sesión abierta
desde ese día. Decime **"pausá mauro2"** y lo hago (se puede volver atrás). O pegá esto en
Supabase → SQL Editor:

```sql
update public.perfiles set activo = false
 where user_id = (select id from auth.users where email = 'mauro2@life.com');
update auth.refresh_tokens set revoked = true
 where user_id = (select id::text from auth.users where email = 'mauro2@life.com');
```

### 4. Cerrar el registro público en Supabase
1. https://supabase.com/dashboard/project/jxnlgszmywoebjjpacod/auth/providers
2. Apagá **Allow new users to sign up** y guardá. (Las cuentas nuevas las seguís creando vos desde
   Ajustes → Cuentas.)
3. En la misma sección de Authentication, si te aparece **Leaked password protection** (protección de
   contraseñas filtradas), activala. Si dice que es del plan Pro, salteala: con el registro cerrado el
   riesgo es bajo.

### 5. Tus links de Claude
Tenés 2 links activos que pueden cargar datos, creados el 29/10 y el 30/10, y los dos se usaron hoy
(probablemente uno es este proyecto y el otro otro chat). Cuando se publique este cambio:
- Si alguno ya no lo usás, cortalo en Ajustes → Conexión con Claude.
- Para los que crees de ahora en más, ponele nombre ("Claude proyecto", "Claude celu").
- Cambialos antes del **27/01/2027** (la app te va a avisar).
- Nunca pegues el link en un grupo, un mail o una captura.

### 6. La compu donde está el respaldo
Los respaldos `.json` de `LIFE\respaldos` quedan sin cifrar. En Windows: **Configuración → Privacidad y
seguridad → Cifrado del dispositivo** (o BitLocker) → Activar, y que la compu tenga contraseña o PIN.

## Lo que se aceptó tal como está (y por qué)
- **4 avisos de Supabase** sobre funciones "security definer" (`life_puede_escribir`, `life_rol`,
  `life_es_superadmin`, `life_uso`): las usan las reglas de la base para saber quién sos. Las necesitan
  los usuarios con sesión y solo responden cosas de uno mismo.
- **La clave de Claude va en el link** (`?k=`): Claude.ai no deja mandarla de otra forma. Por eso
  guardamos solo su huella (no la clave), se puede cortar en un toque y ahora avisa a los 90 días.
- **La función `precios`** sigue abierta: solo consulta 3 catálogos públicos fijos (Carrefour, Vea,
  Jumbo) y no devuelve nada tuyo. Riesgo bajo; se cierra cuando el modo local deje de usarla.
