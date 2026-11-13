import type { Fila } from '../../core/db';

/** Link personal para que Claude entre a LIFE (tabla api_claves, función life-mcp). */
export interface Clave extends Fila {
  nombre: string;
  prefijo: string;
  permiso: 'leer' | 'escribir';
  ultimo_uso: string | null;
  revocada: boolean;
  /** Fecha en que deja de andar (supabase/seguridad-claves.sql). Antes de ese SQL no viene. */
  vence?: string | null;
}

/** Cada link dura 90 días (docs/seguridad.md). */
export const DIAS_ROTAR = 90;
/** Desde cuántos días antes de vencer se avisa. */
export const DIAS_AVISO = 14;

const DIA = 86_400_000;

/** Fecha de vencimiento: la que guardó la base, o 90 días desde que se creó. */
export function venceDe(c: Clave): Date | null {
  if (c.vence) return new Date(c.vence);
  if (c.created_at) return new Date(new Date(c.created_at).getTime() + DIAS_ROTAR * DIA);
  return null;
}

/** Días que le quedan (negativo = vencido). */
export function diasParaVencer(c: Clave, ahora = Date.now()) {
  const v = venceDe(c);
  return v ? Math.ceil((v.getTime() - ahora) / DIA) : DIAS_ROTAR;
}

export const activa = (c: Clave) => !c.revocada && diasParaVencer(c) > 0;

/** Huella sha-256 en hexadecimal: en la base se guarda esto, nunca la clave. */
export async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clave al azar (base64 para links): `prefijo` + `bytes` bytes del generador seguro del navegador. */
export function claveNueva(prefijo = 'life_', bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return prefijo + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
