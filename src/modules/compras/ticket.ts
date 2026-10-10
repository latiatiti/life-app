import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { uid } from '../../core/format';
import { buscarPrecios, leerQrTicket, NUBE_LIFE, type Persona, type TicketQR } from './modelo';

/* ---------- Tickets guardados (QR o foto) ---------- */

/** Un producto del ticket, para repartir. precio = por unidad; total = lo que figura en el renglón. */
export interface ItemTicket {
  id: string;
  nombre: string;
  ean: string | null;
  cantidad: number;
  precio: number;
  total: number;
  /** Si es por peso (kg), va como 1 unidad al total del renglón. */
  peso?: number | null;
  para: Persona | null;
  imagen?: string;
}

export interface Ticket extends Fila {
  fecha: string;
  origen: 'qr' | 'foto' | 'manual';
  qr: string | null;
  url: string | null;
  html: string | null;
  texto: string | null;
  fiscal: TicketQR | null;
  items: ItemTicket[];
  total: number | null;
  super_id: string | null;
  compra_id: string | null;
  estado: 'revisar' | 'cerrado';
}

export const TABLA_TICKETS = 'com_tickets';
export const useTickets = () => useTabla<Ticket>(TABLA_TICKETS);

export const nuevoTicket = (d: Partial<Ticket>) => crear<Ticket>(TABLA_TICKETS, {
  fecha: new Date().toISOString().slice(0, 10), origen: 'qr', qr: null, url: null, html: null, texto: null, fiscal: null,
  items: [], total: null, super_id: null, compra_id: null, estado: 'revisar',
  ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
});
export const cambiarTicket = (id: string, d: Partial<Ticket>) => modificar<Ticket>(TABLA_TICKETS, id, d);

/* ---------- Leer el renglón de un ticket ---------- */

/** "1.250,00" → 1250 · "1250.50" → 1250.5 · "1,234" (kg) → 1.234 */
export function numero(s: string): number {
  let t = s.replace(/[$\s]/g, '');
  if (/,\d{1,3}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(t) && !/\.\d{3}\./.test(t) && t.split('.').length > 2) t = t.replace(/\./g, '');
  else t = t.replace(/,/g, '');
  return Number(t);
}

const MONTO = String.raw`-?\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|-?\$?\s?\d+[.,]\d{2}`;
const FIN_MONTO = new RegExp(`(${MONTO})\\s*[A-Z*]{0,2}\\s*$`);
const CANT_X = new RegExp(String.raw`^(\d+(?:[.,]\d{1,3})?)\s*(?:u|un|uni|kg|k)?\s*[xX*]\s*\$?\s*(${MONTO})`);
const NO_PRODUCTO = /\b(sub\s*-?total|total|iva|cuit|c\.?u\.?i\.?t|ing\.?\s*brutos|vuelto|efectivo|tarjeta|d[eé]bito|cr[eé]dito|cambio|pago|recibido|cajer|caja\b|ticket|factura|comprobante|p\.?\s*venta|fecha|hora|cliente|consumidor|resp\.?\s*inscr|cae\b|vto|redondeo|percep|retenc|items?\s*vendidos|cant\.?\s*art|ahorro|saldo|puntos|gracias)\b/i;
const DESCUENTO = /\b(desc(uento)?|dto|bonif|promo|oferta|2x1|3x2|ahorr[oa]s?|rebaja)\b/i;

/**
 * Pasa el texto de un ticket (de la foto o de la página del QR) a productos.
 * Sirve para los formatos más comunes de los súper de acá: "2 x 1.250,00" en un renglón y el producto en el siguiente,
 * o todo junto en uno ("7790742363015 LECHE SER 1L  1.939,00"). Lo que no entiende lo deja afuera: después se revisa uno a uno.
 */
