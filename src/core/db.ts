import { useEffect, useSyncExternalStore } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { configNube, escribirStorage, leerStorage } from './config';
import { uid } from './format';

/**
 * Capa de datos: una sola forma de leer y guardar para todos los módulos.
 * Los módulos nunca hablan con Supabase ni con el navegador directamente,
 * así se puede cambiar el destino sin tocarlos.
 */
export interface Fila {
  id: string;
  created_at?: string;
}

export interface Almacen {
  tipo: 'local' | 'nube';
  listar<T extends Fila>(tabla: string): Promise<T[]>;
  insertar<T extends Fila>(tabla: string, fila: T): Promise<T>;
  /** Inserta muchas filas de una vez (importar respaldos sin esperar fila por fila). */
  insertarVarios(tabla: string, filas: Fila[]): Promise<void>;
  actualizar<T extends Fila>(tabla: string, id: string, cambios: Partial<T>): Promise<void>;
  borrar(tabla: string, id: string): Promise<void>;
}

/* ---------- Modo local: guarda en el navegador (con respaldo en memoria) ---------- */

class AlmacenLocal implements Almacen {
  tipo = 'local' as const;
  private memoria = new Map<string, Fila[]>();

  private leer<T extends Fila>(tabla: string): T[] {
    if (!this.memoria.has(tabla)) {
      const raw = leerStorage(`life.data.${tabla}`);
      let filas: Fila[] = [];
      try {
        filas = raw ? (JSON.parse(raw) as Fila[]) : [];
      } catch {
        filas = [];
      }
      this.memoria.set(tabla, filas);
    }
    return this.memoria.get(tabla) as T[];
  }

  private escribir(tabla: string, filas: Fila[]) {
    this.memoria.set(tabla, filas);
    escribirStorage(`life.data.${tabla}`, JSON.stringify(filas));
  }

  async listar<T extends Fila>(tabla: string) {
    return [...this.leer<T>(tabla)];
  }
  async insertar<T extends Fila>(tabla: string, fila: T) {
    const nueva = { ...fila, created_at: fila.created_at ?? new Date().toISOString() };
    this.escribir(tabla, [...this.leer(tabla), nueva]);
    return nueva;
  }
  async insertarVarios(tabla: string, filas: Fila[]) {
    const ahora = new Date().toISOString();
    this.escribir(tabla, [...this.leer(tabla), ...filas.map((f) => ({ ...f, created_at: f.created_at ?? ahora }))]);
  }
  async actualizar<T extends Fila>(tabla: string, id: string, cambios: Partial<T>) {
    this.escribir(
      tabla,
      this.leer(tabla).map((f) => (f.id === id ? { ...f, ...cambios, id } : f))
    );
  }
  async borrar(tabla: string, id: string) {
    this.escribir(
      tabla,
      this.leer(tabla).filter((f) => f.id !== id)
    );
  }
}

/* ---------- Modo nube: Supabase ---------- */

class AlmacenNube implements Almacen {
  tipo = 'nube' as const;
  constructor(private cliente: SupabaseClient) {}

