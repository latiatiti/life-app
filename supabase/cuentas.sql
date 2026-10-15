-- =====================================================================
-- LIFE · Cuentas, roles y conexión con Claude
--
-- Correr DESPUÉS de los otros SQL. Se puede correr más de una vez.
-- No borra ni mueve datos: los datos siguen siendo de cada usuario (user_id).
--
-- 1. perfiles: un perfil por usuario con su rol.
--      superadmin → administra todas las cuentas (crear, pausar, roles).
--      usuario    → usa la app completa con sus propios datos.
--      lector     → ve sus datos pero no puede cambiarlos.
--    modulos: null = todos; si no, solo esos (ej. {economia,pagos}).
--    activo = false pausa la cuenta (no puede escribir nada).
-- 2. Las reglas de escritura de todas las tablas ahora piden, además de
--    ser el dueño de la fila, tener la cuenta activa y no ser lector.
-- 3. api_claves / api_registro: claves personales para que Claude lea y
--    escriba (función life-mcp) y el registro de todo lo que hizo.
-- =====================================================================

-- ---------- Perfiles ----------
create table if not exists public.perfiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  usuario    text unique,                    -- nombre corto para entrar (ej. "mauro")
  nombre     text not null default '',
  rol        text not null default 'usuario' check (rol in ('superadmin','usuario','lector')),
  modulos    text[],                         -- null = todos
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Rol del que está conectado (sin perfil = usuario común, para no romper nada).
create or replace function public.life_rol() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.perfiles where user_id = auth.uid()), 'usuario');
$$;

create or replace function public.life_es_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where user_id = auth.uid() and rol = 'superadmin' and activo);
$$;

create or replace function public.life_puede_escribir() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo and rol <> 'lector' from public.perfiles where user_id = auth.uid()), true);
$$;

alter table public.perfiles enable row level security;
drop policy if exists perfiles_select on public.perfiles;
drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (user_id = auth.uid() or public.life_es_superadmin());
-- Solo el superadmin cambia roles y permisos (nadie puede subirse el rol solo).
create policy perfiles_admin on public.perfiles for all to authenticated
  using (public.life_es_superadmin()) with check (public.life_es_superadmin());

-- Cada usuario nuevo recibe su perfil. Queda pausado hasta que el superadmin lo active
-- (las cuentas que crea el superadmin desde la app ya nacen activas).
create or replace function public.life_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (user_id, usuario, rol, activo)
  values (new.id, split_part(new.email, '@', 1), 'usuario', false)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists life_perfil_nuevo on auth.users;
create trigger life_perfil_nuevo after insert on auth.users
  for each row execute function public.life_perfil_nuevo();

-- Los usuarios que ya existían: perfil activo. El más antiguo queda como superadmin
-- si todavía no hay ninguno.
insert into public.perfiles (user_id, usuario, rol, activo)
select u.id, split_part(u.email, '@', 1), 'usuario', true
from auth.users u
on conflict (user_id) do nothing;

update public.perfiles set rol = 'superadmin', activo = true
where user_id = (select id from auth.users order by created_at limit 1)
  and not exists (select 1 from public.perfiles where rol = 'superadmin');

-- ---------- Reglas de escritura de todas las tablas de datos ----------
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('perfiles','api_claves','api_registro')
  loop
    execute format('drop policy if exists "propio_insert" on public.%I', t);
    execute format('drop policy if exists "propio_update" on public.%I', t);
    execute format('drop policy if exists "propio_delete" on public.%I', t);
    execute format('create policy "propio_insert" on public.%I for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir())', t);
    execute format('create policy "propio_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir())', t);
    execute format('create policy "propio_delete" on public.%I for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir())', t);
  end loop;
end $$;

-- ---------- Claves para Claude ----------
-- La app genera la clave, muestra el link una sola vez y acá guarda solo su huella (sha-256).
create table if not exists public.api_claves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null default 'Claude',
  hash       text not null unique,
  prefijo    text not null default '',       -- primeros caracteres, para reconocerla
  permiso    text not null default 'escribir' check (permiso in ('leer','escribir')),
  ultimo_uso timestamptz,
  revocada   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.api_claves enable row level security;
drop policy if exists propio_select on public.api_claves;
drop policy if exists propio_insert on public.api_claves;
drop policy if exists propio_update on public.api_claves;
drop policy if exists propio_delete on public.api_claves;
create policy propio_select on public.api_claves for select to authenticated using (user_id = auth.uid());
create policy propio_insert on public.api_claves for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy propio_update on public.api_claves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy propio_delete on public.api_claves for delete to authenticated using (user_id = auth.uid());

-- Todo lo que Claude cambia queda anotado (con el antes y el después, para deshacer).
create table if not exists public.api_registro (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  clave_id   uuid references public.api_claves(id) on delete set null,
  accion     text not null,                  -- crear | modificar | borrar | deshacer
  tabla      text not null,
  fila_id    uuid,
  antes      jsonb,
  despues    jsonb,
  deshecho   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists api_registro_user on public.api_registro (user_id, created_at desc);
alter table public.api_registro enable row level security;
drop policy if exists propio_select on public.api_registro;
create policy propio_select on public.api_registro for select to authenticated using (user_id = auth.uid());
-- Solo la función del servidor escribe el registro.

-- Columnas de las tablas de datos: la función life-mcp las usa para que Claude sepa qué hay.
-- Toda tabla nueva con user_id aparece sola.
create or replace function public.life_columnas()
returns table (tabla text, columna text, tipo text, nulable boolean, defecto text)
language sql stable security definer set search_path = public as $$
  select c.table_name::text, c.column_name::text, c.data_type::text, c.is_nullable = 'YES', c.column_default::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in (
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'
        and table_name not in ('perfiles','api_claves','api_registro'))
  order by c.table_name, c.ordinal_position;
$$;
revoke all on function public.life_columnas() from public, anon, authenticated;
grant execute on function public.life_columnas() to service_role;
