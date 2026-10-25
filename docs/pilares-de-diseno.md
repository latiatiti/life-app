# Pilares de diseño: cómo trabajar los diseños de un sistema

Este archivo explica cómo diseñamos el software de la sodería Tía Titi (AquaFlow) para que otro proyecto trabaje igual: con el mismo nivel de detalle, el mismo orden y la misma simetría entre PC y celular. Se lo podés dar a otro Claude como contexto fijo. Lo que sigue aplica a cualquier sistema de gestión, no solo a una sodería: los ejemplos son de AquaFlow, y donde dice "reparto" o "cobros" se reemplaza por las secciones del sistema nuevo.

**Cómo usarlo:** antes de diseñar cualquier pantalla, leer los 10 pilares (sección 1) y seguir el método de trabajo (sección 7). Si una pantalla nueva no encaja en la estructura, primero se ajusta la estructura y después se diseña.

---

## 1. Los 10 pilares

1. **Primero la estructura, después las pantallas.** Antes de dibujar se define el mapa del sistema: secciones, qué vive en cada una y qué objetos guarda. Cada pantalla nueva entra en un lugar que ya existe. Nada de pantallas sueltas.
2. **PC y celular son el mismo sistema.** Mismas secciones, mismos nombres, mismas piezas y mismos colores. Cambia la forma, no el orden. Cada pantalla se diseña en las dos versiones.
3. **Celular = calle, PC = oficina.** En el celular se hace y se mira (rápido, con el pulgar, con una mano). En la PC se arma, se configura y se analiza (tablas, panel lateral, teclado).
4. **Una sola cosa, un solo lugar.** Una sola bandeja de pendientes, un solo formulario por acción y una sola definición por cifra. Si algo aparece en dos lugares, es el mismo dato mostrado dos veces, nunca dos copias.
5. **Lo diario adelante, lo que se configura atrás.** Lo de todos los días va en las primeras secciones. Lo que se configura una vez va en Ajustes. Lo que se analiza va en Números.
6. **Cada aviso trae su botón.** Un problema en pantalla siempre viene con la acción que lo resuelve ("Falta el CBU" → CARGAR CBU). Nunca un aviso sin salida.
7. **Nada se pierde sin querer.** Después de guardar, siempre se puede DESHACER. Lo que no tiene vuelta (anular, borrar, mandar un mensaje) pide confirmar y muestra antes lo que va a pasar.
8. **El sistema avisa lo raro.** Pagos repetidos, montos que no coinciden, datos que faltan: se marcan solos en naranja y explican por qué.
9. **Lenguaje de la persona que lo usa.** Español simple, como se habla en el negocio. Botones con verbo (COBRAR, AGENDAR, CONFIRMAR CARGA). Nada de jerga técnica.
10. **Se diseña con datos de verdad.** Los ejemplos tienen la forma de los datos reales (nombres, montos, fechas) para ver si entra todo. Los datos sensibles se tapan con marcadores ([Cliente], $[0], [Patente]).

---

## 2. Estructura del sistema (el esqueleto)

### Navegación

| | PC | Celular |
|---|---|---|
| Dónde | Barra arriba, siempre visible | Barra abajo, siempre visible |
| Cuántas secciones | 6 + Ajustes (⚙) | 4 + botón central **+** |
| AquaFlow sodería | HOY · REPARTO · CLIENTES · COBROS · STOCK · NÚMEROS · ⚙ | INICIO · REPARTO · **+** · COBROS · MÁS |
| AquaFlow planta | HOY · MOSTRADOR · COLA DE LLENADO · SODEROS · CAJA · NÚMEROS · ⚙ | INICIO · COLA · **+** · SODEROS · MÁS |
| Extras fijos | Buscador (Ctrl K), botón **+ NUEVO**, campana de alertas, perfil | Campana arriba; lo que no entra en la barra va en **MÁS** |

**Reglas para armar el menú de un sistema nuevo:**
- La primera sección siempre es **HOY / INICIO**: lo que pide atención ahora.
- Después, en orden, las 2 o 3 cosas que más se usan en el día.
- Al final, **NÚMEROS** (analizar) y **⚙ AJUSTES** (configurar).
- En el celular, la barra lleva solo lo diario. El resto va en MÁS, como una lista de tarjetas grandes con una línea que explica cada una.
- Las secciones tienen **pestañas internas** (subsecciones). En AquaFlow, por ejemplo: COBROS → Cobrar · Pagos · Ventas · Facturas.

### Mapa de secciones (plantilla)

Por cada sección se define, en una tabla: **nombre en PC**, **dónde está en el celular**, **qué vive acá** (pestañas internas) y **qué objetos guarda**. Este mapa es la fuente de verdad. Todo pedido de cambio dice en qué sección y pestaña va.

### Objetos (dónde se guarda cada dato)

Antes de diseñar se listan los objetos del sistema, por ejemplo Empresa, Cliente, Pedido o Movimiento de plata. Cada dato nuevo se cuelga de uno de ellos. Si no entra en ninguno, se dice explícitamente y se agrega al mapa.

### Piezas compartidas (se reusan, nunca se duplican)

