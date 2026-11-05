/* Fuerza y descansos (2026-11-04, pedido de ella): cuánta fuerza tenés en cada ejercicio según tus series reales,
 * qué peso te toca para las reps y el esfuerzo del plan, y qué descanso te deja rendir sin alargar el entreno.
 * Sin hooks: lo usan modelo.ts (peso sugerido), Pantallas.tsx (Progreso) y el modo entrenando. */
import { infoEjercicio } from './biblioteca';
import { pesoInicial, redondearCarga, type Perfil } from './ciclo';
import type { DiaPlan, EjercicioPlan, Serie } from './modelo';

const ef = (series: Serie[]) => series.filter((s) => s.tipo !== 'calentamiento');
const orden = (a: Serie, b: Serie) => a.fecha.localeCompare(b.fecha) || (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.numero - b.numero;

/** Ejercicios donde se mueve el cuerpo (fondos, dominadas): el peso cargado es lastre y la carga real suma tu peso. */
export function conCuerpo(nombre: string): boolean {
  return /con peso|lastre|dominada|fondos/i.test(nombre) || infoEjercicio(nombre)?.equipo === 'peso corporal';
}

/** Repeticiones en reserva según el esfuerzo (RPE 8 = te quedaban 2). Sin RPE se asume 1. */
const reserva = (rpe: number | null | undefined) => (rpe == null ? 1 : Math.max(0, Math.min(5, 10 - rpe)));

/**
 * 1RM estimado de una serie (Epley) contando las repeticiones que te quedaban en reserva:
 * 20 kg × 8 a RPE 8 rinde como 20 kg × 10 al fallo. En fondos y dominadas se suma tu peso.
 */
export function rmSerie(s: Pick<Serie, 'ejercicio' | 'peso' | 'reps' | 'rpe'>, pesoCorporal = 0): number {
  const carga = (Number(s.peso) || 0) + (conCuerpo(s.ejercicio) ? pesoCorporal : 0);
  const reps = s.reps + reserva(s.rpe);
  return carga * (1 + reps / 30);
}

/** Peso a cargar para hacer `reps` repeticiones a cierto RPE con ese 1RM (la inversa de rmSerie). */
export function pesoPara(rm: number, reps: number, rpe: number, nombre: string, pesoCorporal = 0): number {
  const carga = rm / (1 + (reps + reserva(rpe)) / 30) - (conCuerpo(nombre) ? pesoCorporal : 0);
  return redondearCarga(Math.max(0, carga), nombre);
}

export interface PuntoFuerza {
  fecha: string;
  sesion_id: string;
  /** 1RM estimado de la mejor serie del día. */
  rm: number;
  /** Serie más pesada (peso × reps). */
  top: { peso: number; reps: number; rpe: number | null };
  series: number;
  reps: number;
  /** Kilos movidos: peso × reps de todas las series efectivas. */
  volumen: number;
  /** Descanso medio real antes de cada serie (sin contar la primera), en segundos; null si no se midió. */
  descanso: number | null;
}

/** Un punto por sesión de ese ejercicio, de la más vieja a la más nueva. */
export function historiaEjercicio(series: Serie[], nombre: string, pesoCorporal = 0): PuntoFuerza[] {
  const porSesion = new Map<string, Serie[]>();
  for (const s of ef(series)) {
    if (s.ejercicio !== nombre) continue;
    const k = s.sesion_id;
    porSesion.set(k, [...(porSesion.get(k) ?? []), s]);
  }
  return [...porSesion.values()].map((xs) => {
    xs.sort(orden);
    const mejor = xs.reduce((a, b) => (rmSerie(b, pesoCorporal) > rmSerie(a, pesoCorporal) ? b : a));
    const top = xs.reduce((a, b) => (Number(b.peso) > Number(a.peso) || (Number(b.peso) === Number(a.peso) && b.reps > a.reps) ? b : a));
    const desc = xs.slice(1).map((s) => s.descanso_seg).filter((d): d is number => d != null && d > 0);
    return {
      fecha: xs[0].fecha, sesion_id: xs[0].sesion_id, rm: rmSerie(mejor, pesoCorporal),
      top: { peso: Number(top.peso) || 0, reps: top.reps, rpe: top.rpe ?? null },
      series: xs.length, reps: xs.reduce((t, s) => t + s.reps, 0),
      volumen: xs.reduce((t, s) => t + (Number(s.peso) || 0) * s.reps, 0),
      descanso: desc.length ? Math.round(desc.reduce((a, b) => a + b, 0) / desc.length) : null,
    };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface Fuerza {
  /** 1RM estimado actual (el de la última sesión; si fue un día flojo, el promedio con la anterior). */
  rm: number;
  sesiones: number;
  fecha: string;
  /** "medida" con 2 sesiones o más; "primera" con una sola (puede moverse bastante). */
  confianza: 'primera' | 'medida';
  /** Cambio del 1RM contra la sesión anterior, en %. */
  cambio: number | null;
}

export function fuerzaDe(series: Serie[], nombre: string, pesoCorporal = 0): Fuerza | null {
  const h = historiaEjercicio(series, nombre, pesoCorporal);
  if (!h.length) return null;
  const ult = h[h.length - 1];
  const ant = h[h.length - 2];
  // Un día flojo (más de 5 % abajo) no tira la estimación entera para abajo: se promedia con la anterior.
  const rm = ant && ult.rm < ant.rm * 0.95 ? (ult.rm + ant.rm) / 2 : ult.rm;
  return { rm, sesiones: h.length, fecha: ult.fecha, confianza: h.length >= 2 ? 'medida' : 'primera', cambio: ant ? ((ult.rm - ant.rm) / ant.rm) * 100 : null };
}

/** Reps de referencia para la primera serie (la más pesada): una arriba del mínimo del rango. */
export const repsTop = (ej: EjercicioPlan) => Math.min(ej.repsMax, ej.repsMin + 1);

/**
 * Peso de trabajo según tu fuerza: lo que te deja hacer las reps de la primera serie al RPE del plan.
 * No salta más de un escalón para arriba ni dos para abajo contra lo último que usaste, para no pegar volantazos.
 */
export function pesoPorFuerza(series: Serie[], ej: EjercicioPlan, pesoCorporal = 0): { peso: number; rm: number; reps: number } | null {
  const f = fuerzaDe(series, ej.nombre, pesoCorporal);
  if (!f) return null;
  const h = historiaEjercicio(series, ej.nombre, pesoCorporal);
  const ultimo = h[h.length - 1].top.peso;
  const reps = repsTop(ej);
  let p = pesoPara(f.rm, reps, ej.rpe, ej.nombre, pesoCorporal);
  const paso = ej.salto > 0 ? ej.salto : 2.5;
  if (ultimo > 0) p = Math.min(ultimo + paso, Math.max(ultimo - 2 * paso, p));
  return { peso: redondearCarga(p, ej.nombre), rm: f.rm, reps };
}

/**
 * Cuánto rendís contra lo que estimaba la app por tu peso y nivel (1 = igual). Sirve para los ejercicios
 * que todavía no hiciste: si en lo que ya hiciste rendís 20 % más, la primera vez del resto también arranca 20 % más arriba.
 * null con menos de 2 ejercicios medidos.
 */
export function calibracion(series: Serie[], perfil: Perfil | null | undefined): { factor: number; ejercicios: number } | null {
  if (!perfil?.peso_kg) return null;
  const nombres = [...new Set(ef(series).map((s) => s.ejercicio))];
  const ratios: number[] = [];
  for (const n of nombres) {
    const ini = pesoInicial(perfil, n);
    if (!ini || ini <= 0 || conCuerpo(n)) continue;
    const h = historiaEjercicio(series, n);
    const top = h[h.length - 1]?.top.peso;
    if (top > 0) ratios.push(top / ini);
  }
  if (ratios.length < 2) return null;
  ratios.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  return { factor: Math.max(0.5, Math.min(1.8, med)), ejercicios: ratios.length };
}

/* ---------- Descanso contra rendimiento ---------- */

/** Cuánto sostenés de una serie a la siguiente: 1RM estimado de la serie ÷ el de la anterior, en %. */
export interface Caida { ejercicio: string; fecha: string; numero: number; descanso: number | null; real: boolean; retencion: number }

/**
 * Para cada serie (desde la segunda de cada ejercicio) cuánto rendimiento sostuviste contra la anterior
 * y cuánto descansaste antes. Si el descanso no se midió (entrenos viejos), usa el del plan y lo marca como no real.
 */
export function caidas(series: Serie[], descansoPlan: (nombre: string) => number | null, pesoCorporal = 0): Caida[] {
  const out: Caida[] = [];
  const grupos = new Map<string, Serie[]>();
  for (const s of ef(series)) {
    const k = `${s.sesion_id}|${s.ejercicio}`;
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  for (const xs of grupos.values()) {
    xs.sort(orden);
    for (let i = 1; i < xs.length; i++) {
      const a = rmSerie(xs[i - 1], pesoCorporal), b = rmSerie(xs[i], pesoCorporal);
      if (!(a > 0)) continue;
      const real = xs[i].descanso_seg != null && xs[i].descanso_seg! > 0;
      out.push({
        ejercicio: xs[i].ejercicio, fecha: xs[i].fecha, numero: xs[i].numero,
        descanso: real ? xs[i].descanso_seg! : descansoPlan(xs[i].ejercicio), real, retencion: (b / a) * 100,
      });
    }
  }
  return out;
}

/** Tramos de descanso para comparar. */
export const TRAMOS: Array<{ id: string; nombre: string; desde: number; hasta: number }> = [
  { id: 'r60', nombre: 'Hasta 1:15', desde: 0, hasta: 75 },
  { id: 'r90', nombre: '1:15 a 1:45', desde: 75, hasta: 105 },
  { id: 'r120', nombre: '1:45 a 2:15', desde: 105, hasta: 135 },
  { id: 'r150', nombre: '2:15 a 2:45', desde: 135, hasta: 165 },
  { id: 'r180', nombre: '2:45 o más', desde: 165, hasta: Infinity },
];

export interface Tramo { id: string; nombre: string; n: number; retencion: number; medio: number }

export function porTramo(cs: Caida[]): Tramo[] {
  return TRAMOS.map((t) => {
    const xs = cs.filter((c) => c.descanso != null && c.descanso >= t.desde && c.descanso < t.hasta);
    return {
      id: t.id, nombre: t.nombre, n: xs.length,
      retencion: xs.length ? xs.reduce((a, c) => a + c.retencion, 0) / xs.length : 0,
      medio: xs.length ? xs.reduce((a, c) => a + (c.descanso ?? 0), 0) / xs.length : 0,
    };
  }).filter((t) => t.n > 0);
}

/** Lo que se considera sostener bien de una serie a otra a RPE 8-9: perder 5 % o menos. */
export const META_RETENCION = 95;

export interface SugDescanso {
  nombre: string;
  plan: number;
  sugerido: number;
  /** Retención media (en %), null sin series para comparar. */
  retencion: number | null;
  /** Descanso real medio, si se midió. */
  real: number | null;
  muestras: number;
  /** Cuántas de esas muestras tienen el descanso medido de verdad. */
  medidas: number;
  motivo: string;
}

const lim = (ej: EjercicioPlan) => {
  const comp = infoEjercicio(ej.nombre)?.compuesto ?? conCuerpo(ej.nombre);
  return comp ? { min: 90, max: 210 } : { min: 60, max: 150 };
};
const a15 = (s: number) => Math.round(s / 15) * 15;

/**
 * Descanso sugerido por ejercicio: el más corto que te deja sostener el rendimiento.
 * - Con descansos medidos (3 o más): el tramo más corto cuya retención llega a la meta (o queda a 2 puntos del mejor).
 * - Si solo está el del plan: si perdés más de 8 % por serie, +30 s; entre 5 y 8 %, +15 s; si no perdés nada, −15 s.
 * Nunca baja de 1:00 (aislados) / 1:30 (compuestos) ni sube de 2:30 / 3:30.
 */
export function sugerirDescanso(ej: EjercicioPlan, cs: Caida[]): SugDescanso {
  const xs = cs.filter((c) => c.ejercicio === ej.nombre);
  const medidas = xs.filter((c) => c.real);
  const { min, max } = lim(ej);
  const base: SugDescanso = { nombre: ej.nombre, plan: ej.descanso, sugerido: ej.descanso, retencion: null, real: null, muestras: xs.length, medidas: medidas.length, motivo: 'Todavía sin series para comparar.' };
  if (!xs.length) return base;
  const ret = xs.reduce((a, c) => a + c.retencion, 0) / xs.length;
  const real = medidas.length ? Math.round(medidas.reduce((a, c) => a + (c.descanso ?? 0), 0) / medidas.length) : null;
  const out = { ...base, retencion: ret, real };
  if (medidas.length >= 3) {
    const tr = porTramo(medidas).filter((t) => t.n >= 2);
    if (tr.length >= 2) {
      const mejor = Math.max(...tr.map((t) => t.retencion));
      const ok = tr.find((t) => t.retencion >= META_RETENCION || t.retencion >= mejor - 2) ?? tr[tr.length - 1];
      const s = Math.max(min, Math.min(max, a15(ok.medio)));
      return { ...out, sugerido: s, motivo: `Con ${ok.nombre.toLowerCase()} sostenés ${Math.round(ok.retencion)} % de una serie a la otra; descansar más casi no suma.` };
    }
  }
  const actual = real ?? ej.descanso;
  if (ret < 92) {
    const s = Math.min(max, a15(actual + 30));
    return { ...out, sugerido: s, motivo: `Perdés ${Math.round(100 - ret)} % por serie: con 30 s más deberías sostener mejor.` };
  }
  if (ret < META_RETENCION) {
    const s = Math.min(max, a15(actual + 15));
    return { ...out, sugerido: s, motivo: `Perdés ${Math.round(100 - ret)} % por serie: 15 s más.` };
  }
  if (ret >= 99 && actual > min) {
    return { ...out, sugerido: Math.max(min, a15(actual - 15)), motivo: 'Sostenés todo: podés recortar 15 s y ganar tiempo.' };
  }
  return { ...out, sugerido: Math.max(min, Math.min(max, a15(actual))), motivo: 'Sostenés bien: dejalo así.' };
}

/** Sugerencias para todos los ejercicios de la rutina (las variantes de día cuentan aparte, sin repetir nombres). */
export function descansosRutina(dias: DiaPlan[], series: Serie[], pesoCorporal = 0): SugDescanso[] {
  const plan = new Map<string, number>();
  for (const d of dias) for (const x of d.ejercicios) if (!plan.has(x.nombre)) plan.set(x.nombre, x.descanso);
  const cs = caidas(series, (n) => plan.get(n) ?? null, pesoCorporal);
  const vistos = new Set<string>();
  const out: SugDescanso[] = [];
  for (const d of dias) for (const x of d.ejercicios) {
    if (vistos.has(x.nombre)) continue;
    vistos.add(x.nombre);
    out.push(sugerirDescanso(x, cs));
  }
  return out;
}

/** Descanso real antes de una serie: el tiempo desde la serie anterior menos lo que dura hacerla (~3 s por rep). */
export function descansoReal(tAnterior: number | undefined, t: number, reps: number): number | null {
  if (!tAnterior) return null;
  const seg = Math.round((t - tAnterior) / 1000 - Math.max(15, reps * 3));
  return seg > 0 && seg < 15 * 60 ? seg : null;
}

export const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(Math.round(seg % 60)).padStart(2, '0')}`;
