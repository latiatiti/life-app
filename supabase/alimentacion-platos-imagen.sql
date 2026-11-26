-- Platos con foto (2026-11-23): descripción para generar la imagen con IA y el link de la imagen.
-- Solo suma dos columnas opcionales; no toca datos.
alter table public.ali_platos add column if not exists prompt text not null default '';
alter table public.ali_platos add column if not exists imagen text not null default '';

-- Fotos guardadas (2026-11-23, parte 2): la función "platos-foto" genera cada foto UNA vez y la guarda
-- en el bucket "platos" (lectura pública por link; solo la función escribe). imagen_error = por qué
-- quedó pendiente la última vez (vacío = sin error).
alter table public.ali_platos add column if not exists imagen_error text not null default '';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platos', 'platos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
