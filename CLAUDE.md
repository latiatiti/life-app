# LIFE — contexto para Claude Code

App personal que centraliza áreas de la vida (economía, pagos, tareas, calendario, compras, entrenamiento, sueño…) en módulos que cruzan datos entre sí para tomar mejores decisiones. Meta a futuro: que sea vendible. **No tiene relación con la sodería.**

Forma de trabajo: hub central + módulos de a uno, profundizando los anteriores mientras se suman nuevos. Hablar con el usuario en español rioplatense y simple (no es programador).

## Stack
- PWA instalable (PC y celular): React 19 + TypeScript + Vite 8.
- Datos en Supabase (PostgreSQL + RLS: cada usuario ve solo lo suyo). Sin Supabase configurado funciona en "modo local" (guarda en el navegador).
- Comandos: `npm install`, `npm run dev`, `npm run build`. Ver `LEEME.md`.
- `../LIFE-demo.html` es un build de un solo archivo (modo local) para abrir con doble clic.

## Arquitectura
- `src/core/types.ts`: contrato `Modulo` { id, nombre, icono, pantallas, Resumen (tarjeta del hub), useSenales(), useAgenda(), useActividad(), enHub }.
- `src/core/juego.ts`: nivel, XP y racha (la usuaria pidió estética de juego). `useActividad()` devuelve una fecha por registro; 10 XP cada uno.
- Tema: siempre oscuro, acento violeta neón + cian para XP (tokens en `styles.css`).
- `src/core/registry.ts`: lista de módulos. **Sumar un módulo** = crear `src/modules/<x>/index.tsx` y registrarlo acá.
- `src/core/db.ts`: capa de datos (`useTabla`, `crear`, `modificar`, `eliminar`, exportar/importar respaldo). Agregar las tablas nuevas a `TABLAS`.
- `src/hub/Hub.tsx`: junta señales (ordenadas por nivel) y agenda compartida (14 días) de todos los módulos.
- Rutas por hash: `#/economia` (+ `/movimientos`, `/ingresos`, `/cuentas`), `#/pagos`, `#/entrenamiento` (+ `/progreso`, `/historial`, `/rutina`, `/entrenador`), `#/stock` (+ `/lista`), `#/compras` (+ `/escanear`, `/comprando`, `/precios`, `/historial`), `#/alimentacion` (+ `/platos`, `/metas`), `#/ajustes`.
- `src/modules/ajustes/semilla.ts`: botón "Cargar mi configuración" con los datos reales de la usuaria (ingresos, fijos, básicos, platos). Idempotente por nombre.

## Tablas (`supabase/schema.sql` + `entreno-v2.sql` + `entreno-ciclos.sql` + `entreno-ejercicios.sql`, en ese orden)
- `eco_cuentas`, `eco_categorias`, `eco_movimientos`, `eco_ingresos`, `pag_pagos`, `ent_sesiones`, `ent_series`, `ent_rutinas` (dias jsonb), `ent_ejercicios` (ejercicios propios con zonas y variantes), `stk_productos`, `ali_platos` (ingredientes jsonb), `ali_comidas`, `ali_extras` (agua/suplementos), `ali_metas` (una fila).
- Compras (`supabase/compras.sql`, aplicado en la nube): `com_supers` (bloques jsonb = orden de pasillos de ese súper), `com_items` (catálogo propio; precios jsonb = último precio online por cadena; producto_id enlaza al stock), `com_precios` (historial: online/ticket/manual), `com_compras` (estimado vs total del ticket, items jsonb, reparto y ticket jsonb).
- Prefijos por módulo: `eco_`, `pag_`, `ent_`, `stk_`, `ali_`; `com_`; próximos `tar_` (tareas), `cal_` (calendario), `mer_` (mercado).
- Toda tabla nueva: con `user_id` y política RLS, igual que las existentes.

