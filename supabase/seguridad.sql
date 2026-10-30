-- =====================================================================
-- LIFE · Seguridad (Gonzalito, 2026-10-29)
--
-- Aplicado en la nube el 2026-10-30 con el OK de ella (migración seguridad_gonzalito_1).
-- Se puede correr más de una vez. No borra ni mueve datos.
--
-- 1. Las funciones de permisos (security definer) dejan de poder llamarse
--    sin iniciar sesión (aviso de los asesores de Supabase). Las que usan
--    las reglas (life_puede_escribir, life_es_superadmin, life_rol) siguen
--    disponibles para los usuarios con sesión, si no las reglas se rompen.
-- 2. Un usuario SIN perfil ya no puede escribir (antes sí: coalesce(..., true)).
--    Hoy todas las cuentas tienen perfil, así que no cambia nada para ellas.
-- 3. El perfil nuevo no se pierde si el nombre de usuario ya existe
--    (ej. mauro@otro.com chocaba con "mauro" y quedaba sin perfil = sin pausar).
-- 4. com_tickets: reglas solo para usuarios con sesión, igual que las demás tablas.
-- =====================================================================

-- 1. Nada de permisos para "anon" (sin sesión).
revoke execute on function public.life_es_superadmin() from public, anon;
revoke execute on function public.life_puede_escribir() from public, anon;
revoke execute on function public.life_rol() from public, anon;
revoke execute on function public.life_perfil_nuevo() from public, anon, authenticated;
grant execute on function public.life_es_superadmin() to authenticated;
grant execute on function public.life_puede_escribir() to authenticated;
grant execute on function public.life_rol() to authenticated;

-- 2. Sin perfil = no escribe.
create or replace function public.life_puede_escribir() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo and rol <> 'lector' from public.perfiles where user_id = auth.uid()), false);
$$;

-- 3. Perfil nuevo siempre se crea (pausado); si el usuario corto ya existe, queda sin usuario corto.
create or replace function public.life_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare corto text := split_part(new.email, '@', 1);
begin
  if exists (select 1 from public.perfiles where usuario = corto) then corto := null; end if;
  insert into public.perfiles (user_id, usuario, rol, activo)
  values (new.id, corto, 'usuario', false)
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.life_perfil_nuevo() from public, anon, authenticated;

-- 4. com_tickets: "to authenticated" (alter policy, sin drop: la herramienta de Supabase se cuelga con drop policy).
alter policy propio_select on public.com_tickets to authenticated;
alter policy propio_insert on public.com_tickets to authenticated;
alter policy propio_update on public.com_tickets to authenticated;
alter policy propio_delete on public.com_tickets to authenticated;
