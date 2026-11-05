/* Cuentas del modo entrenando (pantalla única, 2026-10-29): cómo venís contra lo esperado,
 * cuánto debería durar y el calentamiento sugerido. Lo que se sugiere de peso sigue en modelo.ts. */
import { infoEjercicio } from './biblioteca';
import { redondearCarga, type Perfil, type SemanaCiclo } from './ciclo';
import { pesoSugerido, ultimaVez, type DiaPlan, type EjercicioPlan, type Serie, type Sesion } from './modelo';

export interface HechaVivo { ejercicio: string; peso: number; reps: number; rpe: number | null; tipo: 'efectiva' | 'calentamiento' }

/**
 * Rendimiento de hoy en % contra lo esperado: cada serie efectiva (peso × reps) se compara con lo que
 * pedía el plan para esa serie (`esperado`: peso sugerido × reps previstas). Así una semana de descarga
 * hecha como dice el plan da 100 %, no "peor que la vez pasada". Los ejercicios sin referencia no cuentan.
 * null = todavía no hay nada con qué comparar.
 */
export function rendimientoVivo(hechas: HechaVivo[], esperado: (ejercicio: string, indice: number) => number | null): number | null {
  let hoy = 0;
  let antes = 0;
  const vistas = new Map<string, number>();
  for (const h of hechas) {
    if (h.tipo === 'calentamiento') continue;
    const i = vistas.get(h.ejercicio) ?? 0;
    vistas.set(h.ejercicio, i + 1);
    const ref = esperado(h.ejercicio, i);
    if (!ref || !(ref > 0)) continue;
    hoy += (h.peso || 1) * h.reps;
    antes += ref;
  }
  return antes > 0 ? (hoy / antes) * 100 : null;
}

/** Reps previstas para la serie `i`: lo que hiciste esa serie la última vez si fue con el mismo peso, si no el mínimo del rango. */
export function repsPrevistas(series: Serie[], ej: EjercicioPlan, peso: number | null, i: number): number {
  const antes = ultimaVez(series, ej.nombre)[i];
  return antes && Number(antes.peso) === peso ? Math.min(ej.repsMax, Math.max(ej.repsMin, antes.reps)) : ej.repsMin;
}

/**
 * Rendimiento de un entreno ya guardado, con la misma vara que en vivo: contra lo que pedía el plan ese día
 * (peso sugerido con lo que había antes de esa sesión y la semana del ciclo). Para el Día y la agenda.
 */
export function rendimientoGuardado(sesion: Sesion, todas: Serie[], plan: DiaPlan | undefined, perfil?: Perfil | null, semana?: SemanaCiclo | null): number | null {
  if (!plan) return null;
  const orden = (a: Serie, b: Serie) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.numero - b.numero;
  const propias = todas.filter((s) => s.sesion_id === sesion.id).sort(orden);
  const empezo = propias[0]?.created_at ?? '';
  const antes = todas.filter((s) => s.sesion_id !== sesion.id && (s.fecha < sesion.fecha || (s.fecha === sesion.fecha && (s.created_at ?? '') < empezo)));
  const esperado = (nombre: string, i: number) => {
    const x = plan.ejercicios.find((e) => e.nombre === nombre);
    const p = x ? pesoSugerido(antes, x, perfil, semana).peso : null;
    return x && p != null ? (p || 1) * repsPrevistas(antes, x, p, i) : null;
  };
  return rendimientoVivo(propias.map((s) => ({ ejercicio: s.ejercicio, peso: Number(s.peso) || 0, reps: s.reps, rpe: s.rpe ?? null, tipo: s.tipo ?? 'efectiva' })), esperado);
}

/**
 * Tiempo que se va entre un ejercicio y otro (2026-11-05, pedido de ella): ir hasta el lugar, armar la barra o la máquina,
 * acomodarse y, a veces, esperar que se libere. Con barra se tarda más (discos, rack). Si ya hay entrenos guardados,
 * se usa lo que tardás de verdad (`cambioAprendido`).
 */
