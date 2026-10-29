import { crear, type Fila, useTabla } from '../../core/db';
import { diasEntre, hoy, sumarDias } from '../../core/format';
import type { Comida, Metas } from './modelo';

/*
 * El "experto en nutrición" de LIFE: cuentas para ganar masa magra.
 * Todo sale de tus datos (perfil, peso, comidas registradas); las referencias son las de siempre
 * en nutrición deportiva (Mifflin-St Jeor, 1,6–2,2 g de proteína por kilo, 0,4 g/kg por comida).
 */

/* ---------- Perfil y metas sugeridas ---------- */

export const ACTIVIDAD = {
  media: { nombre: 'Media', ayuda: 'Trabajo de pie y entrenás 3 veces', factor: 1.55 },
  alta: { nombre: 'Alta', ayuda: 'Trabajo físico (bidones, reparto) + gimnasio', factor: 1.725 },
  muy: { nombre: 'Muy alta', ayuda: 'Trabajo físico pesado todo el día + gimnasio', factor: 1.9 },
} as const;
export type Actividad = keyof typeof ACTIVIDAD;

export interface Perfil {
  altura_cm: number;
  edad: number | null;
  /** Fórmula del metabolismo basal: cambia la constante de Mifflin-St Jeor. */
  formula: 'hombre' | 'mujer' | null;
  actividad: Actividad;
  /** Cuántos kilos por mes querés subir (masa magra: 0,5 a 1). */
  kg_mes: number;
}

/** Lo que contó: 1,82 m, mucha actividad. Edad y fórmula quedan para completar. */
export const PERFIL_BASE: Perfil = { altura_cm: 182, edad: null, formula: null, actividad: 'alta', kg_mes: 0.75 };
export const PESO_BASE = 80;

export const perfilDe = (metas: Metas[]): Perfil => ({ ...PERFIL_BASE, ...(metas[0]?.perfil ?? {}) });

export interface MetasSugeridas {
  basal: number;
  gasto: number;
  kcal_descanso: number;
  kcal_entreno: number;
  proteina_descanso: number;
  proteina_entreno: number;
  grasas: number;
  agua_ml: number;
  porComida: number;
  /** false si faltan edad o fórmula (se usó un valor de arranque). */
  completo: boolean;
}

const r50 = (x: number) => Math.round(x / 50) * 50;

/**
 * Metas para ganar masa magra. Si ya medimos tu gasto real (peso + lo que comés), manda ese;
 * si no, el estimado por fórmula. Superávit chico para no sumar grasa en la panza:
 * 1 kg de masa al mes ≈ 7700 kcal / 30 ≈ 250 kcal por día.
 */
export function sugerirMetas(p: Perfil, peso: number, gastoReal?: number | null): MetasSugeridas {
  const edad = p.edad ?? 30;
  const constante = p.formula === 'hombre' ? 5 : p.formula === 'mujer' ? -161 : -78;
  const basal = 10 * peso + 6.25 * p.altura_cm - 5 * edad + constante;
  const gasto = gastoReal ?? basal * ACTIVIDAD[p.actividad].factor;
  const superavit = (p.kg_mes * 7700) / 30;
  return {
    basal: Math.round(basal),
    gasto: Math.round(gasto),
    kcal_descanso: r50(gasto + superavit - 150),
    kcal_entreno: r50(gasto + superavit + 200),
    proteina_descanso: Math.round(peso * 1.8),
    proteina_entreno: Math.round(peso * 2),
    grasas: Math.round(peso * 0.9),
    agua_ml: Math.round((peso * 35 + 500) / 250) * 250,
    porComida: Math.round(peso * 0.4),
    completo: p.edad != null && p.formula != null,
  };
}

/* ---------- Mediciones del cuerpo ---------- */

