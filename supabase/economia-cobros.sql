-- Economía: cobros que quedan pendientes (ej. la fábrica que paga atrasado).
-- adeudado = lo que te deben de esa fuente; puede_adeudarse = suele quedar debiendo.
-- Aplicado en la nube el 2026-10-15.
alter table public.eco_ingresos add column if not exists adeudado numeric(14,2) not null default 0;
alter table public.eco_ingresos add column if not exists puede_adeudarse boolean not null default false;
