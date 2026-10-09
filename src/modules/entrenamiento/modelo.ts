import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { hoy } from '../../core/format';
import { fijarPropios, infoEjercicio, type EjercicioBase } from './biblioteca';
import { CICLO_BASE, estadoCiclo, lunesDe, pesoInicial, redondearCarga, type Ciclo, type EstadoCiclo, type Perfil, type SemanaCiclo } from './ciclo';

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
  /** Hasta 5 ejercicios para rotar en este lugar de la rutina. */
  variantes?: string[];
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
  /** Primer día del ciclo de 4 semanas (lunes). */
  inicio?: string | null;
  /** Semanas del ciclo, objetivo y perfil con el que se armó. */
  ciclo?: Ciclo | null;
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
  /** Segundos que se descansó de verdad después de esta serie (si se cortó el descanso, lo real). */
  descanso_seg?: number | null;
}

export const TE = { sesiones: 'ent_sesiones', series: 'ent_series', rutinas: 'ent_rutinas', ejercicios: 'ent_ejercicios' } as const;
export const useSesiones = () => useTabla<Sesion>(TE.sesiones);
export const useSeries = () => useTabla<Serie>(TE.series);
export const useRutinas = () => useTabla<Rutina>(TE.rutinas);

/** Ejercicio cargado por la usuaria (o pegado de Claude): mismo formato que la biblioteca. */
export interface EjercicioPropio extends Fila, Omit<EjercicioBase, 'propio'> {}

/** Lee los ejercicios propios y los suma a la biblioteca. Llamarlo arriba de cada pantalla que use ejercicios. */
export function useBiblioteca() {
  const { filas, cargado } = useTabla<EjercicioPropio>(TE.ejercicios);
  fijarPropios(filas);
  return { propios: filas, cargado };
}

/** Crea o actualiza (por nombre) un ejercicio propio. */
export async function guardarEjercicio(x: Omit<EjercicioBase, 'propio'>, existentes: EjercicioPropio[]) {
  const datos = {
    nombre: x.nombre.trim(), grupo: x.grupo, secundarios: x.secundarios, equipo: x.equipo, compuesto: x.compuesto,
    salto: x.salto, zonas: x.zonas ?? {}, sentir: x.sentir ?? '', variantes: (x.variantes ?? []).slice(0, 5),
  };
  const ya = existentes.find((e) => e.nombre.toLowerCase() === datos.nombre.toLowerCase());
  if (ya) await modificar<EjercicioPropio>(TE.ejercicios, ya.id, datos);
  else await crear<EjercicioPropio>(TE.ejercicios, datos);
}

export interface RutinaActiva {
  dias: DiaPlan[];
  fila: Rutina | null;
  cargado: boolean;
  ciclo: Ciclo | null;
  perfil: Perfil | null;
  /** Semana del ciclo en la que estás hoy (null si la rutina no tiene ciclo). */
  estado: EstadoCiclo | null;
  semana: SemanaCiclo | null;
  /** Todas las rutinas guardadas (ciclos anteriores incluidos), de la más nueva a la más vieja. */
  todas: Rutina[];
}

/** Rutina activa: la guardada por la usuaria, o la base si nunca la editó. */
export function useRutina(): RutinaActiva {
  const { filas, cargado } = useRutinas();
  const fila = filas.find((r) => r.activa) ?? null;
  const ciclo = fila?.ciclo ?? null;
  const estado = estadoCiclo(ciclo, fila?.inicio);
  const todas = [...filas].sort((a, b) => (b.inicio ?? b.created_at ?? '').localeCompare(a.inicio ?? a.created_at ?? ''));
  return {
    dias: fila?.dias?.length ? fila.dias : RUTINA_BASE, fila, cargado, ciclo, perfil: ciclo?.perfil ?? null, estado,
    semana: estado && !estado.terminado ? estado.semana : null, todas,
  };
}

/** Guarda cambios en la rutina activa (crea la fila la primera vez). */
export async function guardarRutina(dias: DiaPlan[], extra: { nombre?: string; notas?: string; ciclo?: Ciclo | null; inicio?: string | null } = {}, fila: Rutina | null) {
  if (fila) await modificar<Rutina>(TE.rutinas, fila.id, { dias, ...extra });
  else await crear<Rutina>(TE.rutinas, {
    nombre: extra.nombre ?? 'Mi rutina', notas: extra.notas ?? '', dias, activa: true,
    ciclo: extra.ciclo ?? { semanas: CICLO_BASE }, inicio: extra.inicio ?? lunesDe(hoy()),
  });
}

