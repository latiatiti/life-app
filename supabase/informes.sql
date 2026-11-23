-- =====================================================================
-- LIFE · Informar problemas e ideas + panel de cuentas (2026-11-19)
--
-- Correr después de cuentas.sql, seguridad.sql y pedir-cuenta.sql.
-- Se puede correr más de una vez. No borra ni mueve datos.
--
-- 1. life_informes: lo que cada cuenta manda con el botón "Informar"
--    (problema, idea o mejora, necesidad, otra cosa) y los errores que la app
--    detecta sola (tipo 'error', origen 'auto').
--      · Cada cuenta crea y ve SOLO los suyos (y la respuesta de la superadmin).
--      · La superadmin ve todos y cambia el estado / responde.
--      · Tope: 30 por día por cuenta (para que un error repetido no llene la base).
-- 2. life_panel_cuentas(): solo superadmin. Por cada cuenta, cuántos datos tiene,
--    cuándo cargó algo por última vez, informes abiertos, errores de 7 días y
--    links de Claude activos. No devuelve datos de nadie, solo conteos.
-- 3. life_panel_base(): solo superadmin. Tamaño de la base y las tablas más grandes.
-- =====================================================================

create table if not exists public.life_informes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo        text not null default 'problema'
              check (tipo in ('problema','idea','necesidad','otro','error')),
  origen      text not null default 'persona' check (origen in ('persona','auto')),
  texto       text not null check (length(texto) between 1 and 4000),
  urgencia    text not null default 'normal' check (urgencia in ('frena','molesta','normal')),
  pantalla    text,                      -- ruta donde estaba (#/compras/ticket)
  aparato     text,                      -- "Celu · Chrome" (corto, sin datos personales)
  version     text,                      -- versión de LIFE que estaba usando
  estado      text not null default 'nuevo'
              check (estado in ('nuevo','visto','en_proceso','resuelto','descartado')),
  respuesta   text,
  tarea_id    uuid,                      -- si se pasó al Tablero de la superadmin
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists life_informes_user on public.life_informes (user_id, created_at desc);
create index if not exists life_informes_estado on public.life_informes (estado, created_at desc);

alter table public.life_informes enable row level security;

drop policy if exists informes_ver on public.life_informes;
drop policy if exists informes_crear on public.life_informes;
drop policy if exists informes_admin on public.life_informes;
drop policy if exists informes_borrar on public.life_informes;
create policy informes_ver on public.life_informes for select to authenticated
  using (user_id = auth.uid() or public.life_es_superadmin());
-- Cualquier cuenta con sesión puede informar (también las de solo lectura): es su forma de avisar.
create policy informes_crear on public.life_informes for insert to authenticated
  with check (user_id = auth.uid() and estado = 'nuevo' and respuesta is null and tarea_id is null);
-- Estado y respuesta: solo la superadmin.
create policy informes_admin on public.life_informes for update to authenticated
  using (public.life_es_superadmin()) with check (public.life_es_superadmin());
-- Borrar: la superadmin, o la persona su propio informe mientras siga "nuevo" (para DESHACER).
create policy informes_borrar on public.life_informes for delete to authenticated
  using (public.life_es_superadmin() or (user_id = auth.uid() and estado = 'nuevo'));

create or replace function public.life_informes_control() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.life_informes
        where user_id = new.user_id and created_at > now() - interval '24 hours') >= 30 then
      raise exception 'Llegaste al tope de 30 informes por día. Probá mañana.';
    end if;
    new.texto := left(new.texto, 4000);
    new.pantalla := left(new.pantalla, 120);
    new.aparato := left(new.aparato, 60);
    new.version := left(new.version, 40);
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger life_informes_control before insert or update on public.life_informes
  for each row execute function public.life_informes_control();

-- ---------- Panel de cuentas (solo superadmin) ----------
create or replace function public.life_panel_cuentas()
returns table (user_id uuid, filas bigint, ultima_carga timestamptz, informes_abiertos bigint,
               errores_7d bigint, claves_claude bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  consulta text := '';
begin
  if not public.life_es_superadmin() then
    raise exception 'Solo la superadmin.';
  end if;
  -- Suma filas y última carga de todas las tablas de datos con user_id (sin mirar su contenido).
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    join information_schema.columns cc on cc.table_schema = c.table_schema and cc.table_name = c.table_name and cc.column_name = 'created_at'
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('perfiles','api_claves','api_registro','life_informes')
      and c.table_name not like 'wa\_%'
  loop
    consulta := consulta || case when consulta = '' then '' else ' union all ' end
      || format('select user_id, count(*) n, max(created_at) ult from public.%I group by user_id', t);
  end loop;
  if consulta = '' then consulta := 'select null::uuid user_id, 0::bigint n, null::timestamptz ult where false'; end if;

  return query execute format($q$
    with datos as (select d.user_id, sum(d.n)::bigint filas, max(d.ult) ult from (%s) d group by d.user_id)
    select p.user_id,
           coalesce(datos.filas, 0),
           datos.ult,
           (select count(*) from public.life_informes i where i.user_id = p.user_id and i.origen = 'persona'
              and i.estado in ('nuevo','visto','en_proceso')),
           (select count(*) from public.life_informes i where i.user_id = p.user_id and i.origen = 'auto'
              and i.created_at > now() - interval '7 days'),
           (select count(*) from public.api_claves k where k.user_id = p.user_id and not k.revocada)
    from public.perfiles p left join datos on datos.user_id = p.user_id
  $q$, consulta);
end $$;
revoke all on function public.life_panel_cuentas() from public, anon;
grant execute on function public.life_panel_cuentas() to authenticated;

-- ---------- Cómo viene la base (solo superadmin) ----------
create or replace function public.life_panel_base()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.life_es_superadmin() then
    raise exception 'Solo la superadmin.';
  end if;
  return jsonb_build_object(
    'base_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'tope_mb', 500,
    'cuentas', (select count(*) from public.perfiles),
    'activas', (select count(*) from public.perfiles where activo),
    'tablas', (select coalesce(jsonb_agg(x order by x.mb desc), '[]'::jsonb) from (
      select c.relname as nombre, round(pg_total_relation_size(c.oid) / 1048576.0, 2) as mb,
             c.reltuples::bigint as filas
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc limit 8) x)
  );
end $$;
revoke all on function public.life_panel_base() from public, anon;
grant execute on function public.life_panel_base() to authenticated;
