-- Compras compartidas (2026-10-08): de quién es cada producto del stock.
-- 'yo' (la usuaria), 'ulises' o 'compartido'. Se puede correr varias veces.
alter table public.stk_productos add column if not exists persona text not null default 'yo';
alter table public.com_compras add column if not exists reparto jsonb;
