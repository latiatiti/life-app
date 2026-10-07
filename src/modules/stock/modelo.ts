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
}

export const TS = { productos: 'stk_productos' } as const;
export const useProductos = () => useTabla<Producto>(TS.productos);

export const faltantes = (ps: Producto[]) => ps.filter((p) => Number(p.cantidad) < Number(p.minimo) || (p.basico && Number(p.cantidad) <= 0));

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
