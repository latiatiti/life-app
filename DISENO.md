# Diseño de LIFE

> **Reglas fijas de diseño: [`docs/pilares-de-diseno.md`](docs/pilares-de-diseno.md)** (los 10 pilares, medidas, recetas de pantalla, método y checklist). Antes de diseñar o cambiar cualquier pantalla: leer los pilares, ubicarla en [`docs/mapa-estructura.md`](docs/mapa-estructura.md) y pasar la checklist de la sección 8. Los ejemplos de ese archivo son de AquaFlow (la sodería): en LIFE se reemplazan por sus módulos. Los colores de AquaFlow (sección 3) **no** se aplican salvo que ella lo decida; la paleta sigue saliendo de `src/tema/tema.css`.

Todo el look de la app sale de **un solo archivo: `src/tema/tema.css`**. Si querés cambiar algo general (el color, las letras, las esquinas, la velocidad de las animaciones), se cambia ahí y se aplica en todas las pantallas, en el celu y en la compu.

## Cambios rápidos

| Quiero… | Tocá en `src/tema/tema.css` |
|---|---|
| Cambiar el verde menta por otro color | `--acento` (y `--acento-texto`, una versión más clara del mismo color para textos y links) |
| Cambiar el celeste de la experiencia | `--xp` |
| Esquinas más redondeadas | `--radio` (6px = tablero recto; 14px = redondeado) |
| Sacar las etiquetas en MAYÚSCULA | `--etiqueta-mayus: none` |
| Otra letra | `--letra` y `--letra-titulo` (y el link de Google Fonts en `index.html`) |
| Fondo más claro u oscuro | `--fondo`, `--capa-1`, `--capa-2`, `--capa-3` |
| Botones más altos en el celu | `--alto-toque` |
| Animaciones más lentas o rápidas | `--dur` |

Si el color nuevo es claro (amarillo, celeste), poné `--sobre-acento: #000` para que el texto encima se lea.

## Cómo está armado

- `src/tema/tema.css`: los valores (tokens). Al final están los nombres viejos (`--accent`, `--surface`…) que usan los módulos; apuntan a los nuevos, no hace falta tocarlos.
- `src/styles.css`: las piezas comunes (tarjetas, botones, pestañas, listas, menú, avisos, modo actividad) armadas con esos valores. No lleva colores sueltos.
- `src/ui/`: componentes compartidos (`Tarjeta`, `Cifra`, `Modal`, `Semana`, `ModoActividad`, avisos).
- Cada módulo puede tener su `.css` (ej. `entreno.css`, `compras.css`), siempre usando las variables del tema.

## Estilo actual (2026-10-25, "Signos vitales · modo juego")

