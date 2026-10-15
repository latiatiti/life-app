-- Módulo Día (2026-10-15): semana tipo, días puntuales (libre/feriado/prioridades/horario propio) y tareas.
-- Pensado para que la API de Claude lea y escriba directo: fechas 'YYYY-MM-DD', horas 'HH:MM' (24:00 = fin del día).
-- Correr después de schema.sql. Se puede correr más de una vez.

-- Semana tipo: un bloque por fila. dia_semana 0 = domingo … 6 = sábado.
create table if not exists public.dia_plantilla (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  inicio      text not null check (inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  fin         text not null check (fin ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'),
  titulo      text not null,
  tipo        text not null default 'otro' check (tipo in ('descanso','casa','fabrica','reparto','gym','comida','traslado','libre','otro')),
  nota        text,
  opcional    boolean not null default false,
  come_alla   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists dia_plantilla_user_dia on public.dia_plantilla (user_id, dia_semana);

-- Una fila por fecha marcada. bloques null = usa la semana tipo; si no, es el horario propio de ese día
-- (lista de {inicio, fin, titulo, tipo, nota, opcional, come_alla}). prioridades = [{texto, hecho}].
create table if not exists public.dia_dias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null,
  estado      text not null default 'normal' check (estado in ('normal','libre','feriado','especial')),
  nombre      text,
  nota        text,
  prioridades jsonb not null default '[]'::jsonb,
  bloques     jsonb,
  created_at  timestamptz not null default now()
);
create unique index if not exists dia_dias_user_fecha on public.dia_dias (user_id, fecha);

-- Tareas. fecha null = sin fecha. origen: 'app' o 'claude'.
create table if not exists public.dia_tareas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date,
  hora        text check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  titulo      text not null,
  hecho       boolean not null default false,
  prioridad   text not null default 'media' check (prioridad in ('alta','media','baja')),
  nota        text,
  origen      text not null default 'app',
  created_at  timestamptz not null default now()
);
create index if not exists dia_tareas_user_fecha on public.dia_tareas (user_id, fecha);

do $$
declare t text;
begin
  foreach t in array array['dia_plantilla','dia_dias','dia_tareas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propio_select" on public.%I', t);
    execute format('drop policy if exists "propio_insert" on public.%I', t);
    execute format('drop policy if exists "propio_update" on public.%I', t);
    execute format('drop policy if exists "propio_delete" on public.%I', t);
    execute format('create policy "propio_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "propio_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "propio_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "propio_delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
