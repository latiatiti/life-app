import { leerStorage, escribirStorage } from '../../core/config';
import { hoy } from '../../core/format';
import { avisarCambio } from '../../ui/Actividad';
import { guardarDia, type DiaMarcado } from './modelo';

/**
 * Chequeo del día (2026-11-26, pedido de ella, propuesta A del boceto diseno/encuesta-diaria-boceto.html):
 * dos encuestas cortas por pasos, una a la mañana ("Arranque") y otra a la noche ("Cierre").
 * Lo que es de otra sección se guarda en su lugar de siempre (agua → Comida, gastos → Plata,
 * prioridades → Día, pendientes de mañana → Tablero). Lo propio del chequeo (sueño, energía, cuerpo,
 * cómo fue el día) queda en la fila del día: dia_dias.chequeo (jsonb, SQL supabase/chequeo.sql).
 */

export type Momento = 'manana' | 'noche';
export const MOMENTOS: Record<Momento, { nombre: string; icono: string; titulo: string; desde: number }> = {
  manana: { nombre: 'Arranque', icono: '☀', titulo: 'Arranque del día', desde: 0 },
  noche: { nombre: 'Cierre', icono: '☾', titulo: 'Cierre del día', desde: 19 },
};

/** Cómo está una zona del cuerpo: 1 = cargada (como después de entrenar), 2 = duele. */
export type NivelZona = 1 | 2;
export type ZonaCuerpo =
  | 'cabeza' | 'cuello' | 'hombros' | 'pecho' | 'espalda_alta' | 'espalda_baja' | 'brazos' | 'munecas'
  | 'panza' | 'cadera' | 'piernas' | 'rodillas' | 'gemelos' | 'pies';

export const ZONAS_CUERPO: Array<{ id: ZonaCuerpo; nombre: string }> = [
  { id: 'cabeza', nombre: 'Cabeza' }, { id: 'cuello', nombre: 'Cuello' }, { id: 'hombros', nombre: 'Hombros' },
  { id: 'pecho', nombre: 'Pecho' }, { id: 'espalda_alta', nombre: 'Espalda alta' }, { id: 'espalda_baja', nombre: 'Espalda baja' },
  { id: 'brazos', nombre: 'Brazos' }, { id: 'munecas', nombre: 'Muñecas y manos' }, { id: 'panza', nombre: 'Panza' },
  { id: 'cadera', nombre: 'Cadera y glúteos' }, { id: 'piernas', nombre: 'Piernas' }, { id: 'rodillas', nombre: 'Rodillas' },
  { id: 'gemelos', nombre: 'Gemelos' }, { id: 'pies', nombre: 'Pies' },
];

/** Cómo te sentís en general (se pueden elegir varias). */
export const SINTOMAS = ['Cansancio', 'Resfriado', 'Dolor de cabeza', 'Panza revuelta', 'Alergia', 'Estrés', 'Lesión'] as const;

export interface Cuerpo {
  zonas: Partial<Record<ZonaCuerpo, NivelZona>>;
  sintomas: string[];
  /** Se pesó esta mañana (kg), si lo cargó. */
  peso: number | null;
}

export interface ChequeoManana {
  hecho_at: string;
  acoste: string; // HH:MM
  levante: string; // HH:MM
  horas: number;
  sueno: 'corrido' | 'cortado' | 'mal' | null;
  energia: number | null; // 1..5
  cuerpo: Cuerpo;
  plan: 'si' | 'cambio' | 'libre' | null;
}

export interface ChequeoNoche {
  hecho_at: string;
  agua_ml: number;
  dia: number | null; // 1..5 cómo fue
  nota: string;
}

export interface ChequeosDia { manana?: ChequeoManana | null; noche?: ChequeoNoche | null }

/* ---------- Lo que se va contestando (localStorage: sobrevive a cerrar la app a mitad) ---------- */

export interface EnCursoChequeo {
  momento: Momento;
  fecha: string;
  paso: number;
  minimizada: boolean;
  /** Respuestas parciales; se guardan en la base al terminar (lo de otras secciones, al pasar cada paso). */
  r: Record<string, unknown>;
}

const CLAVE = 'life.dia.chequeo';
const EVENTO = 'life-chequeo';

export function leerEnCursoChequeo(): EnCursoChequeo | null {
  try {
    const crudo = leerStorage(CLAVE);
    return crudo ? (JSON.parse(crudo) as EnCursoChequeo) : null;
  } catch { return null; }
}

export function guardarEnCursoChequeo(e: EnCursoChequeo | null) {
  escribirStorage(CLAVE, e ? JSON.stringify(e) : null);
  avisarCambio();
  window.dispatchEvent(new Event(EVENTO));
}

export function escucharChequeo(fn: () => void) {
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}

/** Abre (o retoma) el chequeo de la mañana o de la noche de hoy. */
export function abrirChequeo(momento: Momento) {
  const e = leerEnCursoChequeo();
  if (e && e.momento === momento && e.fecha === hoy()) guardarEnCursoChequeo({ ...e, minimizada: false });
  else guardarEnCursoChequeo({ momento, fecha: hoy(), paso: 0, minimizada: false, r: {} });
}

/* ---------- Lectura y escritura en la fila del día ---------- */

export function chequeosDe(dias: DiaMarcado[], fecha: string): ChequeosDia {
  return dias.find((d) => d.fecha === fecha)?.chequeo ?? {};
}

export async function guardarChequeo<M extends Momento>(dias: DiaMarcado[], fecha: string, momento: M, datos: M extends 'manana' ? ChequeoManana : ChequeoNoche) {
  const previo = chequeosDe(dias, fecha);
  await guardarDia(dias, fecha, { chequeo: { ...previo, [momento]: datos } });
}

/** El último chequeo de mañana (para precargar las horas de dormir). */
export function ultimoManana(dias: DiaMarcado[]): ChequeoManana | null {
  const con = dias.filter((d) => d.chequeo?.manana).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return con[0]?.chequeo?.manana ?? null;
}

/** Horas entre acostarse y levantarse (cruza la medianoche). */
export function horasDormidas(acoste: string, levante: string): number {
  const m = (s: string) => { const [h, mi] = s.split(':').map(Number); return h * 60 + mi; };
  const d = (m(levante) - m(acoste) + 1440) % 1440;
  return Math.round((d / 60) * 4) / 4;
}

export function sumarMinutos(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Dolor para el entreno (1 a 5): sale de las zonas marcadas a la mañana. */
export function dolorParaEntreno(c: Cuerpo | undefined): number | null {
  if (!c) return null;
  const v = Object.values(c.zonas);
  if (!v.length) return 1;
  const duele = v.filter((x) => x === 2).length;
  return Math.min(5, 1 + v.length + duele);
}

/** Horas de sueño redondeadas a las opciones del chequeo del entreno (≤5, 6, 7, 8+). */
export function suenoParaEntreno(h: number): number {
  return h <= 5 ? 5 : h >= 8 ? 8 : Math.round(h);
}