LIFE como el monitor de tu vida con pantalla de videojuego (HUD). Elegido entre 6 direcciones (lienzo: https://claude.ai/artifact/5WQMqyzMcvkpqjUVnKSeDu).
- Colores: negro de pantalla, **verde menta** para lo que se toca y lo activo, **celeste** para la experiencia, ámbar para revisar, rojo para lo urgente.
- Letras: Chakra Petch (títulos), IBM Plex Sans (texto), IBM Plex Mono (números, fechas y etiquetas).
- Piezas de juego (al final de `styles.css`, bloque "Modo juego"): esquinas de mira en cada panel y títulos entre corchetes; línea de pulso en la tarjeta del día; nivel en hexágono y barra de experiencia por bloques; medidores por bloques; señales con barra de vida (rojo late, naranja avisa); pestaña y menú activos con brillo; botón principal con esquinas cortadas; líneas finas de pantalla vieja.
- Para bajarle el tono: en `tema.css` sección 8, `--brillo: none`, `--mira: 0`, `--linea-pantalla: transparent`.
- Inicio como tablero (boceto de ella): "LIFE" arriba y una tarjeta por área (`.vital`, estado en el borde: `es-ok`, `es-aviso`, `es-critico`, `es-xp`); compu 4 × 2, celu 2 × 4.
- Se mantiene de antes: barra flotante en el celu, menú lateral en la compu, tira de días tocable, hojas que suben desde abajo, aviso "Guardado · DESHACER".

## Reglas

- Nada de colores sueltos en pantallas nuevas: siempre `var(--…)` del tema.
- En el celu, todo lo que se toca mide al menos 44 px (`--alto-toque`).
- Estados siempre con ícono o texto, nunca solo color.
- Textos cortos: etiquetas de 1 a 3 palabras.
- **Deshacer y confirmar (pilar 7):** toda escritura con `crear`/`modificar`/`eliminar` muestra sola el aviso "Guardado · DESHACER" (las que llegan seguidas se deshacen juntas). Para lo que no tiene vuelta usar `await confirmar('¿Borrar X? Qué pasa.')` de `src/ui/Deshacer.tsx`, nunca `window.confirm`.

## Escala de rendimiento (toda la app, 2026-10-29)

Pedido de ella: los porcentajes se ponen más "épicos" cuanto mejor vas. Todo % que compare **lo que pasó contra lo esperado** (100 % = justo lo que tocaba) usa esta escala, en cualquier módulo:

| Nivel | Cuándo (por defecto) | Cómo se ve |
|---|---|---|
| ⚠ Muy mal | menos de 75 % | rojo que **parpadea** (solo para lo grave, y siempre con su botón) |
| ▼ Mal | 75–89 % | rojo |
| ● Regular | 90–96 % | naranja |
| ✓ Bien | 97–104 % | verde |
| ◆ Muy bien | 105–114 % | azul con más brillo |
| ★ Épico | 115 % o más | morado con un brillo que corre |

- Colores: `--n-critico`, `--n-mal`, `--n-regular`, `--n-bien`, `--n-muy`, `--n-epico` en `tema.css`.
- Piezas: `src/ui/nivel.tsx` → `nivelDe(pct)`, `<Medidor pct texto onClick>` (el % grande con nombre del nivel y una línea de qué hacer) y `<Pct pct>` (chico, para filas). En CSS: `.nv[data-n="…"]` da el color en `--n` a cualquier cosa.
- Siempre con palabra e ícono, nunca solo color. Cada módulo puede pasar sus propios límites (`niveles`) si 100 % no es "lo esperado" en su caso.
- Dónde ofrecerla: Entreno (ya está), Plata (gasto del mes contra presupuesto, invertido: menos es mejor), Comida (proteína y agua del día contra la meta), Día (tareas hechas contra las del día), Compras (total contra lo estimado). Cada hilo la propone en su pestaña cuando tenga sentido; no se fuerza.

## Animación (toda la app, 2026-10-29)

Probador: pestaña "Colores y animación" del boceto de entreno. Reglas:
- Rápido y suave: 0,1 a 0,4 s, curvas `--curva` y `--resorte` (rebote suave) de `tema.css`.
- **Tocar:** todo botón se hunde un poco (escala 0,97) y los `.btn`, `.medidor`, `.segmentado button` y los de pantallas en vivo abren una **onda** desde el dedo (`src/ui/onda.ts`, una sola escucha para toda la app).
- **Números que cambian saltan** (`useSalto` de `ui/nivel.tsx`, clase `.salta`).
- **Pantallas** entran hacia el lado que vas (`.entra-adelante` / `.entra-atras`); listas y cifras de un resumen aparecen escalonadas (`.aparece-escalonado`).
- **Hojas** suben desde abajo; el aviso "Guardado · DESHACER" sube con rebote; un récord aparece con `.trofeo`.
- Si el teléfono tiene "reducir movimiento", todo se apaga solo (bloque de `styles.css`).

## Pantallas en vivo (cosas que se hacen con el pulgar mientras pasan)

Modelo: el modo entrenando (`docs/pilares-entreno.md`). Para toda actividad nueva (compra en el súper, cuestionario de la mañana, ponerse al día):
- Una vista sin scroll en el celu: lo que importa ahora en grande y centrado, los datos con − y + ya cargados con lo previsto, un solo botón grande abajo.
- Lo que no se usa en cada paso va en hojas que suben (☰ lista, ⋯ opciones).
- Tira de progreso arriba que se toca para ver la lista.
- Un medidor con la escala de rendimiento para "cómo venís".
- DESHACER a mano del último paso; minimizar a la barra de actividad; cancelar pide confirmar.
