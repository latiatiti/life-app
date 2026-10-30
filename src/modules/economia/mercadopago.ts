import type { Fila } from '../../core/db';
import { almacen, crear, modificar, supabase, useTabla } from '../../core/db';
import { diasEntre, parsearMonto, sumarMeses } from '../../core/format';
import {
  registrarCobro, registrarPago, T,
  type Categoria, type Cuenta, type Ingreso, type Movimiento, type Pago,
} from './modelo';

/*
 * Mercado Pago (2026-10-30): los movimientos de la billetera entran "para revisar" (del resumen que se
 * baja de MP; más adelante también de los avisos por mail o de la API) y ella confirma cada uno:
 * pago de un vencimiento, cobro, gasto/ingreso suelto o ignorar. Nada se carga solo en Economía.
 */

export interface MovMP extends Fila {
  /** Id de la operación en MP (o del aviso). Con esto no se duplica al importar dos veces. */
  externo: string;
  fecha: string;
  sentido: 'entra' | 'sale';
  monto: number;
  descripcion: string;
  origen: 'resumen' | 'mail' | 'api' | 'manual';
  estado: 'nuevo' | 'cargado' | 'ignorado';
  movimiento_id: string | null;
}

export const TABLA_MP = 'eco_mp_movimientos';
export const useMovimientosMP = () => useTabla<MovMP>(TABLA_MP);

export type MovLeido = Pick<MovMP, 'externo' | 'fecha' | 'sentido' | 'monto' | 'descripcion'>;

/* ---------- Leer el resumen ---------- */

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clave = (s: string) => normal(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Nombres de columna que usan los distintos reportes de MP (resumen de cuenta, dinero disponible, liquidaciones).
const COL = {
  fecha: ['release_date', 'date', 'transaction_date', 'date_created', 'fecha', 'fecha_de_liberacion', 'fecha_de_origen', 'fecha_de_aprobacion', 'fecha_de_la_operacion'],
  id: ['reference_id', 'source_id', 'operation_id', 'id', 'numero_de_operacion', 'id_de_operacion', 'numero_de_referencia', 'n_de_operacion'],
  desc: ['transaction_type', 'description', 'descripcion', 'detalle', 'tipo_de_operacion', 'concepto', 'record_type'],
  monto: ['transaction_net_amount', 'net_amount', 'monto_neto', 'importe', 'monto', 'valor', 'transaction_amount', 'amount', 'gross_amount', 'monto_bruto'],
  credito: ['net_credit_amount', 'credito', 'credit', 'ingresos'],
  debito: ['net_debit_amount', 'debito', 'debit', 'egresos'],
};

function separarCSV(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; } else entreComillas = !entreComillas;
    } else if (c === sep && !entreComillas) { celdas.push(actual.trim()); actual = ''; } else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

