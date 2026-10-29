import { hoy, sumarDias } from '../../core/format';
import { rangoSeries } from './analisis';
import { GRUPOS, infoEjercicio, nombreGrupo, todos, variantesDe, type Grupo } from './biblioteca';
import { e, efectivas, pesoSugerido, progresoEjercicio, proximoDia, tendencia, ultimaVez, type DiaPlan, type EjercicioPlan, type Serie, type Sesion } from './modelo';
import type { Perfil, SemanaCiclo } from './ciclo';

/* ---------- El profe: mejoras concretas para la rutina activa ----------
 * Mira la rutina (volumen por músculo, orden, descansos, rango de reps) y lo que pasó entrenando
 * (estancados, ejercicios que siempre cambiás, pesos que ya podés subir) y propone cambios de a uno.
 * Nada se aplica solo: cada mejora trae `aplicar` (devuelve la rutina cambiada) y la pantalla pide el OK.
 * Es lógica pura, sin pantallas: Zonka y el informe para Claude pueden usar lo mismo (`textoMejoras`). */

export type TipoMejora = 'fijar' | 'estancado' | 'volumen' | 'falta' | 'orden' | 'descanso' | 'reps' | 'peso';

export interface Mejora {
  /** Estable mientras la propuesta sea la misma (sirve para "Ahora no"). */
  id: string;
  tipo: TipoMejora;
  titulo: string;
  /** Por qué, en una o dos frases. */
  porque: string;
  /** Día de la rutina al que toca (letra). */
  dia?: string;
  /** Cambia la rutina. Si no está, es un consejo para el próximo entreno. */
  aplicar?: (dias: DiaPlan[]) => DiaPlan[];
  /** Botón para los consejos sin cambio de rutina. */
  ir?: { texto: string; ruta: string };
}

const coma = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const kg = (n: number) => `${coma(n)} kg`;

/** Copia la rutina cambiando un ejercicio (por día y posición). */
function cambiarEj(dias: DiaPlan[], d: number, i: number, fn: (x: EjercicioPlan) => EjercicioPlan): DiaPlan[] {
  return dias.map((dd, j) => (j !== d ? dd : { ...dd, ejercicios: dd.ejercicios.map((x, k) => (k === i ? fn(x) : x)) }));
}

/** Series por semana que la rutina le da a cada músculo si hacés cada día una vez (principal 1, ayuda 0,5). */
export function volumenPlan(dias: DiaPlan[]): Record<Grupo, number> {
  const r = Object.fromEntries(GRUPOS.map((g) => [g.id, 0])) as Record<Grupo, number>;
  for (const x of dias.flatMap((d) => d.ejercicios)) {
    const info = infoEjercicio(x.nombre);
    if (!info) continue;
    r[info.grupo] += x.series;
    for (const g of info.secundarios) r[g] += x.series / 2;
  }
  return r;
}

const ORDEN: TipoMejora[] = ['fijar', 'estancado', 'volumen', 'falta', 'orden', 'descanso', 'reps', 'peso'];