export function leerProductos(texto: string): ItemTicket[] {
  const items: ItemTicket[] = [];
  let pendiente: { cant: number; precio: number } | null = null;
  for (const crudo of texto.split(/\r?\n/)) {
    const l = crudo.replace(/\s+/g, ' ').trim();
    if (l.length < 3) continue;
    const cx = CANT_X.exec(l);
    if (cx) {
      pendiente = { cant: numero(cx[1]), precio: Math.abs(numero(cx[2])) };
      // A veces el producto viene en el mismo renglón, después del precio.
      const resto = l.slice(cx[0].length).trim();
      if (!/[a-záéíóúñ]{3}/i.test(resto)) continue;
    }
    const fm = FIN_MONTO.exec(l);
    if (!fm) continue;
    const monto = numero(fm[1]);
    let nombre = l.slice(0, fm.index).trim();
    if (cx) nombre = l.slice(cx[0].length, fm.index).trim();
    if (!/[a-záéíóúñ]{3}/i.test(nombre)) continue;
    const ant = items[items.length - 1];
    if ((monto < 0 || DESCUENTO.test(nombre)) && ant) {
      // Descuento o promo: se lo resta al producto anterior.
      ant.total = Math.max(0, ant.total - Math.abs(monto));
      ant.precio = ant.peso ? ant.total : Math.round((ant.total / ant.cantidad) * 100) / 100;
      pendiente = null;
      continue;
    }
    if (NO_PRODUCTO.test(nombre) || !Number.isFinite(monto) || monto <= 0) { pendiente = null; continue; }
    const ean = /\b(\d{8,14})\b/.exec(nombre)?.[1] ?? null;
    nombre = nombre.replace(/\b\d{8,14}\b/, '').replace(/\(\s*\d{1,2}[.,]\d{1,2}\s*%?\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[-*#.\s]+/, '').trim();
    let cantidad = 1;
    let precio = monto;
    let peso: number | null = null;
    if (pendiente) {
      if (Number.isInteger(pendiente.cant) && pendiente.cant > 0) { cantidad = pendiente.cant; precio = pendiente.precio; }
      else peso = pendiente.cant;
    }
    items.push({ id: uid(), nombre: titulo(nombre), ean, cantidad, precio, total: monto, peso, para: null });
    pendiente = null;
  }
  return items;
}

/** "LECHE LA SERENISIMA 1L" → "Leche La Serenisima 1L" */
function titulo(s: string) {
  return s.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(\d+)(l|ml|g|kg|cc)\b/gi, (_, n, u) => n + u.toUpperCase());
}

/** El total que figura en el ticket, si se lee. */
export function leerTotal(texto: string): number | null {
  let t: number | null = null;
  for (const l of texto.split(/\r?\n/)) {
    if (/sub\s*-?total/i.test(l) || !/\btotal\b/i.test(l)) continue;
    const m = FIN_MONTO.exec(l.trim());
    if (m) t = numero(m[1]);
  }
  return t && t > 0 ? t : null;
}

/* ---------- QR: ARCA (solo total) o ticket digital del súper (con productos) ---------- */

export type LecturaQr =
  | { tipo: 'fiscal'; fiscal: TicketQR }
  | { tipo: 'link'; url: string }
  | { tipo: 'otro' };

export function clasificarQr(texto: string): LecturaQr {
  const fiscal = leerQrTicket(texto);
  if (fiscal) return { tipo: 'fiscal', fiscal };
  try {
    const u = new URL(texto.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') return { tipo: 'link', url: u.href };
  } catch { /* no es un link */ }
  return { tipo: 'otro' };
}

/** Baja la página del ticket digital por la función "ticket" de Supabase (una sola vez: el link puede vencer). */
export async function bajarTicket(url: string): Promise<{ ok: boolean; url: string; html: string; texto: string; error?: string }> {
  const { url: base, anonKey } = NUBE_LIFE;
  const r = await fetch(`${base}/functions/v1/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ url }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && !d.html) return { ok: false, url, html: '', texto: '', error: d.error ?? `Error ${r.status}` };
  return { ok: !!d.ok, url: d.url ?? url, html: d.html ?? '', texto: d.texto ?? '', error: d.ok ? undefined : `La página respondió ${d.status}` };
}

/* ---------- Foto del ticket: lectura de texto en el teléfono (sin mandar la foto a nadie) ---------- */

/** Mejora la foto para leerla: escala de grises, contraste y tamaño. */
async function preparar(archivo: File): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(archivo);
  const ancho = Math.min(2000, Math.max(1200, img.width));
  const esc = ancho / img.width;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * esc);
  c.height = Math.round(img.height * esc);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 140));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/** Lee el texto de una o varias fotos del ticket (en orden). La primera vez baja el lector en español. */
export async function leerFotos(fotos: File[], progreso: (p: string) => void): Promise<string> {
  progreso('Preparando el lector…');
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('spa', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') progreso(`Leyendo… ${Math.round(m.progress * 100)} %`);
    },
  });
  try {
    const partes: string[] = [];
    for (let i = 0; i < fotos.length; i++) {
      progreso(fotos.length > 1 ? `Foto ${i + 1} de ${fotos.length}…` : 'Leyendo…');
      const { data } = await w.recognize(await preparar(fotos[i]));
      partes.push(data.text);
    }
    return partes.join('\n');
  } finally {
    await w.terminate();
  }
}

/** Foto del producto (busca por código y, si no, por nombre en los súper online). */
export async function imagenDe(it: Pick<ItemTicket, 'ean' | 'nombre'>): Promise<string> {
  try {
    const r = it.ean ? await buscarPrecios({ eans: [it.ean] }) : [];
    const r2 = r.length ? r : await buscarPrecios({ q: it.nombre.split(' ').slice(0, 4).join(' '), limite: 1 });
    return r2.find((x) => x.imagen)?.imagen ?? '';
  } catch { return ''; }
}

/** Totales del reparto: lo de los dos va a medias. */
export function repartoTicket(items: ItemTicket[]) {
  const t = { yo: 0, ulises: 0, compartido: 0, sinAsignar: 0, total: 0 };
  for (const i of items) {
    t.total += i.total;
    if (i.para === 'yo') t.yo += i.total;
    else if (i.para === 'ulises') t.ulises += i.total;
    else if (i.para === 'compartido') { t.compartido += i.total; t.yo += i.total / 2; t.ulises += i.total / 2; }
    else t.sinAsignar += i.total;
  }
  return t;
}
