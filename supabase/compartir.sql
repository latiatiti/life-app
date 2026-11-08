-- =====================================================================
-- LIFE · Compartir por áreas entre cuentas vinculadas (2026-11-08)
--
-- Correr DESPUÉS de multiusuario.sql. Se puede correr más de una vez. No borra ni mueve datos.
--
-- Dos cuentas vinculadas (ej. ella y Ulises, que viven juntos) eligen QUÉ comparten:
--   gastos  → lo que se deben (eco_compartidos)
--   casa    → lista del súper, compras, precios, tickets y lo que hay en casa
--   tareas  → tareas (dia_tareas y la futura lista tar_*)
--   comida  → platos y recetas
--   entreno → ejercicios propios (y ver la rutina y el progreso del otro, sin mezclarlo con lo propio)
-- Un área se comparte solo si LOS DOS la marcan (cada uno da su permiso: que / que_otro).
-- modo 'mezcla' = los dos ven y editan esas filas como una sola lista; modo 'ver' = solo se ve.
-- Crear siempre crea filas propias; borrar, solo el dueño de la fila.
-- Tabla nueva que se quiera compartir: sumarla a life_areas y volver a correr este archivo.
-- =====================================================================

-- ---------- Qué tablas son de cada área ----------
create table if not exists public.life_areas (
  area  text not null,
  tabla text not null,
  modo  text not null default 'mezcla' check (modo in ('mezcla','ver')),
  primary key (area, tabla)
);
alter table public.life_areas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_areas' and policyname='areas_ver') then
    create policy areas_ver on public.life_areas for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_areas' and policyname='areas_admin') then
    create policy areas_admin on public.life_areas for all to authenticated
      using (public.life_es_superadmin()) with check (public.life_es_superadmin());
  end if;
end $$;
insert into public.life_areas (area, tabla, modo) values
  ('casa', 'com_items', 'mezcla'), ('casa', 'com_supers', 'mezcla'), ('casa', 'com_precios', 'mezcla'),
  ('casa', 'com_compras', 'mezcla'), ('casa', 'com_tickets', 'mezcla'), ('casa', 'com_frecuencias', 'mezcla'),
  ('casa', 'stk_productos', 'mezcla'),
  ('tareas', 'dia_tareas', 'mezcla'),
  ('comida', 'ali_platos', 'mezcla'),
  ('entreno', 'ent_ejercicios', 'mezcla'),
  ('entreno', 'ent_rutinas', 'ver'), ('entreno', 'ent_sesiones', 'ver'), ('entreno', 'ent_series', 'ver')
on conflict (area, tabla) do nothing;
-- La futura lista de tareas (tar_*) entra sola en "tareas" cuando exista.
insert into public.life_areas (area, tabla, modo)
select 'tareas', t.table_name, 'mezcla' from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name like 'tar\_%'
on conflict (area, tabla) do nothing;

-- ---------- Permiso de cada lado ----------
-- que = lo que comparte quien invitó (user_id); que_otro = lo que comparte el invitado (otro_id). Columnas en multiusuario.sql.

-- ¿Las cuentas a y b comparten esta área (las dos la marcaron)?
create or replace function public.life_comparte_entre(a uuid, b uuid, area_q text) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.life_vinculos v
    where v.estado = 'aceptado'
      and ((v.user_id = a and v.otro_id = b) or (v.user_id = b and v.otro_id = a))
      and area_q = any(v.que) and area_q = any(v.que_otro));
