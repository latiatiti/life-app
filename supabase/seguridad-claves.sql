-- =====================================================================
-- LIFE · Seguridad de claves y acceso (Gonzalito, 2026-11-13)
-- Correr DESPUÉS de cuentas.sql y seguridad.sql. Se puede correr más de una vez.
--
-- 1. Links de Claude (api_claves) con vencimiento: 90 días desde que se crean.
--    Los que ya existen vencen a los 90 días de su creación. life-mcp rechaza los vencidos.
-- 2. Guardia de claves: un link cortado no se puede "descortar", el permiso no puede pasar de
--    "solo leer" a "leer y cargar", la huella no se cambia y el vencimiento no se estira.
--    Así, aunque alguien robe una sesión abierta, no puede revivir un link viejo.
-- 3. Tope de 5 links activos por cuenta (uno por uso alcanza).
-- 4. Puente de WhatsApp: la app puede cambiar la clave del puente (guarda solo la huella).
-- =====================================================================

-- ---------- 1. Vencimiento ----------
alter table public.api_claves add column if not exists vence timestamptz;
update public.api_claves set vence = created_at + interval '90 days' where vence is null;
alter table public.api_claves alter column vence set default (now() + interval '90 days');
alter table public.api_claves alter column vence set not null;

-- ---------- 2 y 3. Guardia ----------
create or replace function public.life_claves_guardia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- El vencimiento lo pone la base (no más de 90 días), no la app.
    new.vence := least(coalesce(new.vence, now() + interval '90 days'), now() + interval '90 days');
    new.revocada := false;
    if (select count(*) from public.api_claves c
        where c.user_id = new.user_id and not c.revocada and c.vence > now()) >= 5 then
      raise exception 'Ya tenés 5 links activos para Claude. Cortá alguno antes de crear otro.';
    end if;
    return new;
  end if;

  -- UPDATE: solo se puede cambiar el nombre, cortar el link o anotar el último uso.
  if old.revocada and not new.revocada then
    raise exception 'Un link cortado no se puede volver a activar. Creá uno nuevo.';
  end if;
  if old.permiso = 'leer' and new.permiso = 'escribir' then
    raise exception 'Un link de solo lectura no puede pasar a cargar datos. Creá uno nuevo.';
  end if;
  if new.hash is distinct from old.hash or new.user_id is distinct from old.user_id
     or new.vence > old.vence or new.created_at is distinct from old.created_at then
    raise exception 'Esa parte del link no se puede cambiar.';
  end if;
  return new;
end $$;

create or replace trigger life_claves_guardia
  before insert or update on public.api_claves
  for each row execute function public.life_claves_guardia();

-- ---------- 4. Cambiar la clave del puente de WhatsApp ----------
-- La app genera una clave nueva en el navegador, manda SOLO su huella sha-256 y muestra la clave
-- una vez para pegarla en la compu del puente. La clave vieja deja de servir en el acto.
create or replace function public.life_wa_puente_nueva(huella text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión.'; end if;
  if not public.life_puede_escribir() then raise exception 'Esta cuenta no puede cambiar claves.'; end if;
  if huella !~ '^[0-9a-f]{64}$' then raise exception 'Huella inválida.'; end if;
  insert into public.wa_puente (user_id, hash, creada) values (auth.uid(), huella, now())
  on conflict (user_id) do update set hash = excluded.hash, creada = excluded.creada;
end $$;

revoke all on function public.life_wa_puente_nueva(text) from public, anon;
grant execute on function public.life_wa_puente_nueva(text) to authenticated;

-- Fecha de la clave del puente (sin la huella), para avisar cuándo cambiarla.
create or replace function public.life_wa_puente_fecha()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$ select creada from public.wa_puente where user_id = auth.uid() $$;

revoke all on function public.life_wa_puente_fecha() from public, anon;
grant execute on function public.life_wa_puente_fecha() to authenticated;
