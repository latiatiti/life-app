import { crear, modificar, useTabla, type Fila } from '../../core/db';
import { diasEntre, hoy } from '../../core/format';
import { TD, type NivelPrioridad, type Tarea } from '../dia/modelo';

/**
 * Tablero de pendientes e ideas (2026-11-07, boceto aprobado: project-files diseno/tablero-boceto.html).
 * Una cosa, un solo lugar: cada tarjeta ES una fila de dia_tareas. Las que tienen fecha se ven también en el Día;
 * las sin fecha viven solo acá. "hecho" y "etapa" van juntos: estar en la última etapa = hecho.
 * Etapas y categorías propias en dia_tablero (una fila; vacía = las de fábrica).
 */

export const TABLA_TABLERO = 'dia_tablero';

export interface Etapa { id: string; nombre: string }
export interface PasoTarjeta { texto: string; hecho: boolean }

export interface Tarjeta extends Tarea {
  etapa?: string | null;
  categoria?: string | null;
  pasos?: PasoTarjeta[] | null;
  orden?: number | null;
  movida?: string | null;
  /** Lo que fue pasando, con fecha (la más nueva al final). */
  novedades?: Novedad[] | null;
  /** Cuándo mandarle el recordatorio por WhatsApp (timestamptz). */
  recordar_en?: string | null;
  recordatorio_enviado?: string | null;
  /** A quién hay que avisarle (abre WhatsApp con el mensaje listo). */
  contacto?: Contacto | null;
}

export interface Novedad { fecha: string; texto: string }
export interface Contacto { nombre?: string; telefono?: string }

/** Tabla con el número y la clave de CallMeBot (fuera de TABLAS: no va en el respaldo). */
export const TABLA_WHATSAPP = 'avi_whatsapp';
export interface ConfigWhatsapp extends Fila {
  telefono: string; apikey: string; activo: boolean; ultimo_envio?: string | null; ultimo_error?: string | null;
}
export function useWhatsapp() {
  const { filas, cargado } = useTabla<ConfigWhatsapp>(TABLA_WHATSAPP);
  const fila = filas[0];
  return { fila, cargado, conectado: !!(fila?.activo && fila.telefono && fila.apikey) };
}

const MAX_NOVEDADES = 40;
/** Suma una novedad con la fecha y hora de ahora (devuelve la lista nueva, no escribe). */
export function conNovedad(t: Pick<Tarjeta, 'novedades'> | undefined, texto: string): Novedad[] {
  const lista = [...(t?.novedades ?? []), { fecha: new Date().toISOString(), texto }];
  return lista.slice(-MAX_NOVEDADES);
}

/** El paso en el que está: el primero sin tildar. */
export function pasoActual(t: Pick<Tarjeta, 'pasos'>): string | null {
  return (t.pasos ?? []).find((p) => !p.hecho && p.texto.trim())?.texto ?? null;
}

