-- Entreno: descanso real después de cada serie (segundos). Si se corta el descanso, queda lo que se descansó de verdad.
-- Correr después de entreno-ejercicios.sql. Es idempotente.
alter table public.ent_series add column if not exists descanso_seg integer;