## Cruces ya implementados
- Pagos → Economía: "Pagar" crea el gasto y avanza el vencimiento.
- Pagos → Agenda/Hub: vencimientos de los próximos 60 días.
- Pagos × Economía × Ingresos: señal "¿alcanza la plata?" (pagos en 30 días vs. disponible + cobros esperados).
- Ingresos → Economía: "Cobré" crea el ingreso y avanza al próximo cobro; los cobros van a la agenda.
- Entrenamiento → Alimentación: los días con entreno suben la meta de proteína y calorías.
- Alimentación → Stock: registrar un plato descuenta sus ingredientes; "con lo que hay podés hacer".
- Stock → Hub: faltantes, vencimientos (señales y agenda). Lista de compras suma al stock al tildar.
- Entrenamiento (v2, 2026-10-07): biblioteca de ~70 ejercicios con grupo muscular (`biblioteca.ts`); rutina editable guardada en `ent_rutinas` (si no hay, usa `RUTINA_BASE`); modo entrenando con chequeo previo (sueño/energía/dolor → ajusta series, peso y RPE), series de calentamiento, cambiar ejercicio solo por hoy, deshacer, terminar antes; estado en localStorage (sobrevive sin señal). Al guardar muestra el resultado (tonelaje, RPE medio, carga = RPE sesión × min, récords, Δ vs. la vez anterior, próxima carga). Progreso: series por músculo vs. semana pasada con rango 10–20, barras de 8 semanas, 1RM Epley y estancamiento; señal de descarga por fatiga (`analisis.ts`).
- Claude como entrenador: pantalla Coach copia un informe de 4 semanas para pegar en el chat y acepta una rutina en JSON (`{nombre, notas, dias:[{id,nombre,ejercicios:[{nombre,series,repsMin,repsMax,descanso,rpe,salto,nota}]}]}`) con vista previa antes de activarla.
- Economía: señales de presupuesto al 80 % y 100 %, y gasto mayor que ingreso en el mes.
- Compras: precios online vía la función de Supabase `precios` (`supabase/functions/precios`, proxy a los catálogos VTEX públicos de Carrefour, Vea y Jumbo; busca por texto o por código de barras). La app la llama con la anon key del proyecto Life (en `compras/modelo.ts`). Son precios web de referencia; el real sale del ticket.
- Stock → Compras: "Falta en casa" suma faltantes a la lista. Compras → Stock/Economía: cerrar la compra suma al stock lo enlazado, guarda el precio real de cada cosa y crea el gasto (categoría Súper).
- Escanear (compra compartida con Ulises): cámara con ZXing (`compras/Escaner.tsx`, cargado aparte), cada cosa con para quién (Yo / Ulises / Los dos, `PERSONAS` en `stock/modelo.ts`), cantidad y precio opcional; total y reparto (lo de los dos va a medias). Carro en localStorage (`life.compras.carrito`). Al cerrar: compra con `reparto` (quién pagó y cuánto debe el otro), precios del ticket, stock de cada dueño (`stk_productos.persona`, SQL `supabase/compras-personas.sql`, aplicado en la nube) y gasto si pagó ella. Lo de Ulises no cuenta como faltante.
- Modo compra con escáner (2026-10-09, pestaña "Modo compra" = `#/compras/escanear`; la de pasillos quedó como "Por pasillos"): tablero fijo (gastado, cosas en el carro, te falta = lista + faltantes de casa no cargados, `faltaAgarrar`), cada escaneo abre una ventana para confirmar (foto, último precio pagado, ya en el carro, cantidad, para quién, precio). Cierre en 3 pasos: QR fiscal del ticket (`leerQrTicket`: ARCA solo trae total, fecha, CUIT y número, no los productos), precio de cada cosa con ▲▼ contra el último ticket, quién pagó. `com_compras.ticket` jsonb (`supabase/compras-ticket.sql`, aplicado). Subas y bajas: `cambiosDePrecio` (tarjeta en Precios y señal en el hub).
- Por pasillos: estado en localStorage (`life.compras.encurso`), bloques en el orden guardado del súper (▲▼ lo reordena), "en este pasillo también" sugiere lo que comprás seguido o falta en casa.