export interface Medicion extends Fila {
  fecha: string;
  peso: number | null;
  cintura: number | null;
  brazo: number | null;
  nota: string | null;
}
export const TCU = 'ali_cuerpo';
export const useCuerpo = () => useTabla<Medicion>(TCU);
export const guardarMedicion = (m: Omit<Medicion, 'id'>) => crear<Medicion>(TCU, m);

const num = (x: unknown) => (x == null || x === '' ? null : Number(x));

export function ultimoPeso(cuerpo: Medicion[]): number | null {
  const c = [...cuerpo].filter((m) => num(m.peso)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return c[0] ? Number(c[0].peso) : null;
}

/** Pendiente por regresión lineal (unidades por día) de un campo en los últimos `dias`. */
function pendiente(cuerpo: Medicion[], campo: 'peso' | 'cintura', dias: number) {
  const desde = sumarDias(hoy(), -dias);
  const pts = cuerpo.filter((m) => m.fecha >= desde && num(m[campo]) != null).map((m) => ({ x: diasEntre(desde, m.fecha), y: Number(m[campo]) }));
  if (pts.length < 2) return null;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 7) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den ? { porDia: pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den, puntos: pts.length, span } : null;
}

/** Cómo viene el cuerpo en las últimas 4 semanas: kg por mes y cm de cintura por mes. */
export function tendencia(cuerpo: Medicion[]) {
  const p = pendiente(cuerpo, 'peso', 35);
  const c = pendiente(cuerpo, 'cintura', 35);
  return { kgMes: p ? p.porDia * 30 : null, cmMes: c ? c.porDia * 30 : null, pesajes: p?.puntos ?? 0 };
}

/**
 * Tu metabolismo de verdad (gasto diario real): lo que comiste en promedio menos lo que cambió el peso.
 * 1 kg de cuerpo ≈ 7700 kcal. Necesita 2 semanas con casi todas las comidas cargadas y 3 pesajes o más.
 */
export function gastoReal(comidas: Comida[], cuerpo: Medicion[]) {
  const dias = 21;
  const desde = sumarDias(hoy(), -dias);
  const porDia = new Map<string, number>();
  for (const c of comidas) if (c.fecha >= desde && c.fecha < hoy()) porDia.set(c.fecha, (porDia.get(c.fecha) ?? 0) + (Number(c.kcal) || 0));
  const cargados = [...porDia.values()].filter((k) => k > 800);
  const p = pendiente(cuerpo, 'peso', dias);
  const falta: string[] = [];
  if (cargados.length < 14) falta.push(`${14 - cargados.length} días más con todas las comidas cargadas`);
  if (!p || p.puntos < 3) falta.push(`${Math.max(1, 3 - (p?.puntos ?? 0))} pesajes más (en ayunas, separados por unos días)`);
  if (falta.length) return { gasto: null, falta, diasCargados: cargados.length };
  const media = cargados.reduce((s, k) => s + k, 0) / cargados.length;
  return { gasto: Math.round(media - p!.porDia * 7700), falta, diasCargados: cargados.length, media: Math.round(media), kgSemana: p!.porDia * 7 };
}

/** Qué decir de la tendencia según el objetivo (masa magra sin sumar panza). */
export function veredicto(t: ReturnType<typeof tendencia>, objetivoKgMes: number): { nivel: 'ok' | 'aviso' | 'info'; texto: string } {
  if (t.kgMes == null) return { nivel: 'info', texto: 'Pesate en ayunas 2 o 3 veces por semana y en 2 semanas te digo cómo venís.' };
  const kg = t.kgMes;
  if (t.cmMes != null && t.cmMes > 1 && kg > 0) return { nivel: 'aviso', texto: `La cintura sube ${t.cmMes.toFixed(1)} cm por mes: estás sumando algo de grasa. Bajá unas 200 kcal (sacá algo de aceite, dulces o pan).` };
  if (kg < objetivoKgMes * 0.4) return { nivel: 'aviso', texto: `Subís ${kg.toFixed(1)} kg por mes y la meta es ${objetivoKgMes}. Comé unas 250 kcal más por día (ej. un sándwich de huevo o avena con leche).` };
  if (kg > objetivoKgMes * 1.6) return { nivel: 'aviso', texto: `Subís ${kg.toFixed(1)} kg por mes: muy rápido para que sea todo músculo. Bajá unas 150 kcal por día.` };
  return { nivel: 'ok', texto: `Subís ${kg.toFixed(1)} kg por mes: buen ritmo para ganar masa sin sumar grasa.` };
}