/** "28-10-2026", "28/10/2026", "28/10/26" o "2026-10-28T…" → "2026-10-28". */
export function leerFecha(txt: string): string | null {
  const t = txt.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Montos de MP: "-15000.00", "-15.000,00" o "$ 15.000". */
function leerMonto(txt: string): number {
  const t = txt.replace(/\s/g, '');
  if (!t) return NaN;
  // "15000.50" (punto decimal, sin miles) lo entiende parsearMonto; "-1.234.56" no existe.
  return parsearMonto(t);
}

const buscar = (cab: string[], nombres: string[]) => {
  for (const n of nombres) { const i = cab.indexOf(n); if (i >= 0) return i; }
  return -1;
};

/**
 * Lee el resumen de movimientos que se baja de Mercado Pago (CSV, con ; o ,). Busca la fila de títulos
 * (los reportes traen arriba un bloque de saldos) y toma fecha, id, detalle y monto con su signo.
 * Si no hay títulos, prueba renglón por renglón (texto copiado de la actividad).
 */
export function leerResumen(texto: string): MovLeido[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = (l: string) => (l.split(';').length > l.split(',').length ? ';' : l.includes('\t') ? '\t' : ',');

  for (let h = 0; h < lineas.length; h++) {
    const s = sep(lineas[h]);
    const cab = separarCSV(lineas[h], s).map(clave);
    const iFecha = buscar(cab, COL.fecha);
    const iMonto = buscar(cab, COL.monto);
    const iCred = buscar(cab, COL.credito);
    const iDeb = buscar(cab, COL.debito);
    if (iFecha < 0 || (iMonto < 0 && iCred < 0 && iDeb < 0)) continue;
    const iId = buscar(cab, COL.id);
    const iDesc = buscar(cab, COL.desc);

    const salida: MovLeido[] = [];
    const vistos = new Map<string, number>();
    for (const linea of lineas.slice(h + 1)) {
      const c = separarCSV(linea, s);
      const fecha = leerFecha(c[iFecha] ?? '');
      if (!fecha) continue;
      let monto = iMonto >= 0 ? leerMonto(c[iMonto] ?? '') : NaN;
      if (!Number.isFinite(monto)) {
        const cr = iCred >= 0 ? leerMonto(c[iCred] ?? '') || 0 : 0;
        const db = iDeb >= 0 ? leerMonto(c[iDeb] ?? '') || 0 : 0;
        monto = cr - Math.abs(db);
      }
      if (!Number.isFinite(monto) || monto === 0) continue;
      const descripcion = (iDesc >= 0 ? c[iDesc] : '') || 'Movimiento de Mercado Pago';
      const base = (iId >= 0 && c[iId]) || `${fecha}|${normal(descripcion)}|${monto}`;
      // Un mismo id puede traer dos renglones (ej. pago y su comisión): se numeran.
      const n = vistos.get(base) ?? 0;
      vistos.set(base, n + 1);
      salida.push({
        externo: `mp:${base}${n ? `#${n}` : ''}`,
        fecha, sentido: monto > 0 ? 'entra' : 'sale', monto: Math.abs(Math.round(monto * 100) / 100), descripcion,
      });
    }
    return salida;
  }
  return leerTextoSuelto(lineas);
}

const PALABRAS_SALE = /pagaste|pago a|pago de|transferiste|enviaste|enviada|compra|debito|retiro|extraccion/;
const PALABRAS_ENTRA = /recibiste|recibida|cobro|cobraste|ingreso|rendimiento|devolucion|reintegro|te (pago|transfirio|envio)/;

/** Texto copiado de la actividad de MP: un movimiento por renglón con fecha y "$ monto". */
function leerTextoSuelto(lineas: string[]): MovLeido[] {
  const salida: MovLeido[] = [];
  const anio = new Date().getFullYear();
  lineas.forEach((l, i) => {
    const f = l.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
    const m = l.match(/([-+−])?\s*\$\s*([\d.]+(?:,\d{1,2})?)/);
    if (!f || !m) return;
    const fecha = leerFecha(`${f[1]}/${f[2]}/${f[3] ?? anio}`);
    const monto = parsearMonto(m[2]);
    if (!fecha || !(monto > 0)) return;
    const n = normal(l);
    const sale = m[1] === '-' || m[1] === '−' || (!PALABRAS_ENTRA.test(n) && (PALABRAS_SALE.test(n) || m[1] !== '+'));
    const descripcion = l.replace(f[0], '').replace(m[0], '').replace(/\s+/g, ' ').trim() || 'Movimiento de Mercado Pago';
    salida.push({ externo: `mp:${fecha}|${normal(descripcion)}|${monto}|${i}`, fecha, sentido: sale ? 'sale' : 'entra', monto, descripcion });
  });
  return salida;
}

/* ---------- Qué es cada movimiento ---------- */

const VACIAS = new Set(['pago', 'pagos', 'transferencia', 'enviada', 'recibida', 'compra', 'cobro', 'dinero', 'mercado',
  'para', 'desde', 'con', 'del', 'los', 'las', 'por', 'una', 'cuenta', 'movimiento', 'operacion', 'liberado', 'disponible']);

/** Palabras que identifican un movimiento o un vencimiento ("Seguro Rivadavia" → seguro, rivadavia). */
export function palabras(s: string): string[] {
  return normal(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !VACIAS.has(w) && !/^\d+$/.test(w));
}

const comparten = (a: string, b: string) => { const pb = new Set(palabras(b)); return palabras(a).some((w) => pb.has(w)); };
const parecido = (a: number, b: number, tolerancia = 0.15) => b > 0 && Math.abs(a - b) / b <= tolerancia;

// Detalle de MP → nombres posibles de la categoría en Economía.
const CATEGORIAS: Array<[RegExp, string[]]> = [
  [/super|carrefour|\bvea\b|jumbo|changomas|coto|\bdia\b|almacen|verduleria|carniceria/, ['super', 'mercado', 'comida', 'alimentos']],
  [/seguro/, ['seguro']],
  [/nafta|ypf|shell|axion|combustible|estacion/, ['nafta', 'combustible', 'auto', 'transporte']],
  [/edemsa|ecogas|aysam|\bluz\b|\bgas\b|agua|internet|claro|personal|movistar|telefon|cable|flow/, ['servicio']],
  [/farmacia|medic|salud|osde|obra social/, ['salud', 'farmacia']],
  [/uber|cabify|didi|sube|colectivo|taxi|peaje/, ['transporte']],
  [/gimnasio|\bgym\b|suplement/, ['gimnasio', 'deporte', 'salud']],
  [/rendimiento/, ['rendimiento', 'inversion', 'interes']],
];

function categoriaPara(desc: string, tipo: 'gasto' | 'ingreso', categorias: Categoria[]): string | null {
  const n = normal(desc);
  const propias = categorias.filter((c) => c.tipo === tipo);
  const directa = propias.find((c) => comparten(desc, c.nombre));
  if (directa) return directa.id;
  for (const [re, nombres] of CATEGORIAS) {
    if (!re.test(n)) continue;
    const c = propias.find((x) => nombres.some((k) => normal(x.nombre).includes(k)));
    if (c) return c.id;
  }
  return null;
}

export type Sugerencia =
  | { tipo: 'pago'; pago: Pago }
  | { tipo: 'cobro'; ingreso: Ingreso }
  | { tipo: 'gasto' | 'ingreso'; categoria_id: string | null };

/**
 * Qué parece ser: el vencimiento de Pagos que coincide (nombre, monto parecido o fecha cerca del
 * vencimiento: dos de tres), el cobro esperado de Ingresos, o un gasto/ingreso con su categoría.
 */
export function sugerir(m: MovLeido, pagos: Pago[], ingresos: Ingreso[], categorias: Categoria[]): Sugerencia {
  const puntaje = (nombre: string, monto: number, fecha: string) =>
    (comparten(m.descripcion, nombre) ? 2 : 0) + (parecido(m.monto, Number(monto)) ? 1 : 0) + (Math.abs(diasEntre(fecha, m.fecha)) <= 12 ? 1 : 0);
  const mejor = <X>(lista: X[], f: (x: X) => number) =>
    lista.map((x) => ({ x, p: f(x) })).filter((r) => r.p >= 2).sort((a, b) => b.p - a.p)[0]?.x;

  if (m.sentido === 'sale') {
    const pago = mejor(pagos.filter((p) => p.activo && p.moneda === 'ARS'), (p) => puntaje(p.nombre, p.monto, p.proximo_vencimiento));
    if (pago) return { tipo: 'pago', pago };
    return { tipo: 'gasto', categoria_id: categoriaPara(m.descripcion, 'gasto', categorias) };
  }
  const ingreso = mejor(ingresos.filter((i) => i.activo && i.moneda === 'ARS'), (i) => puntaje(i.nombre, i.monto, i.proximo_cobro));
  if (ingreso) return { tipo: 'cobro', ingreso };
  return { tipo: 'ingreso', categoria_id: categoriaPara(m.descripcion, 'ingreso', categorias) };
}

/* ---------- Pagos que se repiten y no tienen recordatorio ---------- */

export interface Repetido { nombre: string; monto: number; dia: number; proximo: string; veces: number }

/**
 * Lo que sale de MP con el mismo detalle en dos o más meses distintos y no está en Pagos
 * (ej. el seguro): se propone como vencimiento mensual para que avise.
 */
export function repetidosSinRecordatorio(movs: MovMP[], pagos: Pago[]): Repetido[] {
  const grupos = new Map<string, MovMP[]>();
  for (const m of movs) {
    if (m.sentido !== 'sale' || m.estado === 'ignorado') continue;
    const k = palabras(m.descripcion).slice(0, 3).join(' ');
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  const salida: Repetido[] = [];
  for (const lista of grupos.values()) {
    const meses = new Set(lista.map((m) => m.fecha.slice(0, 7)));
    if (meses.size < 2) continue;
    const ultimo = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    if (pagos.some((p) => comparten(p.nombre, ultimo.descripcion))) continue;
    const dia = Number(ultimo.fecha.slice(8));
    salida.push({
      nombre: ultimo.descripcion,
      monto: Math.round(lista.reduce((s, m) => s + Number(m.monto), 0) / lista.length),
      dia, proximo: sumarMeses(ultimo.fecha, 1, dia), veces: meses.size,
    });
  }
  return salida.sort((a, b) => b.veces - a.veces);
}

/* ---------- Traer de la API (función `mercadopago` en la nube) ---------- */

/** Solo en modo nube: la clave de MP vive en la nube, nunca en el navegador. */
export const hayNube = () => almacen.tipo === 'nube' && !!supabase;

const ULTIMA = 'life.mp.ultima';
export const ultimaTraida = (): string | null => { try { return localStorage.getItem(ULTIMA); } catch { return null; } };

/** Saldo y movimientos de los últimos `dias` desde Mercado Pago. Tira error con un texto para mostrar. */
export async function traerDeMP(dias = 30): Promise<{ saldo: number | null; movimientos: MovLeido[] }> {
  if (!supabase) throw new Error('Mercado Pago se conecta solo con la nube.');
  const { data, error } = await supabase.functions.invoke('mercadopago', { body: { dias } });
  if (error) {
    let texto = error.message;
    try { texto = (await (error as { context?: Response }).context?.json())?.error ?? texto; } catch { /* queda el mensaje */ }
    throw new Error(texto);
  }
  try { localStorage.setItem(ULTIMA, new Date().toISOString()); } catch { /* sin memoria */ }
  return { saldo: data.saldo ?? null, movimientos: data.movimientos ?? [] };
}

/* ---------- Escrituras ---------- */

/** La billetera de MP en Economía: la que se llama "Mercado Pago" (o "MP"). */
export function cuentaMP(cuentas: Cuenta[]): Cuenta | undefined {
  return cuentas.find((c) => !c.archivada && /mercado ?pago|^mp$/.test(normal(c.nombre)));
}

/** Suma los movimientos leídos que todavía no están (por su id de MP). Devuelve cuántos entraron. */
export async function importar(leidos: MovLeido[], existentes: MovMP[], origen: MovMP['origen'] = 'resumen'): Promise<number> {
  const ya = new Set(existentes.map((m) => m.externo));
  let n = 0;
  for (const m of leidos) {
    if (ya.has(m.externo)) continue;
    ya.add(m.externo);
    await crear<MovMP>(TABLA_MP, { ...m, origen, estado: 'nuevo', movimiento_id: null });
    n++;
  }
  return n;
}

/** Confirma un movimiento con lo que es: registra el pago o el cobro (con sus cruces) o crea el movimiento. */
export async function confirmar(m: MovMP, s: Sugerencia, cuenta_id: string) {
  const datos = { monto: Number(m.monto), cuenta_id, fecha: m.fecha };
  let mov: Movimiento | null;
  if (s.tipo === 'pago') mov = await registrarPago(s.pago, { ...datos, categoria_id: s.pago.categoria_id });
  else if (s.tipo === 'cobro') mov = await registrarCobro(s.ingreso, datos);
  else {
    mov = await crear<Movimiento>(T.movimientos, {
      ...datos, tipo: s.tipo, cuenta_destino_id: null, monto_destino: null,
      categoria_id: s.categoria_id, descripcion: m.descripcion, pago_id: null,
    });
  }
  await modificar<MovMP>(TABLA_MP, m.id, { estado: 'cargado', movimiento_id: mov?.id ?? null });
}

export const ignorar = (m: MovMP) => modificar<MovMP>(TABLA_MP, m.id, { estado: 'ignorado' });

/** Crea el vencimiento mensual en Pagos para algo que se repite (avisa como cualquier otro pago). */
export async function crearRecordatorio(r: Repetido, cuenta_id: string | null, categoria_id: string | null) {
  await crear<Pago>(T.pagos, {
    nombre: r.nombre, monto: r.monto, moneda: 'ARS', categoria_id, cuenta_id,
    frecuencia: 'mensual', dia: r.dia, proximo_vencimiento: r.proximo, activo: true,
    notas: 'Detectado en Mercado Pago',
  });
}
