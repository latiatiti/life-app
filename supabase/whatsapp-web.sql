-- WhatsApp web de LIFE (2026-11-11). Aplicar después de cuentas.sql y seguridad.sql.
--
-- Su propio WhatsApp conectado por QR (como WhatsApp Web) a un "puente" (carpeta whatsapp-puente/ del repo)
-- que corre prendido siempre en un servidor chico. El puente NO tiene la clave service_role: habla solo con la
-- función whatsapp-puente con una clave propia (secreto WA_PUENTE_CLAVE) y todo queda a nombre de la dueña (WA_DUENO).
--
-- wa_sesion        una fila: estado de la conexión, QR para escanear, pedido de conectar/desconectar desde la app.
-- wa_chats         una fila por conversación (solo chats de a dos, sin grupos).
-- wa_mensajes      los mensajes de texto de los últimos 30 días (el puente borra lo más viejo).
-- wa_salida        lo que hay que mandar (desde la app o desde Claude). El puente lo manda y anota el resultado.
-- wa_credenciales  la sesión de WhatsApp CIFRADA con una clave que vive solo en el servidor del puente.
--                  Sin reglas para usuarios: solo la lee y escribe la función (service_role).

create table if not exists public.wa_sesion (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  estado       text not null default 'apagado' check (estado in ('apagado', 'esperando_qr', 'conectando', 'conectado', 'desconectado', 'error')),
  qr           text,                 -- imagen data:image/png del QR (vive ~20 s; null cuando no hace falta)
  numero       text,                 -- su número conectado
  nombre       text,
  pedido       text check (pedido in ('conectar', 'desconectar')), -- lo pide la app, lo cumple el puente
  visto        timestamptz,          -- último latido del puente (si pasa de 2 min, está apagado)
  ultimo_error text,
  created_at   timestamptz not null default now()
);

create table if not exists public.wa_chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jid         text not null,         -- id de WhatsApp del chat (549261…@s.whatsapp.net)
  nombre      text,                  -- como lo tiene agendado (o el nombre de su perfil)
  telefono    text,
  ultimo_texto text,
  ultimo_at   timestamptz,
  sin_leer    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, jid)
);
create index if not exists wa_chats_ultimo on public.wa_chats (user_id, ultimo_at desc);

create table if not exists public.wa_mensajes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jid         text not null,
  wa_id       text not null,         -- id del mensaje en WhatsApp
  de_mi       boolean not null default false,
  texto       text,
  tipo        text not null default 'texto', -- texto, imagen, audio, video, documento, sticker, otro
  fecha       timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (user_id, wa_id)
);
create index if not exists wa_mensajes_chat on public.wa_mensajes (user_id, jid, fecha desc);

create table if not exists public.wa_salida (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  jid         text,                  -- chat existente, o
  telefono    text,                  -- un número (549261…)
  nombre      text,                  -- para mostrar
  texto       text not null check (length(texto) between 1 and 2000),
  origen      text not null default 'app' check (origen in ('app', 'claude')),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'cancelado')),
  no_antes    timestamptz not null default now() + interval '10 seconds', -- margen para DESHACER
  enviado_at  timestamptz,
  wa_id       text,
  error       text,
  created_at  timestamptz not null default now(),
  check (jid is not null or telefono is not null)
);
create index if not exists wa_salida_pendiente on public.wa_salida (user_id, no_antes) where estado = 'pendiente';

create table if not exists public.wa_credenciales (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  datos       text not null,         -- JSON cifrado AES-256-GCM (la clave está solo en el servidor del puente)
  actualizado timestamptz not null default now()
);

-- Reglas: cada una ve solo lo suyo. Mensajes y chats los escribe el puente; desde la app solo se marcan leídos.
alter table public.wa_sesion       enable row level security;
alter table public.wa_chats        enable row level security;
alter table public.wa_mensajes     enable row level security;
alter table public.wa_salida       enable row level security;
alter table public.wa_credenciales enable row level security; -- sin reglas: nadie con sesión la ve

create policy "propio_select" on public.wa_sesion for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.wa_sesion for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.wa_sesion for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());

create policy "propio_select" on public.wa_chats for select to authenticated using (user_id = auth.uid());
create policy "propio_update" on public.wa_chats for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());

create policy "propio_select" on public.wa_mensajes for select to authenticated using (user_id = auth.uid());

create policy "propio_select" on public.wa_salida for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.wa_salida for insert to authenticated
  with check (user_id = auth.uid() and public.life_puede_escribir() and estado = 'pendiente' and origen = 'app');
-- Solo se puede cancelar (o volver a pendiente) lo que todavía no salió.
create policy "propio_update" on public.wa_salida for update to authenticated
  using (user_id = auth.uid() and estado in ('pendiente', 'cancelado'))
  with check (user_id = auth.uid() and public.life_puede_escribir() and estado in ('pendiente', 'cancelado'));
create policy "propio_delete" on public.wa_salida for delete to authenticated
  using (user_id = auth.uid() and public.life_puede_escribir() and estado in ('pendiente', 'cancelado'));

revoke all on public.wa_credenciales from anon, authenticated;

-- Tope de envíos: 40 por día entre la app y Claude (cuida que WhatsApp no marque el número).
create or replace function public.life_wa_cupo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.wa_salida
      where user_id = new.user_id and created_at > now() - interval '1 day' and estado <> 'cancelado') >= 40 then
    raise exception 'Llegaste al tope de 40 mensajes por día desde LIFE.';
  end if;
  return new;
end $$;
revoke all on function public.life_wa_cupo() from public, anon, authenticated;
create or replace trigger wa_salida_cupo before insert on public.wa_salida for each row execute function public.life_wa_cupo();
