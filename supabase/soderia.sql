-- Sodería (2026-10-29): copia de solo lectura de lo que dice el software de la sodería Tía Titi
-- sobre su repartidor (Mauro): lo que le deben y los repartos de cada día.
-- La app solo LEE estas tablas. Las llena el servidor (función life-mcp → soderia_guardar, o la
-- función soderia cuando tenga la clave de la sodería). La sodería es la fuente de verdad: cada
-- sincronización pisa lo anterior. Correr después de cuentas.sql. Se puede correr más de una vez.

-- Una fila por usuario: la cuenta de la persona en la sodería.
-- movimientos = [{dia, tipo: devengado|pago|compensacion|ajuste, concepto, monto}] (los pagos en negativo).
create table if not exists public.sod_cuenta (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  persona_id      text not null,
  persona         text not null,
  saldo           numeric not null default 0,
  monto_semanal   numeric,
  cierres_impagos integer not null default 0,
  movimientos     jsonb not null default '[]'::jsonb,
  actualizado     timestamptz not null default now(),
  origen          text not null default 'claude',
  created_at      timestamptz not null default now()
);
create unique index if not exists sod_cuenta_user on public.sod_cuenta (user_id);

-- El reparto de cada día según el orden guardado en la sodería (dia_semana 0 = domingo … 6 = sábado),
-- o el de una fecha puntual si fecha no es null (gana sobre el del día de la semana).
-- paradas = [{nombre, zona, llegada 'HH:MM', sale 'HH:MM'}].
create table if not exists public.sod_repartos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  fecha       date,
  salida      text check (salida is null or salida ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  regreso     text check (regreso is null or regreso ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  paradas     jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists sod_repartos_user_dia on public.sod_repartos (user_id, dia_semana);

-- Solo lectura desde la app: no hay reglas de insert/update/delete (el servidor usa la llave de servicio).
alter table public.sod_cuenta enable row level security;
alter table public.sod_repartos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sod_cuenta' and policyname = 'propio_select') then
    create policy propio_select on public.sod_cuenta for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sod_repartos' and policyname = 'propio_select') then
    create policy propio_select on public.sod_repartos for select to authenticated using (user_id = auth.uid());
  end if;
end $$;
