# LIFE — contexto para Claude Code

App personal que centraliza áreas de la vida (economía, pagos, tareas, calendario, compras, entrenamiento, sueño…) en módulos que cruzan datos entre sí para tomar mejores decisiones. Meta a futuro: que sea vendible. **No tiene relación con la sodería.**

Forma de trabajo: hub central + módulos de a uno, profundizando los anteriores mientras se suman nuevos. Hablar con el usuario en español rioplatense y simple (no es programador).

## Stack
- PWA instalable (PC y celular): React 19 + TypeScript + Vite 8.
- Datos en Supabase (PostgreSQL + RLS: cada usuario ve solo lo suyo). Sin Supabase configurado funciona en "modo local" (guarda en el navegador).
- Comandos: `npm install`, `npm run dev`, `npm run build`. Ver `LEEME.md`.
- `../LIFE-demo.html` es un build de un solo archivo (modo local) para abrir con doble clic.

## Diseño (2026-10-25): pilares fijos
- **Toda pantalla nueva o cambiada sigue `docs/pilares-de-diseno.md`** (10 pilares: estructura primero, PC y celu mismo sistema, celu = calle / PC = oficina, una cosa un solo lugar, lo diario adelante, cada aviso con su botón, DESHACER después de guardar, avisar lo raro, lenguaje simple, datos de verdad). Pasar la checklist de su sección 8 antes de darla por hecha.
- `docs/mapa-estructura.md`: mapa de secciones, pestañas, objetos y piezas compartidas (fuente de verdad de dónde va cada cosa) + tandas pendientes. Si algo no entra en el mapa, primero se cambia el mapa.
- DESHACER automático: `core/db.ts` anota la inversa de cada `crear`/`modificar`/`eliminar` y `ui/Deshacer.tsx` muestra "Guardado · DESHACER" 5 s. Confirmaciones con `confirmar()` (no `window.confirm`).
- **Escala de rendimiento y animación** (2026-10-29, pedido de ella, `DISENO.md`): todo % contra lo esperado usa `ui/nivel.tsx` (`Medidor`, `Pct`, `nivelDe`): ⚠ rojo que parpadea < 75 · ▼ rojo · ● naranja · ✓ verde 97–104 · ◆ azul · ★ morado épico ≥ 115, siempre con palabra e ícono. Animaciones comunes: onda al tocar (`ui/onda.ts`), números que saltan (`useSalto`), pantallas que entran hacia el lado que vas. Cada hilo la ofrece en su pestaña si tiene sentido (Plata vs. presupuesto, Comida vs. meta, Día tareas hechas…).
- **Pantallas en vivo** (entreno, compra, cuestionarios): una vista sin scroll, botón grande abajo, lo demás en hojas. Modelo: `docs/pilares-entreno.md`.
- Los colores de AquaFlow del archivo NO se usan: ella eligió "Signos vitales · modo juego" (tokens en `src/tema/tema.css`).

