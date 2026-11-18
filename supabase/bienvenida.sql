-- Configuración inicial para cuentas nuevas (2026-11-18). Va después de cuentas.sql.
-- perfiles.bienvenida = respuestas de la configuración inicial (áreas que usa, con quién comparte compras…).
-- perfiles.bienvenida_at = cuándo la hizo. null = cuenta nueva: la app se la muestra sola al entrar.
-- Las áreas elegidas se suman al plan (perfiles.modulos): ve un módulo si está en su plan Y lo eligió.

alter table public.perfiles add column if not exists bienvenida jsonb;
alter table public.perfiles add column if not exists bienvenida_at timestamptz;

-- Cuentas que ya existían: no se les muestra sola (si quieren, la repiten desde Ajustes).
-- Ojo: si ya repartían compras con otra persona, al aplicar hay que guardar ese nombre aparte
-- (update ... set bienvenida = jsonb_build_object('comparte', '<nombre>')), así Compras lo sigue mostrando.
-- No va acá porque el repo es público.
update public.perfiles set bienvenida_at = now() where bienvenida_at is null;

-- Cada persona guarda SOLO su configuración inicial (y su nombre). Rol, plan y estado no se tocan desde acá.
create or replace function public.life_guardar_bienvenida(respuestas jsonb, nombre_nuevo text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles
     set bienvenida = respuestas,
         bienvenida_at = case when respuestas is null then null else now() end,
         nombre = coalesce(nullif(trim(nombre_nuevo), ''), nombre)
   where user_id = auth.uid();
$$;
revoke all on function public.life_guardar_bienvenida(jsonb, text) from public, anon;
grant execute on function public.life_guardar_bienvenida(jsonb, text) to authenticated;
