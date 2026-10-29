# Pilares de la pantalla de entrenar

Cómo funciona el modo entrenando de LIFE y qué no se rompe al cambiarlo. Se suma a los pilares generales (`docs/pilares-de-diseno.md`) y a la escala de rendimiento y animación de `DISENO.md`. Boceto aprobado por ella el 2026-10-29: https://claude.ai/artifact/19usSDfhDfmhLj5UEzr4Mo (copia en project-files `diseno/entreno-boceto.html`).

Código: `src/modules/entrenamiento/Entrenando.tsx` (pantalla), `vivo.ts` (cuentas: rendimiento, tiempo estimado, calentamiento), `vivo.css` (estilos). La lógica de qué peso sugerir y cómo progresar vive en `modelo.ts` (`pesoSugerido`), `ciclo.ts` y `profe.ts` (hilo "Sugerir mejoras en las rutinas"): esta pantalla solo la muestra.

## Cómo se entrena (el recorrido)

1. **Llegar.** Una sola pantalla: qué día toca (con la semana del ciclo y su nota), el calentamiento sugerido (5 min de cardio + aproximación del primer ejercicio al 50 % × 10 y 75 % × 5) y tres preguntas de un toque (dormí, energía, dolor). Si no toca nada, empieza con el plan completo. "Empezar entreno" arranca el cronómetro.
2. **Serie.** Arriba el ejercicio grande y centrado, el cronómetro grande con el ritmo ("estimado 1 h 10 · vas a tiempo"), los tres números (peso, reps, RPE) con − y + ya puestos con el plan, el medidor de cómo venís y la vez pasada. Un botón grande abajo carga la serie y arranca el descanso.
3. **Descanso.** Cuenta regresiva grande en un anillo, +30 s y "Ya estoy", la serie recién guardada con DESHACER, qué sigue (con el peso y las reps que va a proponer) y el medidor. Al terminar vibra y vuelve sola a la serie.
4. **Cierre.** Medidor del día, series, duración y esfuerzo, cada ejercicio con su %, "¿Cómo fue todo?" (Liviano / Justo / Duro / Al límite = RPE de la sesión 5 / 7 / 8 / 10) y nota opcional. "Guardar en mi día" guarda y deja el entreno en Día.
5. **Guardado.** El medidor con el mismo % que se vio en vivo, y el resultado de siempre (récords, próxima vez).

## Reglas

- **Una vista, sin scroll** en el celu (probado en 390 × 844 y en iPhone SE 375 × 667; en pantallas bajitas se achica lo grande y se esconde la línea "la vez pasada"). Lo que no hace falta en cada serie va en hojas que suben: ☰ lista de ejercicios (también tocando la tira de progreso), ⋯ opciones (terminar ya, minimizar, cancelar), cómo venís, técnica, cambiar, nota.
- **Lo previsto ya cargado.** Peso = el de la serie anterior de hoy o el sugerido; reps = lo de esa serie la última vez con el mismo peso, o el mínimo del rango; RPE = el objetivo. Debajo de cada número, chiquito, lo que pide el plan; si se corre, se pone naranja.
- **Primera vez de un ejercicio:** el peso aparece en naranja como "?" con "elegí el peso"; el botón no carga hasta que lo elige. Desde la próxima queda asentado.
- **Cómo venís = contra lo esperado, no contra la vez pasada a secas.** Cada serie (peso × reps) se compara con lo que pedía el plan para esa serie (peso sugerido × reps previstas). Así una semana de descarga hecha como dice el plan da 100 %. Se pinta con la escala de rendimiento. Los ejercicios nuevos no cuentan hasta tener referencia.
- **Ritmo:** ~45 s por serie más el descanso de cada ejercicio. "vas a tiempo" dentro de ±2 min; si no, "X' adelante" o "X' atrás".
- **Ajuste por cómo llegás:** día bajo = una serie menos y ~10 % menos de peso; día medio = sin subir peso y tope RPE 8.
- **Nada se pierde:** el entreno vive en el celular (`life.entreno.encurso`) hasta guardarlo; sobrevive sin señal y si se cierra la app. Minimizar lo deja en la barra de actividad con "Volver". Cancelar pide confirmar. Cada serie se puede deshacer.
- **Pantalla completa encima del menú** (capa `.actividad`); en la compu queda centrada a 760 px con el mismo orden.
- **Va al Día:** cada entreno guardado aparece en Día y en la agenda del Inicio como hecho: "✓ Entreno · Día A Espalda y tríceps · 1 h 10 · 17 series · 104 % de lo esperado · justo" (`useAgenda` del módulo).
- **Escala y animación de toda la app** (ver `DISENO.md`): el medidor, los % por ejercicio, los números que saltan, la onda al tocar y las pantallas que entran hacia el lado que vas.

## Checklist antes de cambiar esta pantalla

- [ ] ¿Sigue entrando sin scroll en 390 × 844 y en 375 × 667?
- [ ] ¿Cargar una serie sigue siendo un solo toque con lo previsto?
- [ ] ¿El cronómetro y el ejercicio siguen siendo lo más grande?
- [ ] ¿Todo % usa la escala de rendimiento (con palabra e ícono)?
- [ ] ¿Lo nuevo que no es de cada serie fue a una hoja y no a la pantalla?
- [ ] ¿Se puede deshacer, minimizar y volver sin perder nada?
- [ ] ¿Las funciones nuevas con cruces sumaron su herramienta al conector `life-mcp`?

## Pendiente (propuestas, sin hacer)

Analíticas que faltan medir, para Zonka y para que ella decida: peso corporal (hoy solo el número fijo del perfil), medidas mensuales, sueño de todos los días (hoy solo en el chequeo), agua desde el descanso ("+ vaso").