/**
 * Empieza un ciclo nuevo: guarda la rutina como una fila nueva y archiva la anterior.
 * Así queda el historial de ciclos (qué rutina usaste cada mes y por qué cambió).
 */
export async function empezarCiclo(dias: DiaPlan[], datos: { nombre: string; notas: string; ciclo: Ciclo; inicio?: string }, anterior: Rutina | null) {
  if (anterior) await modificar<Rutina>(TE.rutinas, anterior.id, { activa: false });
  const numero = (anterior?.ciclo?.numero ?? 0) + 1;
  return crear<Rutina>(TE.rutinas, {
    nombre: datos.nombre, notas: datos.notas, dias, activa: true,
    ciclo: { ...datos.ciclo, numero, perfil: datos.ciclo.perfil ?? anterior?.ciclo?.perfil ?? null },
    inicio: datos.inicio ?? lunesDe(hoy()),
  });
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
export function pesoSugerido(series: Serie[], ej: EjercicioPlan, perfil?: Perfil | null, semana?: SemanaCiclo | null): { peso: number | null; motivo: string } {
  const base = pesoSugeridoBase(series, ej, perfil);
  if (base.peso == null || !semana?.carga || semana.carga === 100) return base;
  const peso = redondearCarga((base.peso * semana.carga) / 100, ej.nombre);
  return { peso, motivo: `Semana de ${semana.nombre.toLowerCase()}: ${semana.carga} % del peso (${base.peso} → ${peso} kg).` };
}

function pesoSugeridoBase(series: Serie[], ej: EjercicioPlan, perfil?: Perfil | null): { peso: number | null; motivo: string } {
  const prev = ultimaVez(series, ej.nombre);
  if (!prev.length) {
    // ¿Hiciste algo parecido (mismo músculo y mismo equipo)? Partimos de ese peso, un poco más abajo.
    const info = infoEjercicio(ej.nombre);
    const parecido = info && efectivas(series).filter((s) => {
      const o = infoEjercicio(s.ejercicio);
      return o && o.nombre !== info.nombre && o.grupo === info.grupo && o.equipo === info.equipo && o.compuesto === info.compuesto;
    }).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    if (parecido && Number(parecido.peso) > 0) {
      const p = redondearCarga(Number(parecido.peso) * 0.9, ej.nombre);
      return { peso: p, motivo: `Primera vez: parto del ${parecido.ejercicio.toLowerCase()} (${Number(parecido.peso)} kg) con 10 % menos.` };
    }
    const ini = pesoInicial(perfil, ej.nombre);
    if (ini != null && ini > 0) return { peso: ini, motivo: `Primera vez: estimado por tu peso (${perfil!.peso_kg} kg) y nivel. Si sale muy fácil, subí; si no llegás a ${ej.repsMin}, bajá.` };
    if (ini === 0) return { peso: 0, motivo: 'Con tu peso corporal.' };
    return { peso: null, motivo: 'Primera vez: elegí un peso que te deje cerca del esfuerzo objetivo. Cargá tu peso en Preparador y te lo calculo.' };
  }
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

/**
 * "subiendo", "estancado" o null si hay pocos datos.
 * Estancado = en las últimas 5 sesiones de ese ejercicio no superaste tu mejor marca anterior.
 * Se mira una ventana de 5 (y no de 3) para que una semana de descarga, un viaje o un día malo no cuenten como estancamiento.
 */
export function tendencia(puntos: Array<{ mejor: number }>): 'subiendo' | 'estancado' | null {
  if (puntos.length < 4) return null;
  const n = Math.min(5, puntos.length - 1);
  const ult = puntos.slice(-n);
  const previoMax = Math.max(...puntos.slice(0, -n).map((p) => p.mejor), 0);
  const recienteMax = Math.max(...ult.map((p) => p.mejor));
  if (puntos.length >= 6 && recienteMax <= previoMax) return 'estancado';
  return recienteMax > previoMax ? 'subiendo' : null;
}

export const entrenoHoy = (sesiones: Sesion[]) => sesiones.some((s) => s.fecha === hoy());

export async function guardarSesion(datos: Omit<Sesion, 'id'>, series: Array<Omit<Serie, 'id' | 'sesion_id' | 'fecha'>>) {
  const s = await crear<Sesion>(TE.sesiones, datos);
  for (const x of series) await crear<Serie>(TE.series, { ...x, sesion_id: s.id, fecha: datos.fecha });
  return s;
}