  async listar<T extends Fila>(tabla: string) {
    const { data, error } = await this.cliente.from(tabla).select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  }
  async insertar<T extends Fila>(tabla: string, fila: T) {
    const { data, error } = await this.cliente.from(tabla).insert(fila).select().single();
    if (error) throw new Error(error.message);
    return data as T;
  }
  async insertarVarios(tabla: string, filas: Fila[]) {
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await this.cliente.from(tabla).insert(filas.slice(i, i + 200));
      if (error) throw new Error(`${tabla}: ${error.message}`);
    }
  }
  async actualizar<T extends Fila>(tabla: string, id: string, cambios: Partial<T>) {
    const { error } = await this.cliente.from(tabla).update(cambios as Record<string, unknown>).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async borrar(tabla: string, id: string) {
    const { error } = await this.cliente.from(tabla).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}

/* ---------- Instancia activa ---------- */

let cliente: SupabaseClient | null = null;
const cfg = configNube();
if (cfg) {
  try {
    cliente = createClient(cfg.url, cfg.anonKey);
  } catch {
    cliente = null;
  }
}

export const supabase = cliente;
export const almacen: Almacen = cliente ? new AlmacenNube(cliente) : new AlmacenLocal();

/* ---------- Caché compartida + hook para React ---------- */

interface EstadoTabla {
  filas: Fila[];
  cargado: boolean;
  error: string | null;
  cargando: boolean;
}

const cache = new Map<string, EstadoTabla>();
const oyentes = new Map<string, Set<() => void>>();
const VACIO: EstadoTabla = { filas: [], cargado: false, error: null, cargando: false };

function estado(tabla: string): EstadoTabla {
  return cache.get(tabla) ?? VACIO;
}

function fijar(tabla: string, e: Partial<EstadoTabla>) {
  cache.set(tabla, { ...estado(tabla), ...e });
  oyentes.get(tabla)?.forEach((fn) => fn());
}

export async function recargar(tabla: string) {
  if (estado(tabla).cargando) return;
  fijar(tabla, { cargando: true });
  try {
    const filas = await almacen.listar(tabla);
    fijar(tabla, { filas, cargado: true, error: null, cargando: false });
  } catch (e) {
    fijar(tabla, { cargado: true, error: (e as Error).message, cargando: false });
  }
}

export function recargarTodo() {
  cache.forEach((_, tabla) => void recargar(tabla));
}

function suscribir(tabla: string, fn: () => void) {
  if (!oyentes.has(tabla)) oyentes.set(tabla, new Set());
  oyentes.get(tabla)!.add(fn);
  return () => oyentes.get(tabla)!.delete(fn);
}

/** Lee una tabla y se actualiza sola cuando cualquier módulo la modifica. */
export function useTabla<T extends Fila>(tabla: string) {
  const e = useSyncExternalStore(
    (fn) => suscribir(tabla, fn),
    () => estado(tabla)
  );
  useEffect(() => {
    if (!estado(tabla).cargado) void recargar(tabla);
  }, [tabla]);
  return { filas: e.filas as T[], cargado: e.cargado, error: e.error };
}

/* ---------- Escrituras (actualizan la caché al instante) ---------- */

export async function crear<T extends Fila>(tabla: string, datos: Omit<T, 'id'> & { id?: string }): Promise<T> {
  const fila = { ...datos, id: datos.id ?? uid() } as T;
  const guardada = await almacen.insertar(tabla, fila);
  fijar(tabla, { filas: [...estado(tabla).filas, guardada] });
  return guardada;
}

export async function modificar<T extends Fila>(tabla: string, id: string, cambios: Partial<T>) {
  await almacen.actualizar(tabla, id, cambios);
  fijar(tabla, {
    filas: estado(tabla).filas.map((f) => (f.id === id ? { ...f, ...cambios } : f)),
  });
}

export async function eliminar(tabla: string, id: string) {
  await almacen.borrar(tabla, id);
  fijar(tabla, { filas: estado(tabla).filas.filter((f) => f.id !== id) });
}

/* ---------- Respaldo: exportar / importar todo ---------- */

export const TABLAS = ['eco_cuentas', 'eco_categorias', 'pag_pagos', 'eco_movimientos', 'eco_ingresos',
  'ent_sesiones', 'ent_series', 'stk_productos', 'ali_platos', 'ali_comidas', 'ali_extras', 'ali_metas', 'ent_rutinas',
  'com_supers', 'com_items', 'com_precios', 'com_compras', 'ent_ejercicios'] as const;

export async function exportarTodo(): Promise<Record<string, Fila[]>> {
  const salida: Record<string, Fila[]> = {};
  for (const t of TABLAS) salida[t] = await almacen.listar(t);
  return salida;
}

/** Importa un respaldo. Omite filas cuyo id ya existe. Devuelve cuántas filas agregó. */
export async function importarTodo(datos: Record<string, Fila[]>): Promise<number> {
  let n = 0;
  for (const t of TABLAS) {
    if (!datos[t]?.length) continue;
    const existentes = new Set((await almacen.listar(t)).map((f) => f.id));
    const nuevas = datos[t].filter((f) => !existentes.has(f.id)).map((fila) => {
      const limpia = { ...fila } as Fila & { user_id?: string };
      delete limpia.user_id;
      return limpia;
    });
    // Si se importa una rutina activa, la que había queda archivada (solo puede haber una activa).
    if (t === 'ent_rutinas' && nuevas.some((f) => (f as Fila & { activa?: boolean }).activa)) {
      for (const f of await almacen.listar<Fila & { activa?: boolean }>(t)) if (f.activa) await almacen.actualizar<Fila & { activa?: boolean }>(t, f.id, { activa: false });
    }
    if (nuevas.length) await almacen.insertarVarios(t, nuevas);
    n += nuevas.length;
    await recargar(t);
  }
  return n;
}

/* ---------- Datos de prueba ---------- */

/** Los historiales simulados usan ids que empiezan así, para poder borrarlos sin tocar lo real. */
export const PREFIJO_PRUEBA = 'cafe0000-';

export async function contarPrueba(): Promise<number> {
  let n = 0;
  for (const t of TABLAS) n += (await almacen.listar(t)).filter((f) => f.id.startsWith(PREFIJO_PRUEBA)).length;
  return n;
}

/** Borra todo lo simulado (las series primero, por la relación con las sesiones). */
export async function borrarPrueba(): Promise<number> {
  let n = 0;
  const orden = ['ent_series', ...TABLAS.filter((t) => t !== 'ent_series')];
  for (const t of orden) {
    for (const f of (await almacen.listar(t)).filter((x) => x.id.startsWith(PREFIJO_PRUEBA))) {
      await almacen.borrar(t, f.id);
      n++;
    }
    await recargar(t);
  }
  return n;
}
