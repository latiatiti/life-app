import type { Modulo, Senal } from '../../core/types';
import { diasQuieta, estaQuieta, useTarjetas } from './modelo';
import { PantallaTablero } from './Tablero';

const icono = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="5" height="16" /><rect x="10" y="4" width="5" height="10" /><rect x="17" y="4" width="4" height="6" />
  </svg>
);

/** Señales al Inicio ("Para resolver"): lo de prioridad alta sin fecha y lo que quedó quieto. Lo que tiene fecha ya lo avisa el Día. */
function useSenalesTablero(): Senal[] {
  const { filas } = useTarjetas();
  const senales: Senal[] = [];
  const quietas = filas.filter(estaQuieta).sort((a, b) => diasQuieta(b) - diasQuieta(a));
  if (quietas.length) senales.push({
    id: 'tablero-quietas', modulo: 'tablero', nivel: 'aviso',
    titulo: quietas.length === 1 ? `"${quietas[0].titulo}" está quieta hace ${diasQuieta(quietas[0])} días` : `${quietas.length} pendientes quietos hace días`,
    detalle: quietas.slice(0, 4).map((t) => t.titulo).join(', '),
    ruta: '#/tablero', accion: { texto: 'Revisar', ruta: '#/tablero' },
  });
  const altas = filas.filter((t) => !t.hecho && !t.fecha && t.prioridad === 'alta' && !estaQuieta(t));
  if (altas.length) senales.push({
    id: 'tablero-altas', modulo: 'tablero', nivel: 'info',
    titulo: altas.length === 1 ? `Pendiente importante: ${altas[0].titulo}` : `${altas.length} pendientes de prioridad alta`,
    detalle: altas.length > 1 ? altas.slice(0, 4).map((t) => t.titulo).join(', ') : undefined, ruta: '#/tablero',
  });
  return senales;
}

/** XP: cada tarjeta terminada sin fecha (las que tienen fecha ya las cuenta el Día). */
function useActividadTablero(): string[] {
  return useTarjetas().filas.filter((t) => t.hecho && !t.fecha && t.movida).map((t) => t.movida!);
}

export const moduloTablero: Modulo = {
  id: 'tablero',
  nombre: 'Tablero',
  descripcion: 'Pendientes e ideas por etapa: por hacer, en proceso y hecho',
  icono,
  pantallas: [{ ruta: '', titulo: 'Tablero', componente: PantallaTablero }],
  useSenales: useSenalesTablero,
  useActividad: useActividadTablero,
  enHub: false,
};
