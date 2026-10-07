import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { hoy } from '../../core/format';
import { infoEjercicio } from './biblioteca';

/* ---------- Rutina: días con ejercicios. La base viene en código; la usuaria (o Claude) la puede editar ---------- */

export interface EjercicioPlan {
  nombre: string;
  series: number;
  repsMin: number;
  repsMax: number;
  /** Descanso entre series, en segundos. */
  descanso: number;
  /** Esfuerzo objetivo (RPE 1–10: 8 = te quedan 2 repeticiones en reserva). */
  rpe: number;
  /** Cuánto subir cuando completás todas las series en el tope de repeticiones. */
  salto: number;
  /** Indicación de técnica o comentario del entrenador. */
  nota?: string;
}

export interface DiaPlan {
  /** Letra o código corto del día (A, B, C…). */
  id: string;
  nombre: string;
  ejercicios: EjercicioPlan[];
}

export const e = (nombre: string, series: number, repsMin: number, repsMax: number, descanso: number, rpe: number, salto?: number): EjercicioPlan =>
  ({ nombre, series, repsMin, repsMax, descanso, rpe, salto: salto ?? infoEjercicio(nombre)?.salto ?? 2.5 });

/** Rutina base: 3 días por grupo muscular, orientada a ganar masa (hipertrofia). */
export const RUTINA_BASE: DiaPlan[] = [
  {
    id: 'A', nombre: 'Pecho y bíceps', ejercicios: [
      e('Press de banca con barra', 4, 6, 10, 150, 8),
      e('Press inclinado con mancuernas', 3, 8, 12, 120, 8, 2),
      e('Aperturas en polea o máquina', 3, 12, 15, 75, 9, 2.5),
      e('Fondos en paralelas (o press declinado)', 3, 8, 12, 90, 8, 2.5),
      e('Curl de bíceps con barra', 3, 8, 12, 90, 8, 2),
      e('Curl martillo con mancuernas', 3, 10, 14, 75, 9, 2),
    ],
  },
  {
    id: 'B', nombre: 'Espalda y tríceps', ejercicios: [
      e('Dominadas o jalón al pecho', 4, 6, 10, 150, 8),
      e('Remo con barra', 4, 8, 10, 120, 8),
      e('Remo con mancuerna a una mano', 3, 10, 12, 90, 8, 2),
      e('Face pull en polea', 3, 12, 15, 60, 9, 2.5),
      e('Press francés con barra Z', 3, 8, 12, 90, 8, 2),
      e('Extensión de tríceps en polea', 3, 12, 15, 60, 9, 2.5),
    ],
  },
  {
    id: 'C', nombre: 'Piernas', ejercicios: [
      e('Sentadilla con barra', 4, 6, 10, 180, 8, 5),
      e('Peso muerto rumano', 3, 8, 10, 150, 8, 5),
      e('Prensa de piernas', 3, 10, 12, 120, 8, 10),
      e('Estocadas caminando con mancuernas', 3, 10, 12, 90, 8, 2),
      e('Curl femoral en máquina', 3, 10, 14, 75, 9, 2.5),
      e('Elevación de talones (gemelos)', 4, 12, 15, 60, 9, 5),
    ],
  },
];
/** Compatibilidad con código viejo. */
export const RUTINA = RUTINA_BASE;

/* ---------- Datos ---------- */

export interface Rutina extends Fila {
  nombre: string;
  dias: DiaPlan[];
  activa: boolean;
  /** Explicación de la rutina (por ejemplo, la que escribe Claude como entrenador). */
  notas: string;
}

export interface Sesion extends Fila {
  fecha: string;
  /** Día de la rutina (A/B/C…) u "otro" para otros deportes. */
  dia: string;
  deporte: string;
  duracion_min: number | null;
  /** Sensación general del entreno, 1–10 (10 = excelente). */
  sensacion: number | null;
  notas: string;
  /** Esfuerzo de toda la sesión, 1–10 (10 = lo más duro posible). Carga interna = rpe_sesion × minutos. */
  rpe_sesion?: number | null;
  /** Chequeo antes de entrenar: horas de sueño, energía 1–5 y dolor muscular 1–5. */
  sueno_h?: number | null;
  energia?: number | null;
  agujetas?: number | null;
  /** Nombre del día al momento de entrenar (la rutina puede cambiar después). */
  dia_nombre?: string | null;
}

export interface Serie extends Fila {
  sesion_id: string;
  fecha: string;
  ejercicio: string;
  numero: number;
  peso: number;
  reps: number;
  rpe: number | null;
  /** "efectiva" (cuenta para progreso y volumen) o "calentamiento". */
  tipo?: 'efectiva' | 'calentamiento';
}

export const TE = { sesiones: 'ent_sesiones', series: 'ent_series', rutinas: 'ent_rutinas' } as const;
export const useSesiones = () => useTabla<Sesion>(TE.sesiones);
export const useSeries = () => useTabla<Serie>(TE.series);
export const useRutinas = () => useTabla<Rutina>(TE.rutinas);

/** Rutina activa: la guardada por la usuaria, o la base si nunca la editó. */
export function useRutina(): { dias: DiaPlan[]; fila: Rutina | null; cargado: boolean } {
  const { filas, cargado } = useRutinas();
  const fila = filas.find((r) => r.activa) ?? null;
  return { dias: fila?.dias?.length ? fila.dias : RUTINA_BASE, fila, cargado };
}

