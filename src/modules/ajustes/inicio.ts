import { almacen, crear, recargar } from '../../core/db';
import { hoy, sumarMeses } from '../../core/format';
import { COLORES, T, type Categoria, type Cuenta, type FrecuenciaCobro, type Ingreso, type Pago, type TipoCuenta } from '../economia/modelo';
import { METAS_BASE, TA, type Metas, type Plato } from '../alimentacion/modelo';
import { TD, type BloquePlantilla, type TipoBloque } from '../dia/modelo';
import { TS, type Lugar, type Producto, type Unidad } from '../stock/modelo';
import { TC, type CadenaSuper, type Super } from '../compras/modelo';
import { ETAPAS_BASE, TABLA_TABLERO } from '../tablero/modelo';
import { empezarCiclo, TE } from '../entrenamiento/modelo';
import { leerTabla, PRESETS } from '../entrenamiento/tabla';

/**
 * Configuración inicial para cualquier cuenta nueva (2026-11-18, boceto diseno/bienvenida-boceto.html).
 * La persona elige qué áreas usa y acá se carga SOLO lo genérico de esas áreas: nada de datos de otra persona.
 * Todo es idempotente por nombre (si ya existe, no se duplica) y todas las escrituras van seguidas,
 * así "Guardado · DESHACER" vuelve atrás la carga entera.
 */

/** Áreas que se pueden elegir. id = id del módulo (lo que filtra el menú). */
export const AREAS: Array<{ id: string; icono: string; nombre: string; ayuda: string }> = [
  { id: 'dia', icono: '🗓', nombre: 'Día', ayuda: 'Tu horario, tareas y prioridades' },
  { id: 'economia', icono: '💰', nombre: 'Plata', ayuda: 'Gastos, cobros y cuánto te queda' },
  { id: 'pagos', icono: '🧾', nombre: 'Pagos', ayuda: 'Vencimientos que se repiten' },
  { id: 'tablero', icono: '📌', nombre: 'Pendientes', ayuda: 'Ideas y cosas por hacer' },
  { id: 'entrenamiento', icono: '🏋', nombre: 'Entreno', ayuda: 'Rutina del gym y progreso' },
  { id: 'alimentacion', icono: '🍽', nombre: 'Comida', ayuda: 'Qué comés, proteína y agua' },
  { id: 'stock', icono: '🏠', nombre: 'En casa', ayuda: 'Lo que hay en heladera y alacena' },
  { id: 'compras', icono: '🛒', nombre: 'Compras', ayuda: 'Lista del súper y precios' },
  { id: 'whatsapp', icono: '💬', nombre: 'WhatsApp', ayuda: 'Tus chats dentro de LIFE' },
];

export const ATAJOS: Array<[string, string[]]> = [
  ['Todo', ['dia', 'economia', 'pagos', 'tablero', 'entrenamiento', 'alimentacion', 'stock', 'compras']],
  ['Ordenar la plata', ['economia', 'pagos']],
  ['Cuerpo', ['entrenamiento', 'alimentacion']],
  ['La casa', ['stock', 'compras', 'alimentacion']],
  ['Organizarme', ['dia', 'tablero']],
];

export const LUGARES_PLATA: Array<[string, TipoCuenta]> = [
  ['Efectivo', 'efectivo'], ['Mercado Pago', 'billetera'], ['Banco', 'banco'], ['Ualá', 'billetera'], ['Inversiones', 'inversion'],
];

export const FIJOS: Array<[string, number]> = [
  ['Alquiler', 5], ['Expensas', 10], ['Luz', 15], ['Gas', 15], ['Agua', 15], ['Internet', 10], ['Celular', 10],
  ['Gimnasio', 5], ['Streaming', 1], ['Tarjeta', 10], ['Seguro', 10], ['Cuota', 10],
];

export const CATEGORIAS_TABLERO = ['Trabajo', 'Casa', 'Plata', 'Trámites', 'Estudio', 'Salud', 'Ideas'];

