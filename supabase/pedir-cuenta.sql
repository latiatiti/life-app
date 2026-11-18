-- =====================================================================
-- LIFE · Pedir una cuenta y que la superadmin la apruebe (2026-11-18)
--
-- Correr después de cuentas.sql y seguridad.sql. Se puede correr más de una vez.
-- No borra ni mueve datos.
--
-- Cómo queda:
--   · Cualquiera puede pedir una cuenta desde la pantalla de entrada (correo y
--     contraseña, o Google). La cuenta nace EN ESPERA (perfiles.activo = false):
--     puede iniciar sesión pero no ve ni carga nada.
--   · La base le avisa a la función aviso-cuenta (pg_net), que le manda un mail a la
--     superadmin para que la apruebe o la rechace en Ajustes → Cuentas y roles.
--   · Las cuentas que crea la superadmin desde la app (función cuentas) traen
--     app_metadata.creada_por = 'superadmin' (solo lo puede poner el servidor):
--     nacen activas y sin mail.
--   · Tope: si en las últimas 24 h hubo más de 20 pedidos, los siguientes no mandan
--     mail (siguen en espera y se ven en el panel).
-- =====================================================================

alter table public.perfiles add column if not exists pedido_at timestamptz;
alter table public.perfiles add column if not exists aviso_at  timestamptz;
alter table public.perfiles add column if not exists via       text;

create or replace function public.life_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  de_admin boolean := coalesce(new.raw_app_meta_data->>'creada_por', '') = 'superadmin';
  proveedor text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  nombre_pedido text := left(trim(coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', '')), 60);
  recientes int;
begin
  if de_admin then
    insert into public.perfiles (user_id, usuario, rol, activo)
    values (new.id, split_part(new.email, '@', 1), 'usuario', true)
    on conflict do nothing;
    return new;
  end if;

  insert into public.perfiles (user_id, usuario, nombre, rol, activo, pedido_at, via)
  -- usuario queda vacío (es único y "mauro@gmail.com" chocaría con "mauro"): entra con su correo.
  values (new.id, null, nombre_pedido, 'usuario', false, now(),
          case when proveedor = 'google' then 'google' else 'correo' end)
  on conflict do nothing;

  -- Aviso por mail. Si algo falla, el pedido igual queda guardado (nunca frena el alta).
  begin
    select count(*) into recientes from public.perfiles where pedido_at > now() - interval '24 hours';
    if recientes <= 20 then
      perform net.http_post(
        url := 'https://jxnlgszmywoebjjpacod.supabase.co/functions/v1/aviso-cuenta',
        body := jsonb_build_object('user_id', new.id),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    raise warning 'aviso-cuenta: %', sqlerrm;
  end;
  return new;
end $$;

-- El trigger ya existe (cuentas.sql); se recrea igual por si faltara.
create or replace trigger life_perfil_nuevo after insert on auth.users
  for each row execute function public.life_perfil_nuevo();
