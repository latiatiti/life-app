/**
 * Configuración de conexión. Prioridad:
 * 1. Variables de entorno de Vite (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) al compilar.
 * 2. Datos cargados desde la pantalla Ajustes (se guardan en este navegador).
 * Si no hay ninguna, la app funciona en modo local.
 */
export interface ConfigNube {
  url: string;
  anonKey: string;
}

const CLAVE = 'life.config.nube';

export function leerStorage(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function escribirStorage(clave: string, valor: string | null): boolean {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
    return true;
  } catch {
    return false;
  }
}

export function configDesdeEntorno(): ConfigNube | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export function configGuardada(): ConfigNube | null {
  const raw = leerStorage(CLAVE);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as ConfigNube;
    return c.url && c.anonKey ? c : null;
  } catch {
    return null;
  }
}

export function configNube(): ConfigNube | null {
  return configDesdeEntorno() ?? configGuardada();
}

export function guardarConfigNube(c: ConfigNube | null): void {
  escribirStorage(CLAVE, c ? JSON.stringify(c) : null);
}
