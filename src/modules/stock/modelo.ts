import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { diasEntre, hoy } from '../../core/format';

export const LUGARES = {
  heladera: 'Heladera',
  freezer: 'Freezer',
  alacena: 'Alacena',
  frutas: 'Frutas y verduras',
  bano: 'Baño',
  limpieza: 'Limpieza',
  otro: 'Otro',
} as const;
export type Lugar = keyof typeof LUGARES;

export const UNIDADES = ['u', 'g', 'kg', 'ml', 'l', 'paq'] as const;
export type Unidad = (typeof UNIDADES)[number];

export interface Producto extends Fila {
  nombre: string;
  lugar: Lugar;
  cantidad: number;
  unidad: Unidad;
  /** Si la cantidad baja de acá, va a la lista de compras. */
  minimo: number;
  /** Cuánto comprar de una vez (para la lista). */
  compra: number;
  vence: string | null;
  /** Básico: tiene que estar siempre en casa. */
  basico: boolean;
  /** De quién es: 'yo', la clave de otra persona (ver `per_personas`) o 'compartido'. Sin dato = 'yo'. */
  persona?: Persona;
}

/**
 * Para quién es cada cosa (2026-11-23): 'yo', 'compartido' (entre todos) o la `clave` de una persona
 * que armó la cuenta en `per_personas` (Ulises sigue siendo 'ulises' para no tocar lo guardado).
 */
export type Persona = string;
export interface PersonaCfg extends Fila {
  nombre: string;
  clave: string;
  /** Usuario de LIFE de esa persona (opcional), para cruzar compras entre cuentas. */
  cuenta: string | null;
  orden: number;
  activa: boolean;
}
export const TPER = 'per_personas';
export const personaDe = (p: Pick<Producto, 'persona'>): Persona => p.persona ?? 'yo';
/** Lo que cuenta como tuyo en casa (para faltantes y lista): lo tuyo y lo compartido. */
export const esMio = (p: Persona | null | undefined) => !p || p === 'yo' || p === 'compartido';

const capital = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
export const claveDe = (nombre: string) =>
  nombre.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'persona';

export interface Personas {
  /** Las otras personas activas, en orden. */
  otras: PersonaCfg[];
  /** Para elegir: Yo, cada persona y "Los dos"/"Entre todos" (sin otras personas, solo Yo). */
  quienes: Persona[];
  nombre: (k: Persona | null | undefined) => string;
}

export function armarPersonas(filas: PersonaCfg[]): Personas {
  const otras = filas.filter((p) => p.activa !== false).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const mapa: Record<string, string> = { yo: 'Yo', compartido: otras.length > 1 ? 'Entre todos' : 'Los dos' };
  for (const p of filas) mapa[p.clave] = p.nombre;
  return {
    otras,
    quienes: otras.length ? ['yo', ...otras.map((p) => p.clave), 'compartido'] : ['yo'],
    nombre: (k) => mapa[k ?? 'yo'] ?? capital(String(k)),
  };
}
export const usePersonas = () => armarPersonas(useTabla<PersonaCfg>(TPER).filas);

/**
 * Reparte montos por persona. Lo "compartido" se divide en partes iguales entre vos y las personas
 * que aparecen en esta compra (si no aparece nadie, entre vos y todas las activas).
 */
export function repartir(montos: Array<{ para: Persona | null | undefined; monto: number }>, otras: string[]) {
  const partes: Record<string, number> = { yo: 0 };
  let compartido = 0;
  for (const m of montos) {
    const k = m.para || 'yo';
    if (k === 'compartido') compartido += m.monto;
    else partes[k] = (partes[k] ?? 0) + m.monto;
  }
  const presentes = Object.keys(partes).filter((k) => k !== 'yo');
  const entre = ['yo', ...(presentes.length ? presentes : otras)];
  for (const k of entre) partes[k] = (partes[k] ?? 0) + compartido / entre.length;
  return { partes, compartido };
}

export const TS = { productos: 'stk_productos' } as const;
export const useProductos = () => useTabla<Producto>(TS.productos);

/** Lo que falta en casa. Lo de Ulises no cuenta (es su stock). */
export const faltantes = (ps: Producto[]) => ps.filter((p) => esMio(personaDe(p)) && (Number(p.cantidad) < Number(p.minimo) || (p.basico && Number(p.cantidad) <= 0)));

export function porVencer(ps: Producto[], dias = 3) {
  return ps.filter((p) => p.vence && Number(p.cantidad) > 0 && diasEntre(hoy(), p.vence) <= dias)
    .sort((a, b) => (a.vence ?? '').localeCompare(b.vence ?? ''));
}

/** Cantidad sugerida a comprar: lo que falta para llegar al mínimo, redondeado a la compra habitual. */
export function aComprar(p: Producto): number {
  const falta = Math.max(Number(p.minimo) - Number(p.cantidad), 0);
  const paquete = Number(p.compra) || Number(p.minimo) || 1;
  return Math.max(paquete, Math.ceil(falta / paquete) * paquete);
}

export async function ajustar(p: Producto, delta: number) {
  const cantidad = Math.max(0, Math.round((Number(p.cantidad) + delta) * 100) / 100);
  await modificar<Producto>(TS.productos, p.id, { cantidad });
}

/** Lo usan otros módulos (Alimentación) para descontar ingredientes. */
export async function descontar(productos: Producto[], usos: Array<{ producto_id: string; cantidad: number }>) {
  for (const u of usos) {
    const p = productos.find((x) => x.id === u.producto_id);
    if (p) await ajustar(p, -u.cantidad);
  }
}

export const nuevoProducto = (d: Omit<Producto, 'id'>) => crear<Producto>(TS.productos, d);