/* ---------- Ritmo de comidas (ventanas sin comer) ---------- */

/** Hora de una comida: la que cargaste, o la hora en que la registraste. */
export function horaDe(c: Comida): string {
  if (c.hora) return c.hora;
  if (c.created_at) { const d = new Date(c.created_at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  return '12:00';
}
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0); };

export interface RitmoDia { fecha: string; comidas: number; primera: string; ultima: string; maxHueco: number; proteina: number; buenas: number }

/** Por día: cuántas comidas, el hueco más largo entre dos comidas (en horas) y cuántas llegaron a la proteína por comida. */
export function ritmoDia(comidas: Comida[], fecha: string, porComida: number): RitmoDia | null {
  const del = comidas.filter((c) => c.fecha === fecha).sort((a, b) => aMin(horaDe(a)) - aMin(horaDe(b)));
  if (!del.length) return null;
  let maxHueco = 0;
  for (let k = 1; k < del.length; k++) maxHueco = Math.max(maxHueco, (aMin(horaDe(del[k])) - aMin(horaDe(del[k - 1]))) / 60);
  return {
    fecha, comidas: del.length, primera: horaDe(del[0]), ultima: horaDe(del[del.length - 1]), maxHueco,
    proteina: del.reduce((s, c) => s + (Number(c.proteina) || 0), 0),
    buenas: del.filter((c) => Number(c.proteina) >= porComida * 0.75).length,
  };
}

export function ritmoSemana(comidas: Comida[], porComida: number) {
  const dias: RitmoDia[] = [];
  for (let k = 1; k <= 7; k++) { const r = ritmoDia(comidas, sumarDias(hoy(), -k), porComida); if (r) dias.push(r); }
  if (!dias.length) return null;
  const prom = (f: (r: RitmoDia) => number) => dias.reduce((s, r) => s + f(r), 0) / dias.length;
  return { dias, comidas: prom((r) => r.comidas), maxHueco: prom((r) => r.maxHueco), buenas: prom((r) => r.buenas), proteina: prom((r) => r.proteina) };
}

/** Horas desde la última comida (hoy, o anoche si hoy no comiste nada todavía). */
export function horasSinComer(comidas: Comida[]): number | null {
  const ahora = new Date();
  const ult = comidas.filter((c) => c.fecha === hoy() || c.fecha === sumarDias(hoy(), -1))
    .map((c) => { const [a, b] = horaDe(c).split(':').map(Number); const d = new Date(`${c.fecha}T00:00:00`); d.setHours(a, b || 0); return d.getTime(); })
    .filter((t) => t <= ahora.getTime()).sort((a, b) => b - a)[0];
  return ult == null ? null : (ahora.getTime() - ult) / 3600000;
}

/* ---------- Tabla de alimentos (por 100 g, valores de referencia) ---------- */

export interface Alimento { nombre: string; p: number; c: number; g: number; kcal: number; porcion: number; etiqueta: string }