$$;
-- ¿La cuenta "otro" comparte esta área conmigo?
create or replace function public.life_comparte(otro uuid, area_q text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.life_comparte_entre(auth.uid(), otro, area_q);
$$;

-- Cada lado cambia solo SU permiso.
create or replace function public.life_vinculo_areas(vinculo uuid, areas text[]) returns void
language plpgsql security definer set search_path = public as $$
declare limpias text[];
begin
  if not public.life_puede_escribir() then raise exception 'No podés hacer cambios con esta cuenta.'; end if;
  select coalesce(array_agg(distinct a), '{}') into limpias from unnest(areas) a
   where a in ('gastos','casa','tareas','comida','entreno');
  update public.life_vinculos set que = limpias where id = vinculo and user_id = auth.uid();
  if not found then
    update public.life_vinculos set que_otro = limpias where id = vinculo and otro_id = auth.uid();
  end if;
  if not found then raise exception 'No encontré ese vínculo.'; end if;
end $$;

-- life_mis_vinculos (con mis_areas, sus_areas y comunes) está en multiusuario.sql.

-- Para la app: por tabla, de qué otras cuentas trae filas (solo áreas en modo "mezcla").
create or replace function public.life_compartido_conmigo()
returns table (tabla text, duenos uuid[])
language sql stable security definer set search_path = public as $$
  select a.tabla, array_agg(distinct x.otro_id)
  from public.life_mis_vinculos() x
  join public.life_areas a on a.area = any(x.comunes) and a.modo = 'mezcla'
  where x.estado = 'aceptado'
  group by a.tabla;
$$;

-- ---------- Reglas de cada tabla compartible (se suman a las propias: "ver" y "editar" del otro) ----------
do $$
declare r record;
begin
  for r in select a.area, a.tabla, a.modo from public.life_areas a
           join information_schema.tables t on t.table_schema = 'public' and t.table_name = a.tabla and t.table_type = 'BASE TABLE'
  loop
    if exists (select 1 from pg_policies where schemaname='public' and tablename=r.tabla and policyname='compartido_select') then
      execute format('alter policy "compartido_select" on public.%I to authenticated using (public.life_comparte(user_id, %L))', r.tabla, r.area);
    else
      execute format('create policy "compartido_select" on public.%I for select to authenticated using (public.life_comparte(user_id, %L))', r.tabla, r.area);
    end if;
    if r.modo = 'mezcla' then
      if exists (select 1 from pg_policies where schemaname='public' and tablename=r.tabla and policyname='compartido_update') then
        execute format('alter policy "compartido_update" on public.%I to authenticated using (public.life_comparte(user_id, %L)) with check (public.life_comparte(user_id, %L) and public.life_puede_escribir())', r.tabla, r.area, r.area);
      else
        execute format('create policy "compartido_update" on public.%I for update to authenticated using (public.life_comparte(user_id, %L)) with check (public.life_comparte(user_id, %L) and public.life_puede_escribir())', r.tabla, r.area, r.area);
      end if;
    elsif exists (select 1 from pg_policies where schemaname='public' and tablename=r.tabla and policyname='compartido_update') then
      -- Pasó de "mezcla" a "ver": la regla de editar queda sin efecto.
      execute format('alter policy "compartido_update" on public.%I to authenticated using (false) with check (false)', r.tabla);
    end if;
  end loop;
end $$;

-- ---------- Gastos: ahora también piden el área "gastos" marcada por los dos ----------
alter policy "propio_select" on public.eco_compartidos to authenticated
  using (user_id = auth.uid() or (con_user_id = auth.uid() and public.life_comparte(user_id, 'gastos')));

create or replace function public.life_enlazar_compartido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.con_user_id is null then
    select x.otro_id into new.con_user_id from public.life_mis_vinculos() x
     where x.estado = 'aceptado' and 'gastos' = any(x.comunes)
       and (lower(x.usuario) = lower(new.persona) or lower(x.nombre) = lower(new.persona))
     limit 1;
  end if;
  if new.con_user_id is not null and not public.life_comparte_entre(new.user_id, new.con_user_id, 'gastos') then
    raise exception 'No comparten gastos con esa cuenta.';
  end if;
  return new;
end $$;

-- ---------- Permisos de las funciones nuevas ----------
revoke execute on function public.life_comparte(uuid, text) from public, anon;
revoke execute on function public.life_comparte_entre(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.life_comparte_entre(uuid, uuid, text) to service_role;
revoke execute on function public.life_vinculo_areas(uuid, text[]) from public, anon;
revoke execute on function public.life_mis_vinculos() from public, anon;
revoke execute on function public.life_compartido_conmigo() from public, anon;
grant execute on function public.life_comparte(uuid, text) to authenticated, service_role;
grant execute on function public.life_vinculo_areas(uuid, text[]) to authenticated, service_role;
grant execute on function public.life_mis_vinculos() to authenticated, service_role;
grant execute on function public.life_compartido_conmigo() to authenticated, service_role;
revoke execute on function public.life_enlazar_compartido() from public, anon, authenticated;
