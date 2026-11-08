-- =====================================================================
-- LIFE · Varios usuarios en una sola base (2026-11-06)
--
-- Correr DESPUÉS de todos los otros SQL (necesita perfiles de cuentas.sql y
-- la versión de life_puede_escribir de seguridad.sql). Se puede correr más de una vez.
-- NO borra ni mueve datos. Antes de tocar nada guarda una copia de cada tabla.
--
-- Cómo queda la base:
--   · Cada fila sigue teniendo dueño (user_id) y cada usuario ve solo lo suyo (RLS).
--     Esto ya era así; acá se asegura en TODAS las tablas (user_id obligatorio,
--     con valor por defecto auth.uid(), índice y regla de lectura propia).
--   · Lo único que se comparte entre dos cuentas es lo que ellas deciden:
--     life_vinculos (dos cuentas que se aceptan, ej. ella y Ulises) y
--     eco_compartidos (gastos, préstamos y pagos entre los dos: cada uno ve
--     las filas que cargó y las que el otro cargó "con" él, con el signo dado vuelta).
--   · Planes y suscripciones (life_planes, life_suscripciones): solo los maneja el
--     superadmin. Sin cobro real; una suscripción vencida o cancelada deja la cuenta
--     en solo lectura. Sin fila de suscripción = como siempre.
--   · Encuesta de bienvenida: perfiles.bienvenida (respuestas) y bienvenida_at.
-- =====================================================================

-- ---------- 0. Respaldo de todo antes de cambiar nada ----------
-- Esquema "respaldo" (no lo expone la API: nadie de afuera lo lee). Una copia por tabla y por día.
create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;
do $$
declare t text; sufijo text := to_char(now() at time zone 'America/Argentina/Mendoza', 'YYYYMMDD');
begin
  for t in select table_name from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    if not exists (select 1 from information_schema.tables where table_schema = 'respaldo' and table_name = t || '_' || sufijo) then
      execute format('create table respaldo.%I as table public.%I', t || '_' || sufijo, t);
    end if;
  end loop;
end $$;