## Arquitectura
- `src/core/types.ts`: contrato `Modulo` { id, nombre, icono, pantallas, Resumen, useSenales(), useAgenda(), useActividad(), useVital() (tarjeta del tablero), enHub }.
- `src/core/juego.ts`: nivel, XP y racha (la usuaria pidió estética de juego). `useActividad()` devuelve una fecha por registro; 10 XP cada uno.
- Tema: siempre oscuro. **Todo el look sale de `src/tema/tema.css`** (color principal `--acento`, capas, letras Chakra Petch / IBM Plex, esquinas `--radio`, animación, sección 8 "modo juego"); `styles.css` arma las piezas con esos tokens, sin colores sueltos. Guía en `DISENO.md`. Estilo "Signos vitales · modo juego" (2026-10-25, elegido por ella): HUD de videojuego en verde menta, piezas de juego al final de `styles.css`; estructura: **sin menú lateral** (2026-10-25, pedido de ella): barra fina arriba en compu y celu (`barra-sup`: "LIFE ▾" abre `MenuLife` = todas las secciones con sus pestañas; a la derecha + Cargar (compu), ⚙ Ajustes y Nube/Local); en el Inicio el LIFE grande del tablero es el que abre el menú; en el celu sigue la barra flotante de abajo (Inicio + `EN_BARRA` + "Más" = mismo menú); Inicio con tira de días `ui/Semana.tsx` y tarjeta del día.
- Menú por secciones (2026-10-25): `GRUPOS` en `App.tsx` junta módulos sin tocar sus rutas: **Plata** = Economía + Pagos, **Casa** = Stock + Compras + Comida (lista de compras única en Compras). Barra del celu = Inicio, Día, **+**, Plata, Más (`EN_BARRA` usa ids de sección; Entreno quedó en Más). El **+** (`hub/Cargar.tsx`, en la compu "+ Cargar" arriba del menú) abre "¿Qué cargás?": Gasto y Comí con su formulario de siempre ahí mismo, el resto lleva a su pantalla. Toda carga rápida nueva se suma a `OPCIONES` de ese archivo. En el celu, 4 pestañas y el resto en "⋯".
- `src/core/registry.ts`: lista de módulos. **Sumar un módulo** = crear `src/modules/<x>/index.tsx` y registrarlo acá.
- `src/core/db.ts`: capa de datos (`useTabla`, `crear`, `modificar`, `eliminar`, exportar/importar respaldo). Agregar las tablas nuevas a `TABLAS`.
- `src/hub/Hub.tsx` (2026-10-25, boceto de ella): Inicio = **tablero** con "LIFE" arriba y 8 tarjetas tipo signo vital (compu 4 × 2, celu 2 × 4): Día, Plata, Entreno, Comida, Compras, En casa (de `AREAS`), Mi partida (nivel/XP) y Para resolver (bandeja única de señales en una ventana). Cada módulo aporta `useVital()` {cifra, sub, barra, accion}; el estado y el aviso salen de sus señales (y `Senal.accion` gana sobre la acción de siempre). Debajo, la agenda de 14 días.
- Rutas por hash: `#/dia` (+ `/semana`), `#/economia` (+ `/movimientos`, `/ingresos`, `/proyeccion`, `/cuentas`), `#/pagos`, `#/entrenamiento` (+ `/progreso`, `/historial`, `/rutina`, `/entrenador`), `#/stock`, `#/compras` (+ `/escanear`, `/comprando`, `/ticket`, `/precios`, `/historial`), `#/alimentacion` (+ `/platos`, `/metas`), `#/ajustes`.
- `src/modules/ajustes/semilla.ts`: botón "Cargar mi configuración" con los datos reales de la usuaria (ingresos, fijos, básicos, platos). Idempotente por nombre.

## Cuentas y conexión con Claude (2026-10-15, `docs/cuentas-y-conexiones.md`)
- La nube de LIFE viene integrada (`NUBE_LIFE` en `core/config.ts`); solo `build:single` queda en modo local. Login por usuario (`mauro` = `mauro@life.com`), sin registro público. Aviso "Subir a mi cuenta" para datos que quedaron en el navegador.
- `supabase/cuentas.sql`: `perfiles` (rol superadmin/usuario/lector, modulos, activo), reglas de escritura con `life_puede_escribir()` en toda tabla con `user_id`, `api_claves`, `api_registro`, `life_columnas()`. `usePerfil()` en `core/auth.tsx`.
- Funciones: `cuentas` (superadmin: listar/crear/clave) y `life-mcp` (conector MCP para Claude con clave personal, sin JWT; leer/crear/modificar/borrar/deshacer con registro).

