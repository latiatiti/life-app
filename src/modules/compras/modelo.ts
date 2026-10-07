import { escribirStorage, leerStorage } from '../../core/config';
import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { diasEntre, hoy } from '../../core/format';
import { T as TE, type Movimiento } from '../economia/modelo';
import { ajustar, LUGARES, type Lugar, type Producto } from '../stock/modelo';

/* ---------- Tipos ---------- */

/** Cadenas con precios online (las tres con sucursales en Mendoza y catálogo público). */
export const CADENAS = { carrefour: 'Carrefour', vea: 'Vea', jumbo: 'Jumbo' } as const;
export type Cadena = keyof typeof CADENAS;
export type CadenaSuper = Cadena | 'otro';
export const NOMBRE_CADENA: Record<CadenaSuper, string> = { ...CADENAS, otro: 'Otro súper' };

/** Precio online guardado por cadena: p = precio, l = precio de lista (sin oferta), f = fecha. */
export interface PrecioOnline { p: number; l: number; n: string; f: string }

export interface Item extends Fila {
  nombre: string;
  bloque: string;
  producto_id: string | null;
  ean: string | null;
  marca: string;
  unidad: string;
  en_lista: boolean;
  cantidad: number;
  precios: Partial<Record<Cadena, PrecioOnline>>;
}

export interface Super extends Fila {
  nombre: string;
  cadena: CadenaSuper;
  /** Orden de los bloques en ese súper (lo vas armando en el modo compra). */
  bloques: string[];
}

export type FuentePrecio = 'online' | 'ticket' | 'manual';
export interface PrecioReg extends Fila {
  item_id: string;
  cadena: CadenaSuper;
  super_id: string | null;
  precio: number;
  fuente: FuentePrecio;
  fecha: string;
  compra_id: string | null;
}

export interface LineaCompra { item_id: string; nombre: string; cantidad: number; estimado: number; real: number | null }
export interface Compra extends Fila {
  fecha: string;
  super_id: string | null;
  estimado: number;
  total: number;
  items: LineaCompra[];
  movimiento_id: string | null;
}

export const TC = { items: 'com_items', supers: 'com_supers', precios: 'com_precios', compras: 'com_compras' } as const;
export const useItems = () => useTabla<Item>(TC.items);
export const useSupers = () => useTabla<Super>(TC.supers);
export const usePrecios = () => useTabla<PrecioReg>(TC.precios);
export const useCompras = () => useTabla<Compra>(TC.compras);

/* ---------- Bloques (pasillos) ---------- */

