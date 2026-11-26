# Mapa de agentes de LIFE

Quién es quién entre los Claude que trabajan en LIFE, qué sabe cada uno, dónde guarda su memoria y
cómo pueden trabajar juntos y al mismo tiempo. Versión visual: boceto `diseno/mapa-agentes.html` en
los archivos del proyecto. Armado el 2026-11-26.

## 1. Los que hay

| Agente | Qué hace | Cómo se llama | Memoria / reglas | Estado |
|---|---|---|---|---|
| **Coordinador** | Habla con ella en el chat del proyecto, abre un hilo por tarea y le resume | Escribirle en el chat del proyecto | Memoria del proyecto (`MEMORY.md`) | Andando |
| **Hilos constructores** | Hacen el trabajo: código, PR con vista previa, nube con su OK | Los abre el coordinador | `CLAUDE.md`, `RESUMEN.md`, memoria por tema | Andando |
| **Zonka** | Mejoras: qué no se mide y por qué, novedades de IA y tecnología; también coach de entreno y comida | "Llamá a Zonka" | Memoria `zonka.md` | Andando (habilidad sin guardar en su cuenta) |
| **Gonzalito** | Seguridad: claves, filtraciones, permisos, disponibilidad | "Llamá a Gonzalito" | Memoria `gonza.md`, `docs/seguridad.md` | Andando (habilidad sin guardar en su cuenta) |
| **Lupita** (nueva) | Usabilidad: vacía, poco práctica, poco intuitiva, lo importante a la vista | "Llamá a Lupita" / "pasale la lupa a…" | `docs/agentes/lupita.md`, memoria `lupita.md`, `scripts/lupita.mjs` | Nueva |
| **El profe** | Dentro de la app: propone mejoras de rutina con Aplicar / Ahora no | Entreno → Rutina | `entrenamiento/profe.ts` | Andando (no es un Claude, son reglas) |
| **Quién es quién** | Define de quién es cada conector (ella o Ulises) y cómo cargar gastos compartidos | Sola, al cargar por conector | Habilidad `life-quien-es-quien` | Guardada |
| **Diseño y UX de AquaFlow** | Las mismas ideas de diseño, para la sodería | En los proyectos de la sodería | Habilidades `diseno-aquaflow`, `ux-movil-aquaflow` | Guardadas (otro sistema) |

**Herramientas que todos comparten (no son agentes):** conector `LIFE` (life-mcp, su cuenta),
`life_ulises` (cuenta de Ulises), `mcp_tia_titi` (sodería), el puente de WhatsApp y Claude en Chrome
(en un chat aparte, para pasos en el navegador).

## 2. Cómo se conectan (lo que comparten)

Los hilos no se ven en vivo entre ellos. Se pasan información por cuatro lugares comunes:

1. **La memoria del proyecto:** cada agente tiene su archivo (`zonka.md`, `gonza.md`, `lupita.md`)
   y lee el de los otros antes de proponer, para no repetir ni contradecir.
2. **El Tablero de LIFE** (categoría "Ideas de desarrollo"): toda propuesta que ella aprueba se
   vuelve una tarjeta con `tablero_anotar`. Es la bandeja única de trabajo: el coordinador abre
   hilos desde ahí y la tarjeta pasa a "Hecho" cuando se publica.
3. **Los informes de "! Informar"** (`life_informes`): Lupita toma los de pantallas, Gonzalito los
   de errores raros o accesos, Zonka las ideas.
4. **Las reglas del repo** (`DISENO.md`, `docs/pilares-de-diseno.md`, `docs/seguridad.md`,
   `docs/agentes/`): lo que se decide una vez queda escrito para todos.

## 3. Trabajar en simultáneo: tres formas

### A · Ronda de revisión (los tres a la vez)
El coordinador abre 3 hilos al mismo tiempo: Lupita (cómo se usa), Zonka (qué falta medir y
novedades) y Gonzalito (seguridad). Cada uno deja sus propuestas. Un cuarto paso, **el Consejo**,
junta todo en **un solo informe** ordenado por impacto, saca lo repetido y marca los choques (ej.
Zonka quiere una pregunta más, Lupita quiere menos ruido). Ella decide una sola vez.
Se puede programar (ej. cada 15 días) cuando ella diga.

### B · Cadena por entrega (cada PR)
Hilo constructor hace el PR → **Lupita** mide la vista previa contra antes (`scripts/lupita.mjs`) →
**Gonzalito** pasa la checklist de `docs/seguridad.md` → ella ve el link y dice "va". Lupita y
Gonzalito corren a la vez porque no tocan lo mismo.

### C · De la idea a la pantalla
**Zonka** detecta algo que no se mide → **Lupita** propone cómo se ve y cómo se carga sin ensuciar
la pantalla → ella aprueba → **tarjeta en el Tablero** → hilo constructor.

## 4. Reglas para que no se pisen

- Un dueño por archivo grande a la vez (ej. `styles.css`, `App.tsx`, `Hub.tsx`): si dos hilos lo
  necesitan, el segundo espera o se coordina por mensaje entre hilos.
- Nadie publica ni toca la nube sin el OK de ella; los agentes solo proponen.
- Cada propuesta lleva quién la hizo (Zonka / Gonzalito / Lupita) para que ella sepa de dónde viene.
- Lo descartado se anota en la memoria del agente y no vuelve a aparecer.

## 5. Lo que falta para que funcione del todo

1. Guardar **Zonka**, **Gonzalito** y **Lupita** como habilidades en su cuenta (hoy Zonka y
   Gonzalito viven solo en la memoria: un hilo nuevo los conoce por `CLAUDE.md`, pero no hay
   habilidad guardada).
2. Elegir si quiere la **ronda programada** (A) y cada cuánto.
3. Que "Ideas de desarrollo" del Tablero sea la bandeja oficial de propuestas aprobadas.