// ── Recordatorios: la hora que ella elige es hora de Mendoza (-03:00, sin horario de verano). ──
const ZONA = 'America/Argentina/Mendoza';
/** 'YYYY-MM-DDTHH:MM' (hora de Mendoza) → ISO con zona. */
export function aInstante(local: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00-03:00` : null;
}
/** ISO → 'YYYY-MM-DDTHH:MM' en hora de Mendoza (para el campo de fecha y hora). */
export function aLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** "hoy 20:00", "mañana 9:00", "sáb 14/11 9:00". */
export function cuandoCorto(iso: string | null | undefined): string {
  const l = aLocal(iso);
  if (!l) return '';
  const [f, h] = l.split('T');
  const hora = h.replace(/^0/, '');
  const dif = diasEntre(hoy(), f);
  if (dif === 0) return `hoy ${hora}`;
  if (dif === 1) return `mañana ${hora}`;
  if (dif === -1) return `ayer ${hora}`;
  const d = new Date(`${f}T12:00:00`);
  const dia = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  return `${dia} ${d.getDate()}/${d.getMonth() + 1} ${hora}`;
}
/** Atajos de recordatorio relativos a ahora (hora de Mendoza). */
export function atajosRecordar(): { texto: string; local: string }[] {
  const ahora = aLocal(new Date().toISOString());
  const [f, h] = ahora.split('T');
  const enUnaHora = aLocal(new Date(Date.now() + 3600_000).toISOString());
  const manana = aLocal(new Date(Date.now() + 86400_000).toISOString()).split('T')[0];
  const lista = [{ texto: 'En 1 hora', local: enUnaHora }];
  if (h < '20:00') lista.push({ texto: 'Hoy 20:00', local: `${f}T20:00` });
  lista.push({ texto: 'Mañana 9:00', local: `${manana}T09:00` });
  return lista;
}

/** Link de WhatsApp con el mensaje listo (lo manda ella desde su teléfono). */
export function linkWhatsapp(telefono: string, texto: string): string | null {
  const n = telefono.replace(/\D/g, '');
  if (n.length < 8) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

interface ConfigTablero extends Fila { etapas: Etapa[]; categorias: string[] }

export const ETAPAS_BASE: Etapa[] = [
  { id: 'hacer', nombre: 'Por hacer' },
  { id: 'proceso', nombre: 'En proceso' },
  { id: 'hecho', nombre: 'Hecho' },
];
export const CATEGORIAS_BASE = ['Reparto', 'Pagos', 'Casa', 'Compras', 'Ideas de desarrollo'];

export const PRIORIDADES: Array<{ id: NivelPrioridad; nombre: string; icono: string }> = [
  { id: 'alta', nombre: 'Alta', icono: '▲' },
  { id: 'media', nombre: 'Media', icono: '●' },
  { id: 'baja', nombre: 'Baja', icono: '▽' },
];

/** Días sin moverse para que avise (pilar 8: avisar lo raro). */
export const DIAS_QUIETA = 4;

export const useTarjetas = () => useTabla<Tarjeta>(TD.tareas);

export function useConfigTablero() {
  const { filas } = useTabla<ConfigTablero>(TABLA_TABLERO);
  const fila = filas[0];
  return {
    fila,
    etapas: fila?.etapas?.length ? fila.etapas : ETAPAS_BASE,
    categorias: fila?.categorias?.length ? fila.categorias : CATEGORIAS_BASE,
  };
}

export async function guardarConfig(fila: ConfigTablero | undefined, cambios: Partial<Pick<ConfigTablero, 'etapas' | 'categorias'>>) {
  if (fila) await modificar<ConfigTablero>(TABLA_TABLERO, fila.id, cambios);
  else await crear<ConfigTablero>(TABLA_TABLERO, { etapas: ETAPAS_BASE, categorias: CATEGORIAS_BASE, ...cambios });
}

const ultima = (etapas: Etapa[]) => etapas[etapas.length - 1].id;

/** En qué columna va una tarjeta. Si se tildó en el Día, va a la última; si su etapa ya no existe, a la primera. */
export function etapaDe(t: Tarjeta, etapas: Etapa[]): string {
  const ult = ultima(etapas);
  if (t.hecho) return ult;
  if (t.etapa && t.etapa !== ult && etapas.some((e) => e.id === t.etapa)) return t.etapa;
  return etapas[0].id;
}

export function diasQuieta(t: Tarjeta): number {
  const desde = t.movida ?? t.created_at?.slice(0, 10) ?? hoy();
  return Math.max(0, diasEntre(desde, hoy()));
}

export const estaQuieta = (t: Tarjeta) => !t.hecho && t.prioridad !== 'baja' && diasQuieta(t) >= DIAS_QUIETA;

/** Orden dentro de una columna: el campo orden (menor arriba) y, si falta, las más nuevas arriba. */
export function ordenar(ts: Tarjeta[]): Tarjeta[] {
  return [...ts].sort((a, b) => {
    const oa = a.orden ?? -Infinity, ob = b.orden ?? -Infinity;
    if (oa !== ob) return oa - ob;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

/** Columnas del tablero, ya ordenadas. */
export function columnas(ts: Tarjeta[], etapas: Etapa[]): Map<string, Tarjeta[]> {
  const m = new Map<string, Tarjeta[]>(etapas.map((e) => [e.id, []]));
  for (const t of ts) m.get(etapaDe(t, etapas))!.push(t);
  for (const [k, v] of m) m.set(k, ordenar(v));
  return m;
}

/** Número de orden para dejar una tarjeta arriba de todo en una columna. */
export function ordenArriba(col: Tarjeta[]): number {
  const nums = col.map((t) => t.orden).filter((o): o is number => typeof o === 'number');
  return nums.length ? Math.min(...nums) - 1 : 0;
}

/**
 * Mueve una tarjeta a una etapa. antesDe = id de la tarjeta que va a quedar debajo (null = al final).
 * Una sola escritura: el DESHACER de abajo la vuelve atrás entera.
 */
export async function mover(t: Tarjeta, etapa: string, etapas: Etapa[], col: Tarjeta[], antesDe: string | null = null) {
  const lista = col.filter((x) => x.id !== t.id);
  // Números de orden seguros para todas (las viejas pueden no tener).
  const o = (i: number) => lista[i].orden ?? i;
  let orden: number;
  const i = antesDe ? lista.findIndex((x) => x.id === antesDe) : -1;
  if (!lista.length) orden = 0;
  else if (i < 0) orden = o(lista.length - 1) + 1;
  else if (i === 0) orden = o(0) - 1;
  else orden = (o(i - 1) + o(i)) / 2;
  const cambia = etapaDe(t, etapas) !== etapa;
  const nombre = etapas.find((e) => e.id === etapa)?.nombre ?? etapa;
  await modificar<Tarjeta>(TD.tareas, t.id, {
    etapa, hecho: etapa === ultima(etapas), orden,
    ...(cambia ? { movida: hoy(), novedades: conNovedad(t, `Pasó a ${nombre}`) } : {}),
  });
}

export function siguienteEtapa(etapas: Etapa[], id: string, paso: 1 | -1): Etapa | undefined {
  return etapas[etapas.findIndex((e) => e.id === id) + paso];
}
