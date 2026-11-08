-- Tablero de pendientes e ideas (2026-11-07). Aplicar después de dia.sql y cuentas.sql.
-- Una cosa, un solo lugar: las tarjetas del tablero SON las tareas de dia_tareas.
-- Las que tienen fecha aparecen también en el Día; las sin fecha viven solo en el tablero.

-- Tarjeta = fila de dia_tareas con estas columnas nuevas.
alter table public.dia_tareas add column if not exists etapa     text;                          -- id de la etapa (ver dia_tablero); null = por hacer (o hecho si hecho = true)
alter table public.dia_tareas add column if not exists categoria text;                          -- Reparto, Pagos, Casa, Compras, Ideas de desarrollo…
alter table public.dia_tareas add column if not exists pasos     jsonb not null default '[]';   -- [{texto, hecho}] lo que implica
alter table public.dia_tareas add column if not exists orden     double precision;              -- orden dentro de la columna (menor = más arriba)
alter table public.dia_tareas add column if not exists movida    date;                          -- último cambio de etapa (para avisar lo que queda quieto)

-- Etapas y categorías propias (una fila por persona). Vacía = las de fábrica de la app.
create table if not exists public.dia_tablero (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  etapas      jsonb not null default '[]',   -- [{id, nombre}] en orden; la última es "hecho"
  categorias  jsonb not null default '[]',   -- ["Reparto", "Pagos", …]
  created_at  timestamptz not null default now()
);
alter table public.dia_tablero enable row level security;
create policy "propio_select" on public.dia_tablero for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.dia_tablero for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.dia_tablero for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.dia_tablero for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());