## Tablas (`supabase/schema.sql` + `entreno-v2.sql` + `entreno-ciclos.sql` + `entreno-ejercicios.sql` + `dia.sql`, en ese orden)
- `eco_cuentas`, `eco_categorias`, `eco_movimientos`, `eco_ingresos`, `pag_pagos`, `ent_sesiones`, `ent_series`, `ent_rutinas` (dias jsonb), `ent_ejercicios` (ejercicios propios con zonas y variantes), `stk_productos`, `ali_platos` (ingredientes jsonb), `ali_comidas`, `ali_extras` (agua/suplementos), `ali_metas` (una fila).
- Compras (`supabase/compras.sql`, aplicado en la nube): `com_supers` (bloques jsonb = orden de pasillos de ese súper), `com_items` (catálogo propio; precios jsonb = último precio online por cadena; producto_id enlaza al stock), `com_precios` (historial: online/ticket/manual), `com_compras` (estimado vs total del ticket, items jsonb, reparto y ticket jsonb).
- Día (`supabase/dia.sql`, aplicado en la nube): `dia_plantilla` (semana tipo, un bloque por fila: dia_semana 0=dom, inicio/fin 'HH:MM' con '24:00' = fin, tipo, opcional, come_alla), `dia_dias` (una fila por fecha: estado normal/libre/feriado/especial, nombre, nota, prioridades jsonb [{texto,hecho}], bloques jsonb = horario propio o null = semana tipo), `dia_tareas` (fecha, hora, prioridad alta/media/baja, origen 'app'|'claude'). Pensadas para la API de lectura/escritura de Claude.
- Prefijos por módulo: `eco_`, `pag_`, `ent_`, `stk_`, `ali_`; `com_`; `dia_`; próximos `tar_` (tareas), `cal_` (calendario), `mer_` (mercado).
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
- Ingresos con deuda (2026-10-15, `supabase/economia-cobros.sql`, aplicado): `eco_ingresos.adeudado` (lo que te debe esa fuente) y `puede_adeudarse` (la fábrica suele pagar atrasado). Botones Cobré (si cobrás menos, el resto queda pendiente) / Quedó pendiente / Me pagó. Botón de un toque para cargar Reparto $120.000 y Fábrica $135.000 los sábados.
- Proyección (`#/economia/proyeccion`, `Proyeccion.tsx`, `proyectar()` en `modelo.ts`): plata día por día a 30/60/90 días = disponible + cobros − vencimientos de Pagos; dos líneas (contando lo adeudado / si la fábrica no paga), deslizador para elegir día y línea de tiempo de lo que entra y sale. Señales: "Te deben $X" y día en rojo dentro de 30 días.
- Compras: precios online vía la función de Supabase `precios` (`supabase/functions/precios`, proxy a los catálogos VTEX públicos de Carrefour, Vea y Jumbo; busca por texto o por código de barras). La app la llama con la anon key del proyecto Life (en `compras/modelo.ts`). Son precios web de referencia; el real sale del ticket.
- Stock → Compras: "Falta en casa" suma faltantes a la lista. Compras → Stock/Economía: cerrar la compra suma al stock lo enlazado, guarda el precio real de cada cosa y crea el gasto (categoría Súper).
- Escanear (compra compartida con Ulises): cámara con ZXing (`compras/Escaner.tsx`, cargado aparte), cada cosa con para quién (Yo / Ulises / Los dos, `PERSONAS` en `stock/modelo.ts`), cantidad y precio opcional; total y reparto (lo de los dos va a medias). Carro en localStorage (`life.compras.carrito`). Al cerrar: compra con `reparto` (quién pagó y cuánto debe el otro), precios del ticket, stock de cada dueño (`stk_productos.persona`, SQL `supabase/compras-personas.sql`, aplicado en la nube) y gasto si pagó ella. Lo de Ulises no cuenta como faltante.
- Modo compra con escáner (2026-10-09, pestaña "Modo compra" = `#/compras/escanear`; la de pasillos quedó como "Por pasillos"): tablero fijo (gastado, cosas en el carro, te falta = lista + faltantes de casa no cargados, `faltaAgarrar`), cada escaneo abre una ventana para confirmar (foto, último precio pagado, ya en el carro, cantidad, para quién, precio). Cierre en 3 pasos: QR fiscal del ticket (`leerQrTicket`: ARCA solo trae total, fecha, CUIT y número, no los productos), precio de cada cosa con ▲▼ contra el último ticket, quién pagó. `com_compras.ticket` jsonb (`supabase/compras-ticket.sql`, aplicado). Subas y bajas: `cambiosDePrecio` (tarjeta en Precios y señal en el hub).
- Ticket (2026-10-10, `#/compras/ticket`, `Ticket.tsx` + `ticket.ts`): tabla `com_tickets` (`supabase/compras-tickets.sql`, aplicado). QR: si es el fiscal de ARCA guarda total/fecha; si es un link de ticket digital, PRIMERO guarda el QR y después lo baja UNA vez con la función `ticket` (`supabase/functions/ticket`, desplegada; los links vencen al abrirlos) y guarda la copia (html + texto, se ve en un iframe sin scripts). Foto: OCR en el teléfono con tesseract.js (español, datos desde jsDelivr; varias fotos si es largo), o pegar el texto. `leerProductos()` interpreta renglones "2 x 1.250,00" + producto, EAN, kg y descuentos. Repartir de a uno (foto del producto vía `precios`, Yo/Ulises/Los dos) → cuenta → `cerrarCarrito(..., vaciarCarro:false)`.
- Por pasillos: estado en localStorage (`life.compras.encurso`), bloques en el orden guardado del súper (▲▼ lo reordena), "en este pasillo también" sugiere lo que comprás seguido o falta en casa.

