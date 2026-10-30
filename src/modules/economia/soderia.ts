import type { Fila } from '../../core/db';
import { useTabla } from '../../core/db';
import { desdeISO } from '../../core/format';

/**
 * Copia de solo lectura de lo que dice el software de la sodería Tía Titi sobre la usuaria (su repartidor):
 * lo que le deben y el reparto de cada día. La llena el servidor (life-mcp → soderia_guardar o la función
 * soderia); la app no la escribe. Lo adeudado ya se pasa al ingreso del reparto, así entra en la proyección.
 */

export const TS = { cuenta: 'sod_cuenta', repartos: 'sod_repartos' } as const;

export interface MovSoderia {
  dia: string;
  tipo: 'inicial' | 'devengado' | 'pago' | 'compensacion' | 'ajuste';
  concepto: string;
  monto: number;
}

export interface CuentaSoderia extends Fila {
  persona_id: string;
  persona: string;
  /** Lo que la sodería le debe hoy. */
  saldo: number;
  monto_semanal: number | null;
  cierres_impagos: number;
  movimientos: MovSoderia[];
  actualizado: string;
  origen: 'claude' | 'auto';
}

export interface ParadaSoderia {
  nombre: string;
  zona: string | null;
  llegada: string | null;
  sale: string | null;
  tirada: number;
}

export interface RepartoSoderia extends Fila {
  dia_semana: number;
  fecha: string | null;
  salida: string | null;
  regreso: string | null;
  paradas: ParadaSoderia[];
  actualizado: string;
}

export const TIPOS_MOV: Record<MovSoderia['tipo'], string> = {
  inicial: 'Ya te debían',
  devengado: 'Semana trabajada',
  pago: 'Te pagaron',
  compensacion: 'Pusiste de tu plata',
  ajuste: 'Ajuste',
};

export const useCuentaSoderia = () => useTabla<CuentaSoderia>(TS.cuenta);
export const useRepartosSoderia = () => useTabla<RepartoSoderia>(TS.repartos);

/** El reparto de esa fecha: el cargado para ese día o, si no hay, el del día de la semana. */
export function repartoDe(fecha: string, repartos: RepartoSoderia[]): RepartoSoderia | undefined {
  return repartos.find((r) => r.fecha === fecha) ?? repartos.find((r) => !r.fecha && r.dia_semana === desdeISO(fecha).getDay());
}

/** Días desde la última copia (para avisar si quedó vieja). */
export function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
