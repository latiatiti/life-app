-- Ejercicios propios (2026-10-08): los que carga la usuaria o pega Claude, con su mapa muscular y hasta 5 variantes.
-- Correr DESPUÉS de entreno-ciclos.sql. Se puede correr más de una vez.
create table if not exists public.ent_ejercicios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  grupo       text not null,
  secundarios text[] not null default '{}',
  equipo      text not null default 'otro',
  compuesto   boolean not null default false,
  salto       numeric(5,2) not null default 2.5,
  zonas       jsonb not null default '{}'::jsonb,
  sentir      text not null default '',
  variantes   text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create unique index if not exists ent_ejercicios_user_nombre on public.ent_ejercicios (user_id, lower(nombre));

alter table public.ent_ejercicios enable row level security;
drop policy if exists "propio_select" on public.ent_ejercicios;
drop policy if exists "propio_insert" on public.ent_ejercicios;
drop policy if exists "propio_update" on public.ent_ejercicios;
drop policy if exists "propio_delete" on public.ent_ejercicios;
create policy "propio_select" on public.ent_ejercicios for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.ent_ejercicios for insert to authenticated with check (user_id = auth.uid());
create policy "propio_update" on public.ent_ejercicios for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio_delete" on public.ent_ejercicios for delete to authenticated using (user_id = auth.uid());
