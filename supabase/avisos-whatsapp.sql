-- Seguimiento de tarjetas y recordatorios por WhatsApp (2026-11-08). Aplicar después de tablero.sql.
--
-- 1) Cada tarjeta (dia_tareas) suma: novedades con fecha, recordatorio (día y hora) y a quién avisarle.
-- 2) avi_whatsapp: el número propio y la clave de CallMeBot (servicio gratis que manda WhatsApp a TU número).
-- 3) Cada 5 minutos la base manda los recordatorios vencidos (pg_cron + pg_net), sin servidor aparte.

alter table public.dia_tareas add column if not exists novedades            jsonb not null default '[]'; -- [{fecha ISO, texto}]
alter table public.dia_tareas add column if not exists recordar_en          timestamptz;                 -- cuándo avisar por WhatsApp
alter table public.dia_tareas add column if not exists recordatorio_enviado timestamptz;                 -- null = todavía no
alter table public.dia_tareas add column if not exists contacto             jsonb;                       -- {nombre, telefono} a quién avisarle
create index if not exists dia_tareas_recordar on public.dia_tareas (recordar_en) where recordatorio_enviado is null;

create table if not exists public.avi_whatsapp (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  telefono    text not null,                 -- con código de país, ej. +5492615551234
  apikey      text not null,                 -- la que manda CallMeBot por WhatsApp
  activo      boolean not null default true,
  ultimo_envio timestamptz,
  ultimo_error text,
  created_at  timestamptz not null default now()
);
alter table public.avi_whatsapp enable row level security;
create policy "propio_select" on public.avi_whatsapp for select to authenticated using (user_id = auth.uid());
create policy "propio_insert" on public.avi_whatsapp for insert to authenticated with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_update" on public.avi_whatsapp for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.life_puede_escribir());
create policy "propio_delete" on public.avi_whatsapp for delete to authenticated using (user_id = auth.uid() and public.life_puede_escribir());

-- Manda un WhatsApp a un número propio por CallMeBot (GET). Devuelve el id del pedido de pg_net.
create or replace function public.life_whatsapp_enviar(p_telefono text, p_apikey text, p_texto text) returns bigint
language sql security definer set search_path = public, extensions as $$
  select net.http_get(
    url := 'https://api.callmebot.com/whatsapp.php',
    params := jsonb_build_object('phone', p_telefono, 'text', p_texto, 'apikey', p_apikey)
  );
$$;
revoke all on function public.life_whatsapp_enviar(text, text, text) from public, anon, authenticated;

-- Botón "Probar" de Ajustes: manda un mensaje de prueba a la persona que lo toca.
create or replace function public.life_whatsapp_probar() returns text
language plpgsql security definer set search_path = public as $$
declare w public.avi_whatsapp;
begin
  select * into w from public.avi_whatsapp where user_id = auth.uid();
  if w is null then return 'Primero guardá tu número y la clave.'; end if;
  perform public.life_whatsapp_enviar(w.telefono, w.apikey, '✅ LIFE: tus recordatorios por WhatsApp ya están conectados.');
  update public.avi_whatsapp set ultimo_envio = now(), ultimo_error = null where id = w.id;
  return 'ok';
end $$;
revoke all on function public.life_whatsapp_probar() from public, anon;
grant execute on function public.life_whatsapp_probar() to authenticated;

-- Lo que corre cada 5 minutos: cada recordatorio vencido de quien tenga WhatsApp conectado.
create or replace function public.life_mandar_recordatorios() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; txt text; sigue text;
begin
  for r in
    select t.id, t.titulo, t.nota, t.pasos, t.recordar_en, w.telefono, w.apikey
    from public.dia_tareas t join public.avi_whatsapp w on w.user_id = t.user_id and w.activo
    where t.recordar_en <= now() and t.recordatorio_enviado is null and not t.hecho
      and t.recordar_en > now() - interval '1 day'   -- lo muy viejo no se manda
    order by t.recordar_en limit 50
  loop
    txt := '⏰ LIFE · ' || r.titulo;
    if r.nota is not null and r.nota <> '' then txt := txt || E'\n' || r.nota; end if;
    sigue := (select p ->> 'texto' from jsonb_array_elements(coalesce(r.pasos, '[]'::jsonb)) p
              where not coalesce((p ->> 'hecho')::boolean, false) limit 1);
    if sigue is not null then txt := txt || E'\nSigue: ' || sigue; end if;
    perform public.life_whatsapp_enviar(r.telefono, r.apikey, txt);
    update public.dia_tareas set recordatorio_enviado = now(),
      novedades = coalesce(novedades, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha', now(), 'texto', 'Te avisé por WhatsApp'))
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.life_mandar_recordatorios() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('life-recordatorios', '*/5 * * * *', 'select public.life_mandar_recordatorios()');
