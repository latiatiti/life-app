import { desdeISO, hoy, mesActual, moverMes } from '../../core/format';
import type { Compra } from '../compras/modelo';
import type { Categoria, Movimiento } from '../economia/modelo';

/**
 * Cuánto se gasta en comida por mes. Pedido de ella (2026-10-30): empezar a medir desde el mes que viene,
 * así que antes de esta fecha no se cuenta nada.
 */
export const INICIO_GASTO_COMIDA = '2026-11-01';

/** Categorías de gasto que son comida (las de la semilla y parecidas). */
const ES_COMIDA = /s[uú]per|verduler|carnicer|delivery|almac[eé]n|panader|fiambrer|comida|kiosco|rotiser/i;

export interface GastoMes {
  mes: string;
  /** Lo que salió en total, contando lo de Ulises en las compras compartidas ("cuánto nos gastamos"). */
  total: number;
  /** Tu parte: lo compartido a medias y lo de Ulises afuera. */
  mio: number;
  porCategoria: Array<{ nombre: string; monto: number }>;
  compras: number;
  empezo: boolean;
}

export function gastoComida(mes: string, d: { compras: Compra[]; movimientos: Movimiento[]; categorias: Categoria[] }): GastoMes {
  const empezo = `${mes}-31` >= INICIO_GASTO_COMIDA;
  const enMes = (f: string) => f.slice(0, 7) === mes && f >= INICIO_GASTO_COMIDA;
  const cat = new Map(d.categorias.map((c) => [c.id, c]));
  const porCat = new Map<string, number>();
  let total = 0, mio = 0, compras = 0;
  const ligados = new Set<string>();

  // Compras del súper: el total del ticket y tu parte según el reparto.
  for (const c of d.compras) {
    if (c.movimiento_id) ligados.add(c.movimiento_id);
    if (!enMes(c.fecha) || !Number(c.total)) continue;
    const t = Number(c.total);
    total += t;
    mio += c.reparto ? Number(c.reparto.yo) : t;
    compras++;
    const nombre = (c.movimiento_id && cat.get(d.movimientos.find((m) => m.id === c.movimiento_id)?.categoria_id ?? '')?.nombre) || 'Súper';
    porCat.set(nombre, (porCat.get(nombre) ?? 0) + t);
  }
  // Gastos sueltos en categorías de comida (verdulería, carnicería, delivery…) que no salieron de una compra.
  for (const m of d.movimientos) {
    if (m.tipo !== 'gasto' || !enMes(m.fecha) || ligados.has(m.id)) continue;
    const c = cat.get(m.categoria_id ?? '');
    if (!c || !ES_COMIDA.test(c.nombre)) continue;
    const monto = Number(m.monto) || 0;
    total += monto;
    mio += monto;
    porCat.set(c.nombre, (porCat.get(c.nombre) ?? 0) + monto);
  }
  return {
    mes, total: Math.round(total), mio: Math.round(mio), compras, empezo,
    porCategoria: [...porCat.entries()].map(([nombre, monto]) => ({ nombre, monto: Math.round(monto) })).sort((a, b) => b.monto - a.monto),
  };
}

/** El mes en curso, el anterior y a cuánto llegaría el actual a este ritmo. */
export function resumenGastoComida(d: Parameters<typeof gastoComida>[1]) {
  const mes = mesActual();
  const actual = gastoComida(mes, d);
  const anterior = gastoComida(moverMes(mes, -1), d);
  const hoyD = desdeISO(hoy());
  const diasMes = new Date(hoyD.getFullYear(), hoyD.getMonth() + 1, 0).getDate();
  const desde = Math.max(1, hoy() >= INICIO_GASTO_COMIDA && INICIO_GASTO_COMIDA.slice(0, 7) === mes ? Number(INICIO_GASTO_COMIDA.slice(8)) : 1);
  const transcurridos = Math.max(1, hoyD.getDate() - desde + 1);
  const proyeccion = actual.empezo ? Math.round((actual.total / transcurridos) * (diasMes - desde + 1)) : 0;
  return { actual, anterior, proyeccion, faltanDias: transcurridos < 7 };
}
