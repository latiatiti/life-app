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
(cámara y ubicación solo la propia app) y una regla de contenido (CSP) en modo **solo avisar**.
Para activarla: abrir la app publicada, recorrer todo (incluido Ticket con foto y el escáner), mirar la
consola; si no hay avisos "Content-Security-Policy-Report-Only", cambiar el nombre del encabezado a
`Content-Security-Policy`. Si se suma un dominio externo nuevo, agregarlo ahí.

## Estado (auditoría 2026-10-29)
Aplicado en el repo (PR de Gonzalito): encabezados, service worker que no guarda errores, Vite 8.3.5
(fallas del servidor de desarrollo), `supabase/seguridad.sql` **escrito pero sin aplicar**.

Pendiente de decisión de ella:
- Pasar el repo de GitHub a **privado** (hoy es público).
- Aplicar `supabase/seguridad.sql`.
- Cuenta `mauro2@life.com` (sin datos, con una sesión abierta desde el 15/10): pausarla o borrarla.
- Supabase → Authentication: confirmar que "Allow new users to sign up" esté apagado y activar la
  protección de contraseñas filtradas.
- Conector `life-mcp`: la clave viaja en el link (`?k=`). Una clave por uso (Claude = escribir, copia de
  la PC = solo leer), cambiarlas cada 90 días y revocar la que se haya pegado en un lugar compartido.
- Funciones `ticket` y `precios`: cualquiera con la anon key (pública) puede usarlas; limitar a usuarios
  con sesión cuando el modo local deje de necesitarlas.
- Copia en la PC: los respaldos `.json` quedan sin cifrar en `LIFE\respaldos`; activar BitLocker (o
  cifrado de dispositivo) en esa compu y contraseña/PIN de Windows.