## Modo actividad, barra y avisos (2026-10-11)
- `src/ui/Actividad.tsx`: `ModoActividad` = capa a pantalla completa encima de todo (salir, etiqueta, progreso, minimizar; botones fijos abajo, el de confirmar verde `btn-confirmar grande-boton`; en la compu queda centrado a 760 px). Las preguntas o datos raros van en el `Modal` de siempre (en el celular sube desde abajo). Usarlo para toda actividad nueva (entreno, compra y cuestionario de la mañana deberían pasarse a este molde).
- `Modulo.enCurso()` (sin hooks, lee localStorage) → `BarraActividad`: lo que quedó a medias flota arriba del menú (celu) o abajo a la derecha (compu) con "Volver". Ya lo publican Pagos, Entreno y Compras. Al cambiar el estado, llamar `avisarCambio()`.
- `src/ui/Avisos.tsx`: avisos flotantes con las señales urgentes y las que traen `Senal.accion` {texto, ruta} (acceso directo, ej. "Pagar"). Al cerrarlos no vuelven hasta el otro día (`life.avisos.cerrados`). Señales de todos los módulos: `useTodasLasSenales()` en `core/senales.ts`.
- Pagos → "Ponerse al día" (`pagos/AlDia.tsx`, ruta `#/pagos/al-dia`): recorre vencidos y los de los próximos 7 días de a uno, registra el pago con control de monto (más de 30 % de diferencia pregunta). Estado en `life.pagos.aldia`.

## Día (2026-10-15)
- `src/modules/dia/`: línea del día deslizable por hora (cursor al centro que dice qué pasa a esa hora; línea roja = ahora), tarjeta "Ahora", plan en lista, tareas y prioridades, tira de la semana y calendario mensual (tocar un día lo abre; "Editar día": libre/feriado/especial, prioridades, nota, horario solo de ese día). Pestaña Semana tipo para editar cada día.
- Si `dia_plantilla` está vacía usa `SEMANA_BASE` (`modelo.ts`, armada con lo que contó: lun reparto, mar/mié fábrica 8–17, jue reparto partido + gym, vie fábrica + Challao, sáb reparto 10:30 y cobro, dom libre). Editar un día guarda toda la semana.
- Feriados nacionales 2026–2027 + Santiago Apóstol (Mendoza) en `FERIADOS`; los "puente" no cuentan como feriado automático.
- Gimnasio: domingo cerrado, sábado abre a las 7, entrenos ~1 h 30 (`GIMNASIO`). Días de fábrica come allá: bloques `come_alla`, `comeEnFabrica(bloques)` para Alimentación.
- Al hub: señales (tareas atrasadas, prioridad de hoy, feriado mañana), agenda (tareas, feriados, días libres) y XP por tarea hecha.

