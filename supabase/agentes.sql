-- Panel de agentes (2026-11-27). Aplicar después de cuentas.sql y seguridad.sql.
-- Lo que hacen los agentes de LIFE (Zonka, Gonzalito, Lupita, Sapires…) para verlo en Panel → Agentes.
-- Los agentes escriben con el conector (agentes_anotar / agentes_proponer); ella responde desde la app.

-- Una tarea de agentes "en relevo": pasa por estaciones y cada agente suma un paso.
create table if not exists public.age_trabajos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo      text not null,
  agente      text not null,                       -- quién la tiene ahora (zonka, gonzalito, lupita, sapires, constructor…)
  receta      text,                                -- tipo de tarea, ej. "pantalla nueva", "revisión"
  estado      text not null default 'en_curso' check (estado in ('pedido', 'en_curso', 'espera_ok', 'hecho', 'frenado')),
  estaciones  jsonb not null default '[]',         -- [{nombre, agente, estado: hecho|ahora|falta}]
  vueltas     integer not null default 0,          -- veces que el control la devolvió
  novedades   jsonb not null default '[]',         -- [{fecha (timestamptz), agente, texto}] la más nueva al final
  nota        integer,                             -- cómo salió, % contra lo esperado (escala de LIFE)
  link        text,                                -- PR, boceto o informe
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Una mejora que propone un agente y espera su Sí / No / Cambiar.
create table if not exists public.age_propuestas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agente        text not null,
  texto         text not null,
  porque        text,                              -- en qué se basa (el marco o dato)
  link          text,
  trabajo_id    uuid references public.age_trabajos(id) on delete set null,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'si', 'no', 'cambiar')),
  respuesta     text,                              -- lo que ella pidió cambiar
  respondida_at timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.age_trabajos enable row level security;
alter table public.age_propuestas enable row level security;

create policy "propio_select" on public.age_trabajos for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.age_trabajos for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.age_trabajos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.age_trabajos for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());

create policy "propio_select" on public.age_propuestas for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.age_propuestas for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.age_propuestas for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.age_propuestas for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());

create index if not exists age_trabajos_user on public.age_trabajos (user_id, updated_at desc);
create index if not exists age_propuestas_user on public.age_propuestas (user_id, estado);

-- 2026-11-27 (Tu equipo en el Inicio): "pedido" = ella se lo pidió desde la app y ningún Claude lo tomó todavía.
-- Por si la tabla ya existía con el control viejo.
alter table public.age_trabajos drop constraint if exists age_trabajos_estado_check;
alter table public.age_trabajos add constraint age_trabajos_estado_check
  check (estado in ('pedido', 'en_curso', 'espera_ok', 'hecho', 'frenado'));
