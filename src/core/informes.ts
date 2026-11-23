import { useSyncExternalStore } from 'react';
import { supabase, useTabla, type Fila } from './db';
import { leerStorage, escribirStorage } from './config';
import { hoy } from './format';
import { VERSION } from './version';

/**
 * Informes (2026-11-19): lo que cada cuenta manda con el botón "Informar" (problema, idea, necesidad…)
 * y los errores que la app detecta sola. Tabla life_informes (supabase/informes.sql): cada cuenta ve
 * los suyos y la respuesta; la superadmin ve todos en Panel → Informes. Fuera de TABLAS (no va al respaldo).
 */
export const TABLA_INFORMES = 'life_informes';

export type TipoInforme = 'problema' | 'idea' | 'necesidad' | 'otro' | 'error';
export type EstadoInforme = 'nuevo' | 'visto' | 'en_proceso' | 'resuelto' | 'descartado';
export type Urgencia = 'frena' | 'molesta' | 'normal';

export interface Informe extends Fila {
  user_id?: string;
  tipo: TipoInforme;
  origen: 'persona' | 'auto';
  texto: string;
  urgencia: Urgencia;
  pantalla?: string | null;
  aparato?: string | null;
  version?: string | null;
  estado: EstadoInforme;
  respuesta?: string | null;
  tarea_id?: string | null;
  updated_at?: string;
}

export const TIPOS: Array<{ id: Exclude<TipoInforme, 'error'>; nombre: string; icono: string; ayuda: string }> = [
  { id: 'problema', nombre: 'Algo anda mal', icono: '⚠', ayuda: 'Un error, algo que no carga o hace otra cosa.' },
  { id: 'idea', nombre: 'Idea o mejora', icono: '✦', ayuda: 'Algo que estaría bueno cambiar o sumar.' },
  { id: 'necesidad', nombre: 'Necesito…', icono: '◎', ayuda: 'Algo que te falta para usar LIFE en tu día.' },
  { id: 'otro', nombre: 'Otra cosa', icono: '…', ayuda: 'Una pregunta o lo que sea.' },
];
export const nombreTipo = (t: TipoInforme) => (t === 'error' ? 'Error automático' : TIPOS.find((x) => x.id === t)?.nombre ?? t);
export const iconoTipo = (t: TipoInforme) => (t === 'error' ? '✖' : TIPOS.find((x) => x.id === t)?.icono ?? '•');

export const URGENCIAS: Array<{ id: Urgencia; nombre: string }> = [
  { id: 'frena', nombre: 'Me frena' },
  { id: 'molesta', nombre: 'Molesta' },
  { id: 'normal', nombre: 'Cuando puedan' },
];

export const ESTADOS: Array<{ id: EstadoInforme; nombre: string; nivel: 'critico' | 'aviso' | 'info' | 'ok' }> = [
  { id: 'nuevo', nombre: 'Nuevo', nivel: 'aviso' },
  { id: 'visto', nombre: 'Leído', nivel: 'info' },
  { id: 'en_proceso', nombre: 'En proceso', nivel: 'info' },
  { id: 'resuelto', nombre: 'Resuelto', nivel: 'ok' },
  { id: 'descartado', nombre: 'Descartado', nivel: 'ok' },
];
export const infoEstado = (e: EstadoInforme) => ESTADOS.find((x) => x.id === e) ?? ESTADOS[0];
export const abierto = (i: Informe) => i.estado === 'nuevo' || i.estado === 'visto' || i.estado === 'en_proceso';

export function useInformes() {
  const t = useTabla<Informe>(TABLA_INFORMES);
  return { ...t, filas: [...t.filas].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) };
}

/** "Celu · Chrome", "Compu · Safari": sirve para entender el problema sin guardar datos de la persona. */
export function aparato(): string {
  const ua = navigator.userAgent;
  const tipo = /iPhone|Android.+Mobile|Mobile/.test(ua) ? 'Celu' : /iPad|Android/.test(ua) ? 'Tablet' : 'Compu';
  const nav = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'otro';
  const app = window.matchMedia?.('(display-mode: standalone)').matches ? ' · app instalada' : '';
  return `${tipo} · ${nav}${app}`;
}

/** Ruta donde está parada la persona (sin datos: solo la pantalla). */
export const pantallaActual = () => window.location.hash || '#/';

/* ---------- Abrir el formulario desde cualquier lado (barra de arriba, una pantalla que tropezó…) ---------- */

interface Pedido { abierto: boolean; tipo?: TipoInforme; texto?: string }
let pedido: Pedido = { abierto: false };
const oyentes = new Set<() => void>();
export function pedirInformar(p: Omit<Pedido, 'abierto'> = {}) {
  pedido = { abierto: true, ...p };
  oyentes.forEach((fn) => fn());
}
export function cerrarInformar() {
  pedido = { abierto: false };
  oyentes.forEach((fn) => fn());
}
export function usePedidoInformar(): Pedido {
  return useSyncExternalStore((fn) => { oyentes.add(fn); return () => oyentes.delete(fn); }, () => pedido);
}

/* ---------- Errores que la app detecta sola ---------- */

/** Ruido que no es un problema de LIFE (extensiones, sin señal, el navegador). */
const RUIDO = /ResizeObserver|^Script error\.?$|Failed to fetch|NetworkError|Load failed|AbortError|cancelad|The user aborted/i;
const MAX_POR_SESION = 5;
let enviados = 0;

/**
 * Manda un error a life_informes (tipo 'error', origen 'auto'). El mismo error se manda una vez por día
 * por aparato, y como mucho 5 por sesión (más el tope de 30 por día de la base). En modo local no hace nada.
 */
export async function informarError(mensaje: string, detalle?: string) {
  if (!supabase || RUIDO.test(mensaje) || enviados >= MAX_POR_SESION) return;
  const clave = `${hoy()}|${mensaje.slice(0, 120)}`;
  let vistos: string[] = [];
  try { vistos = JSON.parse(leerStorage('life.errores.enviados') ?? '[]'); } catch { vistos = []; }
  vistos = vistos.filter((v) => v.startsWith(hoy()));
  if (vistos.includes(clave)) return;
  enviados++;
  escribirStorage('life.errores.enviados', JSON.stringify([...vistos, clave]));
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const texto = [mensaje, detalle?.split('\n').slice(0, 4).join('\n')].filter(Boolean).join('\n').slice(0, 1500);
  await supabase.from(TABLA_INFORMES).insert({
    tipo: 'error', origen: 'auto', texto, urgencia: 'normal',
    pantalla: pantallaActual(), aparato: aparato(), version: VERSION,
  });
}

let instalado = false;
/** Escucha los errores sueltos de toda la app (se llama una vez al arrancar). */
export function capturarErrores() {
  if (instalado) return;
  instalado = true;
  window.addEventListener('error', (e) => {
    void informarError(e.message || String(e.error), (e.error as Error | undefined)?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | string | undefined;
    void informarError(typeof r === 'string' ? r : r?.message ?? 'Promesa rechazada', typeof r === 'object' ? r?.stack : undefined);
  });
}
