import { crear, modificar, useTabla, type Fila } from '../../core/db';
import { diasEntre, hoy } from '../../core/format';
import { TD, type NivelPrioridad, type Tarea } from '../dia/modelo';

/**
 * Tablero de pendientes e ideas (2026-11-07, boceto aprobado: project-files diseno/tablero-boceto.html).
 * Una cosa, un solo lugar: cada tarjeta ES una fila de dia_tareas. Las que tienen fecha se ven también en el Día;
 * las sin fecha viven solo acá. "hecho" y "etapa" van juntos: estar en la última etapa = hecho.
 * Etapas y categorías propias en dia_tablero (una fila; vacía = las de fábrica).
 */

export const TABLA_TABLERO = 'dia_tablero';

export interface Etapa { id: string; nombre: string }
export interface PasoTarjeta { texto: string; hecho: boolean }

export interface Tarjeta extends Tarea {
  etapa?: string | null;
  categoria?: string | null;
  pasos?: PasoTarjeta[] | null;
  orden?: number | null;
  movida?: string | null;
}

interface ConfigTablero extends Fila { etapas: Etapa[]; categorias: string[] }

export const ETAPAS_BASE: Etapa[] = [
  { id: 'hacer', nombre: 'Por hacer' },
  { id: 'proceso', nombre: 'En proceso' },
  { id: 'hecho', nombre: 'Hecho' },
];
export const CATEGORIAS_BASE = ['Reparto', 'Pagos', 'Casa', 'Compras', 'Ideas de desarrollo'];

export const PRIORIDADES: Array<{ id: NivelPrioridad; nombre: string; icono: string }> = [
  { id: 'alta', nombre: 'Alta', icono: '▲' },
  { id: 'media', nombre: 'Media', icono: '●' },
  { id: 'baja', nombre: 'Baja', icono: '▽' },
];

/** Días sin moverse para que avise (pilar 8: avisar lo raro). */
export const DIAS_QUIETA = 4;

export const useTarjetas = () => useTabla<Tarjeta>(TD.tareas);

export function useConfigTablero() {
  const { filas } = useTabla<ConfigTablero>(TABLA_TABLERO);
  const fila = filas[0];
  return {
    fila,
    etapas: fila?.etapas?.length ? fila.etapas : ETAPAS_BASE,
    categorias: fila?.categorias?.length ? fila.categorias : CATEGORIAS_BASE,
  };
}

export async function guardarConfig(fila: ConfigTablero | undefined, cambios: Partial<Pick<ConfigTablero, 'etapas' | 'categorias'>>) {
  if (fila) await modificar<ConfigTablero>(TABLA_TABLERO, fila.id, cambios);
  else await crear<ConfigTablero>(TABLA_TABLERO, { etapas: ETAPAS_BASE, categorias: CATEGORIAS_BASE, ...cambios });
}

const ultima = (etapas: Etapa[]) => etapas[etapas.length - 1].id;

/** En qué columna va una tarjeta. Si se tildó en el Día, va a la última; si su etapa ya no existe, a la primera. */
export function etapaDe(t: Tarjeta, etapas: Etapa[]): string {
  const ult = ultima(etapas);
  if (t.hecho) return ult;
  if (t.etapa && t.etapa !== ult && etapas.some((e) => e.id === t.etapa)) return t.etapa;
  return etapas[0].id;
}

export function diasQuieta(t: Tarjeta): number {
  const desde = t.movida ?? t.created_at?.slice(0, 10) ?? hoy();
  return Math.max(0, diasEntre(desde, hoy()));
}

export const estaQuieta = (t: Tarjeta) => !t.hecho && t.prioridad !== 'baja' && diasQuieta(t) >= DIAS_QUIETA;

/** Orden dentro de una columna: el campo orden (menor arriba) y, si falta, las más nuevas arriba. */
export function ordenar(ts: Tarjeta[]): Tarjeta[] {
  return [...ts].sort((a, b) => {
    const oa = a.orden ?? -Infinity, ob = b.orden ?? -Infinity;
    if (oa !== ob) return oa - ob;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

/** Columnas del tablero, ya ordenadas. */
export function columnas(ts: Tarjeta[], etapas: Etapa[]): Map<string, Tarjeta[]> {
  const m = new Map<string, Tarjeta[]>(etapas.map((e) => [e.id, []]));
  for (const t of ts) m.get(etapaDe(t, etapas))!.push(t);
  for (const [k, v] of m) m.set(k, ordenar(v));
  return m;
}

/** Número de orden para dejar una tarjeta arriba de todo en una columna. */
export function ordenArriba(col: Tarjeta[]): number {
  const nums = col.map((t) => t.orden).filter((o): o is number => typeof o === 'number');
  return nums.length ? Math.min(...nums) - 1 : 0;
}

/**
 * Mueve una tarjeta a una etapa. antesDe = id de la tarjeta que va a quedar debajo (null = al final).
 * Una sola escritura: el DESHACER de abajo la vuelve atrás entera.
 */
export async function mover(t: Tarjeta, etapa: string, etapas: Etapa[], col: Tarjeta[], antesDe: string | null = null) {
  const lista = col.filter((x) => x.id !== t.id);
  // Números de orden seguros para todas (las viejas pueden no tener).
  const o = (i: number) => lista[i].orden ?? i;
  let orden: number;
  const i = antesDe ? lista.findIndex((x) => x.id === antesDe) : -1;
  if (!lista.length) orden = 0;
  else if (i < 0) orden = o(lista.length - 1) + 1;
  else if (i === 0) orden = o(0) - 1;
  else orden = (o(i - 1) + o(i)) / 2;
  const cambia = etapaDe(t, etapas) !== etapa;
  await modificar<Tarjeta>(TD.tareas, t.id, {
    etapa, hecho: etapa === ultima(etapas), orden,
    ...(cambia ? { movida: hoy() } : {}),
  });
}

export function siguienteEtapa(etapas: Etapa[], id: string, paso: 1 | -1): Etapa | undefined {
  return etapas[etapas.findIndex((e) => e.id === id) + paso];
}
