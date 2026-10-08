-- Preparador (2026-10-06): cada rutina guarda su ciclo de 4 semanas (semanas, objetivo, perfil) y el día en que empezó.
-- Correr DESPUÉS de entreno-v2.sql. Se puede correr más de una vez. (Ya aplicado en el proyecto Life.)
alter table public.ent_rutinas add column if not exists inicio date;
alter table public.ent_rutinas add column if not exists ciclo jsonb;