## Preparador y ciclos (2026-10-06)
- `ent_rutinas` guarda cada ciclo como una fila: `inicio` (lunes) + `ciclo` jsonb {semanas, objetivo, perfil, numero}. Solo una `activa`; las viejas quedan como historial (`empezarCiclo` en `modelo.ts`). SQL: `supabase/entreno-ciclos.sql` (aplicado).
- `ciclo.ts`: semanas del ciclo (s+1, s50%, rpe-1, rpe6, c85), `ajustarDia`, peso inicial por perfil (`pesoInicial`), propuesta automática del próximo ciclo (`proponerCiclo`: cambia ejercicios estancados, ajusta series por rango de volumen, no sube volumen si la adherencia < 70 %).
- `tabla.ts`: formato de tabla compacto para rutinas (lo que se le pide a Claude) + presets. Acepta nombres abreviados.
- `Preparador.tsx` (pestaña Preparador, ruta `#/entrenamiento/entrenador`): ciclo, propuesta, perfil, presets, informe para Claude y pegar tabla/JSON.
- Modo entrenando: steppers − / + (reps arranca en el mínimo o en lo de la última vez), RPE preelegido, botón fijo abajo para confirmar, encabezado fijo, notas rápidas. `Controles.tsx`: fotos inicio/final de Free Exercise DB (dominio público, CDN jsDelivr) alternadas como mini "reel" + imagen IA opcional (Pollinations, experimental).
- Mapa muscular (2026-10-08): `MapaMuscular.tsx` dibuja frente y espalda (silueta negra sobre blanco, mitad derecha espejada) con 17 zonas (`Zona` en `biblioteca.ts`) pintadas de amarillo (ayuda) a rojo (principal). `zonasDe(nombre)` usa el mapa propio del ejercicio, el fino de fábrica (`FINO`) o el del grupo; `queSentir()` da la pista de técnica. Se ve en el modo entrenando (reemplaza las fotos, que quedan como "Ver fotos"), en el selector, en el editor de rutina y en Progreso ("Mapa de la semana": series por zona, 15 = rojo).
- Ejercicios propios: tabla `ent_ejercicios` (`supabase/entreno-ejercicios.sql`), `useBiblioteca()` los suma a la biblioteca (`fijarPropios` + `todos()`); llamarlo arriba de cada pantalla que use ejercicios. Se cargan tocando la figura (Rutina → Mis ejercicios, o "Cargar un ejercicio nuevo" en el selector) o pegando `{"ejercicios":[{nombre, zonas:{pecho:1,…}, equipo, compuesto, salto, sentir, variantes}]}` en el Preparador.
- Variantes: hasta 5 por ejercicio (en el ejercicio o en el lugar de la rutina, `EjercicioPlan.variantes`; en la tabla, columna `var: A / B`). `variantesDe()` completa con las más parecidas por zonas. En el modo entrenando aparecen primero en "Cambiar por otro".
- Modo entrenando en una sola vista (2026-10-29, boceto aprobado, `docs/pilares-entreno.md`): Llegar (chequeo + calentamiento sugerido) → Serie (cronómetro grande, peso/reps/RPE con − +, medidor "cómo venís" contra lo que pedía el plan) ↔ Descanso (anillo, DESHACER, qué sigue) → Cierre (cómo fue: Liviano/Justo/Duro/Al límite) → "Guardar en mi día". Pantalla completa encima del menú, se minimiza a la barra. Cuentas en `vivo.ts`. Cada entreno guardado aparece en Día y la agenda (`useAgenda` de Entreno, con "% de lo esperado").
- Rutina propia (2026-10-26): preset `mia3` en `tabla.ts` = "Mi rutina 3 días" (A espalda+tríceps arrancando con remo en T, B pierna, C pecho alto+bíceps), con notas de progresión y de comida. También quedó activa en la nube (ciclo 2, inicio 2026-10-26). Ejercicios nuevos en la biblioteca: press inclinado en Smith, cruce de poleas de abajo hacia arriba, pec deck, pec deck invertido, pullover con mancuerna, curl concentrado, extensión tras nuca con barra, sentadilla en Smith.
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

## Zonka (2026-10-25)
- Zonka (con Z; si ella escribe Sonka es el mismo) = el agente que propone mejoras (habilidad `zonka`). Revisa qué no se está midiendo y por qué, investiga novedades (IA, tecnología), arma un informe con propuestas y ella acepta, corrige o descarta. Su memoria (gustos de ella, aceptado/descartado, pendientes) vive en la memoria del proyecto, archivo `zonka.md`; los informes son Claude Docs. Nada se implementa sin su OK.

## Gonza (2026-10-25)
- Gonza = el ingeniero de ciberseguridad (habilidad `gonza`): audita código, Supabase (RLS, asesores, funciones, cuentas), Netlify y dependencias, arma un informe con hallazgos por gravedad y ella decide. Memoria en `gonza.md` (memoria del proyecto). Nunca cambia la nube sin su OK.

## Reglas
- Antes de dar algo por terminado: `npm run build` sin errores.
- Trabajar en entregas chicas y cerradas (pedido de la usuaria, para no quedar a medias si se cortan los créditos).
- Para probar en este entorno: copiar la app a una carpeta de trabajo, `npm ci`, y volver a copiar `src/`, `supabase/`, `public/` y docs a la carpeta del proyecto (no subir `node_modules`). Regenerar `../LIFE-demo.html` con `npm run build:single`.
- Cada módulo nuevo debe aportar al menos una señal o un ítem de agenda al hub (el valor está en los cruces).
- **Conector para Claude siempre al día** (pedido de ella, 2026-10-25): `life-mcp` ve sola toda tabla nueva con `user_id` (vía `life_columnas()`), pero cada función nueva con cruces (pagar, cobrar, cerrar compra, chequeo…) suma también su herramienta propia al conector, para que Claude cargue igual que la app. Redesplegar `life-mcp` al cerrar la entrega.
- Mantener este archivo actualizado cuando cambie la arquitectura o la hoja de ruta.
