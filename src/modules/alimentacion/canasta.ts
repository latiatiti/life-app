import { crear, modificar } from '../../core/db';
import { diasEntre, hoy, sumarDias } from '../../core/format';
import {
  adivinarBloque, buscarPrecios, CADENAS, type Cadena, type Compra, estimar, type Item, nuevoItem, type PrecioOnline,
  type PrecioReg, TC,
} from '../compras/modelo';

/*
 * Canasta para ganar masa: qué comprar por semana, cuánto sale con tus precios y cuánto separar.
 * Si ya compraste algo varias veces, manda lo que consumís de verdad (historial de compras);
 * si no, la cantidad de referencia, escalada a tu meta de proteína.
 */

export interface Basico {
  id: string;
  nombre: string;
  /** Cómo buscarlo en Carrefour, Vea y Jumbo. */
  buscar: string;
  /** Para reconocerlo en tu catálogo de compras. */
  patron: RegExp;
  unidad: string;
  /** Cantidad por semana para ~145 g de proteína por día (con 3 almuerzos en la fábrica). */
  semana: number;
  /** Gramos de proteína por unidad de compra. */
  prot: number;
  proteico: boolean;
}

export const CANASTA: Basico[] = [
  { id: 'huevos', nombre: 'Huevos', buscar: 'huevos blancos 30 unidades', patron: /huevo/i, unidad: 'maple de 30', semana: 0.7, prot: 190, proteico: true },
  { id: 'pollo', nombre: 'Pechuga de pollo', buscar: 'pechuga de pollo', patron: /pechuga|^pollo|muslo/i, unidad: 'kg', semana: 1, prot: 230, proteico: true },
  { id: 'carne', nombre: 'Carne picada', buscar: 'carne picada especial', patron: /picada|carne/i, unidad: 'kg', semana: 0.75, prot: 190, proteico: true },
  { id: 'atun', nombre: 'Atún al natural', buscar: 'atun al natural', patron: /at[uú]n/i, unidad: 'lata', semana: 3, prot: 30, proteico: true },
  { id: 'leche', nombre: 'Leche', buscar: 'leche entera 1 litro', patron: /^leche/i, unidad: 'litro', semana: 3, prot: 32, proteico: true },
  { id: 'queso', nombre: 'Queso cremoso', buscar: 'queso cremoso', patron: /queso/i, unidad: 'kg', semana: 0.25, prot: 200, proteico: true },
  { id: 'lentejas', nombre: 'Lentejas', buscar: 'lentejas 400 g', patron: /lenteja|poroto|garbanzo/i, unidad: 'paquete', semana: 1, prot: 90, proteico: true },
  { id: 'avena', nombre: 'Avena', buscar: 'avena arrollada', patron: /avena/i, unidad: 'paquete', semana: 0.75, prot: 65, proteico: false },
  { id: 'arroz', nombre: 'Arroz', buscar: 'arroz largo fino 1 kg', patron: /arroz/i, unidad: 'kg', semana: 0.75, prot: 70, proteico: false },
  { id: 'fideos', nombre: 'Fideos', buscar: 'fideos secos 500 g', patron: /fideo|tallar|spaghet|mostachol/i, unidad: 'paquete', semana: 1.5, prot: 60, proteico: false },
  { id: 'pan', nombre: 'Pan lactal', buscar: 'pan lactal', patron: /\bpan\b/i, unidad: 'paquete', semana: 1.5, prot: 45, proteico: false },
  { id: 'papa', nombre: 'Papa', buscar: 'papa', patron: /papa\b|papas\b|batata/i, unidad: 'kg', semana: 2, prot: 20, proteico: false },
  { id: 'banana', nombre: 'Banana', buscar: 'banana', patron: /banana/i, unidad: 'kg', semana: 1.5, prot: 11, proteico: false },
  { id: 'verdura', nombre: 'Tomate', buscar: 'tomate', patron: /tomate/i, unidad: 'kg', semana: 1, prot: 9, proteico: false },
  { id: 'mani', nombre: 'Mantequilla de maní', buscar: 'mantequilla de mani', patron: /\bman[ií]\b/i, unidad: 'frasco', semana: 0.5, prot: 85, proteico: false },
];

