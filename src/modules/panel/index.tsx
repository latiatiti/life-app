import { usePerfil } from '../../core/auth';
import { abierto, useInformes } from '../../core/informes';
import type { Modulo, Senal } from '../../core/types';
import { PantallaCuentas } from './Cuentas';
import { PantallaInformes } from './Informes';
import { PantallaLife } from './Life';
import './panel.css';

const icono = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><circle cx="12" cy="10" r="2.5" /><path d="M8 16c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4" />
  </svg>
);

/**
 * Señales solo para la superadmin: informes nuevos y errores automáticos de las últimas 24 h.
 * A las demás cuentas: aviso cuando les respondieron algo que mandaron.
 */
function useSenalesPanel(): Senal[] {
  const yo = usePerfil();
  const { filas } = useInformes();
  if (yo.rol !== 'superadmin') {
    const respondidos = filas.filter((i) => i.user_id === yo.user_id && i.respuesta && abierto(i));
    return respondidos.length ? [{
      id: 'informes-respuesta', modulo: 'panel', nivel: 'info',
      titulo: respondidos.length === 1 ? 'Te respondieron lo que informaste' : `Te respondieron ${respondidos.length} informes`,
      detalle: respondidos[0].respuesta ?? undefined, ruta: '#/ajustes/informes', accion: { texto: 'Ver', ruta: '#/ajustes/informes' },
    }] : [];
  }
  const senales: Senal[] = [];
  const nuevos = filas.filter((i) => i.origen === 'persona' && i.estado === 'nuevo' && i.user_id !== yo.user_id);
  if (nuevos.length) senales.push({
    id: 'panel-informes', modulo: 'panel', nivel: nuevos.some((i) => i.urgencia === 'frena') ? 'critico' : 'aviso',
    titulo: nuevos.length === 1 ? 'Llegó un informe nuevo' : `Llegaron ${nuevos.length} informes nuevos`,
    detalle: nuevos.slice(0, 3).map((i) => i.texto.split('\n')[0].slice(0, 60)).join(' · '),
    ruta: '#/panel/informes', accion: { texto: 'Leer', ruta: '#/panel/informes' },
  });
  const dia = new Date(Date.now() - 86400000).toISOString();
  const errores = filas.filter((i) => i.origen === 'auto' && abierto(i) && String(i.created_at) >= dia);
  if (errores.length) senales.push({
    id: 'panel-errores', modulo: 'panel', nivel: 'aviso',
    titulo: errores.length === 1 ? 'La app tuvo un error en las últimas 24 h' : `La app tuvo ${errores.length} errores en las últimas 24 h`,
    detalle: errores[0].texto.split('\n')[0].slice(0, 80),
    ruta: '#/panel/informes', accion: { texto: 'Mirar', ruta: '#/panel/informes' },
  });
  return senales;
}

export const moduloPanel: Modulo = {
  id: 'panel',
  nombre: 'Panel',
  descripcion: 'Solo superadmin: cuentas, informes y cómo viene LIFE',
  icono,
  pantallas: [
    { ruta: '', titulo: 'Cuentas', componente: PantallaCuentas },
    { ruta: 'informes', titulo: 'Informes', componente: PantallaInformes },
    { ruta: 'life', titulo: 'LIFE', componente: PantallaLife },
  ],
  useSenales: useSenalesPanel,
  enHub: false,
};
