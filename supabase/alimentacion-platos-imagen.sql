-- Platos con foto (2026-11-23): descripción para generar la imagen con IA y el link de la imagen.
-- Solo suma dos columnas opcionales; no toca datos.
alter table public.ali_platos add column if not exists prompt text not null default '';
alter table public.ali_platos add column if not exists imagen text not null default '';
