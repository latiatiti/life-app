# Graph Report - life-app  (2026-10-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 946 nodes · 3611 edges · 35 communities (26 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `648fb34f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29

## God Nodes (most connected - your core abstractions)
1. `hoy()` - 89 edges
2. `Tarjeta()` - 63 edges
3. `dinero()` - 54 edges
4. `Campo()` - 50 edges
5. `Modal()` - 46 edges
6. `fechaCorta()` - 43 edges
7. `react` - 42 edges
8. `sumarDias()` - 41 edges
9. `TS` - 36 edges
10. `useTabla()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `guardar()` --indirect_call--> `estado()`  [INFERRED]
  src/modules/dia/Pantallas.tsx → src/core/db.ts
- `PantallaPreparador()` --indirect_call--> `rangoSeries()`  [INFERRED]
  src/modules/entrenamiento/Preparador.tsx → src/modules/entrenamiento/analisis.ts
- `PantallaPreparador()` --indirect_call--> `seriesPorGrupo()`  [INFERRED]
  src/modules/entrenamiento/Preparador.tsx → src/modules/entrenamiento/analisis.ts
- `guardar()` --calls--> `nuevoItem()`  [EXTRACTED]
  src/modules/compras/FormItem.tsx → src/modules/compras/modelo.ts
- `Categoria` --inherits--> `Fila`  [EXTRACTED]
  src/modules/economia/modelo.ts → src/core/db.ts

## Import Cycles
- 3-file cycle: `src/core/registry.ts -> src/modules/ajustes/index.tsx -> src/modules/ajustes/Cuentas.tsx -> src/core/registry.ts`
- 3-file cycle: `src/core/registry.ts -> src/modules/dia/index.tsx -> src/modules/dia/Pantallas.tsx -> src/core/registry.ts`
- 4-file cycle: `src/core/registry.ts -> src/modules/pagos/index.tsx -> src/modules/pagos/AlDia.tsx -> src/ui/Actividad.tsx -> src/core/registry.ts`
- 4-file cycle: `src/core/registry.ts -> src/modules/pagos/index.tsx -> src/modules/pagos/Pagos.tsx -> src/ui/Actividad.tsx -> src/core/registry.ts`
- 5-file cycle: `src/core/registry.ts -> src/modules/pagos/index.tsx -> src/modules/pagos/Pagos.tsx -> src/modules/pagos/AlDia.tsx -> src/ui/Actividad.tsx -> src/core/registry.ts`

## Communities (35 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (120): react, escribirStorage(), fechaCorta(), mesActual(), nombreMes(), parsearMonto(), relativo(), ir() (+112 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (83): modificar(), aISO(), desdeISO(), fechaLarga(), hoy(), moverMes(), pad(), sumarDias() (+75 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (56): leerRutinaJson(), Preparacion, progresoPorFecha, alternativas(), fijarPropios(), infoEjercicio(), ajustarDia(), ajustarEjercicio() (+48 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (51): crear(), eliminar(), estado(), fijar(), Fila, recargar(), useTabla(), Clave (+43 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (47): BIBLIOTECA, EjercicioBase, Equipo, FINO, nombreGrupo(), nombreZona(), PROPIOS, queSentir() (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (41): com_precios_item, public.com_compras, public.com_items, public.com_precios, public.com_supers, public.com_tickets, api_registro_user, life_perfil_nuevo (+33 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (44): diasEntre(), evaluarPreparacion(), necesitaDescarga(), pct(), describirSemana(), Stepper(), Chequeo(), efectivasDe() (+36 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (36): NUBE_LIFE, Cerrar(), confirmar(), PantallaComprando(), sumarExtra(), Cuestionario(), sumar(), adivinarBloque() (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (30): dinero(), ElegirSuper(), PantallaHistorial(), compraEnCurso(), ResumenCompras(), useActividadCompras(), useSenalesCompras(), PantallaLista() (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (32): TicketQR, bajarTicket(), BotonFoto(), elegir(), cambiarTicket(), CANT_X, clasificarQr(), Cuenta() (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (32): dependencies, react@^19.3.0, react-dom@^19.3.0, tesseract.js@^7.0.0, @zxing/browser@^0.2.1, @zxing/library@^0.23.0, devDependencies, @types/react@^19.0.0 (+24 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (23): uid(), Cambio(), Cerrar(), alLeerQr(), confirmar(), ElegirPara(), FormLinea(), PantallaEscanear() (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (24): compararSemana(), CompEjercicio, enSemana(), informeEntrenador(), inicioSemana(), kg(), mejor1RM(), objetivoHoy() (+16 more)

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (24): ResumenStock(), useAgendaStock(), useSenalesStock(), TS, aComprar(), ajustar(), faltantes(), Lugar (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (18): AGENDA, CICLOS, DIAS_C1, DIAS_C2, DIAS_C4, EJ, fuerza, pad() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (22): Perfil, usePerfil(), guardarConfigNube(), borrarPrueba(), contarPrueba(), exportarTodo(), importarTodo(), supabase (+14 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (20): MODULOS, ORDEN, useTodasLasSenales(), Modulo, NivelSenal, Pantalla, Senal, moduloAjustes (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (16): CORS, ROLES, anotar(), atender(), CORS, DESCRIPCION, ejecutar(), ErrorUso (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.18
Nodes (13): cargarPerfil(), ConSesion(), correoDe(), CuentaPausada(), DOMINIO_USUARIOS, fijarPerfil(), Login(), enviar() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.27
Nodes (12): App(), AvisoLocales(), EN_BARRA, veModulo(), contarLocales(), noSubirDatosLocales(), subirDatosLocales(), rutaActual() (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.26
Nodes (10): puedeEscribir(), configDesdeEntorno(), configGuardada(), ConfigNube, leerStorage(), ACCION, claveNueva(), ConexionClaude() (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (10): @supabase/supabase-js@^2.117.2, @supabase/supabase-js, cache, cfg, EstadoTabla, oyentes, PREFIJO_PRUEBA, suscribir() (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.36
Nodes (7): GRUPOS, abreviar(), barra(), BarrasSemanas(), fmt(), Linea(), VolumenGrupos()

### Community 26 - "Community 26"
Cohesion: 0.43
Nodes (7): BuscarOnline(), buscar(), elegir(), FormItem(), elegir(), guardar(), buscarPrecios()

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (5): buscar(), CADENAS, CORS, normalizar(), Resultado

## Knowledge Gaps
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 13`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 21`, `Community 23`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05871459694989107 - nodes in this community are weakly interconnected._
- **Why does `hoy()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 6`, `Community 7`, `Community 8`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 26`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06337719298245614 - nodes in this community are weakly interconnected._
- **Why does `Tarjeta()` connect `Community 8` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 9`, `Community 11`, `Community 13`, `Community 15`, `Community 21`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08192090395480225 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09764309764309764 - nodes in this community are weakly interconnected._