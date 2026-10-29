import type { Fila } from '../../core/db';
import { crear, modificar, useTabla } from '../../core/db';
import { dinero, hoy } from '../../core/format';
import { T as TE, type Movimiento } from './modelo';

/**
 * Cuenta corriente con Ulises (con quien vive y comparte gastos).
 * Cada fila es un gasto compartido, un préstamo o un pago para saldar; `monto` ya trae el efecto en el saldo:
 * positivo = él te debe, negativo = vos le debés. El saldo es la suma.
 */
export const OTRO = 'Ulises';

export type TipoCompartido = 'gasto' | 'prestamo' | 'pago';
export const TIPOS_COMPARTIDO: Record<TipoCompartido, string> = {
  gasto: 'Gasto compartido',
  prestamo: 'Préstamo',
  pago: 'Pago para saldar',
};

export interface Compartido extends Fila {
  fecha: string;
  persona: string;
  tipo: TipoCompartido;
  descripcion: string;
  /** Lo que salió en total (el gasto entero, el préstamo o el pago). */
  total: number;
  /** Quién puso la plata. */
  pago: 'yo' | 'otro';
  /** % del total que le toca a quien NO pagó (solo gastos; préstamos y pagos = 100). */
  parte: number;
  /** Efecto en el saldo: + él te debe, − vos le debés. */
  monto: number;
  movimiento_id: string | null;
  compra_id: string | null;
}

export const TABLA_COMPARTIDOS = 'eco_compartidos';
export const useCompartidos = () => useTabla<Compartido>(TABLA_COMPARTIDOS);

/** Lo que cambia el saldo: quien pagó presta la parte del otro (o todo, si es préstamo o pago). */
export function efecto(d: { tipo: TipoCompartido; total: number; pago: 'yo' | 'otro'; parte: number }): number {
  const parte = d.tipo === 'gasto' ? Math.min(100, Math.max(0, d.parte)) : 100;
  const m = Math.round((Number(d.total) || 0) * parte) / 100;
  return d.pago === 'yo' ? m : -m;
}

export function saldoCon(filas: Compartido[], persona = OTRO): number {
  return Math.round(filas.filter((f) => f.persona === persona).reduce((s, f) => s + (Number(f.monto) || 0), 0) * 100) / 100;
}

/** "Ulises te debe $X" / "Le debés a Ulises $X" / "Están a mano". */
export function textoSaldo(saldo: number, persona = OTRO): string {
  if (Math.abs(saldo) < 1) return `Con ${persona} están a mano`;
  return saldo > 0 ? `${persona} te debe ${dinero(saldo)}` : `Le debés a ${persona} ${dinero(-saldo)}`;
}

/** Filas con el saldo corrido después de cada una (de la más nueva a la más vieja). */
export function conSaldoCorrido(filas: Compartido[], persona = OTRO): Array<{ fila: Compartido; saldo: number }> {
  const orden = filas.filter((f) => f.persona === persona)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  let s = 0;
  return orden.map((fila) => ({ fila, saldo: (s = Math.round((s + (Number(fila.monto) || 0)) * 100) / 100) })).reverse();
}

export type DatosCompartido = Pick<Compartido, 'fecha' | 'tipo' | 'descripcion' | 'total' | 'pago' | 'parte'> &
  Partial<Pick<Compartido, 'persona' | 'movimiento_id' | 'compra_id' | 'monto'>>;

export function filaCompartido(d: DatosCompartido): Omit<Compartido, 'id'> {
  const parte = d.tipo === 'gasto' ? d.parte : 100;
  return {
    fecha: d.fecha, persona: d.persona ?? OTRO, tipo: d.tipo, descripcion: d.descripcion.trim(),
    total: d.total, pago: d.pago, parte, monto: d.monto ?? efecto({ ...d, parte }),
    movimiento_id: d.movimiento_id ?? null, compra_id: d.compra_id ?? null,
  };
}

/**
 * Anota algo con Ulises. Si se elige una cuenta y la plata la pusiste vos (o te la devolvió él),
 * también lo registra en tus cuentas: gasto/préstamo/pago que hiciste = gasto; pago que te hizo = ingreso.
 */
export async function anotarCompartido(d: DatosCompartido, cuenta?: { cuenta_id: string; categoria_id: string | null } | null) {
  let movimiento_id = d.movimiento_id ?? null;
  if (cuenta && !movimiento_id && d.total > 0) {
    const persona = d.persona ?? OTRO;
    const desc = d.descripcion.trim() || (d.tipo === 'pago' ? (d.pago === 'yo' ? `Le pagué a ${persona}` : `${persona} me pagó`) : TIPOS_COMPARTIDO[d.tipo]);
    const m = await crear<Movimiento>(TE.movimientos, {
      fecha: d.fecha, tipo: d.pago === 'yo' ? 'gasto' : 'ingreso', monto: d.total, cuenta_id: cuenta.cuenta_id,
      cuenta_destino_id: null, monto_destino: null, categoria_id: cuenta.categoria_id,
      descripcion: `${desc} · con ${persona}`, pago_id: null,
    });
    movimiento_id = m.id;
  }
  return crear<Compartido>(TABLA_COMPARTIDOS, filaCompartido({ ...d, movimiento_id }));
}

export async function cambiarCompartido(f: Compartido, d: DatosCompartido) {
  await modificar<Compartido>(TABLA_COMPARTIDOS, f.id, filaCompartido({ ...d, persona: f.persona, movimiento_id: f.movimiento_id, compra_id: f.compra_id }));
  // El gasto o pago enlazado en tus cuentas sigue el mismo monto y fecha.
  if (f.movimiento_id && (Number(f.total) !== d.total || f.fecha !== d.fecha)) {
    await modificar<Movimiento>(TE.movimientos, f.movimiento_id, { monto: d.total, fecha: d.fecha });
  }
}

/* ---------- Compras del súper con reparto (Compras ya calcula quién le debe a quién) ---------- */

export interface CompraConReparto extends Fila {
  fecha: string;
  total: number;
  movimiento_id: string | null;
  reparto?: { pago: string; yo: number; ulises: number; debe: number } | null;
}

/** Compras del súper con algo para Ulises que todavía no están en la cuenta con él. */
export function comprasSinAnotar(compras: CompraConReparto[], filas: Compartido[]) {
  const anotadas = new Set(filas.map((f) => f.compra_id).filter(Boolean));
  return compras.filter((c) => c.reparto && Number(c.reparto.debe) > 0 && (c.reparto.pago === 'yo' || c.reparto.pago === 'ulises') && !anotadas.has(c.id));
}

/** Pasa una compra del súper a la cuenta con Ulises (lo que debe el otro, según el reparto). */
export function datosDeCompra(c: CompraConReparto, nombreSuper?: string): DatosCompartido {
  const r = c.reparto!;
  const total = Number(c.total) || Number(r.yo) + Number(r.ulises);
  const parte = total > 0 ? Math.round((Number(r.debe) / total) * 10000) / 100 : 0;
  return {
    fecha: c.fecha || hoy(), tipo: 'gasto', descripcion: `Compra${nombreSuper ? ` en ${nombreSuper}` : ' del súper'}`,
    total, pago: r.pago === 'yo' ? 'yo' : 'otro', parte, compra_id: c.id, movimiento_id: c.movimiento_id,
    monto: r.pago === 'yo' ? Number(r.debe) : -Number(r.debe),
  };
}