/** Básicos por lugar: [nombre, lugar, unidad, mínimo, cuánto comprar]. */
export const BASICOS: Array<{ grupo: string; cosas: Array<[string, Lugar, Unidad, number, number]> }> = [
  { grupo: 'Heladera', cosas: [['Leche', 'heladera', 'l', 1, 2], ['Huevos', 'heladera', 'u', 6, 12], ['Queso', 'heladera', 'g', 200, 500],
    ['Manteca', 'heladera', 'u', 1, 1], ['Verduras', 'frutas', 'u', 2, 4], ['Frutas', 'frutas', 'u', 3, 6]] },
  { grupo: 'Alacena', cosas: [['Fideos', 'alacena', 'paq', 1, 2], ['Arroz', 'alacena', 'paq', 1, 1], ['Aceite', 'alacena', 'u', 1, 1],
    ['Yerba', 'alacena', 'paq', 1, 1], ['Café', 'alacena', 'u', 1, 1], ['Azúcar', 'alacena', 'paq', 1, 1], ['Latas', 'alacena', 'u', 2, 4], ['Pan', 'alacena', 'u', 1, 1]] },
  { grupo: 'Baño y limpieza', cosas: [['Papel higiénico', 'bano', 'u', 4, 8], ['Jabón', 'bano', 'u', 1, 2], ['Detergente', 'limpieza', 'u', 1, 1],
    ['Lavandina', 'limpieza', 'u', 1, 1], ['Rollo de cocina', 'limpieza', 'u', 1, 2]] },
];

/** Platos de ejemplo con macros aproximados por porción (sin ingredientes: cada uno los arma después). */
export const PLATOS: Array<Omit<Plato, 'id' | 'ingredientes'>> = [
  { nombre: 'Milanesas', proteina: 45, carbos: 30, grasas: 18, kcal: 470, minutos: 30 },
  { nombre: 'Fideos', proteina: 18, carbos: 90, grasas: 10, kcal: 530, minutos: 15 },
  { nombre: 'Arroz con pollo', proteina: 40, carbos: 70, grasas: 12, kcal: 560, minutos: 35 },
  { nombre: 'Ensalada', proteina: 10, carbos: 15, grasas: 12, kcal: 210, minutos: 10 },
  { nombre: 'Tortilla', proteina: 16, carbos: 35, grasas: 14, kcal: 330, minutos: 30 },
  { nombre: 'Tostadas con huevo', proteina: 18, carbos: 30, grasas: 11, kcal: 300, minutos: 10 },
  { nombre: 'Avena', proteina: 14, carbos: 60, grasas: 8, kcal: 370, minutos: 5 },
  { nombre: 'Guiso', proteina: 30, carbos: 60, grasas: 15, kcal: 500, minutos: 60 },
  { nombre: 'Pizza casera', proteina: 25, carbos: 80, grasas: 20, kcal: 600, minutos: 45 },
  { nombre: 'Empanadas', proteina: 20, carbos: 50, grasas: 22, kcal: 480, minutos: 40 },
];

export const SUPERS: Array<[string, CadenaSuper]> = [
  ['Carrefour', 'carrefour'], ['Vea', 'vea'], ['Jumbo', 'jumbo'], ['Chino del barrio', 'otro'], ['Mayorista', 'otro'], ['Verdulería', 'otro'],
];

export type Objetivo = 'salud' | 'masa' | 'fuerza' | 'bajar';
export type Experiencia = 'empiezo' | 'intermedio' | 'avanzado';

export interface Cobro { nombre: string; monto: string; frecuencia: FrecuenciaCobro }
export interface Fijo { nombre: string; monto: string; dia: string }
export interface Actividad { nombre: string; dias: number[]; desde: string; hasta: string }

/** Todo lo que junta la bienvenida. Se guarda tal cual en el perfil (perfiles.bienvenida). */
export interface DatosInicio {
  version: 2;
  nombre: string;
  areas: string[];
  plata: Record<string, string>;      // lugar → saldo de hoy (texto)
  cobros: Cobro[];
  fijos: Fijo[];
  despierta: string;
  duerme: string;
  actividades: Actividad[];
  categorias: string[];               // del tablero
  diasGym: number;
  experiencia: Experiencia;
  objetivo: Objetivo;
  peso: string;
  altura: string;
  edad: string;
  noCome: string;
  platos: string[];
  basicos: string[];
  supers: string[];
  /** Con quién reparte compras (aparece en Compras como "Yo / <nombre> / Los dos"). */
  comparte: string;
  /** Áreas que usa pero saltó: se ven en el menú y no se les carga nada. */
  saltadas: string[];
  fecha?: string;
}

