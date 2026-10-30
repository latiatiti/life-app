import { crear, type Fila, modificar, useTabla } from '../../core/db';
import { hoy } from '../../core/format';
import { armarDia, useDias, usePlantilla, useTareas } from '../dia/modelo';
import { entrenoHoy, useSesiones } from '../entrenamiento/modelo';
import { descontar, type Producto } from '../stock/modelo';

export const MOMENTOS = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena', colacion: 'Colación' } as const;
export type Momento = keyof typeof MOMENTOS;

export interface Ingrediente {
  producto_id: string;
  cantidad: number;
}

/** Plato que repetís: con ingredientes del stock y macros aproximados por porción. */
export interface Plato extends Fila {
  nombre: string;
  ingredientes: Ingrediente[];
  proteina: number;
  carbos: number;
  grasas: number;
  kcal: number;
  minutos: number;
}

export interface Comida extends Fila {
  fecha: string;
  momento: Momento;
  plato_id: string | null;
  descripcion: string;
  proteina: number;
  carbos: number;
  grasas: number;
  kcal: number;
  /** Hora en que comiste ('HH:MM'); si falta, vale la hora en que se registró. */
  hora?: string | null;
}

/** Agua y suplementos. */
export interface Extra extends Fila {
  fecha: string;
  tipo: 'agua' | 'suplemento';
  nombre: string;
  cantidad: number;
}

/** Metas diarias. Una sola fila. Los días de entreno piden más proteína y calorías. */
export interface Metas extends Fila {
  proteina_entreno: number;
  proteina_descanso: number;
  kcal_entreno: number;
  kcal_descanso: number;
  agua_ml: number;
  suplementos: string;
  /** Altura, edad, actividad y objetivo para calcular las metas (ver nutricion.ts). */
  perfil?: Partial<import('./nutricion').Perfil>;
}

export const TA = { platos: 'ali_platos', comidas: 'ali_comidas', extras: 'ali_extras', metas: 'ali_metas' } as const;
export const usePlatos = () => useTabla<Plato>(TA.platos);
export const useComidas = () => useTabla<Comida>(TA.comidas);
export const useExtras = () => useTabla<Extra>(TA.extras);
export const useMetas = () => useTabla<Metas>(TA.metas);

/**
 * Metas de arranque para ganar masa con lo que contó (1,82 m, ~80 kg, actividad alta): 1,8–2 g de proteína
 * por kilo y un superávit chico. Se recalculan en la pestaña Cuerpo con tu peso y edad.
 */
export const METAS_BASE: Omit<Metas, 'id'> = {
  proteina_entreno: 160, proteina_descanso: 145, kcal_entreno: 3350, kcal_descanso: 3000, agua_ml: 3250, suplementos: 'Creatina',
};

/** Si la nube todavía no tiene una columna nueva (hora, perfil), guarda igual sin ella. */
async function sinColumnaNueva<T>(f: (sin: boolean) => Promise<T>): Promise<T> {
  try {
    return await f(false);
  } catch (e) {
    if (/hora|perfil|column/i.test((e as Error).message)) return f(true);
    throw e;
  }
}

export function metasDelDia(metas: Metas[], entreno: boolean) {
  const m = metas[0] ?? METAS_BASE;
  return { proteina: entreno ? m.proteina_entreno : m.proteina_descanso, kcal: entreno ? m.kcal_entreno : m.kcal_descanso, agua: m.agua_ml };
}

export async function guardarMetas(metas: Metas[], datos: Partial<Omit<Metas, 'id'>>) {
  await sinColumnaNueva(async (sin) => {
    const d = { ...datos };
    if (sin) delete d.perfil;
    if (metas[0]) await modificar<Metas>(TA.metas, metas[0].id, d);
    else await crear<Metas>(TA.metas, { ...METAS_BASE, ...d });
  });
}

export function totalesDia(comidas: Comida[], fecha: string) {
  const t = { proteina: 0, carbos: 0, grasas: 0, kcal: 0 };
  for (const c of comidas) {
    if (c.fecha !== fecha) continue;
    t.proteina += Number(c.proteina) || 0;
    t.carbos += Number(c.carbos) || 0;
    t.grasas += Number(c.grasas) || 0;
    t.kcal += Number(c.kcal) || 0;
  }
  return t;
}

/** ¿Alcanza el stock para hacer el plato? Devuelve lo que falta. */
export function faltaPara(plato: Plato, productos: Producto[]): Array<{ nombre: string; falta: number; unidad: string }> {
  const r = [];
  for (const i of plato.ingredientes ?? []) {
    const p = productos.find((x) => x.id === i.producto_id);
    const hay = Number(p?.cantidad) || 0;
    if (hay < i.cantidad) r.push({ nombre: p?.nombre ?? 'Ingrediente borrado', falta: Math.round((i.cantidad - hay) * 100) / 100, unidad: p?.unidad ?? '' });
  }
  return r;
}

/** Registrar una comida: si es un plato, descuenta sus ingredientes del stock (cruce Alimentación → Stock). */
export async function registrarComida(c: Omit<Comida, 'id'>, plato: Plato | null, productos: Producto[], porciones = 1) {
  await sinColumnaNueva((sin) => {
    const d = { ...c };
    if (sin) delete d.hora;
    return crear<Comida>(TA.comidas, d);
  });
  if (plato) await descontar(productos, (plato.ingredientes ?? []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad * porciones })));
}

/** ¿Hoy es día de entreno? Si ya entrenaste, o si el plan del día (módulo Día) tiene gimnasio. */
export function useDiaDeEntreno(): boolean {
  const { filas: sesiones } = useSesiones();
  const { filas: plantilla } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  return entrenoHoy(sesiones) || armarDia(hoy(), plantilla, dias, tareas).bloques.some((b) => b.tipo === 'gym');
}