export function sugerirMejoras(dias: DiaPlan[], sesiones: Sesion[], series: Serie[], datos: {
  desde?: string | null; perfil?: Perfil | null; semana?: SemanaCiclo | null; ref?: string;
} = {}): Mejora[] {
  const out: Mejora[] = [];
  const enRutina = new Set(dias.flatMap((d) => d.ejercicios.map((x) => x.nombre.toLowerCase())));
  const yaUsado = (n: string) => enRutina.has(n.toLowerCase());
  const ref = datos.ref ?? hoy();

  /* 1. Lo que siempre cambiás: en las 2 últimas veces de ese día no hiciste X y sí hiciste Y (mismo músculo). */
  const recientes = sesiones.filter((s) => s.dia !== 'otro' && s.fecha >= (datos.desde ?? sumarDias(ref, -60)));
  dias.forEach((d, di) => {
    const ult = recientes.filter((s) => s.dia === d.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 2);
    if (ult.length < 2) return;
    const hechos = ult.map((s) => new Set(efectivas(series).filter((x) => x.sesion_id === s.id).map((x) => x.ejercicio)));
    if (hechos.some((h) => !h.size)) return;
    const enAmbas = [...hechos[0]].filter((n) => hechos[1].has(n) && !yaUsado(n));
    d.ejercicios.forEach((ej, i) => {
      if (hechos.some((h) => h.has(ej.nombre))) return;
      const g = infoEjercicio(ej.nombre)?.grupo;
      const otro = enAmbas.find((n) => infoEjercicio(n)?.grupo === g);
      if (!otro) return;
      out.push({
        id: `fijar-${d.id}-${ej.nombre}-${otro}`, tipo: 'fijar', dia: d.id,
        titulo: `Día ${d.id}: dejá fijo ${otro} en lugar de ${ej.nombre}`,
        porque: `Las dos últimas veces cambiaste ${ej.nombre} por ${otro}. Si es lo que hacés, que la rutina lo diga: así la app sigue tus pesos.`,
        aplicar: (ds) => cambiarEj(ds, di, i, (x) => ({ ...x, nombre: otro, salto: infoEjercicio(otro)?.salto ?? x.salto, variantes: [ej.nombre, ...(x.variantes ?? []).filter((v) => v !== otro)].slice(0, 5) })),
      });
    });
  });

  /* 2. Estancados: 5 entrenos sin superar tu mejor marca → cambiar por una variante (estímulo nuevo). */
  dias.forEach((d, di) => d.ejercicios.forEach((ej, i) => {
    if (tendencia(progresoEjercicio(series, ej.nombre)) !== 'estancado') return;
    const alt = variantesDe(ej.nombre, ej.variantes).find((n) => !yaUsado(n));
    if (!alt) return;
    out.push({
      id: `estanc-${ej.nombre}-${alt}`, tipo: 'estancado', dia: d.id,
      titulo: `Cambiá ${ej.nombre} por ${alt}`,
      porque: `Hace 5 entrenos que no superás tu mejor marca en ${ej.nombre}. Mismo músculo con otro ángulo suele destrabar; el viejo queda como variante para volver más adelante.`,
      aplicar: (ds) => cambiarEj(ds, di, i, (x) => ({ ...x, nombre: alt, salto: infoEjercicio(alt)?.salto ?? x.salto, variantes: [ej.nombre, ...(x.variantes ?? []).filter((v) => v !== alt)].slice(0, 5) })),
    });
  }));

  /* 3. Volumen por músculo de la rutina contra el rango que más rinde (ver rangoSeries).
   * Con un margen del 20 % abajo: unas series de menos no justifican cambiar la rutina. */
  const vol = volumenPlan(dias);
  const lugares = (g: Grupo) => dias.flatMap((d, di) => d.ejercicios.map((x, i) => ({ d, di, i, x }))).filter((p) => infoEjercicio(p.x.nombre)?.grupo === g);
  for (const { id: g } of GRUPOS) {
    const [min, max] = rangoSeries(g);
    const v = vol[g];
    const ps = lugares(g);
    if (v < min * 0.8 && ps.length) {
      const p = [...ps].sort((a, b) => a.x.series - b.x.series)[0];
      if (p.x.series >= 5) continue;
      out.push({
        id: `vol-mas-${g}-${coma(v)}`, tipo: 'volumen', dia: p.d.id,
        titulo: `${nombreGrupo(g)}: sumá 1 serie a ${p.x.nombre}`,
        porque: `Haciendo cada día una vez por semana, tu rutina le da ${coma(v)} series y lo que más hace crecer está entre ${min} y ${max}. De a una serie por vez, para que el cuerpo se acostumbre.`,
        aplicar: (ds) => cambiarEj(ds, p.di, p.i, (x) => ({ ...x, series: x.series + 1 })),
      });
    } else if (v > max * 1.15 && ps.length) {
      const p = [...ps].sort((a, b) => b.x.series - a.x.series)[0];
      if (p.x.series <= 2) continue;
      out.push({
        id: `vol-menos-${g}-${coma(v)}`, tipo: 'volumen', dia: p.d.id,
        titulo: `${nombreGrupo(g)}: sacale 1 serie a ${p.x.nombre}`,
        porque: `Le das ${coma(v)} series por semana, arriba de ${max}. Más que eso cansa y casi no suma: mejor guardar energía para otro músculo (o para el trabajo).`,
        aplicar: (ds) => cambiarEj(ds, p.di, p.i, (x) => ({ ...x, series: x.series - 1 })),
      });
    } else if (v === 0 && g !== 'antebrazo' && dias.length) {
      // Músculo sin trabajo: un ejercicio de aislamiento al día con menos ejercicios.
      const nuevo = todos().find((x) => x.grupo === g && !x.compuesto && x.equipo !== 'peso corporal' && !yaUsado(x.nombre))
        ?? todos().find((x) => x.grupo === g && !yaUsado(x.nombre));
      if (!nuevo) continue;
      const di = dias.reduce((m, d, j) => (d.ejercicios.length < dias[m].ejercicios.length ? j : m), 0);
      out.push({
        id: `falta-${g}`, tipo: 'falta', dia: dias[di].id,
        titulo: `${nombreGrupo(g)} no tiene trabajo: sumá ${nuevo.nombre}`,
        porque: `Ningún ejercicio de la rutina trabaja ${nombreGrupo(g).toLowerCase()}. Lo pongo al final del día ${dias[di].id}, que es el más corto (3 series).`,
        aplicar: (ds) => ds.map((d, j) => (j !== di ? d : { ...d, ejercicios: [...d.ejercicios, nuevo.compuesto ? e(nuevo.nombre, 3, 8, 12, 120, 8) : e(nuevo.nombre, 3, 12, 15, 60, 9)] })),
      });
    }
  }

  dias.forEach((d, di) => d.ejercicios.forEach((ej, i) => {
    const info = infoEjercicio(ej.nombre);
    /* 4. Orden: un compuesto después de un aislamiento del mismo músculo pierde fuerza. */
    if (info?.compuesto) {
      const antes = d.ejercicios.slice(0, i).findIndex((x) => { const o = infoEjercicio(x.nombre); return o && !o.compuesto && o.grupo === info.grupo; });
      if (antes >= 0) {
        out.push({
          id: `orden-${d.id}-${ej.nombre}`, tipo: 'orden', dia: d.id,
          titulo: `Día ${d.id}: pasá ${ej.nombre} antes de ${d.ejercicios[antes].nombre}`,
          porque: 'Los ejercicios pesados (multiarticulares) rinden más con el músculo fresco. El de aislamiento va después para rematar.',
          aplicar: (ds) => ds.map((dd, j) => {
            if (j !== di) return dd;
            const xs = [...dd.ejercicios];
            const [m] = xs.splice(i, 1);
            xs.splice(antes, 0, m);
            return { ...dd, ejercicios: xs };
          }),
        });
      }
    }
    /* 5. Descansos: para ganar masa, 2–3 min en los pesados rinden más que 1 min (Schoenfeld 2016). */
    const minimo = info?.compuesto ? 90 : 60;
    if (info && ej.descanso < minimo) {
      const nuevo = info.compuesto ? 120 : 75;
      out.push({
        id: `desc-${d.id}-${ej.nombre}-${ej.descanso}`, tipo: 'descanso', dia: d.id,
        titulo: `${ej.nombre}: descansá ${nuevo} s en vez de ${ej.descanso} s`,
        porque: info.compuesto
          ? 'En los ejercicios pesados, descansar poco hace que la serie siguiente salga con menos peso o menos reps, y eso es lo que hace crecer.'
          : 'Menos de un minuto no alcanza para recuperar: la serie siguiente pierde reps.',
        aplicar: (ds) => cambiarEj(ds, di, i, (x) => ({ ...x, descanso: nuevo })),
      });
    }
    /* 6. Rango de reps muy justo: con 0–1 reps de margen la doble progresión no tiene por dónde avanzar. */
    if (ej.repsMax - ej.repsMin < 2 && info?.equipo !== 'peso corporal') {
      const tope = ej.repsMin + (info?.compuesto ? 3 : 4);
      out.push({
        id: `reps-${d.id}-${ej.nombre}-${ej.repsMin}-${ej.repsMax}`, tipo: 'reps', dia: d.id,
        titulo: `${ej.nombre}: abrí el rango a ${ej.repsMin}–${tope} reps`,
        porque: `Con ${ej.repsMin}–${ej.repsMax} no hay lugar para sumar repeticiones antes de subir peso. Con un rango más ancho vas sumando de a una y subís cuando llegás al tope.`,
        aplicar: (ds) => cambiarEj(ds, di, i, (x) => ({ ...x, repsMax: tope })),
      });
    }
  }));

  /* 7. Pesos para el próximo entreno (consejo, no cambia la rutina). */
  if (dias.length) {
    const prox = proximoDia(sesiones, dias, datos.desde);
    for (const ej of prox.ejercicios) {
      const prev = ultimaVez(series, ej.nombre);
      if (!prev.length) continue;
      const antes = Math.max(...prev.map((s) => Number(s.peso) || 0));
      if (antes <= 0) continue;
      const sug = pesoSugerido(series, ej, datos.perfil, datos.semana);
      const conRpe = prev.filter((s) => s.rpe != null);
      const facil = sug.peso === antes && conRpe.length === prev.length && prev.length >= 2 && conRpe.every((s) => (s.rpe ?? 10) <= ej.rpe - 2);
      const peso = facil ? antes + ej.salto : sug.peso;
      if (peso == null || peso === antes) continue;
      const motivo = facil
        ? `La última vez todas las series te quedaron en RPE ${coma(Math.max(...conRpe.map((s) => s.rpe ?? 0)))} y el objetivo es ${coma(ej.rpe)}: te sobró. Subí aunque no hayas llegado al tope de reps.`
        : sug.motivo;
      out.push({
        id: `peso-${ej.nombre}-${peso}-${prev[0].sesion_id}`, tipo: 'peso', dia: prox.id,
        titulo: `${ej.nombre}: la próxima ${peso > antes ? 'subí' : 'bajá'} a ${kg(peso)} (venías con ${kg(antes)})`,
        porque: motivo,
        ir: { texto: 'Ir a entrenar', ruta: '#/entrenamiento' },
      });
    }
  }

  return out.sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo));
}

/* ---------- "Ahora no": se esconde 14 días en este dispositivo ---------- */

const CLAVE = 'life.entreno.profe.ahorano';
const DIAS_FUERA = 14;

function leerPospuestas(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Record<string, string>; } catch { return {}; }
}

export function posponerMejora(id: string) {
  const p = leerPospuestas();
  p[id] = hoy();
  // Limpia las viejas para que no crezca para siempre.
  for (const [k, f] of Object.entries(p)) if (f < sumarDias(hoy(), -DIAS_FUERA)) delete p[k];
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento: vuelve a aparecer */ }
}

export function estaPospuesta(id: string, ref = hoy()): boolean {
  const f = leerPospuestas()[id];
  return !!f && f >= sumarDias(ref, -DIAS_FUERA);
}

/** Texto para el informe a Claude (o para Zonka): lo que la app ya propone, para no repetirlo. */
export function textoMejoras(ms: Mejora[]): string {
  if (!ms.length) return '## Lo que ya sugiere la app\n(nada: la rutina está en rango)';
  return ['## Lo que ya sugiere la app (El profe)', ...ms.map((m) => `- ${m.titulo}. ${m.porque}`)].join('\n');
}