export const datosVacios = (nombre = ''): DatosInicio => ({
  version: 2, nombre, areas: ['dia', 'economia', 'pagos', 'tablero'],
  plata: { Efectivo: '', 'Mercado Pago': '' }, cobros: [], fijos: [],
  despierta: '08:00', duerme: '00:00', actividades: [],
  categorias: ['Trabajo', 'Casa', 'Plata', 'Ideas'],
  diasGym: 3, experiencia: 'empiezo', objetivo: 'salud', peso: '', altura: '', edad: '', noCome: '',
  platos: [], basicos: ['Leche', 'Huevos', 'Fideos', 'Arroz', 'Aceite', 'Yerba', 'Papel higiénico', 'Detergente'],
  supers: [], comparte: '', saltadas: [],
});

export const numero = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

/** Qué rutina de inicio le toca según días y experiencia (presets genéricos de tabla.ts). */
export function presetPara(dias: number, exp: Experiencia) {
  const id = dias >= 4 ? 'tp4' : exp === 'empiezo' ? 'fb3' : 'hip3';
  return PRESETS.find((p) => p.id === id)!;
}

/** Metas de comida según peso y objetivo. Sin peso, las generales. */
export function metasPara(d: Pick<DatosInicio, 'peso' | 'objetivo'>): Omit<Metas, 'id'> {
  const peso = numero(d.peso);
  if (peso < 30 || peso > 250) return METAS_BASE;
  const ajuste = d.objetivo === 'masa' ? 300 : d.objetivo === 'bajar' ? -400 : 0;
  const base = Math.round((peso * 31 + ajuste) / 50) * 50;
  return {
    ...METAS_BASE,
    proteina_descanso: Math.round(peso * 1.6),
    proteina_entreno: Math.round(peso * (d.objetivo === 'masa' || d.objetivo === 'fuerza' ? 2 : 1.8)),
    kcal_descanso: base, kcal_entreno: base + 250, agua_ml: Math.round((peso * 35) / 100) * 100,
  };
}

/** Lo que se va a cargar, en palabras, por área (para el resumen final). */
export function resumenDe(d: DatosInicio): Array<[string, string]> {
  const usa = (id: string) => d.areas.includes(id);
  const sal: Array<[string, string]> = [];
  const n = (x: number, uno: string, varios: string) => `${x} ${x === 1 ? uno : varios}`;
  if (usa('dia')) sal.push(['dia', `tu semana tipo (dormir de ${d.duerme} a ${d.despierta}${d.actividades.length ? ` y ${n(d.actividades.length, 'actividad', 'actividades')}` : ''})`]);
  if (usa('economia')) sal.push(['economia', `${n(Object.keys(d.plata).length, 'lugar', 'lugares')} para tu plata, ${n(d.cobros.filter((c) => c.nombre && numero(c.monto)).length, 'cobro', 'cobros')} y categorías comunes`]);
  if (usa('pagos')) sal.push(['pagos', n(d.fijos.filter((f) => f.nombre).length, 'gasto fijo', 'gastos fijos')]);
  if (usa('tablero')) sal.push(['tablero', `Por hacer / En proceso / Hecho con ${n(d.categorias.length, 'categoría', 'categorías')}`]);
  if (usa('entrenamiento')) sal.push(['entrenamiento', `rutina «${leerTabla(presetPara(d.diasGym, d.experiencia).tabla).nombre}»`]);
  if (usa('alimentacion')) {
    const m = metasPara(d);
    sal.push(['alimentacion', `metas de ${m.proteina_descanso}–${m.proteina_entreno} g de proteína${d.platos.length ? ` y ${n(d.platos.length, 'plato', 'platos')}` : ''}`]);
  }
  if (usa('stock')) sal.push(['stock', n(d.basicos.length, 'básico', 'básicos')]);
  if (usa('compras')) sal.push(['compras', `${d.supers.length ? `${d.supers.length} súper` : 'tu lista de compras'}${d.comparte.trim() ? ` y reparto con ${d.comparte.trim()}` : ''}`]);
  if (usa('whatsapp')) sal.push(['whatsapp', 'se conecta después desde su sección (escaneando un QR)']);
  return sal;
}

/** Próxima fecha con ese día del mes. */
function proximoDia(dia: number): string {
  const h = hoy();
  const d = Math.min(28, Math.max(1, dia || 1));
  const esteMes = `${h.slice(0, 8)}${String(d).padStart(2, '0')}`;
  return esteMes >= h ? esteMes : sumarMeses(esteMes, 1, d);
}

