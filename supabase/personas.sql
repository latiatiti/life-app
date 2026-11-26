-- Personas con las que compartís compras y cosas de la casa (2026-11-23).
-- Reemplaza la lista fija Yo / Ulises / Los dos: cada cuenta arma la suya.
-- `clave` es lo que se guarda en stk_productos.persona, en el carro y en com_compras (por eso Ulises sigue siendo 'ulises').
-- `cuenta` = usuario de LIFE de esa persona (opcional), para cruzar compras entre cuentas más adelante.
create table if not exists public.per_personas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  clave       text not null,
  cuenta      text,
  orden       double precision not null default 0,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, clave)
);
alter table public.per_personas enable row level security;
create policy "propio_select" on public.per_personas for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.per_personas for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.per_personas for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.per_personas for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());

-- Quien ya usaba a Ulises en sus compras o su stock lo encuentra cargado.
insert into public.per_personas (user_id, nombre, clave, orden)
select distinct user_id, 'Ulises', 'ulises', 1 from public.stk_productos where persona = 'ulises'
on conflict (user_id, clave) do nothing;
insert into public.per_personas (user_id, nombre, clave, orden)
select distinct user_id, 'Ulises', 'ulises', 1 from public.com_compras where reparto is not null and (reparto->>'ulises')::numeric > 0
on conflict (user_id, clave) do nothing;