-- ---------- 1. Aislamiento por usuario en todas las tablas con user_id ----------
-- Si una tabla tuviera filas sin dueño, no se fuerza "obligatorio" (se avisa con NOTICE) para no romper nada.
do $$
declare t text; sin_dueno bigint;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', t);
    if t not in ('perfiles') then
      execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    end if;
    execute format('select count(*) from public.%I where user_id is null', t) into sin_dueno;
    if sin_dueno = 0 then
      execute format('alter table public.%I alter column user_id set not null', t);
    else
      raise notice 'La tabla % tiene % filas sin dueño: revisar a mano.', t, sin_dueno;
    end if;
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
    -- Regla de lectura propia, si faltara (eco_compartidos y las del sistema tienen la suya).
    if t not in ('perfiles', 'api_registro', 'eco_compartidos', 'life_suscripciones')
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT') then
      execute format('create policy "propio_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    end if;
  end loop;
end $$;

-- ---------- 2. Planes y suscripciones (solo el superadmin los cambia) ----------
create table if not exists public.life_planes (
  id          text primary key,                       -- ej. 'familia', 'basico', 'completo'
  nombre      text not null,
  descripcion text not null default '',
  precio_mes  numeric(14,2) not null default 0,       -- referencia en ARS; no se cobra nada desde acá
  modulos     text[],                                 -- null = todos
  limites     jsonb not null default '{}'::jsonb,     -- ej. {"claves_claude":2}
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.life_planes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_planes' and policyname='planes_ver') then
    create policy planes_ver on public.life_planes for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_planes' and policyname='planes_admin') then
    create policy planes_admin on public.life_planes for all to authenticated
      using (public.life_es_superadmin()) with check (public.life_es_superadmin());
  end if;
end $$;
insert into public.life_planes (id, nombre, descripcion, precio_mes, modulos) values
  ('familia',  'Familia',  'Cuentas de la casa: todo incluido, sin cargo.', 0, null),
  ('basico',   'Básico',   'Plata, Pagos y Día.', 0, array['dia','economia','pagos']),
  ('completo', 'Completo', 'Todas las secciones y el conector con Claude.', 0, null)
on conflict (id) do nothing;

create table if not exists public.life_suscripciones (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan_id    text not null references public.life_planes(id),
  estado     text not null default 'activa' check (estado in ('prueba','activa','cortesia','vencida','cancelada')),
  desde      date not null default current_date,
  hasta      date,                                    -- null = sin vencimiento
  nota       text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.life_suscripciones enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_suscripciones' and policyname='susc_ver') then
    create policy susc_ver on public.life_suscripciones for select to authenticated
      using (user_id = auth.uid() or public.life_es_superadmin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_suscripciones' and policyname='susc_admin') then
    create policy susc_admin on public.life_suscripciones for all to authenticated
      using (public.life_es_superadmin()) with check (public.life_es_superadmin());
  end if;
end $$;

-- Las cuentas que ya existen quedan en "Familia, cortesía" (nunca se bloquean).
insert into public.life_suscripciones (user_id, plan_id, estado, nota)
select p.user_id, 'familia', 'cortesia', 'Cuenta de la casa'
from public.perfiles p
on conflict (user_id) do nothing;

-- Suscripción que bloquea: vencida, cancelada, o con fecha "hasta" pasada (salvo cortesía).
create or replace function public.life_suscripcion_ok(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.life_suscripciones s
    where s.user_id = uid
      and (s.estado in ('vencida','cancelada') or (s.estado <> 'cortesia' and s.hasta is not null and s.hasta < current_date))
  );
$$;

-- Escribir: cuenta activa, no lector y suscripción al día. El superadmin nunca se bloquea solo.
create or replace function public.life_puede_escribir() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.activo and p.rol <> 'lector' and (p.rol = 'superadmin' or public.life_suscripcion_ok(p.user_id))
    from public.perfiles p where p.user_id = auth.uid()
  ), false);
$$;

-- Plan y estado del que está conectado (la app lo muestra en Ajustes).
create or replace function public.life_mi_plan()
returns table (plan_id text, plan text, modulos text[], estado text, hasta date, al_dia boolean)
language sql stable security definer set search_path = public as $$
  select s.plan_id, pl.nombre, pl.modulos, s.estado, s.hasta, public.life_suscripcion_ok(auth.uid())
  from public.life_suscripciones s join public.life_planes pl on pl.id = s.plan_id
  where s.user_id = auth.uid();
$$;

-- ---------- 3. Encuesta de bienvenida ----------
alter table public.perfiles add column if not exists bienvenida jsonb;
alter table public.perfiles add column if not exists bienvenida_at timestamptz;
-- Quien ya usaba LIFE no tiene que hacerla (la puede repetir desde Ajustes).
update public.perfiles p set bienvenida_at = now()
where bienvenida_at is null
  and (exists (select 1 from public.eco_cuentas x where x.user_id = p.user_id)
    or exists (select 1 from public.dia_plantilla x where x.user_id = p.user_id));

-- Cada uno guarda SUS respuestas y su nombre (no puede tocar rol, módulos ni activo: eso es del superadmin).
create or replace function public.life_guardar_bienvenida(respuestas jsonb, nombre_nuevo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión.'; end if;
  update public.perfiles
     set bienvenida = respuestas,
         bienvenida_at = case when respuestas is null then null else now() end,
         nombre = coalesce(nullif(trim(nombre_nuevo), ''), nombre)
   where user_id = auth.uid();
end $$;

-- ---------- 4. Cuentas vinculadas (ej. ella y Ulises) ----------
create table if not exists public.life_vinculos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,  -- quien invita
  otro_id    uuid not null references auth.users(id) on delete cascade,                     -- invitado
  estado     text not null default 'pendiente' check (estado in ('pendiente','aceptado','rechazado')),
  que        text[] not null default array['gastos'],   -- qué comparten (por ahora: gastos)
  created_at timestamptz not null default now(),
  check (user_id <> otro_id)
);
-- que = lo que comparte quien invitó; que_otro = lo que comparte el invitado (áreas: compartir.sql).
alter table public.life_vinculos add column if not exists que_otro text[] not null default array['gastos'];
create unique index if not exists life_vinculos_par on public.life_vinculos (least(user_id, otro_id), greatest(user_id, otro_id));
alter table public.life_vinculos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_vinculos' and policyname='vinc_ver') then
    create policy vinc_ver on public.life_vinculos for select to authenticated
      using (user_id = auth.uid() or otro_id = auth.uid() or public.life_es_superadmin());
  end if;
  -- Crear/aceptar/cortar va por las funciones de abajo; el superadmin puede todo directo.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='life_vinculos' and policyname='vinc_admin') then
    create policy vinc_admin on public.life_vinculos for all to authenticated
      using (public.life_es_superadmin()) with check (public.life_es_superadmin());
  end if;
end $$;

-- ¿Estas dos cuentas están vinculadas (aceptado)?
create or replace function public.life_vinculado(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.life_vinculos v where v.estado = 'aceptado'
    and ((v.user_id = a and v.otro_id = b) or (v.user_id = b and v.otro_id = a)));
$$;

-- Mis vínculos, con lo que marqué yo, lo que marcó el otro y lo que de verdad se comparte.
create or replace function public.life_mis_vinculos()
returns table (id uuid, otro_id uuid, nombre text, usuario text, estado text, lo_pedi_yo boolean,
               mis_areas text[], sus_areas text[], comunes text[])
language sql stable security definer set search_path = public as $$
  select v.id,
         case when v.user_id = auth.uid() then v.otro_id else v.user_id end,
         coalesce(nullif(p.nombre, ''), p.usuario, 'Otra cuenta'), p.usuario, v.estado, v.user_id = auth.uid(),
         case when v.user_id = auth.uid() then v.que else v.que_otro end,
         case when v.user_id = auth.uid() then v.que_otro else v.que end,
         array(select unnest(v.que) intersect select unnest(v.que_otro))
  from public.life_vinculos v
  join public.perfiles p on p.user_id = case when v.user_id = auth.uid() then v.otro_id else v.user_id end
  where auth.uid() in (v.user_id, v.otro_id);
$$;

-- Invitar a otra cuenta por su usuario corto (ej. "ulises").
create or replace function public.life_invitar(usuario_otro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare otro uuid; nuevo uuid;
begin
  if auth.uid() is null or not public.life_puede_escribir() then raise exception 'No podés hacer cambios con esta cuenta.'; end if;
  select user_id into otro from public.perfiles where lower(usuario) = lower(trim(usuario_otro)) and activo;
  if otro is null then raise exception 'No encontré una cuenta activa con ese usuario.'; end if;
  if otro = auth.uid() then raise exception 'Esa es tu propia cuenta.'; end if;
  select id into nuevo from public.life_vinculos
   where least(user_id, otro_id) = least(auth.uid(), otro) and greatest(user_id, otro_id) = greatest(auth.uid(), otro);
  if nuevo is not null then
    update public.life_vinculos set estado = 'pendiente', user_id = auth.uid(), otro_id = otro
     where id = nuevo and estado = 'rechazado';
    return nuevo;
  end if;
  insert into public.life_vinculos (user_id, otro_id) values (auth.uid(), otro) returning id into nuevo;
  return nuevo;
end $$;

-- Aceptar o rechazar (solo el invitado) o cortar (cualquiera de los dos).
create or replace function public.life_responder_vinculo(vinculo uuid, respuesta text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if respuesta = 'aceptar' then
    update public.life_vinculos set estado = 'aceptado' where id = vinculo and otro_id = auth.uid();
  elsif respuesta in ('rechazar', 'cortar') then
    update public.life_vinculos set estado = 'rechazado' where id = vinculo and auth.uid() in (user_id, otro_id);
  else
    raise exception 'Respuesta: aceptar, rechazar o cortar.';
  end if;
  if not found then raise exception 'No encontré ese vínculo.'; end if;
end $$;

-- ---------- 5. Gastos compartidos entre cuentas ----------
-- Misma tabla que la pestaña "Con Ulises" (PR #16). Si no existía, se crea igual.
create table if not exists public.eco_compartidos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha         date not null default current_date,
  persona       text not null default 'Ulises',
  tipo          text not null default 'gasto' check (tipo in ('gasto','prestamo','pago')),
  descripcion   text not null default '',
  total         numeric(14,2) not null check (total >= 0),
  pago          text not null default 'yo' check (pago in ('yo','otro')),
  parte         numeric(5,2) not null default 50 check (parte between 0 and 100),
  monto         numeric(14,2) not null,   -- visto por quien la cargó: + el otro le debe, − le debe al otro
  movimiento_id uuid,
  compra_id     uuid,
  created_at    timestamptz not null default now()
);
-- La otra cuenta, si la persona tiene LIFE (si no, queda solo el nombre, como hasta hoy).
alter table public.eco_compartidos add column if not exists con_user_id uuid references auth.users(id) on delete set null;
create index if not exists eco_compartidos_user_fecha on public.eco_compartidos (user_id, persona, fecha);
create index if not exists eco_compartidos_con on public.eco_compartidos (con_user_id);
alter table public.eco_compartidos enable row level security;

-- Si "persona" coincide con el nombre o usuario de una cuenta vinculada, se enlaza sola.
create or replace function public.life_enlazar_compartido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.con_user_id is null then
    select x.otro_id into new.con_user_id from public.life_mis_vinculos() x
     where x.estado = 'aceptado' and (lower(x.usuario) = lower(new.persona) or lower(x.nombre) = lower(new.persona))
     limit 1;
  end if;
  if new.con_user_id is not null and not public.life_vinculado(new.user_id, new.con_user_id) then
    raise exception 'Esa cuenta no está vinculada con la tuya.';
  end if;
  return new;
end $$;
create or replace trigger life_enlazar_compartido before insert or update of con_user_id, persona on public.eco_compartidos
  for each row execute function public.life_enlazar_compartido();

do $$ begin
  -- Ver: lo que cargué yo, y lo que el otro cargó conmigo (si seguimos vinculados).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='eco_compartidos' and policyname='propio_select') then
    create policy "propio_select" on public.eco_compartidos for select to authenticated
      using (user_id = auth.uid() or (con_user_id = auth.uid() and public.life_vinculado(user_id, auth.uid())));
  else
    alter policy "propio_select" on public.eco_compartidos to authenticated
      using (user_id = auth.uid() or (con_user_id = auth.uid() and public.life_vinculado(user_id, auth.uid())));
  end if;
  -- Cambiar o borrar: solo quien la cargó.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='eco_compartidos' and policyname='propio_insert') then
    create policy "propio_insert" on public.eco_compartidos for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='eco_compartidos' and policyname='propio_update') then
    create policy "propio_update" on public.eco_compartidos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='eco_compartidos' and policyname='propio_delete') then
    create policy "propio_delete" on public.eco_compartidos for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());
  end if;
