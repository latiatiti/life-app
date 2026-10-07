import type { Fila } from '../../core/db';
import { crear, modificar, useTabla } from '../../core/db';
import { diasEntre, hoy, sumarDias, sumarMeses } from '../../core/format';

/* ---------- Tipos ---------- */

export type TipoCuenta = 'efectivo' | 'banco' | 'billetera' | 'tarjeta' | 'inversion';
export const TIPOS_CUENTA: Record<TipoCuenta, string> = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  billetera: 'Billetera virtual',
  tarjeta: 'Tarjeta de crédito',
  inversion: 'Inversión',
};

export const MONEDAS = ['ARS', 'USD'] as const;
export type Moneda = (typeof MONEDAS)[number];

export interface Cuenta extends Fila {
  nombre: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  saldo_inicial: number;
  archivada: boolean;
}

export type TipoCategoria = 'ingreso' | 'gasto';
export interface Categoria extends Fila {
  nombre: string;
  tipo: TipoCategoria;
  color: string;
  presupuesto: number | null;
}

export type TipoMovimiento = 'ingreso' | 'gasto' | 'transferencia';
export interface Movimiento extends Fila {
  fecha: string;
  tipo: TipoMovimiento;
  monto: number;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  /** Monto que entra en la cuenta destino (distinto si hay cambio de moneda). */
  monto_destino: number | null;
  categoria_id: string | null;
  descripcion: string;
  pago_id: string | null;
}

export type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'unico';
export const FRECUENCIAS: Record<Frecuencia, { nombre: string; meses: number }> = {
  mensual: { nombre: 'Mensual', meses: 1 },
  bimestral: { nombre: 'Bimestral', meses: 2 },
  trimestral: { nombre: 'Trimestral', meses: 3 },
  semestral: { nombre: 'Semestral', meses: 6 },
  anual: { nombre: 'Anual', meses: 12 },
  unico: { nombre: 'Único', meses: 0 },
};

export interface Pago extends Fila {
  nombre: string;
  monto: number;
  moneda: Moneda;
  categoria_id: string | null;
  cuenta_id: string | null;
  frecuencia: Frecuencia;
  dia: number;
  proximo_vencimiento: string;
  activo: boolean;
  notas: string;
}

/** Fuente de ingreso que se repite (un trabajo, un cliente fijo). La forma de cobro es configurable. */
export type FrecuenciaCobro = 'semanal' | 'quincenal' | 'mensual';
export const FRECUENCIAS_COBRO: Record<FrecuenciaCobro, { nombre: string; dias: number }> = {
  semanal: { nombre: 'Semanal', dias: 7 },
  quincenal: { nombre: 'Cada 15 días', dias: 14 },
  mensual: { nombre: 'Mensual', dias: 0 },
};

export interface Ingreso extends Fila {
  nombre: string;
  monto: number;
  moneda: Moneda;
  frecuencia: FrecuenciaCobro;
  proximo_cobro: string;
  cuenta_id: string | null;
  categoria_id: string | null;
  activo: boolean;
  notas: string;
}

/* ---------- Tablas ---------- */

export const T = {
  cuentas: 'eco_cuentas',
  categorias: 'eco_categorias',
  movimientos: 'eco_movimientos',
  pagos: 'pag_pagos',
  ingresos: 'eco_ingresos',
} as const;

export const useCuentas = () => useTabla<Cuenta>(T.cuentas);
export const useCategorias = () => useTabla<Categoria>(T.categorias);
export const useMovimientos = () => useTabla<Movimiento>(T.movimientos);
export const usePagos = () => useTabla<Pago>(T.pagos);
export const useIngresos = () => useTabla<Ingreso>(T.ingresos);

/* ---------- Colores de categoría (paleta categórica validada, orden fijo) ---------- */

export const COLORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/* ---------- Cálculos ---------- */

const num = (v: unknown) => Number(v) || 0;

/** Saldo = saldo inicial + ingresos − gastos − transferencias que salen + las que entran. */
export function saldoCuenta(c: Cuenta, movs: Movimiento[]): number {
  let s = num(c.saldo_inicial);
  for (const m of movs) {
    if (m.cuenta_id === c.id) {
      if (m.tipo === 'ingreso') s += num(m.monto);
      else s -= num(m.monto);
    }
    if (m.tipo === 'transferencia' && m.cuenta_destino_id === c.id) {
      s += m.monto_destino != null ? num(m.monto_destino) : num(m.monto);
    }
  }
  return s;
}

