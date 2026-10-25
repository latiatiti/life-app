# Mapa de estructura de LIFE

Fuente de verdad de **dónde va cada cosa** (pilar 1 y sección 2 de `pilares-de-diseno.md`). Todo pedido de pantalla nueva dice en qué sección y pestaña va. Si no entra, primero se cambia este mapa.

Estado: relevamiento 2026-10-25. **Plata, Casa y el botón + aprobados y hechos (2026-10-25).**

---

## 1. Lo que hay hoy (relevamiento)

### Navegación

| | Compu | Celu |
|---|---|---|
| Dónde | Menú lateral con todo | Barra flotante abajo |
| Qué lleva | Inicio · Día · Economía · Pagos · Entreno · Stock · Compras · Comida · Ajustes | Inicio · Día · Economía · Entreno · Más |
| Extras | Marca "LIFE", etiqueta Nube / Modo local | Hoja "Todo" desde Más; barra de "lo que quedó a medias"; avisos flotantes |

### Secciones y pestañas

| Sección | Pestañas | Objetos (tablas) |
|---|---|---|
| Inicio | (una sola) tira de 14 días, tarjeta del día, nivel/XP, señales, resúmenes de cada módulo | lee de todos |
| Día | Hoy · Semana tipo | `dia_plantilla`, `dia_dias`, `dia_tareas` |
| Economía | Resumen · Movimientos · Ingresos · Proyección · Cuentas y categorías | `eco_cuentas`, `eco_categorias`, `eco_movimientos`, `eco_ingresos` |
| Pagos | (una sola) + Ponerse al día (`#/pagos/al-dia`) | `pag_pagos` |
| Entreno | Hoy · Progreso · Historial · Rutina · Preparador | `ent_sesiones`, `ent_series`, `ent_rutinas`, `ent_ejercicios` |
| Stock | En casa · Lista de compras | `stk_productos` |
| Compras | Lista · Modo compra · Por pasillos · Ticket · Precios · Historial | `com_supers`, `com_items`, `com_precios`, `com_compras`, `com_tickets` |
| Comida | Hoy · Platos · Metas | `ali_platos`, `ali_comidas`, `ali_extras`, `ali_metas` |
| Ajustes | (una sola, larga) cuentas de usuario, conexión con Claude, respaldo, semilla, datos de prueba | `perfiles`, `api_claves` |

### Piezas compartidas que ya existen

| Pieza del pilar | En LIFE hoy |
|---|---|
| Bandeja única "Para resolver" | Señales del Inicio (`useTodasLasSenales`) + avisos flotantes. ✔ una sola fuente |
| Alertas con botón | `Senal.accion` existe, pero solo lo usan Pagos y Entreno. ✖ el resto son avisos sin botón |
| Formulario único por acción | Bastante: `FormMovimiento`, `FormItem`. Sin botón **+** global |
| Historial con deshacer | ✔ (2026-10-25) Aviso "Guardado · DESHACER" 5 s después de cada guardado o borrado (`ui/Deshacer.tsx`, anotado en `core/db.ts`) |
| Confirmar lo que no tiene vuelta | ✔ (2026-10-25) `confirmar()` de `ui/Deshacer.tsx`: ventana propia con la pregunta, qué pasa y el verbo en el botón |
| Panel lateral (PC) | ✖ No existe: en la compu las pantallas son las del celu más anchas |
| Buscador global | ✖ No existe |
| Glosario de cifras (ⓘ) | ✖ No existe |
| Modo actividad (paso a paso) | ✔ `ModoActividad` (pantalla completa, botón fijo abajo) |

### Problemas encontrados

1. **Dos listas de compras:** Stock → "Lista de compras" y Compras → "Lista". Rompe "una sola cosa, un solo lugar".
2. **Dos "Cuentas":** Economía → "Cuentas y categorías" (plata) y Ajustes → cuentas de usuario. Mismo nombre, cosas distintas.
3. **Plata partida en dos secciones:** Pagos está aparte de Economía, pero sus vencimientos viven también en la Proyección de Economía.
4. **Demasiadas pestañas en el celu:** Compras tiene 6 y Entreno 5 (el pilar dice hasta 4, el resto en ⋯).
5. ~~Nada se puede deshacer~~ → resuelto en la tanda 2.
6. **Avisos sin botón:** la mayoría de las señales llevan a la sección pero no a la acción que lo resuelve (pilar 6).
7. **Ajustes es una pantalla larga** sin grupos (pilar 5 y receta 8).
8. **Compu = celu estirado:** sin fila de cifras, tabla ni panel de detalle (pilar 3).

