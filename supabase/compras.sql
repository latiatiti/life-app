-- Módulo Compras (etapa 3). Se corre después de schema.sql. Se puede correr varias veces.

-- Supermercados donde comprás, con el orden de los pasillos/bloques que vas armando.
create table if not exists public.com_supers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  cadena     text not null default 'otro',          -- carrefour | vea | jumbo | otro
  bloques    jsonb not null default '[]'::jsonb,     -- orden de bloques en ese súper
  created_at timestamptz not null default now()
);

-- Catálogo personal: lo que comprás. Puede estar enlazado a un producto del stock.
create table if not exists public.com_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  bloque      text not null default 'Almacén',
  producto_id uuid,                                  -- stk_productos.id (opcional)
  ean         text,
  marca       text not null default '',
  unidad      text not null default 'u',
  en_lista    boolean not null default false,
  cantidad    numeric(10,2) not null default 1,      -- cuánto llevar en la próxima compra
  precios     jsonb not null default '{}'::jsonb,    -- último precio online por cadena
  created_at  timestamptz not null default now()
);

-- Historial de precios: online (referencia), ticket (lo que pagaste) o manual.
create table if not exists public.com_precios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id    uuid not null,
  cadena     text not null default 'otro',
  super_id   uuid,
  precio     numeric(12,2) not null,
  fuente     text not null default 'ticket',
  fecha      date not null default current_date,
  compra_id  uuid,
  created_at timestamptz not null default now()
);

-- Cada salida a comprar: estimado contra ticket.
create table if not exists public.com_compras (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha         date not null default current_date,
  super_id      uuid,
  estimado      numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  items         jsonb not null default '[]'::jsonb,
  movimiento_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists com_precios_item on public.com_precios (item_id, fecha);

do $$
declare t text;
begin
  foreach t in array array['com_supers','com_items','com_precios','com_compras'] loop
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