/** Saldo total por moneda, sin cuentas archivadas. */
export function saldosPorMoneda(cuentas: Cuenta[], movs: Movimiento[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const c of cuentas) {
    if (c.archivada) continue;
    r[c.moneda] = (r[c.moneda] ?? 0) + saldoCuenta(c, movs);
  }
  return r;
}

/** Saldo "disponible": cuentas que no son tarjeta de crédito ni inversión. */
export function disponible(cuentas: Cuenta[], movs: Movimiento[], moneda: Moneda): number {
  return cuentas
    .filter((c) => !c.archivada && c.moneda === moneda && c.tipo !== 'tarjeta' && c.tipo !== 'inversion')
    .reduce((s, c) => s + saldoCuenta(c, movs), 0);
}

export function movsDelMes(movs: Movimiento[], mes: string) {
  return movs.filter((m) => m.fecha.startsWith(mes));
}

export interface TotalesMes {
  ingresos: number;
  gastos: number;
}

/** Totales del mes en una moneda (según la moneda de la cuenta). */
export function totalesMes(movs: Movimiento[], cuentas: Cuenta[], mes: string, moneda: Moneda): TotalesMes {
  const monedaDe = new Map(cuentas.map((c) => [c.id, c.moneda]));
  let ingresos = 0;
  let gastos = 0;
  for (const m of movsDelMes(movs, mes)) {
    if (monedaDe.get(m.cuenta_id) !== moneda) continue;
    if (m.tipo === 'ingreso') ingresos += num(m.monto);
    if (m.tipo === 'gasto') gastos += num(m.monto);
  }
  return { ingresos, gastos };
}

export interface GastoCategoria {
  categoria: Categoria | null;
  gastado: number;
  presupuesto: number | null;
  /** 0..n, null si no tiene presupuesto. */
  uso: number | null;
}

export function gastoPorCategoria(
  movs: Movimiento[],
  cuentas: Cuenta[],
  categorias: Categoria[],
  mes: string,
  moneda: Moneda = 'ARS'
): GastoCategoria[] {
  const monedaDe = new Map(cuentas.map((c) => [c.id, c.moneda]));
  const porCat = new Map<string | null, number>();
  for (const m of movsDelMes(movs, mes)) {
    if (m.tipo !== 'gasto' || monedaDe.get(m.cuenta_id) !== moneda) continue;
    porCat.set(m.categoria_id, (porCat.get(m.categoria_id) ?? 0) + num(m.monto));
  }
  const filas: GastoCategoria[] = categorias
    .filter((c) => c.tipo === 'gasto' && (porCat.has(c.id) || c.presupuesto))
    .map((c) => {
      const gastado = porCat.get(c.id) ?? 0;
      const p = c.presupuesto ? num(c.presupuesto) : null;
      return { categoria: c, gastado, presupuesto: p, uso: p ? gastado / p : null };
    });
  const sinCat = [...porCat.entries()]
    .filter(([id]) => id === null || !categorias.some((c) => c.id === id))
    .reduce((s, [, v]) => s + v, 0);
  if (sinCat > 0) filas.push({ categoria: null, gastado: sinCat, presupuesto: null, uso: null });
  return filas.sort((a, b) => b.gastado - a.gastado);
}

/* ---------- Pagos ---------- */

export type EstadoPago = 'vencido' | 'pronto' | 'aldia';

export function estadoPago(p: Pago, hoyISO = hoy()): EstadoPago {
  const d = diasEntre(hoyISO, p.proximo_vencimiento);
  if (d < 0) return 'vencido';
  if (d <= 7) return 'pronto';
  return 'aldia';
}

export function siguienteVencimiento(p: Pago): string | null {
  const meses = FRECUENCIAS[p.frecuencia].meses;
  if (meses === 0) return null;
  return sumarMeses(p.proximo_vencimiento, meses, p.dia);
}

/** Vencimientos dentro de los próximos `dias` (incluye los vencidos). */
export function pagosPendientes(pagos: Pago[], dias: number, hoyISO = hoy()) {
  return pagos
    .filter((p) => p.activo && diasEntre(hoyISO, p.proximo_vencimiento) <= dias)
    .sort((a, b) => a.proximo_vencimiento.localeCompare(b.proximo_vencimiento));
}

