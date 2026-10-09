import { escribirStorage, leerStorage } from '../../core/config';
import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { diasEntre, hoy } from '../../core/format';
import { T as TE, type Movimiento } from '../economia/modelo';
import { ajustar, LUGARES, type Lugar, nuevoProducto, type Persona, personaDe, type Producto } from '../stock/modelo';

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

export interface LineaCompra { item_id: string; nombre: string; cantidad: number; estimado: number; real: number | null; para?: Persona }
export interface Compra extends Fila {
  fecha: string;
  super_id: string | null;
  estimado: number;
  total: number;
  items: LineaCompra[];
  movimiento_id: string | null;
  /** Compra compartida: quién pagó, cuánto le toca a cada uno y cuánto queda debiendo el otro. */
  reparto?: { pago: Persona; yo: number; ulises: number; debe: number } | null;
  /** Datos del QR fiscal del ticket, si se escaneó. */
  ticket?: TicketQR | null;
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

/* ---------- Carrito con escáner (compra compartida) ---------- */

export { PERSONAS } from '../stock/modelo';
export type { Persona };

/** Una cosa cargada en el súper: escaneada o escrita. Precio opcional (por unidad). */
export interface LineaCarrito {
  id: string;
  ean: string | null;
  nombre: string;
  marca: string;
  para: Persona;
  cantidad: number;
  precio: number | null;
  /** Precio online de referencia, si lo encontramos. */
  ref: number | null;
  imagen?: string;
}
export interface Carrito { super_id: string | null; inicio: number; lineas: LineaCarrito[]; ultimoPara: Persona }

const CLAVE_CARRITO = 'life.compras.carrito';
export const leerCarrito = (): Carrito | null => {
  try { return JSON.parse(leerStorage(CLAVE_CARRITO) ?? 'null'); } catch { return null; }
};
export const guardarCarrito = (c: Carrito | null) => escribirStorage(CLAVE_CARRITO, c ? JSON.stringify(c) : null);

/** Lo de "los dos" se divide a medias. */
export function totalesCarrito(lineas: LineaCarrito[]) {
  const t = { total: 0, yo: 0, ulises: 0, compartido: 0, sinPrecio: 0 };
  for (const l of lineas) {
    if (l.precio == null) { t.sinPrecio++; continue; }
    const m = l.precio * l.cantidad;
    t.total += m;
    if (l.para === 'yo') t.yo += m;
    else if (l.para === 'ulises') t.ulises += m;
    else { t.compartido += m; t.yo += m / 2; t.ulises += m / 2; }
  }
  return t;
}

/** Busca qué producto es un código: primero en tu catálogo, después en los súper online y por último en Open Food Facts. */
export async function identificar(ean: string, items: Item[]): Promise<{ nombre: string; marca: string; ref: number | null; imagen: string; item: Item | null }> {
  const it = items.find((i) => i.ean === ean);
  if (it) return { nombre: it.nombre, marca: it.marca, ref: masBarato(it)?.precio.p ?? null, imagen: '', item: it };
  try {
    const r = await buscarPrecios({ eans: [ean] });
    if (r.length) {
      const barato = [...r].sort((a, b) => a.precio - b.precio)[0];
      return { nombre: r[0].nombre, marca: r[0].marca, ref: barato.precio, imagen: r.find((x) => x.imagen)?.imagen ?? '', item: null };
    }
  } catch { /* sin señal o sin función: seguimos */ }
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_es,brands,image_front_small_url`);
    if (r.ok) {
      const d = await r.json();
      const n = d?.product?.product_name_es || d?.product?.product_name;
      if (n) return { nombre: String(n), marca: String(d.product.brands ?? '').split(',')[0], ref: null, imagen: String(d.product.image_front_small_url ?? ''), item: null };
    }
  } catch { /* nada */ }
  return { nombre: '', marca: '', ref: null, imagen: '', item: null };
}

/** El ítem del catálogo que corresponde a una línea del carro (por código o por nombre). */
export function itemDeLinea(l: Pick<LineaCarrito, 'ean' | 'nombre'>, items: Item[]): Item | null {
  const n = l.nombre.trim().toLowerCase();
  return (l.ean ? items.find((i) => i.ean === l.ean) : null) ?? (n ? items.find((i) => i.nombre.toLowerCase() === n) : null) ?? null;
}

/* ---------- QR del ticket (factura electrónica de ARCA/AFIP) ---------- */

/**
 * Lo que trae el QR fiscal impreso en el ticket. Ojo: ARCA solo pone el total, la fecha y el comercio,
 * no el detalle de productos; los precios de cada cosa se cargan a mano mirando el ticket.
 */
export interface TicketQR { fecha: string; cuit: string; ptoVta: number; nroCmp: number; importe: number }

export function leerQrTicket(texto: string): TicketQR | null {
  const m = /[?&]p=([^&#]+)/.exec(texto.trim());
  if (!m) return null;
  try {
    let b = decodeURIComponent(m[1]).replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const d = JSON.parse(atob(b));
    const importe = Number(d.importe);
    if (!Number.isFinite(importe) || importe <= 0) return null;
    return { fecha: String(d.fecha ?? '').slice(0, 10), cuit: String(d.cuit ?? ''), ptoVta: Number(d.ptoVta) || 0, nroCmp: Number(d.nroCmp) || 0, importe };
  } catch { return null; }
}

export const numeroTicket = (t: TicketQR) => `${String(t.ptoVta).padStart(4, '0')}-${String(t.nroCmp).padStart(8, '0')}`;

/* ---------- Subas y bajas ---------- */

/** Para cada producto, el último precio de ticket contra el anterior (solo los que cambiaron más de 1 %). */
export function cambiosDePrecio(precios: PrecioReg[], items: Item[]) {
  const por = new Map<string, PrecioReg[]>();
  for (const r of precios) {
    if (r.fuente === 'online') continue;
    const l = por.get(r.item_id) ?? [];
    l.push(r);
    por.set(r.item_id, l);
  }
  const r: Array<{ item: Item; antes: number; ahora: number; pct: number; fecha: string }> = [];
  for (const [id, regs] of por) {
    if (regs.length < 2) continue;
    regs.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    const ahora = Number(regs[0].precio);
    const antes = Number(regs.find((x) => x.fecha < regs[0].fecha)?.precio ?? regs[1].precio);
    const item = items.find((i) => i.id === id);
    if (!item || !antes) continue;
    const pct = Math.round((ahora / antes - 1) * 100);
    if (Math.abs(ahora - antes) / antes > 0.01) r.push({ item, antes, ahora, pct, fecha: regs[0].fecha });
  }
  return r.sort((a, b) => b.pct - a.pct);
}

/* ---------- Lo que falta agarrar ---------- */

/** Lo que está en la lista o falta en casa (tuyo o de los dos) y todavía no está en el carro. */
export function faltaAgarrar(items: Item[], faltan: Producto[], lineas: LineaCarrito[]) {
  const enCarro = new Set(lineas.flatMap((l) => [l.ean ?? '', l.nombre.trim().toLowerCase()]).filter(Boolean));
  const r: Array<{ nombre: string; ean: string | null; basico: boolean }> = [];
  const vistos = new Set<string>();
  for (const i of items.filter((x) => x.en_lista)) {
    const n = i.nombre.toLowerCase();
    vistos.add(n);
    if (i.producto_id) vistos.add(`p:${i.producto_id}`);
    if (enCarro.has(n) || (i.ean && enCarro.has(i.ean))) continue;
    r.push({ nombre: i.nombre, ean: i.ean, basico: !!faltan.find((p) => p.id === i.producto_id)?.basico });
  }
  for (const p of faltan) {
    const n = p.nombre.toLowerCase();
    if (vistos.has(n) || vistos.has(`p:${p.id}`) || enCarro.has(n)) continue;
    const it = items.find((i) => i.producto_id === p.id);
    if (it && ((it.ean && enCarro.has(it.ean)) || enCarro.has(it.nombre.toLowerCase()))) continue;
    r.push({ nombre: p.nombre, ean: it?.ean ?? null, basico: !!p.basico });
  }
  return r.sort((a, b) => Number(b.basico) - Number(a.basico) || a.nombre.localeCompare(b.nombre));
}

const LUGAR_DE_BLOQUE: Record<string, Lugar> = {
  'Verdulería': 'frutas', 'Carnicería': 'heladera', 'Fiambrería': 'heladera', 'Lácteos': 'heladera',
  'Congelados': 'freezer', 'Limpieza': 'limpieza', 'Higiene': 'bano',
};

/**
 * Cerrar la compra compartida: guarda la compra con quién lleva qué, los precios que anotaste,
 * suma cada cosa al stock de su dueño (Yo, Ulises o Los dos) y, si pagaste vos, anota el gasto.
 */
export async function cerrarCarrito(d: {
  carrito: Carrito; super: Super | null; items: Item[]; productos: Producto[]; total: number; pago: Persona;
  gasto: { cuenta_id: string; categoria_id: string | null } | null; ticket?: TicketQR | null;
}) {
  const fecha = d.ticket?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.ticket.fecha) ? d.ticket.fecha : hoy();
  const t = totalesCarrito(d.carrito.lineas);
  const lineas: LineaCompra[] = [];
  const catalogo = [...d.items];
  const stock = [...d.productos];
  for (const l of d.carrito.lineas) {
    const nombre = l.nombre.trim() || (l.ean ? `Código ${l.ean}` : 'Sin nombre');
    let it = (l.ean ? catalogo.find((i) => i.ean === l.ean) : null) ?? catalogo.find((i) => i.nombre.toLowerCase() === nombre.toLowerCase()) ?? null;
    if (!it) {
      it = await nuevoItem({ nombre, ean: l.ean, marca: l.marca });
      catalogo.push(it);
    }
    lineas.push({ item_id: it.id, nombre, cantidad: l.cantidad, estimado: l.ref ?? 0, real: l.precio, para: l.para });
    // Stock del dueño.
    let p = stock.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && personaDe(x) === l.para) ?? null;
    if (p) await ajustar(p, l.cantidad);
    else {
      p = await nuevoProducto({ nombre, lugar: LUGAR_DE_BLOQUE[it.bloque] ?? 'alacena', cantidad: l.cantidad, unidad: 'u', minimo: 0, compra: 0, vence: null, basico: false, persona: l.para });
      stock.push(p);
    }
    const cambios: Partial<Item> = {};
    if (l.para !== 'ulises' && !it.producto_id) cambios.producto_id = p.id;
    if (l.para !== 'ulises' && it.en_lista) cambios.en_lista = false;
    if (Object.keys(cambios).length) await modificar<Item>(TC.items, it.id, cambios);
  }
  const debe = d.pago === 'yo' ? t.ulises : t.yo;
  const nota = debe > 0 ? (d.pago === 'yo' ? ` · Ulises te debe ${Math.round(debe)}` : ` · le debés a Ulises ${Math.round(debe)}`) : '';
  let movimiento_id: string | null = null;
  if (d.pago === 'yo' && d.gasto && d.total > 0) {
    const m = await crear<Movimiento>(TE.movimientos, {
      fecha, tipo: 'gasto', monto: d.total, cuenta_id: d.gasto.cuenta_id, cuenta_destino_id: null, monto_destino: null,
      categoria_id: d.gasto.categoria_id, descripcion: `Compra${d.super ? ` en ${d.super.nombre}` : ''}${nota}`, pago_id: null,
    });
    movimiento_id = m.id;
  }
  const compra = await crear<Compra>(TC.compras, {
    fecha, super_id: d.super?.id ?? null, estimado: lineas.reduce((s, l) => s + l.estimado * l.cantidad, 0), total: d.total, items: lineas,
    movimiento_id, reparto: { pago: d.pago, yo: Math.round(t.yo), ulises: Math.round(t.ulises), debe: Math.round(debe) },
    ...(d.ticket ? { ticket: d.ticket } : {}),
  });
  for (const l of lineas) {
    if (l.real != null && l.real > 0) {
      await crear<PrecioReg>(TC.precios, { item_id: l.item_id, cadena: d.super?.cadena ?? 'otro', super_id: d.super?.id ?? null, precio: l.real, fuente: 'ticket', fecha, compra_id: compra.id });
    }
  }
  guardarCarrito(null);
  return compra;
}
