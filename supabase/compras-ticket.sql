-- Compras: datos del QR fiscal del ticket (total, fecha, CUIT y número) en cada compra cerrada.
alter table public.com_compras add column if not exists ticket jsonb;