| Pieza | Qué hace |
|---|---|
| **Bandeja única "Para resolver"** | Junta todo lo que espera una decisión de la persona, con filtros por tipo y contador |
| **Formulario único por acción** | El mismo formulario, entres por el botón +, por la pestaña o por un aviso |
| **Panel lateral (PC)** | El detalle de una fila se abre a la derecha, sin salir de la lista |
| **Buscador global** | Ctrl K en PC, campo arriba en el celular |
| **Textos con vista previa** | Todo mensaje que sale a un cliente se ve antes de mandarlo |
| **Historial con deshacer** | Todo cambio guarda el antes y el después |
| **Glosario de cifras** | Cada número importante tiene una sola definición, que se ve en un ⓘ |
| **Alertas con botón** | Cada alerta de la campana trae su acción |

---

## 3. Sistema visual (tokens)

Usar siempre los mismos valores. No inventar colores nuevos por pantalla.

### Colores (tema oscuro "Kinetic Operations")

| Uso | Valor |
|---|---|
| Fondo de la app | `#181b19` (barras `#1d211f`) |
| Tarjetas | `#1f2421`, internas `#2a302d`, bordes `#38413c` |
| Campos de texto | fondo `#08090a`, borde `#38413c`, foco amarillo |
| Texto principal / secundario / apagado | `#f7f8f8` / `#cbd5e1` / `#8a8f98` |
| **Amarillo = acción y plata** | `#f5d312` (botón principal, montos, pestaña activa) |
| **Verde = el bloque más importante** | fondo `#0c4e28`, borde `#166534`, texto `#84e1bc` (una sola tarjeta destacada por pantalla) |
| **Naranja = riesgo o algo para revisar** | `#f2994a` (avisos, vencidos, "no coincide") |
| Verde claro = bien / hecho | `#4ae176` |

**Regla de color:** amarillo solo para lo que se toca o para plata, naranja solo para lo que hay que mirar, y como mucho un bloque verde destacado por pantalla. Si todo resalta, nada resalta.

### Letras y forma

- **Manrope** para todo el texto. **JetBrains Mono** para números, montos, fechas y códigos, así los números quedan alineados.
- Etiquetas de campo y de sección en MAYÚSCULAS, chicas (12px), con espacio entre letras, en gris.
- **Bordes de 2px de radio**, sin sombras. Las capas se separan con bordes y con tonos de fondo.
- Íconos simples, de un solo trazo, del mismo grosor.

### Movimiento

- Rápido y suave: 120 a 240 ms, curva `cubic-bezier(.2,0,0,1)`.
- Al tocar, el botón se achica apenas (escala .97).
- Las hojas del celular suben desde abajo y la confirmación aparece abajo, con DESHACER durante 5 segundos.
- Respetar "reducir movimiento" del teléfono.

---

## 4. Medidas y simetría

### Celular (se diseña a 390 × 844)

- Barra de arriba de 52px: título de la pantalla y, debajo, una línea chica con la fecha o el contexto. Volver a la izquierda, ⋯ a la derecha.
- Margen de 12px a los costados y 10px entre bloques.
- **Botones:** el principal ocupa todo el ancho, 60px de alto, amarillo. Los secundarios, mínimo 44px. Ningún toque de menos de 44 × 44.
- **Campos:** 58px de alto, letra de 17px o más (así el iPhone no hace zoom). Montos en mono, de 21px.
- **Filas de lista:** 68px mínimo, con nombre en negrita (15px), una línea gris debajo y monto o botón a la derecha.
- **Elegir opciones:** botones grandes en fila o de a dos (no listas desplegables). Para cantidades: − número +.
- **La acción principal va abajo**, donde llega el pulgar, fija sobre la barra.
- **Nada se sale de la pantalla:** si no entra, se saca algo o se manda a "VER TODOS". Nada de scroll horizontal.

### PC (se diseña a 1440 × 900)

- Barra de menú de 52px, encabezado de la pantalla de 64px (título y una línea que explica qué es), pestañas internas debajo.
- Arriba, **fila de 4 tarjetas con cifras** (la primera es la destacada en verde).
- En el medio, **una tabla** con pestañas de filtro, buscador a la derecha y paginación de a 25.
- A la derecha, **panel de detalle de 400px** con encabezado, contenido y dos botones abajo (secundario y principal).
- La fila elegida se marca con fondo un poco más claro y una línea amarilla a la izquierda.
- Atajos de teclado anotados al pie (↑ ↓, Enter, Esc).

### Simetría PC ↔ celular

| PC | Celular |
|---|---|
| Fila de 4 cifras | 2 cifras (la destacada y la más importante) |
| Tabla | Lista de tarjetas con las 2 o 3 columnas que importan |
| Pestañas internas | Las mismas pestañas, debajo de la barra de arriba (hasta 4; el resto en ⋯) |
| Panel lateral | Pantalla completa u hoja que sube desde abajo |
| Botones del panel | Botón fijo abajo |
| Ctrl K | Buscador arriba de la lista |

Mismo orden de arriba hacia abajo en las dos: **contexto → cifras → lo que hay que hacer → lista → acción**.

---

## 5. Patrones de pantalla (recetas)

