/**
 * Configuración de conexión. Prioridad:
 * 1. Variables de entorno de Vite (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) al compilar.
 * 2. La nube de LIFE, ya integrada: la app publicada entra directo, sin configurar nada.
 * 3. Solo en el archivo de un solo clic (build:single): lo cargado en Ajustes, o modo local.
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

// Claves públicas del proyecto Supabase "Life" (la anon key está pensada para ir en la app;
// lo que protege los datos son las reglas por usuario de la base).
export const NUBE_LIFE: ConfigNube = {
  url: 'https://jxnlgszmywoebjjpacod.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4bmxnc3pteXdvZWJqanBhY29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjg3NjgsImV4cCI6MjEwNjgwNDc2OH0.x-P_STJg6SoA-91aSNQoAcO40OYzQNG0iAYqCwR2EYw',
};

/** Conexión fija de esta compilación: no se puede cambiar desde la app. */
export function configDesdeEntorno(): ConfigNube | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey) return { url, anonKey };
  return import.meta.env.MODE === 'single' ? null : NUBE_LIFE;
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