end $$;

-- Nombre de una cuenta vinculada (perfiles solo deja ver el propio; esto da solo el nombre, y solo si están vinculadas).
create or replace function public.life_nombre_de(otro uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.nombre, ''), p.usuario, 'Otra cuenta') from public.perfiles p
  where p.user_id = otro and (otro = auth.uid() or public.life_vinculado(auth.uid(), otro));
$$;

-- Vista "desde mi lado": monto_mio > 0 = me deben, < 0 = debo. Respeta las reglas de arriba.
create or replace view public.eco_compartidos_mios with (security_invoker = on) as
select c.id, c.fecha, c.tipo, c.descripcion, c.total, c.parte,
       case when c.user_id = auth.uid() then c.persona else public.life_nombre_de(c.user_id) end as persona,
       case when c.user_id = auth.uid() then c.con_user_id else c.user_id end as otro_id,
       case when c.user_id = auth.uid() then c.monto else -c.monto end as monto_mio,
       case when c.user_id = auth.uid() then c.pago else (case c.pago when 'yo' then 'otro' else 'yo' end) end as pago_mio,
       c.user_id = auth.uid() as lo_cargue_yo,
       c.created_at
from public.eco_compartidos c;
grant select on public.eco_compartidos_mios to authenticated;

-- ---------- 6. Permisos de las funciones (criterio de docs/seguridad.md) ----------
do $$
declare f text;
begin
  foreach f in array array[
    'life_suscripcion_ok(uuid)', 'life_puede_escribir()', 'life_mi_plan()', 'life_guardar_bienvenida(jsonb, text)',
    'life_vinculado(uuid, uuid)', 'life_nombre_de(uuid)', 'life_mis_vinculos()', 'life_invitar(text)', 'life_responder_vinculo(uuid, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
revoke execute on function public.life_enlazar_compartido() from public, anon, authenticated;

-- life_columnas (lo que ve el conector): las tablas del sistema nuevas quedan afuera.
create or replace function public.life_columnas()
returns table (tabla text, columna text, tipo text, nulable boolean, defecto text)
language sql stable security definer set search_path = public as $$
  select c.table_name::text, c.column_name::text, c.data_type::text, c.is_nullable = 'YES', c.column_default::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in (
      select k.table_name from information_schema.columns k
      join information_schema.tables tb on tb.table_schema = k.table_schema and tb.table_name = k.table_name and tb.table_type = 'BASE TABLE'
      where k.table_schema = 'public' and k.column_name = 'user_id'
        and k.table_name not in ('perfiles','api_claves','api_registro','life_suscripciones','life_vinculos'))
  order by c.table_name, c.ordinal_position;
$$;
revoke all on function public.life_columnas() from public, anon, authenticated;
grant execute on function public.life_columnas() to service_role;

-- ---------- 7. Cuentas nuevas ----------
-- · Con Google (2026-11-08, pedido de ella): la cuenta se crea sola y ACTIVA, con plan "Completo · de prueba".
--   Tope anti-abuso: como mucho 20 cuentas nuevas por día; pasado eso, la base no acepta más hasta el otro día.
-- · Por correo y contraseña (sin pasar por el superadmin): nace PAUSADA, esperando autorización (tope: 5 esperando).
-- · En los dos casos le llega un mail al superadmin (función aviso-cuenta; el mail de destino es un secreto,
--   no está en el repo). Desde Ajustes → Cuentas puede pausar cualquier cuenta.
alter table public.perfiles add column if not exists pedido_at timestamptz;      -- cuándo pidió entrar (cuentas nuevas)
alter table public.perfiles add column if not exists aviso_at timestamptz;       -- cuándo se mandó el mail de aviso
alter table public.perfiles add column if not exists via text;                   -- 'google', 'correo', 'admin'

create or replace function public.life_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  corto text := lower(split_part(coalesce(new.email, ''), '@', 1));
  esperando int;
  proveedor text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  nombre_g text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
  de_admin boolean := coalesce(new.raw_app_meta_data->>'life_admin', '') = 'si';  -- solo la función cuentas puede ponerlo
begin
  if de_admin then
    insert into public.perfiles (user_id, usuario, rol, activo, via)
    values (new.id, case when corto = '' or exists (select 1 from public.perfiles where usuario = corto) then null else corto end, 'usuario', true, 'admin')
    on conflict (user_id) do nothing;
    return new;
  end if;
  if proveedor = 'google' then
    if (select count(*) from public.perfiles where pedido_at > now() - interval '1 day') >= 20 then
      raise exception 'LIFE no acepta cuentas nuevas por ahora.';
    end if;
  else
    select count(*) into esperando from public.perfiles where not activo and pedido_at is not null and pedido_at > now() - interval '30 days';
    if esperando >= 5 then
      raise exception 'LIFE no acepta cuentas nuevas por ahora.';
    end if;
  end if;
  if corto = '' or exists (select 1 from public.perfiles where usuario = corto) then corto := null; end if;
  insert into public.perfiles (user_id, usuario, nombre, rol, activo, pedido_at, via)
  values (new.id, corto, nombre_g, 'usuario', proveedor = 'google', now(), case when proveedor = 'google' then 'google' else 'correo' end)
  on conflict (user_id) do nothing;
  if proveedor = 'google' then
    insert into public.life_suscripciones (user_id, plan_id, estado, nota)
    values (new.id, 'completo', 'prueba', 'Se creó con Google')
    on conflict (user_id) do nothing;
  end if;
  -- Aviso por mail (asincrónico: si falla, la cuenta igual se ve en Ajustes → Cuentas).
  begin
    perform net.http_post(
      url := 'https://jxnlgszmywoebjjpacod.supabase.co/functions/v1/aviso-cuenta',
      body := jsonb_build_object('user_id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  exception when others then null;
  end;
  return new;
end $$;
revoke execute on function public.life_perfil_nuevo() from public, anon, authenticated;

-- Las cuentas que crea el superadmin desde la app (función cuentas, app_metadata.life_admin = 'si') nacen activas, sin aviso.