/**
 * Registrar un pago: crea el gasto en Economía (cruce Pagos → Economía)
 * y mueve el vencimiento al período siguiente.
 */
export async function registrarPago(
  p: Pago,
  datos: { monto: number; cuenta_id: string; fecha: string; categoria_id: string | null }
) {
  await crear<Movimiento>(T.movimientos, {
    fecha: datos.fecha,
    tipo: 'gasto',
    monto: datos.monto,
    cuenta_id: datos.cuenta_id,
    cuenta_destino_id: null,
    monto_destino: null,
    categoria_id: datos.categoria_id,
    descripcion: p.nombre,
    pago_id: p.id,
  });
  const sig = siguienteVencimiento(p);
  if (sig) await modificar<Pago>(T.pagos, p.id, { proximo_vencimiento: sig });
  else await modificar<Pago>(T.pagos, p.id, { activo: false });
}

/** Saltear un vencimiento sin generar gasto (ej. un mes que no se cobró). */
export async function saltearVencimiento(p: Pago) {
  const sig = siguienteVencimiento(p);
  if (sig) await modificar<Pago>(T.pagos, p.id, { proximo_vencimiento: sig });
  else await modificar<Pago>(T.pagos, p.id, { activo: false });
}

/* ---------- Ingresos recurrentes ---------- */

export function siguienteCobro(i: Pick<Ingreso, 'frecuencia' | 'proximo_cobro'>): string {
  const dias = FRECUENCIAS_COBRO[i.frecuencia].dias;
  return dias ? sumarDias(i.proximo_cobro, dias) : sumarMeses(i.proximo_cobro, 1);
}

/** Cobros esperados entre hoy y `hasta` (incluye los atrasados). */
export function cobrosEsperados(ingresos: Ingreso[], hasta: string): Array<{ ingreso: Ingreso; fecha: string }> {
  const r: Array<{ ingreso: Ingreso; fecha: string }> = [];
  for (const i of ingresos) {
    if (!i.activo) continue;
    let fecha = i.proximo_cobro;
    let n = 0;
    while (fecha <= hasta && n < 60) {
      r.push({ ingreso: i, fecha });
      fecha = siguienteCobro({ ...i, proximo_cobro: fecha });
      n++;
    }
  }
  return r.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Registrar un cobro: crea el ingreso en Economía y pasa al próximo cobro. */
export async function registrarCobro(i: Ingreso, datos: { monto: number; cuenta_id: string; fecha: string }) {
  await crear<Movimiento>(T.movimientos, {
    fecha: datos.fecha,
    tipo: 'ingreso',
    monto: datos.monto,
    cuenta_id: datos.cuenta_id,
    cuenta_destino_id: null,
    monto_destino: null,
    categoria_id: i.categoria_id,
    descripcion: i.nombre,
    pago_id: null,
  });
  await modificar<Ingreso>(T.ingresos, i.id, { proximo_cobro: siguienteCobro(i) });
}

/* ---------- Datos sugeridos para empezar ---------- */

export const CATEGORIAS_SUGERIDAS: Array<Pick<Categoria, 'nombre' | 'tipo'>> = [
  { nombre: 'Sueldo', tipo: 'ingreso' },
  { nombre: 'Otros ingresos', tipo: 'ingreso' },
  { nombre: 'Supermercado', tipo: 'gasto' },
  { nombre: 'Servicios', tipo: 'gasto' },
  { nombre: 'Vivienda', tipo: 'gasto' },
  { nombre: 'Transporte', tipo: 'gasto' },
  { nombre: 'Salud', tipo: 'gasto' },
  { nombre: 'Salidas', tipo: 'gasto' },
  { nombre: 'Deporte', tipo: 'gasto' },
  { nombre: 'Otros gastos', tipo: 'gasto' },
];

export async function crearDatosIniciales(existentes: Categoria[], cuentas: Cuenta[]) {
  let i = existentes.length;
  for (const c of CATEGORIAS_SUGERIDAS) {
    if (existentes.some((e) => e.nombre.toLowerCase() === c.nombre.toLowerCase())) continue;
    await crear<Categoria>(T.categorias, { ...c, color: COLORES[i % COLORES.length], presupuesto: null });
    i++;
  }
  if (cuentas.length === 0) {
    await crear<Cuenta>(T.cuentas, {
      nombre: 'Efectivo',
      tipo: 'efectivo',
      moneda: 'ARS',
      saldo_inicial: 0,
      archivada: false,
    });
  }
}
