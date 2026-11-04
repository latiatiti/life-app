-- Entreno: descanso real ANTES de cada serie, en segundos (lo mide el modo entrenando: tiempo desde la serie
-- anterior menos lo que dura hacerla). null en entrenos viejos. Correr después de entreno-ejercicios.sql. Es idempotente.
-- (La columna ya existe en la nube desde 2026-10-09; esto la deja documentada en el repo.)
alter table public.ent_series add column if not exists descanso_seg integer;
