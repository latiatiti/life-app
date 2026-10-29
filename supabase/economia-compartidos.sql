-- Economía: cuenta corriente con Ulises (o con quien comparta gastos). 2026-10-29.
-- Una fila por cosa compartida: un gasto (con qué parte le toca al otro), un préstamo o un pago para saldar.
-- monto = efecto en el saldo, ya calculado: positivo = el otro te debe; negativo = vos le debés.
-- El saldo es la suma de monto por persona (así Claude lo lee directo).
-- Correr después de schema.sql y cuentas.sql. Se puede correr más de una vez.
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
  monto         numeric(14,2) not null,
  movimiento_id uuid,                                  -- gasto o pago en tus cuentas, si lo hay
  compra_id     uuid,                                  -- compra del súper (com_compras) de donde salió
  created_at    timestamptz not null default now()
);
create index if not exists eco_compartidos_user_fecha on public.eco_compartidos (user_id, persona, fecha);

alter table public.eco_compartidos enable row level security;
drop policy if exists "propio_select" on public.eco_compartidos;
drop policy if exists "propio_insert" on public.eco_compartidos;
drop policy if exists "propio_update" on public.eco_compartidos;
drop policy if exists "propio_delete" on public.eco_compartidos;
create policy "propio_select" on public.eco_compartidos for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.eco_compartidos for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.eco_compartidos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.eco_compartidos for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());
