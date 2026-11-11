import type { Modulo, Senal } from '../../core/types';
import { PantallaChats, PantallaConexion } from './Pantallas';
import { situacion, useChatsWa, useSesionWa } from './modelo';

const icono = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a3.5 3.5 0 0 1-2-2l1-1-1-2z" />
  </svg>
);

/** Al Inicio: si se cayó la conexión (con botón para volver), mensajes sin leer y lo que no salió. */
function useSenalesWhatsapp(): Senal[] {
  const { sesion } = useSesionWa();
  const { chats } = useChatsWa();
  if (!sesion) return []; // nunca lo conectó: no molestar
  const s = situacion(sesion);
  const senales: Senal[] = [];
  if (s === 'sin-puente' || s === 'desconectado') senales.push({
    id: 'wa-caido', modulo: 'whatsapp', nivel: 'aviso',
    titulo: s === 'sin-puente' ? 'El puente de WhatsApp está apagado' : 'Tu WhatsApp se desconectó de LIFE',
    detalle: 'Claude no puede leer ni mandar mensajes hasta que vuelva.',
    ruta: '#/whatsapp/conexion', accion: { texto: s === 'sin-puente' ? 'Ver' : 'Conectar', ruta: '#/whatsapp/conexion' },
  });
  const sinLeer = chats.filter((c) => c.sin_leer > 0);
  if (s === 'conectado' && sinLeer.length) senales.push({
    id: 'wa-sinleer', modulo: 'whatsapp', nivel: 'info',
    titulo: sinLeer.length === 1 ? `WhatsApp: ${sinLeer[0].nombre ?? 'un chat'} te escribió` : `WhatsApp: ${sinLeer.length} chats sin leer`,
    detalle: sinLeer.slice(0, 4).map((c) => c.nombre ?? c.telefono).join(', '), ruta: '#/whatsapp',
  });
  return senales;
}

export const moduloWhatsapp: Modulo = {
  id: 'whatsapp',
  nombre: 'WhatsApp',
  descripcion: 'Tu WhatsApp dentro de LIFE: chats, mandar mensajes y que Claude los lea o mande con tu OK',
  icono,
  pantallas: [
    { ruta: '', titulo: 'Chats', componente: PantallaChats },
    { ruta: 'conexion', titulo: 'Conexión', componente: PantallaConexion },
  ],
  useSenales: useSenalesWhatsapp,
  enHub: false,
};