/** Valores aproximados por 100 g (cocido cuando corresponde). porcion = gramos de una porción típica. */
export const ALIMENTOS: Alimento[] = [
  { nombre: 'Huevo', p: 12.6, c: 0.7, g: 9.5, kcal: 143, porcion: 50, etiqueta: '1 huevo' },
  { nombre: 'Pechuga de pollo', p: 31, c: 0, g: 3.6, kcal: 165, porcion: 150, etiqueta: '1 pechuga chica' },
  { nombre: 'Muslo de pollo sin piel', p: 26, c: 0, g: 8, kcal: 180, porcion: 150, etiqueta: '1 muslo grande' },
  { nombre: 'Carne magra (nalga, peceto)', p: 29, c: 0, g: 8, kcal: 190, porcion: 150, etiqueta: '1 bife' },
  { nombre: 'Carne picada común', p: 25, c: 0, g: 17, kcal: 255, porcion: 150, etiqueta: '1 porción' },
  { nombre: 'Milanesa de carne al horno', p: 22, c: 12, g: 10, kcal: 230, porcion: 150, etiqueta: '1 milanesa' },
  { nombre: 'Hamburguesa vacuna', p: 17, c: 2, g: 20, kcal: 250, porcion: 80, etiqueta: '1 medallón' },
  { nombre: 'Atún al natural', p: 25, c: 0, g: 1, kcal: 115, porcion: 120, etiqueta: '1 lata escurrida' },
  { nombre: 'Jamón cocido', p: 18, c: 1, g: 5, kcal: 120, porcion: 40, etiqueta: '2 fetas' },
  { nombre: 'Queso cremoso', p: 20, c: 1, g: 25, kcal: 310, porcion: 40, etiqueta: '1 trozo' },
  { nombre: 'Ricota', p: 11, c: 3, g: 10, kcal: 150, porcion: 100, etiqueta: '4 cucharadas' },
  { nombre: 'Leche entera', p: 3.2, c: 4.8, g: 3.2, kcal: 62, porcion: 250, etiqueta: '1 vaso' },
  { nombre: 'Yogur bebible', p: 2.8, c: 13, g: 2, kcal: 80, porcion: 200, etiqueta: '1 vaso' },
  { nombre: 'Proteína en polvo (whey)', p: 75, c: 8, g: 6, kcal: 380, porcion: 30, etiqueta: '1 medida' },
  { nombre: 'Lentejas cocidas', p: 9, c: 20, g: 0.4, kcal: 116, porcion: 200, etiqueta: '1 plato' },
  { nombre: 'Porotos cocidos', p: 8.7, c: 22, g: 0.5, kcal: 127, porcion: 200, etiqueta: '1 plato' },
  { nombre: 'Garbanzos cocidos', p: 8.9, c: 27, g: 2.6, kcal: 164, porcion: 200, etiqueta: '1 plato' },
  { nombre: 'Arroz blanco cocido', p: 2.7, c: 28, g: 0.3, kcal: 130, porcion: 200, etiqueta: '1 plato' },
  { nombre: 'Fideos cocidos', p: 5.8, c: 31, g: 0.9, kcal: 158, porcion: 250, etiqueta: '1 plato' },
  { nombre: 'Avena', p: 13, c: 60, g: 7, kcal: 380, porcion: 50, etiqueta: '5 cucharadas' },
  { nombre: 'Pan francés', p: 9, c: 55, g: 2, kcal: 280, porcion: 60, etiqueta: '1 pan' },
  { nombre: 'Pan lactal', p: 8, c: 49, g: 4, kcal: 265, porcion: 50, etiqueta: '2 fetas' },
  { nombre: 'Papa hervida', p: 2, c: 20, g: 0.1, kcal: 87, porcion: 200, etiqueta: '1 papa grande' },
  { nombre: 'Batata', p: 1.6, c: 20, g: 0.1, kcal: 86, porcion: 200, etiqueta: '1 batata' },
  { nombre: 'Banana', p: 1.1, c: 23, g: 0.3, kcal: 89, porcion: 120, etiqueta: '1 banana' },
  { nombre: 'Manzana', p: 0.3, c: 14, g: 0.2, kcal: 52, porcion: 150, etiqueta: '1 manzana' },
  { nombre: 'Ensalada (lechuga, tomate)', p: 1, c: 3.5, g: 0.2, kcal: 18, porcion: 150, etiqueta: '1 plato' },
  { nombre: 'Mantequilla de maní', p: 25, c: 20, g: 50, kcal: 590, porcion: 20, etiqueta: '1 cucharada' },
  { nombre: 'Maní tostado', p: 26, c: 16, g: 49, kcal: 570, porcion: 30, etiqueta: '1 puñado' },
  { nombre: 'Aceite', p: 0, c: 0, g: 100, kcal: 884, porcion: 10, etiqueta: '1 cucharada' },
  { nombre: 'Pizza de muzzarella', p: 11, c: 30, g: 10, kcal: 260, porcion: 120, etiqueta: '1 porción' },
  { nombre: 'Empanada de carne', p: 9, c: 25, g: 13, kcal: 250, porcion: 80, etiqueta: '1 empanada' },
];

