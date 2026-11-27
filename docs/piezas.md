# Piezas de LIFE · catálogo y regla

Pedido de ella (2026-11-27): que LIFE se arme con **piezas reusables**. Si dos pantallas muestran
cosas parecidas (una lista de ejercicios y una lista de pagos), usan la misma pieza con otros datos.
Así todo se ve y se comporta igual, y un arreglo en la pieza arregla todas las pantallas.

**Regla para todos los hilos:** antes de dibujar algo en una pantalla, buscalo en este catálogo.
- Si está, usá la pieza.
- Si está casi, sumale una opción a la pieza; no copies el código a la pantalla.
- Si no está, creala en `src/ui/` (con su `.css` y tokens de `tema.css`), anotala acá y recién ahí usala.

Lo mantiene Sapires (diseño); Lupita mide las pantallas antes y después. Cada pieza nueva pasa por boceto.

## 1. Piezas que ya existen

| Pieza | Archivo | Para qué | Dónde se usa |
| --- | --- | --- | --- |
| `ModoActividad` + `BarraActividad` | `ui/Actividad.tsx` | Pantalla en vivo a pantalla completa, botón grande abajo, se minimiza a la barra | Entreno, compras, Ponerse al día, chequeos |
| `Tarjeta`, `Cifra`, `Estado`, `Vacio`, `Campo`, `Pestanas`, `Modal` | `ui/ui.tsx` | Bloques básicos | Toda la app |
| `Medidor`, `Pct`, `nivelDe`, `useSalto` | `ui/nivel.tsx` | Escala de rendimiento ⚠▼●✓◆★ | Plata, Comida, Entreno, Día |
| `Semana` | `ui/Semana.tsx` | Tira de días | Inicio, Día |
| `confirmar`, `AvisoDeshacer` | `ui/Deshacer.tsx` | Confirmar y DESHACER | Toda la app |
| `Lista`, `Fila`, `IcoFila` + `.fl-cab` | `ui/Fila.tsx` | Fila de toda lista (dirección A "Columnas", elegida 2026-11-27): ícono con color de categoría, título, detalle, dato en columna fija (tono `ingreso` verde, `atencion`, `urgente`), flecha o acción | Plata → Movimientos (sigue: Pagos, Stock, Rutina…) |
| `Vacio` con `fantasma` y `accion` | `ui/ui.tsx` | Lista vacía que invita (V2, 2026-11-27): cómo se va a ver + botón para cargar lo primero | Movimientos (sigue: Tablero, Compras, Precios, Historial, Mis informes) |
| `AhoraDia`, `RielDia`, `IcoTipo` | `ui/LineaDia.tsx` | Línea del día: lo que falta en grande + riel con estado | Arranque → Plan (sigue: Día, Mi día, Cortina) |

## 2. Familias que se repiten y todavía no son pieza

Hoy hay **18 pantallas** que arman sus listas a mano con las clases `lista` / `lista-item`
(compras ×7, entreno ×4, economía ×3, pagos ×2, comida, stock). Todas tienen la misma anatomía:

```
[ícono o foto]  Título              dato a la derecha
                detalle chico        (monto, hora, series, cantidad)
                estado / etiqueta    [acción]
```

| Familia | Ejemplos de hoy | Pieza propuesta | Plan 2 |
| --- | --- | --- | --- |
| **Fila de lista** | ejercicio de la rutina, pago, movimiento, producto del stock, plato, ítem de compra | `Fila` ✔ (Movimientos ya la usa) | paso 3 ✔ |
| **Lista con grupos** | pagos por categoría, ejercicios por músculo, compras por pasillo, movimientos por categoría | `ListaGrupos` (cabecera con color de categoría, subtotal y barra; usa `Fila`) | paso 3 (Pagos) |
| **Línea de tiempo** | plan del día, agenda, historial de entrenos, novedades de una tarjeta | `RielDia` ✔ y luego `Riel` genérico (cualquier cosa con fecha u hora) | paso 1 ✔, paso 6 |
| **Vacío que invita** | Tablero, Compras, Precios, Historial, Mis informes | `Vacio` con `fantasma` + `accion` ✔ | paso 3 ✔ |
| **Lista + detalle (compu)** | WhatsApp, Precios, Historial, Movimientos, Tablero | `ListaDetalle` (lista a la izquierda, detalle o gráfico a la derecha; en el celu, hoja) | paso 5 |
| **Tarjeta vital** | 8 tarjetas del Inicio, cifras de cada sección | `TarjetaVital` (cifra, estado, barra, botón) | más adelante |

Orden: primero `Fila` (porque la usan todas las demás), después cada familia en el paso del Plan 2 que le toca.
Una pantalla se pasa a la pieza cuando se trabaja en ella; no se reescribe todo de una.
