-- Control del espacio de la nube (2026-10-29): cuánto ocupa la base frente al límite del plan gratis de Supabase.
-- La app lo muestra en Ajustes y avisa al 70 % y al 90 %. Solo devuelve tamaños, ningún dato.
create or replace function public.life_uso() returns json
language sql stable security definer set search_path = public, pg_catalog as $$
  select json_build_object(
    'bytes', pg_database_size(current_database()),
    'limite', 500 * 1024 * 1024,
    'tablas', (select coalesce(json_agg(json_build_object('tabla', relname, 'bytes', pg_total_relation_size(relid)) order by pg_total_relation_size(relid) desc), '[]'::json)
               from pg_stat_user_tables where schemaname = 'public')
  );
$$;
revoke all on function public.life_uso() from public, anon;
grant execute on function public.life_uso() to authenticated;
