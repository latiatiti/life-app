import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Perfil } from '../../core/auth';
import { supabase } from '../../core/db';

/**
 * Panel de la superadmin (2026-11-19): Cuentas, Informes y LIFE.
 * Las cuentas salen de la función `cuentas` (correo y último ingreso, que solo ve el servidor) + `life_panel_cuentas()`
 * (conteos por cuenta, sin mirar los datos de nadie). La base, de `life_panel_base()`. Ver supabase/informes.sql.
 */

export interface Cuenta extends Perfil {
  email: string;
  ultimo_ingreso: string | null;
  creada?: string;
}

export interface UsoCuenta {
  user_id: string;
  filas: number;
  ultima_carga: string | null;
  informes_abiertos: number;
  errores_7d: number;
  claves_claude: number;
}

export interface EstadoBase {
  base_mb: number;
  tope_mb: number;
  cuentas: number;
  activas: number;
  tablas: Array<{ nombre: string; mb: number; filas: number }>;
}

export async function llamarCuentas(cuerpo: Record<string, unknown>) {
  if (!supabase) throw new Error('Sin conexión.');
  const { data, error } = await supabase.functions.invoke('cuentas', { body: cuerpo });
  if (error) {
    const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalle?.error ?? error.message);
  }
  return data;
}

/* Las cuentas se piden una vez y las comparten las tres pestañas (nombres en Informes, estado en Cuentas). */
interface Datos { cuentas: Cuenta[] | null; uso: Map<string, UsoCuenta>; error: string; usoError: string }
let datos: Datos = { cuentas: null, uso: new Map(), error: '', usoError: '' };
let pidiendo = false;
const oyentes = new Set<() => void>();
const fijar = (d: Partial<Datos>) => { datos = { ...datos, ...d }; oyentes.forEach((fn) => fn()); };

export async function recargarCuentas() {
  if (pidiendo || !supabase) return;
  pidiendo = true;
  try {
    const r = await llamarCuentas({ accion: 'listar' });
    fijar({ cuentas: r.cuentas as Cuenta[], error: '' });
  } catch (e) {
    fijar({ error: (e as Error).message });
  }
  const { data, error } = await supabase.rpc('life_panel_cuentas');
  fijar({
    uso: new Map(((data ?? []) as UsoCuenta[]).map((u) => [u.user_id, { ...u, filas: Number(u.filas), informes_abiertos: Number(u.informes_abiertos), errores_7d: Number(u.errores_7d), claves_claude: Number(u.claves_claude) }])),
    usoError: error ? error.message : '',
  });
  pidiendo = false;
}

export function useCuentas(): Datos {
  const d = useSyncExternalStore((fn) => { oyentes.add(fn); return () => oyentes.delete(fn); }, () => datos);
  useEffect(() => { if (!d.cuentas && !d.error) void recargarCuentas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}

export const nombreCuenta = (c: Pick<Cuenta, 'nombre' | 'usuario' | 'email'> | undefined) =>
  !c ? 'Cuenta borrada' : c.nombre || c.usuario || c.email?.split('@')[0] || 'Sin nombre';

export type EstadoCuenta = 'activa' | 'espera' | 'pausada';
export const estadoCuenta = (c: Cuenta): EstadoCuenta => (c.activo ? 'activa' : c.pedido_at ? 'espera' : 'pausada');

/** Días desde una fecha ISO (null si no hay). */
export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
export function haceCuanto(iso: string | null | undefined): string {
  const d = diasDesde(iso);
  if (d === null) return 'nunca';
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

export function useBase() {
  const [base, setBase] = useState<EstadoBase | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('life_panel_base').then(({ data, error: e }) => {
      if (e) setError(e.message);
      else setBase(data as EstadoBase);
    });
  }, []);
  return { base, error };
}

/** Para pasar de Cuentas a Informes filtrando por una cuenta (el router no lleva parámetros). */
let filtroCuenta: string | null = null;
export const fijarFiltroCuenta = (id: string | null) => { filtroCuenta = id; };
export const tomarFiltroCuenta = () => { const f = filtroCuenta; filtroCuenta = null; return f; };

/** Qué puede hacer cada rol (lo que de verdad hacen las reglas de la base). */
export const PERMISOS: Array<{ que: string; superadmin: boolean; usuario: boolean; lector: boolean }> = [
  { que: 'Ver sus propios datos', superadmin: true, usuario: true, lector: true },
  { que: 'Cargar, cambiar y borrar sus datos', superadmin: true, usuario: true, lector: false },
  { que: 'Conectar Claude y WhatsApp', superadmin: true, usuario: true, lector: false },
  { que: 'Informar problemas e ideas', superadmin: true, usuario: true, lector: true },
  { que: 'Ver datos de otras cuentas', superadmin: false, usuario: false, lector: false },
  { que: 'Aprobar, pausar y editar cuentas', superadmin: true, usuario: false, lector: false },
  { que: 'Leer y responder informes de todos', superadmin: true, usuario: false, lector: false },
];
