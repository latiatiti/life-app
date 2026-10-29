-- Comida y cuerpo (2026-10-29): perfil para calcular las metas, hora de cada comida y mediciones del cuerpo.
-- Correr después de schema.sql y cuentas.sql. Se puede correr más de una vez.

-- Perfil para las metas: {altura_cm, edad, formula: 'hombre'|'mujer', actividad, objetivo, kg_mes}.
alter table public.ali_metas add column if not exists perfil jsonb not null default '{}'::jsonb;

-- Hora en que comiste ('HH:MM'). Sirve para ver cuántas horas pasás sin comer.
alter table public.ali_comidas add column if not exists hora text
  check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Mediciones del cuerpo: peso en ayunas (kg) y cintura a la altura del ombligo (cm), brazo opcional.
create table if not exists public.ali_cuerpo (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha      date not null,
  peso       numeric(5,1),
  cintura    numeric(5,1),
  brazo      numeric(5,1),
  nota       text,
  created_at timestamptz not null default now()
);
create index if not exists ali_cuerpo_user_fecha on public.ali_cuerpo (user_id, fecha);
comment on table public.ali_cuerpo is 'Mediciones del cuerpo: peso en ayunas (kg), cintura al ombligo (cm), brazo (cm). Una fila por medición.';
comment on column public.ali_comidas.hora is 'Hora en que comió, HH:MM (para ver las ventanas sin comer).';

alter table public.ali_cuerpo enable row level security;
drop policy if exists "propio_select" on public.ali_cuerpo;
drop policy if exists "propio_insert" on public.ali_cuerpo;
drop policy if exists "propio_update" on public.ali_cuerpo;
drop policy if exists "propio_delete" on public.ali_cuerpo;
create policy "propio_select" on public.ali_cuerpo for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.ali_cuerpo for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.ali_cuerpo for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.ali_cuerpo for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());
