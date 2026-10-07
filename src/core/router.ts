import { useSyncExternalStore } from 'react';

/** Navegación simple por hash (#/economia/movimientos). Funciona también abriendo el archivo local. */
function rutaActual(): string {
  return window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
}

export function useRuta(): string {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener('hashchange', fn);
      return () => window.removeEventListener('hashchange', fn);
    },
    rutaActual
  );
}

export function ir(ruta: string) {
  window.location.hash = `/${ruta.replace(/^#?\/?/, '')}`;
}
