-- Mercado Pago (2026-10-30): movimientos de la billetera "para revisar".
-- Entran por el resumen que se baja de Mercado Pago (o, más adelante, por Claude leyendo los avisos
-- o una función con la clave de MP). Nada se carga solo en Economía: ella confirma cada uno en
-- Plata → Mercado Pago (pago de un vencimiento, gasto, cobro o ignorar).
-- Correr después de schema.sql y cuentas.sql. Se puede correr más de una vez.

create table if not exists public.eco_mp_movimientos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  externo        text not null,                 -- id de la operación en MP (o del aviso); evita duplicados
  fecha          date not null,
  sentido        text not null check (sentido in ('entra','sale')),
  monto          numeric(14,2) not null check (monto > 0),
  descripcion    text not null default '',
  origen         text not null default 'resumen' check (origen in ('resumen','mail','api','manual')),
  estado         text not null default 'nuevo' check (estado in ('nuevo','cargado','ignorado')),
  movimiento_id  uuid references public.eco_movimientos(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index if not exists eco_mp_movimientos_externo on public.eco_mp_movimientos (user_id, externo);
create index if not exists eco_mp_movimientos_user_fecha on public.eco_mp_movimientos (user_id, fecha desc);

do $$
begin
  execute 'alter table public.eco_mp_movimientos enable row level security';
  execute 'drop policy if exists "propio_select" on public.eco_mp_movimientos';
  execute 'drop policy if exists "propio_insert" on public.eco_mp_movimientos';
  execute 'drop policy if exists "propio_update" on public.eco_mp_movimientos';
  execute 'drop policy if exists "propio_delete" on public.eco_mp_movimientos';
  execute 'create policy "propio_select" on public.eco_mp_movimientos for select to authenticated using (user_id = auth.uid())';
  execute 'create policy "propio_insert" on public.eco_mp_movimientos for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir())';
  execute 'create policy "propio_update" on public.eco_mp_movimientos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir())';
  execute 'create policy "propio_delete" on public.eco_mp_movimientos for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir())';
end $$;
