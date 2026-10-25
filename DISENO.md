# Diseño de LIFE

> **Reglas fijas de diseño: [`docs/pilares-de-diseno.md`](docs/pilares-de-diseno.md)** (los 10 pilares, medidas, recetas de pantalla, método y checklist). Antes de diseñar o cambiar cualquier pantalla: leer los pilares, ubicarla en [`docs/mapa-estructura.md`](docs/mapa-estructura.md) y pasar la checklist de la sección 8. Los ejemplos de ese archivo son de AquaFlow (la sodería): en LIFE se reemplazan por sus módulos. Los colores de AquaFlow (sección 3) **no** se aplican salvo que ella lo decida; la paleta sigue saliendo de `src/tema/tema.css`.

Todo el look de la app sale de **un solo archivo: `src/tema/tema.css`**. Si querés cambiar algo general (el color, las letras, las esquinas, la velocidad de las animaciones), se cambia ahí y se aplica en todas las pantallas, en el celu y en la compu.

## Cambios rápidos

| Quiero… | Tocá en `src/tema/tema.css` |
|---|---|
| Cambiar el violeta por otro color | `--acento` (y `--acento-texto`, una versión más clara del mismo color para textos y links) |
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

## Estilo actual (2026-10-15, "A + C")

Tablero tipo Tiatiti (A) + capas que se deslizan (C):
- Tarjetas grafito con borde fino y esquinas casi rectas; títulos de tarjeta en mayúscula con una línea abajo.
- Una tarjeta destacada rellena del color principal (`.destacada`, o la cabecera del día con el bloque de fecha `15 / OCT`).
- Pestañas como grupo segmentado (`HOY · SEMANA · MES`); en el celu se deslizan.
- Celu: barra flotante tipo píldora abajo (Inicio + 3 módulos + "Más", que abre una hoja con todo). Qué módulos van en la barra: `EN_BARRA` en `src/App.tsx`.
- Compu: menú lateral con todos los módulos.
- Inicio: tira de 14 días tocable (`Semana`), tarjeta del día elegido, nivel, señales y resúmenes de cada módulo (en el celu se pasan con el dedo, `.carrusel`).
- Animación suave al cambiar de pantalla (`.vista`), hojas que suben desde abajo en el celu. Respeta "reducir movimiento" del teléfono.

## Reglas

- Nada de colores sueltos en pantallas nuevas: siempre `var(--…)` del tema.
- En el celu, todo lo que se toca mide al menos 44 px (`--alto-toque`).
- Estados siempre con ícono o texto, nunca solo color.
- Textos cortos: etiquetas de 1 a 3 palabras.
- **Deshacer y confirmar (pilar 7):** toda escritura con `crear`/`modificar`/`eliminar` muestra sola el aviso "Guardado · DESHACER" (las que llegan seguidas se deshacen juntas). Para lo que no tiene vuelta usar `await confirmar('¿Borrar X? Qué pasa.')` de `src/ui/Deshacer.tsx`, nunca `window.confirm`.
