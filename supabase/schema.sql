-- =====================================================================
-- LIFE · Esquema de base de datos (Supabase / PostgreSQL)
-- Etapa 1: Economía + Pagos + Ingresos + Entrenamiento + Stock + Alimentación
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede correr más de una vez sin romper nada.
--
-- Cada fila pertenece a un usuario (user_id) y la seguridad por fila (RLS)
-- hace que cada persona vea solo sus datos. Así la misma base sirve
-- para muchos usuarios el día que la app se venda.
-- =====================================================================

-- ---------- Cuentas ----------
create table if not exists public.eco_cuentas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null,
  tipo          text not null check (tipo in ('efectivo','banco','billetera','tarjeta','inversion')),
  moneda        text not null default 'ARS' check (moneda in ('ARS','USD')),
  saldo_inicial numeric(14,2) not null default 0,
  archivada     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- Categorías ----------
create table if not exists public.eco_categorias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  tipo        text not null check (tipo in ('ingreso','gasto')),
  color       text not null default '#2a78d6',
  presupuesto numeric(14,2),
  created_at  timestamptz not null default now()
);

-- ---------- Pagos recurrentes ----------
create table if not exists public.pag_pagos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre              text not null,
  monto               numeric(14,2) not null default 0,
  moneda              text not null default 'ARS' check (moneda in ('ARS','USD')),
  categoria_id        uuid references public.eco_categorias(id) on delete set null,
  cuenta_id           uuid references public.eco_cuentas(id) on delete set null,
  frecuencia          text not null check (frecuencia in ('mensual','bimestral','trimestral','semestral','anual','unico')),
  dia                 smallint not null check (dia between 1 and 31),
  proximo_vencimiento date not null,
  activo              boolean not null default true,
  notas               text not null default '',
  created_at          timestamptz not null default now()
);

-- ---------- Movimientos ----------
create table if not exists public.eco_movimientos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha             date not null,
  tipo              text not null check (tipo in ('ingreso','gasto','transferencia')),
  monto             numeric(14,2) not null check (monto > 0),
  cuenta_id         uuid not null references public.eco_cuentas(id) on delete restrict,
  cuenta_destino_id uuid references public.eco_cuentas(id) on delete restrict,
  monto_destino     numeric(14,2),
  categoria_id      uuid references public.eco_categorias(id) on delete set null,
  descripcion       text not null default '',
  pago_id           uuid references public.pag_pagos(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint transferencia_con_destino check (
    (tipo = 'transferencia' and cuenta_destino_id is not null and cuenta_destino_id <> cuenta_id)
    or (tipo <> 'transferencia' and cuenta_destino_id is null)
  )
);

-- ---------- Ingresos recurrentes ----------
create table if not exists public.eco_ingresos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null,
  monto         numeric(14,2) not null default 0,
  moneda        text not null default 'ARS' check (moneda in ('ARS','USD')),
  frecuencia    text not null check (frecuencia in ('semanal','quincenal','mensual')),
  proximo_cobro date not null,
  cuenta_id     uuid references public.eco_cuentas(id) on delete set null,
  categoria_id  uuid references public.eco_categorias(id) on delete set null,
  activo        boolean not null default true,
  notas         text not null default '',
  created_at    timestamptz not null default now()
);

-- ---------- Entrenamiento ----------
create table if not exists public.ent_sesiones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha        date not null,
  dia          text not null,
  deporte      text not null default 'Gimnasio',
  duracion_min integer,
  sensacion    smallint check (sensacion between 1 and 10),
  notas        text not null default '',
  created_at   timestamptz not null default now()
);
create table if not exists public.ent_series (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sesion_id  uuid not null references public.ent_sesiones(id) on delete cascade,
  fecha      date not null,
  ejercicio  text not null,
  numero     smallint not null,
  peso       numeric(6,2) not null default 0,
  reps       smallint not null,
  rpe        smallint check (rpe between 1 and 10),
  created_at timestamptz not null default now()
);

-- ---------- Stock ----------
create table if not exists public.stk_productos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  lugar      text not null default 'alacena',
  cantidad   numeric(10,2) not null default 0,
  unidad     text not null default 'u',
  minimo     numeric(10,2) not null default 0,
  compra     numeric(10,2) not null default 0,
  vence      date,
  basico     boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Alimentación ----------
create table if not exists public.ali_platos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre       text not null,
  ingredientes jsonb not null default '[]'::jsonb,
  proteina     numeric(7,1) not null default 0,
  carbos       numeric(7,1) not null default 0,
  grasas       numeric(7,1) not null default 0,
  kcal         numeric(7,1) not null default 0,
  minutos      integer not null default 0,
  created_at   timestamptz not null default now()
);
create table if not exists public.ali_comidas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null,
  momento     text not null,
  plato_id    uuid references public.ali_platos(id) on delete set null,
  descripcion text not null default '',
  proteina    numeric(7,1) not null default 0,
  carbos      numeric(7,1) not null default 0,
  grasas      numeric(7,1) not null default 0,
  kcal        numeric(7,1) not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists public.ali_extras (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha      date not null,
  tipo       text not null check (tipo in ('agua','suplemento')),
  nombre     text not null,
  cantidad   numeric(8,1) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.ali_metas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proteina_entreno  numeric(6,1) not null default 140,
  proteina_descanso numeric(6,1) not null default 120,
  kcal_entreno      numeric(7,1) not null default 2800,
  kcal_descanso     numeric(7,1) not null default 2500,
  agua_ml           integer not null default 2500,
  suplementos       text not null default '',
  created_at        timestamptz not null default now()
);

-- ---------- Índices ----------
create index if not exists eco_movimientos_user_fecha on public.eco_movimientos (user_id, fecha desc);
create index if not exists eco_movimientos_pago on public.eco_movimientos (pago_id);
create index if not exists pag_pagos_user_venc on public.pag_pagos (user_id, proximo_vencimiento);
create index if not exists ent_series_sesion on public.ent_series (sesion_id);
create index if not exists ali_comidas_user_fecha on public.ali_comidas (user_id, fecha desc);

-- ---------- Seguridad por fila: cada usuario ve y toca solo lo suyo ----------
do $$
declare t text;
begin
  foreach t in array array['eco_cuentas','eco_categorias','pag_pagos','eco_movimientos','eco_ingresos',
                         'ent_sesiones','ent_series','stk_productos','ali_platos','ali_comidas','ali_extras','ali_metas'] loop
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
