-- Chequeo del día (2026-11-26): lo contestado en el Arranque (mañana) y el Cierre (noche)
-- se guarda en la fila del día. Lo de otras secciones (agua, gastos, prioridades, pendientes)
-- va a sus tablas de siempre. La regla de acceso es la de dia_dias (cada cuenta ve lo suyo).
alter table public.dia_dias add column if not exists chequeo jsonb;

comment on column public.dia_dias.chequeo is
  'Chequeos del día: {manana:{hecho_at,acoste,levante,horas,sueno,energia(1-5),cuerpo:{zonas:{zona:1 cargada|2 duele},sintomas[],peso},plan}, noche:{hecho_at,agua_ml,dia(1-5),nota}}';