1. **Inicio / Hoy:** un botón grande con lo principal del día, después 3 accesos rápidos, después la bandeja "Para resolver" con filtros y, al final, "Para hacer hoy".
2. **Lista + detalle:** en PC, tabla y panel derecho. En el celular, buscador, filtros en botones, tarjetas y "VER TODOS".
3. **Formulario corto:** pocas preguntas, de a una por bloque, con respuestas en botones, lo más común ya elegido y el monto sugerido ("TODO / LA MITAD / OTRO"). Botón GUARDAR abajo y DESHACER después.
4. **Paso a paso** (para tareas de la calle): pasos numerados arriba (1 · 2 · 3) y una sola pregunta grande por pantalla.
5. **Revisión con ayuda de Claude:** el sistema propone qué entendió ("Claude entiende"), marca solo lo dudoso y deja confirmar los claros de una sola vez. Lo dudoso muestra el mensaje original y su motivo.
6. **Tablero por estados** (colas de trabajo): columnas por paso, con un botón por tarjeta para pasar al siguiente.
7. **Ficha de un objeto:** encabezado con nombre y estado, cifras, pestañas (datos · movimientos · configuración · historial) y acciones arriba a la derecha.
8. **Ajustes:** agrupados por tema, con lo más importante primero, y cada campo con una línea que explica para qué sirve.

---

## 6. Textos

- Títulos cortos y concretos ("Confirmar cargas", no "Gestión de preconfirmaciones").
- La línea debajo del título explica para qué sirve la pantalla en una frase.
- Botones en mayúsculas, con verbo, de 1 a 3 palabras.
- Los avisos dicen qué pasa y por qué ("Falta el CBU: por eso estos pagos no se validan solos").
- Si una pantalla reemplaza a otra vieja, se aclara ("antes Preconfirmaciones").
- Las cifras con ⓘ dicen cómo se calculan.

---

## 7. Método de trabajo (cómo se hace, paso a paso)

1. **Relevar lo que hay:** recorrer el sistema actual o su código y listar las secciones, las pantallas, las funciones y los problemas (cosas duplicadas, datos que no cierran, pantallas con mucho scroll).
2. **Armar el mapa de estructura** (sección 2) y acordarlo antes de dibujar.
3. **Probar el estilo** con 2 opciones de 3 o 4 pantallas clave y elegir una.
4. **Armar la plantilla y el kit de piezas** (una pantalla vacía de celular, una de PC y todas las piezas sueltas) antes de hacer las pestañas.
5. **Diseñar por tandas, de a una sección**, siempre celular y PC juntos, empezando por lo que más se usa.
6. **Todo en un solo lienzo de Claude Design**, ordenado en filas: una fila por tanda o sección, con un título arriba. A la izquierda va el celular y a la derecha la PC, y cada tablero lleva un título del tipo "SECCIÓN celular · qué muestra".
7. **Hacer interactivas las pantallas clave** (se puede tocar y ver el cambio), con una nota en el título: "(tocá…)".
8. **Revisar con capturas** de cada pantalla: que nada se corte, que los textos entren y que los botones se lean. Corregir antes de mostrar.
9. **Comparar contra el código o el sistema real** para ver qué funciones faltan en el diseño, y anotar qué se agrega y qué no a propósito.
10. **Los cambios se hacen sobre el mismo lienzo**, nunca uno nuevo, para que haya un solo lugar.
11. **Entregar al programador** un paquete con:
    - la guía pantalla por pantalla (a qué página del código corresponde, qué cambia, qué es nuevo y en qué orden conviene hacerlo);
    - las capturas;
    - cada pantalla en HTML suelto como modelo;
    - los archivos del lienzo.

    Se carga como ticket, con el adjunto y la sección "Dónde va en el sistema".

### Plantilla "Dónde va en el sistema" (va en todo pedido al programador)

1. **Sección y pantalla:** PC: … · Celular: …
2. **Objeto:** a qué dato se le cuelga y qué campos nuevos lleva.
3. **Piezas que reusa:** de la lista de piezas compartidas.
4. **Qué no se crea nuevo:** para no duplicar.
5. **Con qué se cruza:** otros pedidos abiertos que tocan lo mismo.

---

## 8. Lista para revisar cada pantalla antes de darla por hecha

- [ ] ¿Está en una sección del mapa y en las dos versiones (PC y celular)?
- [ ] ¿Sigue el orden contexto → cifras → qué hacer → lista → acción?
- [ ] ¿Hay un solo botón amarillo principal y como mucho un bloque verde?
- [ ] ¿Todos los toques miden 44px o más, y la acción principal está abajo en el celular?
- [ ] ¿Cada aviso naranja tiene su botón?
- [ ] ¿Lo que no tiene vuelta pide confirmar, y lo demás tiene DESHACER?
- [ ] ¿Los números van en mono y cada cifra importante tiene su ⓘ?
- [ ] ¿Reusa piezas existentes en vez de inventar nuevas?
- [ ] ¿Entra todo sin cortarse en 390 × 844 y en 1440 × 900?
- [ ] ¿Los textos están en el idioma de quien lo usa, con verbos en los botones?