export const BLOQUES = ['Verdulería', 'Panadería', 'Carnicería', 'Fiambrería', 'Lácteos', 'Congelados', 'Almacén',
  'Desayuno', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'];

/** Lo típico de cada bloque, para el cuestionario de "¿qué sumamos?". */
export const SUGERIDOS: Record<string, string[]> = {
  'Verdulería': ['Banana', 'Manzana', 'Tomate', 'Lechuga', 'Cebolla', 'Papa', 'Zanahoria', 'Limón', 'Palta'],
  'Panadería': ['Pan', 'Pan lactal', 'Tostadas de arroz'],
  'Carnicería': ['Pechuga de pollo', 'Carne picada', 'Milanesas', 'Bife'],
  'Fiambrería': ['Jamón cocido', 'Queso de máquina', 'Queso rallado'],
  'Lácteos': ['Leche', 'Huevos', 'Yogur', 'Queso crema', 'Manteca'],
  'Congelados': ['Verduras congeladas', 'Hamburguesas', 'Medallones de pollo'],
  'Almacén': ['Arroz', 'Fideos', 'Atún', 'Arvejas en lata', 'Porotos en lata', 'Aceite', 'Sal', 'Puré de tomate'],
  'Desayuno': ['Avena', 'Café', 'Mate', 'Azúcar', 'Mermelada', 'Dulce de leche'],
  'Bebidas': ['Agua', 'Gaseosa'],
  'Limpieza': ['Detergente', 'Lavandina', 'Esponja', 'Bolsas de residuo', 'Papel de cocina', 'Jabón para ropa'],
  'Higiene': ['Papel higiénico', 'Shampoo', 'Pasta dental', 'Desodorante', 'Jabón'],
  'Otros': [],
};

const PISTAS: Array<[RegExp, string]> = [
  [/banana|manzana|tomate|lechuga|cebolla|papa|zanahoria|lim[oó]n|palta|fruta|verdura|zapallo|naranja|ajo|morr[oó]n/i, 'Verdulería'],
  [/pan\b|pan |lactal|factura|galleta/i, 'Panadería'],
  [/pollo|carne|bife|milanesa|picada|cerdo|asado|pechuga|nalga/i, 'Carnicería'],
  [/jam[oó]n|fiambre|salame|queso de m|rallado/i, 'Fiambrería'],
  [/leche|yogur|queso|manteca|huevo|crema/i, 'Lácteos'],
  [/congelad|helado|hamburguesa|medall/i, 'Congelados'],
  [/avena|caf[eé]|mate|yerba|az[uú]car|mermelada|dulce de leche|cereal/i, 'Desayuno'],
  [/agua|gaseosa|jugo|cerveza|vino|soda/i, 'Bebidas'],
  [/detergente|lavandina|esponja|bolsa|limpi|papel de cocina|rollo|jab[oó]n para ropa|suavizante/i, 'Limpieza'],
  [/higi[eé]nico|shampoo|pasta dental|desodorante|jab[oó]n|cepillo|toallita/i, 'Higiene'],
];

const BLOQUE_DE_LUGAR: Record<Lugar, string> = {
  heladera: 'Lácteos', freezer: 'Congelados', alacena: 'Almacén', frutas: 'Verdulería', bano: 'Higiene', limpieza: 'Limpieza', otro: 'Otros',
};

export function adivinarBloque(nombre: string, lugar?: Lugar): string {
  for (const [re, b] of PISTAS) if (re.test(nombre)) return b;
  return lugar ? BLOQUE_DE_LUGAR[lugar] : 'Almacén';
}
export { LUGARES };

/** Bloques en el orden de ese súper; los que todavía no ubicaste van al final en el orden estándar. */
export function ordenBloques(s: Super | null | undefined, extra: string[] = []): string[] {
  const base = [...(s?.bloques ?? [])];
  for (const b of [...BLOQUES, ...extra]) if (!base.includes(b)) base.push(b);
  return base;
}

/* ---------- Precios ---------- */

/** Último precio pagado (ticket) de un ítem, opcionalmente en una cadena o súper. */
export function ultimoTicket(precios: PrecioReg[], itemId: string, filtro?: { cadena?: CadenaSuper; super_id?: string | null }) {
  let mejor: PrecioReg | null = null;
  for (const r of precios) {
    if (r.item_id !== itemId || r.fuente === 'online') continue;
    if (filtro?.super_id && r.super_id !== filtro.super_id) continue;
    if (filtro?.cadena && r.cadena !== filtro.cadena) continue;
    if (!mejor || r.fecha > mejor.fecha || (r.fecha === mejor.fecha && (r.created_at ?? '') > (mejor.created_at ?? ''))) mejor = r;
  }
  return mejor;
}

/** La cadena online más barata para un ítem. */
export function masBarato(i: Item): { cadena: Cadena; precio: PrecioOnline } | null {
  let r: { cadena: Cadena; precio: PrecioOnline } | null = null;
  for (const c of Object.keys(CADENAS) as Cadena[]) {
    const p = i.precios?.[c];
    if (p && (!r || p.p < r.precio.p)) r = { cadena: c, precio: p };
  }
  return r;
}

/** Precio estimado por unidad de un ítem en un súper: lo último que pagaste ahí, si no el online de esa cadena, si no el más barato. */
export function estimar(i: Item, precios: PrecioReg[], s?: Super | null): number {
  if (s) {
    const t = ultimoTicket(precios, i.id, { super_id: s.id });
    if (t) return Number(t.precio);
    if (s.cadena !== 'otro' && i.precios?.[s.cadena]) return i.precios[s.cadena]!.p;
  }
  const t = ultimoTicket(precios, i.id);
  return t ? Number(t.precio) : masBarato(i)?.precio.p ?? 0;
}

/** Total de la lista en cada cadena y cuántos ítems tienen precio ahí. */
export function totalesPorCadena(lista: Item[]) {
  return (Object.keys(CADENAS) as Cadena[]).map((c) => {
    let total = 0, con = 0;
    for (const i of lista) {
      const p = i.precios?.[c];
      if (p) { total += p.p * Number(i.cantidad || 1); con++; }
    }
    return { cadena: c, total, con };
  }).sort((a, b) => b.con - a.con || a.total - b.total);
}

export const enOferta = (p?: PrecioOnline) => !!p && p.l > p.p * 1.01;
export const descuento = (p: PrecioOnline) => Math.round((1 - p.p / p.l) * 100);

export function preciosViejos(items: Item[], dias = 7) {
  return items.filter((i) => {
    const fechas = Object.values(i.precios ?? {}).map((p) => p!.f);
    return fechas.length > 0 && fechas.every((f) => diasEntre(f, hoy()) > dias);
  });
}

/* ---------- Altas y cambios ---------- */

export const nuevoItem = (d: Partial<Item> & { nombre: string }) => crear<Item>(TC.items, {
  bloque: adivinarBloque(d.nombre), producto_id: null, ean: null, marca: '', unidad: 'u', en_lista: false, cantidad: 1, precios: {}, ...d,
});

/** Pasa a la lista lo que falta en casa (crea el ítem si todavía no existe). */
export async function sumarFaltantes(faltan: Array<Producto & { aComprar: number }>, items: Item[]) {
  for (const p of faltan) {
    const it = items.find((i) => i.producto_id === p.id) ?? items.find((i) => i.nombre.toLowerCase() === p.nombre.toLowerCase());
    if (it) {
      if (!it.en_lista) await modificar<Item>(TC.items, it.id, { en_lista: true, cantidad: p.aComprar, producto_id: p.id });
    } else {
      await nuevoItem({ nombre: p.nombre, bloque: adivinarBloque(p.nombre, p.lugar), producto_id: p.id, unidad: p.unidad, en_lista: true, cantidad: p.aComprar });
    }
  }
}

/** Guarda los precios online que trajo la búsqueda (por código de barras) en cada ítem. */
export async function aplicarPrecios(items: Item[], resultados: ResultadoPrecio[]) {
  const f = hoy();
  let n = 0;
  for (const i of items) {
    if (!i.ean) continue;
    const nuevos = { ...(i.precios ?? {}) };
    let cambio = false;
    for (const r of resultados) {
      if (r.ean !== i.ean) continue;
      nuevos[r.cadena] = { p: r.precio, l: r.precioLista, n: r.nombre, f };
      cambio = true;
    }
    if (cambio) { await modificar<Item>(TC.items, i.id, { precios: nuevos }); n++; }
  }
  return n;
}

/* ---------- Búsqueda online (función "precios" en Supabase) ---------- */

export interface ResultadoPrecio {
  cadena: Cadena; nombre: string; marca: string; ean: string; precio: number; precioLista: number; unidad: string; imagen: string; link: string;
}

// Claves públicas del proyecto (la anon key está pensada para ir en la app). Si Ajustes tiene otra nube, se usa esa.
const NUBE_LIFE = {
  url: 'https://jxnlgszmywoebjjpacod.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4bmxnc3pteXdvZWJqanBhY29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjg3NjgsImV4cCI6MjEwNjgwNDc2OH0.x-P_STJg6SoA-91aSNQoAcO40OYzQNG0iAYqCwR2EYw',
};

export async function buscarPrecios(datos: { q?: string; eans?: string[]; limite?: number }): Promise<ResultadoPrecio[]> {
  const { url, anonKey } = NUBE_LIFE;
  const r = await fetch(`${url}/functions/v1/precios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify(datos),
  });
  if (!r.ok) throw new Error(`No pude consultar precios (${r.status})`);
  return ((await r.json()).resultados ?? []) as ResultadoPrecio[];
}

/** Actualiza los precios online de todo el catálogo con código de barras (de a 30). */
export async function actualizarTodo(items: Item[]) {
  const con = items.filter((i) => i.ean);
  let n = 0;
  for (let k = 0; k < con.length; k += 30) {
    const tanda = con.slice(k, k + 30);
    n += await aplicarPrecios(tanda, await buscarPrecios({ eans: tanda.map((i) => i.ean!) }));
  }
  return n;
}

/* ---------- Modo compra ---------- */

export interface EnCurso { super_id: string; inicio: number; reales: Record<string, number | null>; tildados: string[] }
const CLAVE = 'life.compras.encurso';
export const leerEnCurso = (): EnCurso | null => {
  try { return JSON.parse(leerStorage(CLAVE) ?? 'null'); } catch { return null; }
};
export const guardarEnCurso = (e: EnCurso | null) => escribirStorage(CLAVE, e ? JSON.stringify(e) : null);

/**
 * Cerrar la compra: guarda la compra (estimado vs ticket), el precio real de cada cosa,
 * suma al stock lo que está enlazado, saca los ítems de la lista y, si se pide, anota el gasto en Economía.
 */
export async function cerrarCompra(d: {
  super: Super; lineas: LineaCompra[]; total: number; items: Item[]; productos: Producto[];
  gasto: { cuenta_id: string; categoria_id: string | null } | null;
}) {
  const fecha = hoy();
  const estimado = d.lineas.reduce((s, l) => s + l.estimado * l.cantidad, 0);
  let movimiento_id: string | null = null;
  if (d.gasto && d.total > 0) {
    const m = await crear<Movimiento>(TE.movimientos, {
      fecha, tipo: 'gasto', monto: d.total, cuenta_id: d.gasto.cuenta_id, cuenta_destino_id: null, monto_destino: null,
      categoria_id: d.gasto.categoria_id, descripcion: `Compra en ${d.super.nombre}`, pago_id: null,
    });
    movimiento_id = m.id;
  }
  const compra = await crear<Compra>(TC.compras, { fecha, super_id: d.super.id, estimado, total: d.total, items: d.lineas, movimiento_id });
  for (const l of d.lineas) {
    if (l.real != null && l.real > 0) {
      await crear<PrecioReg>(TC.precios, { item_id: l.item_id, cadena: d.super.cadena, super_id: d.super.id, precio: l.real, fuente: 'ticket', fecha, compra_id: compra.id });
    }
    const it = d.items.find((i) => i.id === l.item_id);
    if (it) await modificar<Item>(TC.items, it.id, { en_lista: false });
    const p = it?.producto_id ? d.productos.find((x) => x.id === it.producto_id) : null;
    if (p) await ajustar(p, l.cantidad);
  }
  guardarEnCurso(null);
  return compra;
}

/** Cosas que comprás seguido (aparecen en 2 o más compras): sirven para "¿no te falta…?" en el pasillo. */
export function frecuentes(compras: Compra[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of compras) for (const l of c.items ?? []) m.set(l.item_id, (m.get(l.item_id) ?? 0) + 1);
  return m;
}
