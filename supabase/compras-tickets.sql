-- Compras: tickets guardados (QR o foto) con sus productos, para repartir de a uno entre Yo / Ulises / Los dos.
-- Se guarda apenas se lee el QR: los links de ticket digital suelen servir una sola vez.
create table if not exists public.com_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha      date not null default current_date,
  origen     text not null default 'qr',              -- qr | foto | manual
  qr         text,                                    -- lo que trae el QR, tal cual
  url        text,                                    -- link final del ticket digital
  html       text,                                    -- copia de la página (el link puede vencer)
  texto      text,                                    -- texto leído (de la página o de la foto)
  fiscal     jsonb,                                   -- datos del QR de ARCA (total, CUIT, número)
  items      jsonb not null default '[]'::jsonb,      -- productos con para quién
  total      numeric(12,2),
  super_id   uuid,
  compra_id  uuid,
  estado     text not null default 'revisar',         -- revisar | cerrado
  created_at timestamptz not null default now()
);
alter table public.com_tickets enable row level security;
drop policy if exists propio_select on public.com_tickets;
drop policy if exists propio_insert on public.com_tickets;
drop policy if exists propio_update on public.com_tickets;
drop policy if exists propio_delete on public.com_tickets;
create policy propio_select on public.com_tickets for select using (user_id = auth.uid());
create policy propio_insert on public.com_tickets for insert with check (user_id = auth.uid());
create policy propio_update on public.com_tickets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy propio_delete on public.com_tickets for delete using (user_id = auth.uid());