export function segCambio(ej: EjercicioPlan, aprendido?: number | null): number {
  if (aprendido != null) return aprendido;
  const eq = infoEjercicio(ej.nombre)?.equipo;
  return eq === 'barra' ? 120 : 80;
}

/**
 * Lo que tardás de más por ejercicio según tus entrenos guardados: (duración real − series × 45 s − descansos) ÷ ejercicios.
 * Usa el descanso medido si está; si no, el del plan. Mediana de los últimos 6 entrenos, entre 1 y 4 min. null sin datos.
 */
export function cambioAprendido(sesiones: Sesion[], series: Serie[], dias: DiaPlan[]): number | null {
  const plan = new Map<string, number>();
  for (const d of dias) for (const x of d.ejercicios) if (!plan.has(x.nombre)) plan.set(x.nombre, x.descanso);
  const vistas = new Set<string>();
  const xs: number[] = [];
  const recientes = [...sesiones].filter((s) => s.dia !== 'otro' && (s.duracion_min ?? 0) > 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const s of recientes) {
    const clave = `${s.fecha}|${s.dia}|${s.duracion_min}`;
    if (vistas.has(clave)) continue; // el mismo entreno guardado dos veces
    vistas.add(clave);
    const propias = series.filter((x) => x.sesion_id === s.id).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.numero - b.numero);
    const ejercicios = new Set(propias.map((x) => x.ejercicio));
    if (!ejercicios.size) continue;
    const yaEmpezado = new Set<string>();
    let seg = 0;
    for (const x of propias) {
      seg += 45;
      if (yaEmpezado.has(x.ejercicio)) seg += x.descanso_seg ?? plan.get(x.ejercicio) ?? 90;
      yaEmpezado.add(x.ejercicio);
    }
    xs.push(((s.duracion_min ?? 0) * 60 - seg) / ejercicios.size);
    if (xs.length >= 6) break;
  }
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  return Math.round(Math.max(60, Math.min(240, xs[Math.floor(xs.length / 2)])) / 15) * 15;
}

/** Minutos que debería durar: ~45 s por serie, el descanso que pide cada ejercicio y el cambio entre ejercicios. */
export function minutosEstimados(plan: DiaPlan, seriesDe: (ej: EjercicioPlan) => number = (e) => e.series, aprendido?: number | null): number {
  const seg = plan.ejercicios.reduce((t, e) => t + seriesDe(e) * 45 + Math.max(0, seriesDe(e) - 1) * e.descanso + segCambio(e, aprendido), 0);
  return Math.round(seg / 60);
}

export const duracion = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);

/** Calentamiento sugerido: 5 min de cardio y 2 series de aproximación del primer ejercicio (50 % × 10 y 75 % × 5). */
export function calentamiento(ej: EjercicioPlan | undefined, peso: number | null): Array<{ texto: string; valor: string; peso?: number; reps?: number }> {
  const out: Array<{ texto: string; valor: string; peso?: number; reps?: number }> = [{ texto: 'Bici o cinta, suave', valor: '5 min' }];
  if (ej && peso && peso > 0) {
    for (const [f, reps] of [[0.5, 10], [0.75, 5]] as const) {
      const p = redondearCarga(peso * f, ej.nombre);
      if (p > 0) out.push({ texto: `${ej.nombre}, aproximación`, valor: `${String(p).replace('.', ',')} kg × ${reps}`, peso: p, reps });
    }
  }
  return out;
}

/** Texto corto de qué hacer según el rendimiento (para el medidor). */
export function consejoRendimiento(pct: number): string {
  if (pct < 75) return 'Muy abajo de la vez pasada. Revisá el peso o si venís cansado: mejor una serie menos.';
  if (pct < 90) return 'Abajo de lo esperado. Bajá un salto de peso o tomate más descanso.';
  if (pct < 97) return 'Un poco abajo. Terminá las series con buena técnica.';
  if (pct < 105) return 'Justo lo esperado.';
  if (pct < 115) return 'Mejor que la vez pasada.';
  return '¡Día de récord! Anotá cómo dormiste y qué comiste.';
}