const CATEGORIAS_PLATA: Array<Pick<Categoria, 'nombre' | 'tipo'>> = [
  { nombre: 'Sueldo', tipo: 'ingreso' }, { nombre: 'Otros ingresos', tipo: 'ingreso' },
  ...['Súper', 'Verdulería', 'Carnicería', 'Delivery', 'Salidas', 'Transporte', 'Salud', 'Ropa', 'Regalos', 'Vivienda', 'Servicios', 'Deporte', 'Suscripciones']
    .map((nombre) => ({ nombre, tipo: 'gasto' as const })),
];

const aMin = (h: string) => { const [a, b] = (h || '00:00').split(':').map(Number); return a * 60 + (b || 0); };
const aHora = (m: number) => (m >= 1440 ? '24:00' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

/** Bloques de un día de la semana tipo: dormir, actividades fijas de ese día y el resto en casa. Nada se pisa. */
export function bloquesDelDia(d: Pick<DatosInicio, 'despierta' | 'duerme' | 'actividades'>, dia: number): Array<Omit<BloquePlantilla, 'id' | 'dia_semana'>> {
  const despierta = aMin(d.despierta);
  const duerme = aMin(d.duerme) || 1440; // 00:00 = medianoche
  const ocupado: Array<{ ini: number; fin: number; titulo: string; tipo: TipoBloque }> = [];
  if (despierta > 0) ocupado.push({ ini: 0, fin: despierta, titulo: 'Dormir', tipo: 'descanso' });
  if (duerme < 1440 && duerme > despierta) ocupado.push({ ini: duerme, fin: 1440, titulo: 'Dormir', tipo: 'descanso' });
  for (const t of d.actividades.filter((x) => x.dias.includes(dia))) {
    const ini = aMin(t.desde), fin = aMin(t.hasta) || 1440;
    if (fin > ini) ocupado.push({ ini, fin, titulo: t.nombre.trim() || 'Trabajo', tipo: 'otro' });
  }
  ocupado.sort((a, b) => a.ini - b.ini);
  const salida: Array<Omit<BloquePlantilla, 'id' | 'dia_semana'>> = [];
  let cursor = 0;
  for (const o of ocupado) {
    const ini = Math.max(o.ini, cursor);
    if (o.fin <= ini) continue;
    if (ini > cursor) salida.push({ inicio: aHora(cursor), fin: aHora(ini), titulo: 'En casa', tipo: 'casa' });
    salida.push({ inicio: aHora(ini), fin: aHora(o.fin), titulo: o.titulo, tipo: o.tipo });
    cursor = o.fin;
  }
  if (cursor < 1440) salida.push({ inicio: aHora(cursor), fin: '24:00', titulo: 'En casa', tipo: 'casa' });
  return salida;
}

/** Carga en la cuenta lo elegido. Devuelve cuántas cosas agregó. */
export async function cargarInicio(d: DatosInicio): Promise<number> {
  const usa = (id: string) => d.areas.includes(id) && !d.saltadas.includes(id);
  let n = 0;
  const lista = <F>(tabla: string) => almacen.listar<F & { id: string; nombre?: string }>(tabla);
  const existe = async (tabla: string, nombre: string) =>
    (await lista<{ nombre: string }>(tabla)).some((x) => x.nombre?.toLowerCase() === nombre.trim().toLowerCase());
  const nuevo = async <F extends { id: string }>(tabla: string, datos: Omit<F, 'id'>) => { n++; return crear<F>(tabla, datos); };

  // Plata: lugares, categorías y cobros.
  let principal: string | null = null;
  if (usa('economia') || usa('pagos')) {
    const cuentas = await lista<Cuenta>(T.cuentas);
    for (const [nombre, tipo] of LUGARES_PLATA) {
      if (d.plata[nombre] === undefined) continue;
      const ya = cuentas.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
      const c = ya ?? await nuevo<Cuenta>(T.cuentas, { nombre, tipo, moneda: 'ARS', saldo_inicial: numero(d.plata[nombre] ?? ''), archivada: false });
      principal ??= c.id;
    }
    principal ??= cuentas[0]?.id ?? null;
    const cats = await lista<Categoria>(T.categorias);
    let i = cats.length;
    for (const c of CATEGORIAS_PLATA) {
      if (cats.some((x) => x.nombre.toLowerCase() === c.nombre.toLowerCase())) continue;
      await nuevo<Categoria>(T.categorias, { ...c, color: COLORES[i++ % COLORES.length], presupuesto: null });
    }
  }
  const cats = await lista<Categoria>(T.categorias);
  const cat = (nombre: string) => cats.find((c) => c.nombre === nombre)?.id ?? null;

  if (usa('economia')) {
    for (const c of d.cobros.filter((x) => x.nombre.trim() && numero(x.monto) > 0)) {
      if (await existe(T.ingresos, c.nombre)) continue;
      await nuevo<Ingreso>(T.ingresos, {
        nombre: c.nombre.trim(), monto: numero(c.monto), moneda: 'ARS', frecuencia: c.frecuencia, proximo_cobro: hoy(),
        cuenta_id: principal, categoria_id: cat('Sueldo'), activo: true, notas: '', puede_adeudarse: false, adeudado: 0,
      });
    }
  }

  if (usa('pagos')) {
    for (const f of d.fijos.filter((x) => x.nombre.trim() && numero(x.monto) > 0)) {
      if (await existe(T.pagos, f.nombre)) continue;
      const dia = Math.round(numero(f.dia)) || 10;
      await nuevo<Pago>(T.pagos, {
        nombre: f.nombre.trim(), monto: numero(f.monto), moneda: 'ARS', frecuencia: 'mensual', dia, proximo_vencimiento: proximoDia(dia),
        categoria_id: cat(/alquiler|expensas/i.test(f.nombre) ? 'Vivienda' : /gimnasio/i.test(f.nombre) ? 'Deporte' : /streaming/i.test(f.nombre) ? 'Suscripciones' : 'Servicios'),
        cuenta_id: principal, activo: true, notas: '',
      });
    }
  }

  // Día: la semana tipo solo si todavía no tiene una.
  if (usa('dia') && !(await lista(TD.plantilla)).length) {
    for (let dia = 0; dia < 7; dia++) for (const b of bloquesDelDia(d, dia)) await nuevo<BloquePlantilla>(TD.plantilla, { ...b, dia_semana: dia });
  }

  // Tablero: sus categorías (solo si todavía no configuró el tablero).
  if (usa('tablero') && d.categorias.length && !(await lista(TABLA_TABLERO)).length) {
    await nuevo(TABLA_TABLERO, { etapas: ETAPAS_BASE, categorias: d.categorias });
  }

  // Entreno: rutina de inicio solo si no tiene ninguna.
  if (usa('entrenamiento') && !(await lista(TE.rutinas)).length) {
    const r = leerTabla(presetPara(d.diasGym, d.experiencia).tabla);
    await empezarCiclo(r.dias, { nombre: r.nombre, notas: r.notas, ciclo: r.ciclo }, null);
    n++;
  }

  // Comida: metas y platos.
  if (usa('alimentacion')) {
    if (!(await lista(TA.metas)).length) {
      await nuevo<Metas>(TA.metas, metasPara(d));
    }
    for (const nombre of d.platos) {
      const p = PLATOS.find((x) => x.nombre === nombre);
      if (!p || await existe(TA.platos, nombre)) continue;
      await nuevo<Plato>(TA.platos, { ...p, ingredientes: [] });
    }
  }

  // En casa: básicos (cantidad 0: la persona cuenta lo que tiene).
  if (usa('stock')) {
    for (const g of BASICOS) for (const [nombre, lugar, unidad, minimo, compra] of g.cosas) {
      if (!d.basicos.includes(nombre) || await existe(TS.productos, nombre)) continue;
      await nuevo<Producto>(TS.productos, { nombre, lugar, unidad, minimo, compra, cantidad: 0, vence: null, basico: true });
    }
  }

  // Compras: sus súper.
  if (usa('compras')) {
    for (const nombre of d.supers) {
      const s = SUPERS.find(([x]) => x === nombre);
      if (!s || await existe(TC.supers, nombre)) continue;
      await nuevo<Super>(TC.supers, { nombre, cadena: s[1], bloques: [] });
    }
  }

  await Promise.all([T.cuentas, T.categorias, T.ingresos, T.pagos, TD.plantilla, TABLA_TABLERO, TE.rutinas, TA.metas, TA.platos, TS.productos, TC.supers].map((t) => recargar(t)));
  return n;
}
