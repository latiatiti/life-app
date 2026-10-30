import { useTabla, type Fila } from '../../core/db';
import { aMinutos, type Bloque } from './modelo';

/**
 * Tiempo libre: cuánto del día se va en dormir, en lo fijo (trabajo, gym, traslados, comidas)
 * y en las cosas de todos los días (bañarse, platos, ordenar…), y cuánto queda libre de verdad.
 * La misma cuenta está repetida en el conector (supabase/functions/life-mcp): si cambia acá, cambiarla allá.
 */

export const TT = { rutinas: 'dia_rutinas', tiempo: 'dia_tiempo' } as const;

export type Momento = 'manana' | 'tarde' | 'noche' | 'cualquiera';

/** Fila de dia_rutinas: algo que se hace todos los días (o ciertos días) y ocupa tiempo. */
export interface Rutina extends Fila {
  nombre: string;
  minutos: number;
  veces: number;
  /** Días de la semana (0 = domingo). null = todos. */
  dias: number[] | null;
  momento: Momento;
  activo: boolean;
  nota?: string | null;
}

export type ClaseTiempo = 'productivo' | 'rutina' | 'ocio' | 'descanso';

export const CLASES: Record<ClaseTiempo, { nombre: string; emoji: string }> = {
  productivo: { nombre: 'Productivo', emoji: '⚡' },
  rutina: { nombre: 'Cosas de la casa', emoji: '🧽' },
  ocio: { nombre: 'Ocio', emoji: '🎮' },
  descanso: { nombre: 'Descanso', emoji: '😌' },
};

/** Fila de dia_tiempo: en qué se usó un rato. */
export interface UsoTiempo extends Fila {
  fecha: string;
  que: string;
  minutos: number;
  clase: ClaseTiempo;
  nota?: string | null;
  origen?: string;
}

export const useRutinas = () => useTabla<Rutina>(TT.rutinas);
export const useUsos = () => useTabla<UsoTiempo>(TT.tiempo);

/** Bloques que cuentan como tiempo disponible (de ahí salen las cosas de todos los días). */
const DISPONIBLE = new Set(['casa', 'libre']);

export interface Reparto {
  sueno: number;
  fijo: number;
  /** Parte de lo fijo que es "si se da" (gym opcional, reparto de la siesta…). */
  opcional: number;
  rutinas: number;
  libre: number;
}

export function rutinasDelDia(rutinas: Rutina[], diaSemana: number): Rutina[] {
  return rutinas.filter((r) => r.activo !== false && (!r.dias?.length || r.dias.includes(diaSemana)));
}

/** Reparte las 24 h del día (en minutos). Lo que no tiene bloque cuenta como disponible. */
export function repartir(bloques: Bloque[], lista: Rutina[], diaSemana: number): Reparto {
  let sueno = 0, fijo = 0, opcional = 0, disponible = 0, cubierto = 0;
  for (const x of bloques) {
    const m = Math.max(0, aMinutos(x.fin) - aMinutos(x.inicio));
    cubierto += m;
    if (x.tipo === 'descanso') sueno += m;
    else if (DISPONIBLE.has(x.tipo)) disponible += m;
    else { fijo += m; if (x.opcional) opcional += m; }
  }
  disponible += Math.max(0, 24 * 60 - cubierto);
  const rutinas = rutinasDelDia(lista, diaSemana).reduce((s, r) => s + r.minutos * (r.veces || 1), 0);
  return { sueno, fijo, opcional, rutinas, libre: Math.max(0, disponible - rutinas) };
}

/** 90 → "1 h 30", 45 → "45 min". */
export function duracion(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Minutos anotados ese día, por clase. */
export function usadoPorClase(usos: UsoTiempo[], fecha: string): Record<ClaseTiempo, number> {
  const r: Record<ClaseTiempo, number> = { productivo: 0, rutina: 0, ocio: 0, descanso: 0 };
  for (const u of usos) if (u.fecha === fecha) r[u.clase] = (r[u.clase] ?? 0) + Number(u.minutos);
  return r;
}
