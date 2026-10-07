import { crear, type Fila, modificar, useTabla } from '../../core/db';
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
}

export const TA = { platos: 'ali_platos', comidas: 'ali_comidas', extras: 'ali_extras', metas: 'ali_metas' } as const;
export const usePlatos = () => useTabla<Plato>(TA.platos);
export const useComidas = () => useTabla<Comida>(TA.comidas);
export const useExtras = () => useTabla<Extra>(TA.extras);
export const useMetas = () => useTabla<Metas>(TA.metas);

/**
 * Metas de arranque para ganar masa (~1,8 g de proteína por kg en ~75 kg y leve superávit).
 * Son aproximadas: se ajustan en la pantalla Metas cuando tengas tu peso.
 */
export const METAS_BASE: Omit<Metas, 'id'> = {
  proteina_entreno: 140, proteina_descanso: 120, kcal_entreno: 2800, kcal_descanso: 2500, agua_ml: 2500, suplementos: '',
};

export function metasDelDia(metas: Metas[], entreno: boolean) {
  const m = metas[0] ?? METAS_BASE;
  return { proteina: entreno ? m.proteina_entreno : m.proteina_descanso, kcal: entreno ? m.kcal_entreno : m.kcal_descanso, agua: m.agua_ml };
}

export async function guardarMetas(metas: Metas[], datos: Omit<Metas, 'id'>) {
  if (metas[0]) await modificar<Metas>(TA.metas, metas[0].id, datos);
  else await crear<Metas>(TA.metas, datos);
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
  await crear<Comida>(TA.comidas, c);
  if (plato) await descontar(productos, (plato.ingredientes ?? []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad * porciones })));
}