## Preparador y ciclos (2026-10-06)
- `ent_rutinas` guarda cada ciclo como una fila: `inicio` (lunes) + `ciclo` jsonb {semanas, objetivo, perfil, numero}. Solo una `activa`; las viejas quedan como historial (`empezarCiclo` en `modelo.ts`). SQL: `supabase/entreno-ciclos.sql` (aplicado).
- `ciclo.ts`: semanas del ciclo (s+1, s50%, rpe-1, rpe6, c85), `ajustarDia`, peso inicial por perfil (`pesoInicial`), propuesta automática del próximo ciclo (`proponerCiclo`: cambia ejercicios estancados, ajusta series por rango de volumen, no sube volumen si la adherencia < 70 %).
- `tabla.ts`: formato de tabla compacto para rutinas (lo que se le pide a Claude) + presets. Acepta nombres abreviados.
- `Preparador.tsx` (pestaña Preparador, ruta `#/entrenamiento/entrenador`): ciclo, propuesta, perfil, presets, informe para Claude y pegar tabla/JSON.
- Modo entrenando: steppers − / + (reps arranca en el mínimo o en lo de la última vez), RPE preelegido, botón fijo abajo para confirmar, encabezado fijo, notas rápidas. `Controles.tsx`: fotos inicio/final de Free Exercise DB (dominio público, CDN jsDelivr) alternadas como mini "reel" + imagen IA opcional (Pollinations, experimental).
- Mapa muscular (2026-10-08): `MapaMuscular.tsx` dibuja frente y espalda (silueta negra sobre blanco, mitad derecha espejada) con 17 zonas (`Zona` en `biblioteca.ts`) pintadas de amarillo (ayuda) a rojo (principal). `zonasDe(nombre)` usa el mapa propio del ejercicio, el fino de fábrica (`FINO`) o el del grupo; `queSentir()` da la pista de técnica. Se ve en el modo entrenando (reemplaza las fotos, que quedan como "Ver fotos"), en el selector, en el editor de rutina y en Progreso ("Mapa de la semana": series por zona, 15 = rojo).
- Ejercicios propios: tabla `ent_ejercicios` (`supabase/entreno-ejercicios.sql`), `useBiblioteca()` los suma a la biblioteca (`fijarPropios` + `todos()`); llamarlo arriba de cada pantalla que use ejercicios. Se cargan tocando la figura (Rutina → Mis ejercicios, o "Cargar un ejercicio nuevo" en el selector) o pegando `{"ejercicios":[{nombre, zonas:{pecho:1,…}, equipo, compuesto, salto, sentir, variantes}]}` en el Preparador.
- Variantes: hasta 5 por ejercicio (en el ejercicio o en el lugar de la rutina, `EjercicioPlan.variantes`; en la tabla, columna `var: A / B`). `variantesDe()` completa con las más parecidas por zonas. En el modo entrenando aparecen primero en "Cambiar por otro".
- Datos de prueba: Ajustes → Cargar/Borrar historial de prueba (`public/historial-prueba.json`, generado con `scripts/gen-historial.mjs`; ids `cafe0000-…`).

## Hoja de ruta (plan aprobado el 2026-10-05, ver doc del plan en la memoria del proyecto)
1. ✅ Puesta a punto + versión base de Entreno, Stock y Comida conectados (falta: la usuaria crea Supabase y Netlify y publicamos).
2. Entrenamiento completo: medición corporal guiada, otros deportes, cola offline para modo nube.
3. Stock y compras: ✅ lista con cuestionario, planilla de precios por cadena, oportunidades, modo compra por pasillos, cierre con ticket → stock + Economía, historial. Falta: foto del ticket con IA, código de barras (Open Food Facts), lista semanal/mensual automática, calendario de ofertas/bancos de Mendoza.
4. Alimentación: plan mensual (días de fábrica/reparto, viandas), macros por ingrediente, sugerencias según stock y dieta.
5. Inicio con timeline del día + proyecciones (simulador, inflación IPC, objetivos de ahorro como vacaciones, ocio separado a mano, gastos compartidos con deuda por persona).
6. WhatsApp (CallMeBot a su propio número, disparado desde Supabase), carga por foto de ticket/audio/chat con IA gratuita, módulo Mercado (noticias de medios y foros filtradas por sus tenencias de Cocos, sin recomendaciones de inversión).
Después: salud, hábitos, tareas programadas, auto, calendario con carga rápida.

## Publicación (iPhone)
- Web app en Netlify: `npm run build` y subir `dist/` (copia lista en `../publicar-netlify/` y `../life-netlify.zip`) por app.netlify.com/drop o la pestaña Deploys del sitio.
- iOS: `apple-touch-icon` (icon-180.png), `apple-mobile-web-app-capable`, barra translúcida con `safe-area-inset-top`. Íconos PNG generados desde `public/icon.svg`.
- Sin Supabase, iOS guarda los datos solo en ese navegador/ícono: conectar Supabase para no perderlos.
- App de tienda (más adelante, si hace falta): envolver con Capacitor; requiere cuenta de Apple Developer (USD 99/año) y compilar en una Mac o servicio en la nube.

## Reglas
- Antes de dar algo por terminado: `npm run build` sin errores.
- Trabajar en entregas chicas y cerradas (pedido de la usuaria, para no quedar a medias si se cortan los créditos).
- Para probar en este entorno: copiar la app a una carpeta de trabajo, `npm ci`, y volver a copiar `src/`, `supabase/`, `public/` y docs a la carpeta del proyecto (no subir `node_modules`). Regenerar `../LIFE-demo.html` con `npm run build:single`.
- Cada módulo nuevo debe aportar al menos una señal o un ítem de agenda al hub (el valor está en los cruces).
- Mantener este archivo actualizado cuando cambie la arquitectura o la hoja de ruta.