---

## 2. Mapa nuevo (hecho)

Reglas que se siguen: primero Inicio, después lo diario, al final lo que se analiza y Ajustes; en el celu solo lo diario en la barra.

### Navegación

| | Compu | Celu |
|---|---|---|
| Dónde | Menú lateral (se mantiene; LIFE ya lo tiene y anda bien en pantallas anchas) | Barra flotante abajo |
| Qué lleva | INICIO · DÍA · PLATA · ENTRENO · CASA · ⚙ AJUSTES | INICIO · DÍA · **+** · PLATA · MÁS |
| Extras | Botón **+ NUEVO**, buscador (Ctrl K), Nube/Local | **+** abre "¿Qué querés cargar?" (gasto, pago, tarea, comida, compra) |

### Secciones

| Sección | Compu | Celu | Pestañas | Objetos |
|---|---|---|---|---|
| **Inicio** | 1.º del menú | barra | Tablero de 8 tarjetas (Día, Plata, Entreno, Comida, Compras, En casa, Mi partida, Para resolver) + agenda de 14 días | todos |
| **Día** | menú | barra | Hoy · Semana · Semana tipo | `dia_*` |
| **Plata** (Economía + Pagos) | menú | barra | Resumen · Pagos · Ingresos · Movimientos · ⋯ Proyección | `eco_*`, `pag_pagos` |
| **Entreno** | menú | Más (o barra, ver pregunta) | Hoy · Progreso · Rutina · ⋯ Historial, Preparador | `ent_*` |
| **Casa** (Stock + Compras + Comida) | menú | Más | En casa · Lista · Comprar · ⋯ Comida, Precios, Tickets, Historial | `stk_*`, `com_*`, `ali_*` |
| **Ajustes** | ⚙ al final | Más | Mi cuenta · Plata (cuentas y categorías) · Claude · Respaldo · Datos de prueba | `perfiles`, `api_claves`, `eco_cuentas`, `eco_categorias` |

Cambios que implica (cada uno sería una tanda chica):
- Lista de compras **una sola**, en Casa → Lista (la de Stock desaparece y queda el botón "Falta en casa").
- "Cuentas y categorías" de la plata pasa a Ajustes → Plata (se configura una vez).
- Pagos pasa a ser una pestaña de Plata; `#/pagos` sigue andando y redirige.
- Las rutas viejas siguen funcionando (redirigen), así no se rompen los avisos ni los atajos.

### Preguntas abiertas

1. ~~Plata y Casa~~ → sí, hecho (2026-10-25).
2. ~~Barra del celu~~ → Inicio · Día · **+** · Plata · Más; Entreno en Más (2026-10-25).
3. ~~Colores~~ → elegido "Signos vitales · modo juego" (2026-10-25).

---

## 3. Tandas propuestas (de a una, cada una con su PR y vista previa)

| # | Tanda | Pilar |
|---|---|---|
| 1 | ✔ Guardar los pilares, este mapa y las reglas en el repo | 1 |
| 2 | ✔ Aviso abajo "Guardado · DESHACER" (5 s) al guardar o borrar, y ventana de confirmar propia (muestra qué va a pasar) en vez de la del navegador | 7 |
| 3 | Cada señal con su botón de acción | 6, 8 |
| 4 | Medidas del celu: botón principal 60 px fijo abajo, campos 58 px y 17 px, filas 68 px (✔ ya: pestañas hasta 4 + ⋯) | 4 (medidas) |
| 5 | ✔ Lista de compras única (la de Stock se sacó; "Usalo pronto" pasó a En casa) | 4 |
| 6 | Ajustes agrupado por tema + "Cuentas y categorías" adentro | 5 |
| 7 | ✔ Plata y Casa (menú y pestañas; `GRUPOS` en `App.tsx`). ✔ botón + "Cargar" (`hub/Cargar.tsx`) | 1, 2 |
| 8 | Compu: fila de 4 cifras, tabla y panel de detalle a la derecha (empezando por Movimientos y Pagos) | 3 |
| 9 | ✔ Colores y letras: "Signos vitales · modo juego" (2026-10-25) | 3 (tokens) |