export const macrosDe = (a: { p: number; c: number; g: number; kcal: number }, gramos: number) => {
  const k = gramos / 100;
  return { proteina: Math.round(a.p * k * 10) / 10, carbos: Math.round(a.c * k * 10) / 10, grasas: Math.round(a.g * k * 10) / 10, kcal: Math.round(a.kcal * k) };
};

/* ---------- Código de barras: Open Food Facts ---------- */

export interface ProductoEscaneado { nombre: string; marca: string; p: number; c: number; g: number; kcal: number; porcion: number | null }

/** Busca el producto por código en Open Food Facts (base libre, tiene muchos productos argentinos). */
export async function buscarPorCodigo(ean: string): Promise<ProductoEscaneado | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=product_name,product_name_es,brands,nutriments,serving_quantity`);
  if (!r.ok) return null;
  const d = await r.json();
  const pr = d?.product;
  if (!pr || d.status === 0) return null;
  const n = pr.nutriments ?? {};
  const kcal = Number(n['energy-kcal_100g']) || (Number(n.energy_100g) ? Number(n.energy_100g) / 4.184 : 0);
  return {
    nombre: String(pr.product_name_es || pr.product_name || 'Producto'), marca: String(pr.brands ?? '').split(',')[0],
    p: Number(n.proteins_100g) || 0, c: Number(n.carbohydrates_100g) || 0, g: Number(n.fat_100g) || 0, kcal: Math.round(kcal),
    porcion: Number(pr.serving_quantity) || null,
  };
}

/* ---------- Qué comer para llegar a la meta ---------- */

/** Opciones rápidas de proteína (lo que se puede comer sin cocinar mucho). */
const RAPIDAS: Array<{ texto: string; nombre: string; gramos: number }> = [
  { texto: '3 huevos revueltos', nombre: 'Huevo', gramos: 150 },
  { texto: '1 lata de atún', nombre: 'Atún al natural', gramos: 120 },
  { texto: '1 pechuga a la plancha', nombre: 'Pechuga de pollo', gramos: 180 },
  { texto: '1 bife de nalga', nombre: 'Carne magra (nalga, peceto)', gramos: 180 },
  { texto: 'Avena con leche (50 g + 1 vaso)', nombre: 'Avena', gramos: 50 },
  { texto: '1 plato de lentejas', nombre: 'Lentejas cocidas', gramos: 250 },
  { texto: 'Sándwich de jamón y queso', nombre: 'Jamón cocido', gramos: 40 },
  { texto: '1 medida de proteína en polvo', nombre: 'Proteína en polvo (whey)', gramos: 30 },
];

export function opcionesProteina() {
  return RAPIDAS.map((o) => {
    const a = ALIMENTOS.find((x) => x.nombre === o.nombre)!;
    const m = macrosDe(a, o.gramos);
    // Las combinadas suman lo que acompaña.
    if (o.nombre === 'Avena') { m.proteina += 8; m.kcal += 155; m.carbos += 12; m.grasas += 8; }
    if (o.nombre === 'Jamón cocido') { m.proteina += 8 + 9; m.kcal += 125 + 133; m.carbos += 25; m.grasas += 10; }
    return { texto: o.texto, ...m };
  });
}