/** Proteína por día con la que se armó la canasta de referencia. */
const PROT_REFERENCIA = 145;

export interface LineaCanasta {
  basico: Basico;
  item: Item | null;
  unidad: string;
  semana: number;
  /** De dónde sale la cantidad. */
  fuente: 'consumo' | 'referencia';
  precio: number | null;
  /** Suba mensual (0,05 = 5 % por mes) o null si no hay historial. */
  suba: number | null;
  subaPropia: boolean;
}

/** El ítem de tu catálogo que corresponde a este básico (el que más compraste, si hay varios). */
function itemDe(b: Basico, items: Item[], usos: Map<string, number>): Item | null {
  const c = items.filter((i) => b.patron.test(i.nombre));
  if (!c.length) return null;
  return c.sort((x, y) => (usos.get(y.id) ?? 0) - (usos.get(x.id) ?? 0) || x.nombre.length - y.nombre.length)[0];
}

/** Cuánto comprás por semana de un ítem: lo de las compras anteriores (lo de Ulises no cuenta, lo de los dos a medias). */
function consumo(itemId: string, compras: Compra[]): number | null {
  const desde = sumarDias(hoy(), -120);
  const con = compras.filter((c) => c.fecha >= desde).map((c) => ({
    fecha: c.fecha,
    cant: (c.items ?? []).filter((l) => l.item_id === itemId && l.para !== 'ulises').reduce((s, l) => s + Number(l.cantidad || 0) * (l.para === 'compartido' ? 0.5 : 1), 0),
  })).filter((x) => x.cant > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (con.length < 2) return null;
  const dias = diasEntre(con[0].fecha, con[con.length - 1].fecha);
  if (dias < 7) return null;
  // Lo de la última compra todavía no se consumió: cuenta lo anterior en el tiempo que duró.
  const total = con.slice(0, -1).reduce((s, x) => s + x.cant, 0);
  return (total / dias) * 7;
}

/** Suba mensual del precio con tu historial: primero tickets, si no los precios web guardados. */
export function subaMensual(itemId: string, precios: PrecioReg[]): number | null {
  const regs = precios.filter((r) => r.item_id === itemId && Number(r.precio) > 0);
  for (const grupo of [regs.filter((r) => r.fuente !== 'online'), regs.filter((r) => r.fuente === 'online')]) {
    if (grupo.length < 2) continue;
    const g = [...grupo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const dias = diasEntre(g[0].fecha, g[g.length - 1].fecha);
    if (dias < 14) continue;
    const m = (Number(g[g.length - 1].precio) / Number(g[0].precio)) ** (30 / dias) - 1;
    return Math.max(-0.2, Math.min(0.3, m));
  }
  return null;
}

export function armarCanasta(d: { items: Item[]; precios: PrecioReg[]; compras: Compra[]; proteinaDia: number }): LineaCanasta[] {
  const usos = new Map<string, number>();
  for (const c of d.compras) for (const l of c.items ?? []) usos.set(l.item_id, (usos.get(l.item_id) ?? 0) + 1);
  const escala = d.proteinaDia / PROT_REFERENCIA;
  const lineas: LineaCanasta[] = CANASTA.map((b) => {
    const item = itemDe(b, d.items, usos);
    const propio = item ? consumo(item.id, d.compras) : null;
    const precio = item ? estimar(item, d.precios) || null : null;
    const suba = item ? subaMensual(item.id, d.precios) : null;
    return {
      basico: b, item, unidad: propio != null ? item!.unidad : b.unidad,
      semana: propio ?? Math.round(b.semana * (b.proteico ? escala : 1) * 100) / 100,
      fuente: propio != null ? 'consumo' : 'referencia', precio, suba, subaPropia: suba != null,
    };
  });
  // Lo que no tiene historial usa la suba promedio de lo que sí tiene.
  const conSuba = lineas.filter((l) => l.suba != null);
  const media = conSuba.length ? conSuba.reduce((s, l) => s + l.suba!, 0) / conSuba.length : null;
  return lineas.map((l) => (l.suba == null && media != null ? { ...l, suba: media } : l));
}

/** Plata a separar: esta semana y las próximas 4, con la suba que venís viendo. */
export function plataCanasta(lineas: LineaCanasta[]) {
  let semana = 0, mes = 0, sinPrecio = 0;
  for (const l of lineas) {
    if (!l.precio) { sinPrecio++; continue; }
    const m = l.suba ?? 0;
    semana += l.semana * l.precio * (1 + m) ** (3.5 / 30);
    for (let k = 0; k < 4; k++) mes += l.semana * l.precio * (1 + m) ** ((7 * k + 3.5) / 30);
  }
  const conSuba = lineas.filter((l) => l.suba != null && l.precio);
  const suba = conSuba.length ? conSuba.reduce((s, l) => s + l.suba!, 0) / conSuba.length : null;
  return { semana: Math.round(semana), mes: Math.round(mes), sinPrecio, suba };
}

/** Busca en la web el precio de lo que no tiene y lo guarda en tu catálogo de Compras (y en el historial de precios). */
export async function buscarFaltantes(lineas: LineaCanasta[]): Promise<number> {
  let n = 0;
  const f = hoy();
  for (const l of lineas.filter((x) => !x.precio)) {
    let res;
    try { res = await buscarPrecios({ q: l.basico.buscar, limite: 4 }); } catch { continue; }
    const precios: Partial<Record<Cadena, PrecioOnline>> = {};
    for (const c of Object.keys(CADENAS) as Cadena[]) {
      const de = res.filter((r) => r.cadena === c && r.precio > 0).sort((a, b) => a.precio - b.precio);
      // El del medio: evita quedarse con un envase chiquito o uno gigante.
      const r = de[Math.floor((de.length - 1) / 2)];
      if (r) precios[c] = { p: r.precio, l: r.precioLista, n: r.nombre, f };
    }
    if (!Object.keys(precios).length) continue;
    const item = l.item
      ? (await modificar<Item>(TC.items, l.item.id, { precios: { ...(l.item.precios ?? {}), ...precios } }), l.item)
      : await nuevoItem({ nombre: l.basico.nombre, bloque: adivinarBloque(l.basico.nombre), unidad: l.basico.unidad, precios });
    for (const [c, p] of Object.entries(precios)) {
      await crear<PrecioReg>(TC.precios, { item_id: item.id, cadena: c as Cadena, super_id: null, precio: p!.p, fuente: 'online', fecha: f, compra_id: null });
    }
    n++;
  }
  return n;
}

/** Pasa la canasta de la semana a la lista de compras (cruce Comida → Compras). */
export async function canastaALista(lineas: LineaCanasta[], items: Item[]) {
  let n = 0;
  for (const l of lineas) {
    const cant = /kg|litro/.test(l.unidad) ? Math.max(0.25, Math.round(l.semana * 4) / 4) : Math.max(1, Math.ceil(l.semana - 0.2));
    const it = l.item ?? items.find((i) => i.nombre.toLowerCase() === l.basico.nombre.toLowerCase());
    if (it) { if (!it.en_lista) { await modificar<Item>(TC.items, it.id, { en_lista: true, cantidad: cant }); n++; } }
    else { await nuevoItem({ nombre: l.basico.nombre, bloque: adivinarBloque(l.basico.nombre), unidad: l.basico.unidad, en_lista: true, cantidad: cant }); n++; }
  }
  return n;
}
