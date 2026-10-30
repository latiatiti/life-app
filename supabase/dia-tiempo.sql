-- Tiempo libre (2026-10-29): cosas de todos los días, anotar en qué se usó el tiempo y cada cuánto se va de compras.
-- Correr después de dia.sql, compras.sql y cuentas.sql. Se puede correr más de una vez.

-- Cosas de todos los días que ocupan tiempo (bañarse, lavar platos, ordenar…).
-- dias null = todos los días; si no, lista de días de la semana (0 = domingo … 6 = sábado).
create table if not exists public.dia_rutinas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  minutos     integer not null check (minutos between 1 and 600),
  veces       smallint not null default 1 check (veces between 1 and 20),
  dias        smallint[],
  momento     text not null default 'cualquiera' check (momento in ('manana','tarde','noche','cualquiera')),
  activo      boolean not null default true,
  nota        text,
  created_at  timestamptz not null default now()
);
create index if not exists dia_rutinas_user on public.dia_rutinas (user_id);

-- En qué se usó el tiempo (sobre todo el libre). clase: productivo / rutina / ocio / descanso.
create table if not exists public.dia_tiempo (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null,
  que         text not null,
  minutos     integer not null check (minutos between 1 and 1440),
  clase       text not null default 'productivo' check (clase in ('productivo','rutina','ocio','descanso')),
  nota        text,
  origen      text not null default 'app',
  created_at  timestamptz not null default now()
);
create index if not exists dia_tiempo_user_fecha on public.dia_tiempo (user_id, fecha);

-- Cada cuánto se va a comprar (aproximado). ultima = última vez que fue (para el súper también cuenta la última compra cerrada).
create table if not exists public.com_frecuencias (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre       text not null,
  lugar        text not null default 'super' check (lugar in ('super','verduleria','carniceria','otro')),
  cada_dias    integer not null check (cada_dias between 1 and 120),
  dia_habitual smallint check (dia_habitual is null or dia_habitual between 0 and 6),
  ultima       date,
  activo       boolean not null default true,
  nota         text,
  created_at   timestamptz not null default now()
);
create index if not exists com_frecuencias_user on public.com_frecuencias (user_id);

do $$
declare t text;
begin
  foreach t in array array['dia_rutinas','dia_tiempo','com_frecuencias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propio_select" on public.%I', t);
    execute format('drop policy if exists "propio_insert" on public.%I', t);
    execute format('drop policy if exists "propio_update" on public.%I', t);
    execute format('drop policy if exists "propio_delete" on public.%I', t);
    execute format('create policy "propio_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "propio_insert" on public.%I for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir())', t);
    execute format('create policy "propio_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir())', t);
    execute format('create policy "propio_delete" on public.%I for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir())', t);
  end loop;
end $$;