/** Guarda la rutina como la activa (crea la fila la primera vez). */
export async function guardarRutina(dias: DiaPlan[], extra: { nombre?: string; notas?: string } = {}, fila: Rutina | null) {
  if (fila) await modificar<Rutina>(TE.rutinas, fila.id, { dias, ...extra });
  else await crear<Rutina>(TE.rutinas, { nombre: extra.nombre ?? 'Mi rutina', notas: extra.notas ?? '', dias, activa: true });
}

export const efectivas = (series: Serie[]) => series.filter((s) => s.tipo !== 'calentamiento');

/* ---------- Cálculos ---------- */

const ordenSesion = (a: Sesion, b: Sesion) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

/** El próximo día de la rutina es el que sigue al último entrenado (A → B → C → A). */
export function proximoDia(sesiones: Sesion[], dias: DiaPlan[] = RUTINA_BASE): DiaPlan {
  const ult = [...sesiones].filter((s) => s.dia !== 'otro').sort(ordenSesion)[0];
  if (!ult) return dias[0];
  const i = dias.findIndex((d) => d.id === ult.dia);
  return dias[(i + 1) % dias.length];
}

/** Series efectivas de la última sesión en la que hiciste ese ejercicio (opcionalmente, antes de cierta sesión). */
export function ultimaVez(series: Serie[], ejercicio: string, excluirSesion?: string): Serie[] {
  const delEj = efectivas(series).filter((s) => s.ejercicio === ejercicio && s.sesion_id !== excluirSesion);
  if (!delEj.length) return [];
  const ultSesion = [...delEj].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0].sesion_id;
  return delEj.filter((s) => s.sesion_id === ultSesion).sort((a, b) => a.numero - b.numero);
}

/**
 * Sugerencia de peso (doble progresión): si la última vez llegaste al tope de repeticiones
 * en todas las series, subís el salto; si no, repetís el peso y buscás más repeticiones.
 * Si la última vez fue muy dura (RPE ≥ 9.5 por encima del objetivo) y no llegaste al mínimo, baja un 5 %.
 */
export function pesoSugerido(series: Serie[], ej: EjercicioPlan): { peso: number | null; motivo: string } {
  const prev = ultimaVez(series, ej.nombre);
  if (!prev.length) return { peso: null, motivo: 'Primera vez: elegí un peso que te deje cerca del esfuerzo objetivo.' };
  const peso = Math.max(...prev.map((s) => Number(s.peso) || 0));
  const completo = prev.length >= ej.series && prev.every((s) => s.reps >= ej.repsMax);
  const muyDuro = prev.some((s) => s.reps < ej.repsMin) && prev.some((s) => (s.rpe ?? 0) >= 10);
  if (completo && ej.salto > 0) return { peso: peso + ej.salto, motivo: `La última vez completaste ${ej.repsMax} reps en todas: subí ${ej.salto} kg.` };
  if (muyDuro && peso > 0) {
    const bajo = Math.round((peso * 0.95) / 1.25) * 1.25;
    return { peso: bajo, motivo: `La última vez no llegaste a ${ej.repsMin} reps y fue al límite: bajá a ${bajo} kg y volvé a construir.` };
  }
  return { peso, motivo: `Mismo peso que la última vez; buscá llegar a ${ej.repsMax} reps.` };
}

/** Mejor marca estimada (1RM, fórmula de Epley). */
export function unoRM(peso: number, reps: number) {
  return reps <= 1 ? peso : peso * (1 + reps / 30);
}

export function progresoEjercicio(series: Serie[], ejercicio: string): Array<{ fecha: string; mejor: number }> {
  const porFecha = new Map<string, number>();
  for (const s of efectivas(series)) {
    if (s.ejercicio !== ejercicio) continue;
    const v = unoRM(Number(s.peso) || 0, s.reps);
    porFecha.set(s.fecha, Math.max(porFecha.get(s.fecha) ?? 0, v));
  }
  return [...porFecha.entries()].map(([fecha, mejor]) => ({ fecha, mejor })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** "subiendo", "estancado" (3 sesiones sin mejorar) o null si hay pocos datos. */
export function tendencia(puntos: Array<{ mejor: number }>): 'subiendo' | 'estancado' | null {
  if (puntos.length < 3) return null;
  const ult = puntos.slice(-3);
  const previoMax = Math.max(...puntos.slice(0, -3).map((p) => p.mejor), 0);
  const recienteMax = Math.max(...ult.map((p) => p.mejor));
  if (puntos.length > 3 && recienteMax <= previoMax) return 'estancado';
  return ult[2].mejor > ult[0].mejor ? 'subiendo' : 'estancado';
}

export const entrenoHoy = (sesiones: Sesion[]) => sesiones.some((s) => s.fecha === hoy());

export async function guardarSesion(datos: Omit<Sesion, 'id'>, series: Array<Omit<Serie, 'id' | 'sesion_id' | 'fecha'>>) {
  const s = await crear<Sesion>(TE.sesiones, datos);
  for (const x of series) await crear<Serie>(TE.series, { ...x, sesion_id: s.id, fecha: datos.fecha });
  return s;
}
