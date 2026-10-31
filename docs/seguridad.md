# Seguridad de LIFE (Gonzalito)

Gonzalito (antes "Gonza") es el experto en ciberseguridad de LIFE. Este archivo tiene las reglas fijas
que todo hilo respeta y el estado de la última auditoría. El informe completo vive en un Claude Doc
(link en la memoria del proyecto, `gonza.md`).

## Reglas para todo cambio (checklist antes de dar algo por hecho)
1. **Claves**: nunca en el código ni en commits. Solo la anon key pública de Supabase puede ir en la app
   (`NUBE_LIFE`). La service_role vive solo como secreto de las funciones. El repo **es público**: todo
   lo que se sube lo puede leer cualquiera, también el historial.
2. **Datos personales**: nada de datos reales de ella (montos, nombres, horarios, lugares) en el repo
   mientras sea público. Lo personal va a la nube o a la memoria del proyecto.
3. **Tablas nuevas**: con `user_id`, RLS activado y las 4 reglas `to authenticated` con
   `user_id = auth.uid()` y `life_puede_escribir()` en insert/update/delete (copiar de `cuentas.sql`).
   Después de aplicarlas, correr los asesores de seguridad de Supabase.
4. **Funciones de Supabase**: si no usan JWT (como `life-mcp`), autorizar con clave guardada como hash
   y filtrar cada consulta por el dueño. Nunca devolver `user_id`, hashes ni datos de otro usuario.
   Funciones `security definer`: `set search_path` y `revoke execute ... from anon`.
5. **HTML de afuera** (tickets, páginas bajadas): solo en `<iframe sandbox="">` sin scripts. Nada de
   `dangerouslySetInnerHTML` ni `eval`.
6. **Nube**: SQL, funciones, cuentas y configuración de Supabase/Netlify se cambian solo con el OK de
   ella. Nada que pueda perder datos sin avisar y sin respaldo.
7. **Dependencias**: `npm audit` sin altas ni críticas antes de cerrar una entrega.

## Encabezados (Netlify, `public/_headers`)
HSTS, nosniff, sin marcos (`X-Frame-Options: DENY`), sin referer, permisos del navegador limitados
(cámara y ubicación solo la propia app) y una regla de contenido (CSP) que **bloquea** (activa desde el
2026-10-31, después de recorrer todas las pantallas sin avisos). Si se suma un dominio externo nuevo
(script, conexión, fuente), agregarlo en `public/_headers` o el navegador lo bloquea. Si algo deja de
andar en la app publicada, mirar la consola: "Refused to …" dice qué dominio falta.

## Estado (2026-10-31, ver `docs/informe-seguridad.md`)
Aplicado: encabezados con CSP que bloquea, service worker que no guarda errores, Vite 8.3.5,
`supabase/seguridad.sql` en la nube (2026-10-30), función `ticket` solo con sesión de LIFE y sin
puertos/usuarios raros en el link, links de Claude con nombre, fecha y aviso a los 90 días.
`npm audit`: 0 fallas. Historial del repo revisado: no hay claves secretas (solo la anon key, que es
pública por diseño).

Pendiente (ver el informe para los pasos):
- Pasar el repo de GitHub a **privado** (hoy es público).
- Redesplegar la función `ticket` **después** de publicar la app nueva (si no, la app vieja falla).
- Cuenta `mauro2@life.com` (sin datos, con una sesión abierta desde el 15/10): pausarla o borrarla.
- Supabase → Authentication: apagar "Allow new users to sign up"; protección de contraseñas
  filtradas (solo en plan Pro).
- Conector `life-mcp`: la clave viaja en el link (`?k=`, Claude no deja otra forma). Una por uso,
  cambiarlas cada 90 días (la app avisa) y cortar la que se haya pegado en un lugar compartido.
- Función `precios`: sigue abierta con la anon key (solo consulta 3 catálogos públicos fijos: riesgo bajo).
- Copia en la PC: los respaldos `.json` quedan sin cifrar en `LIFE\respaldos`; activar BitLocker (o
  cifrado de dispositivo) en esa compu y contraseña/PIN de Windows.
- Aceptado: 4 avisos de Supabase por funciones `security definer` que usan las reglas de la base
  (`life_puede_escribir`, `life_rol`, `life_es_superadmin`, `life_uso`). Las necesitan los usuarios con
  sesión y solo dicen cosas de uno mismo.
