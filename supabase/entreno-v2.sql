-- Entrenamiento v2 (2026-10-07): rutina editable, chequeo de cansancio, esfuerzo de la sesión y series de calentamiento.
-- Correr DESPUÉS de schema.sql, en Supabase > SQL Editor. Se puede correr más de una vez.

alter table public.ent_sesiones add column if not exists rpe_sesion smallint check (rpe_sesion between 1 and 10);
alter table public.ent_sesiones add column if not exists sueno_h    numeric(3,1);
alter table public.ent_sesiones add column if not exists energia    smallint check (energia between 1 and 5);
alter table public.ent_sesiones add column if not exists agujetas   smallint check (agujetas between 1 and 5);
alter table public.ent_sesiones add column if not exists dia_nombre text;

alter table public.ent_series add column if not exists tipo text not null default 'efectiva' check (tipo in ('efectiva', 'calentamiento'));

create table if not exists public.ent_rutinas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null default 'Mi rutina',
  dias       jsonb not null default '[]'::jsonb,
  activa     boolean not null default true,
  notas      text not null default '',
  created_at timestamptz not null default now()
);

alter table public.ent_rutinas enable row level security;
drop policy if exists "propio_select" on public.ent_rutinas;
drop policy if exists "propio_insert" on public.ent_rutinas;
drop policy if exists "propio_update" on public.ent_rutinas;
drop policy if exists "propio_delete" on public.ent_rutinas;
create policy "propio_select" on public.ent_rutinas for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.ent_rutinas for insert to authenticated with check (user_id = auth.uid());
create policy "propio_update" on public.ent_rutinas for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio_delete" on public.ent_rutinas for delete to authenticated using (user_id = auth.uid());
