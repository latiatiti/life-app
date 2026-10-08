import { dinero, relativo } from '../../core/format';
import type { Modulo, Senal } from '../../core/types';
import './compras.css';
import { PantallaEscanear } from './Carrito';
import { PantallaComprando } from './Comprando';
import { PantallaHistorial } from './Historial';
import { PantallaLista } from './Lista';
import { CADENAS, leerCarrito, leerEnCurso, preciosViejos, totalesPorCadena, useCompras, useItems, usePrecios } from './modelo';
import { oportunidades, PantallaPrecios } from './Precios';

const ICONO = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2l2.4 11h11.2L21 7H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" />
  </svg>
);

function useSenalesCompras(): Senal[] {
  const { filas: items, cargado } = useItems();
  const { filas: precios } = usePrecios();
  if (!cargado) return [];
  const senales: Senal[] = [];
  const carro = leerCarrito();
  if (carro?.lineas.length) senales.push({ id: 'com-carro', modulo: 'compras', nivel: 'info', titulo: `Carro a medias: ${carro.lineas.length} cosas`, detalle: 'Tocá para seguir cargando o cerrar la compra.', ruta: '#/compras/escanear' });
  if (leerEnCurso()) senales.push({ id: 'com-curso', modulo: 'compras', nivel: 'info', titulo: 'Tenés una compra a medias', detalle: 'Tocá para seguir en el súper.', ruta: '#/compras/comprando' });
  const lista = items.filter((i) => i.en_lista);
  if (lista.length) {
    const t = totalesPorCadena(lista).filter((x) => x.con > 0);
    const mejor = t.length ? t.filter((x) => x.con === t[0].con).sort((a, b) => a.total - b.total)[0] : null;
    senales.push({
      id: 'com-lista', modulo: 'compras', nivel: 'info', titulo: `Lista del súper: ${lista.length} cosas`,
      detalle: mejor ? `Más barato online en ${CADENAS[mejor.cadena]} (${dinero(mejor.total)}).` : lista.slice(0, 6).map((i) => i.nombre).join(', '),
      ruta: '#/compras',
    });
  }
  const ops = oportunidades(items, precios);
  if (ops.length) senales.push({ id: 'com-ops', modulo: 'compras', nivel: 'ok', titulo: `${ops.length} oportunidad${ops.length > 1 ? 'es' : ''} de ahorro`, detalle: ops.slice(0, 3).map((o) => o.item.nombre).join(', '), ruta: '#/compras/precios' });
  const viejos = preciosViejos(items);
  if (viejos.length) senales.push({ id: 'com-viejos', modulo: 'compras', nivel: 'info', titulo: 'Precios de hace más de una semana', detalle: 'Tocá "Actualizar precios" antes de ir al súper.', ruta: '#/compras/precios' });
  return senales;
}

function ResumenCompras() {
  const { filas: items } = useItems();
  const { filas: compras } = useCompras();
  const lista = items.filter((i) => i.en_lista).length;
  const ult = [...compras].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return (
    <div className="grilla-cifras compacta">
      <div className="cifra"><span className="cifra-etq">En la lista</span><strong className="cifra-val">{lista}</strong><span className="cifra-nota"><a href="#/compras/comprando">Modo compra</a></span></div>
      <div className="cifra"><span className="cifra-etq">Última compra</span><strong className="cifra-val">{ult ? dinero(Number(ult.total)) : '—'}</strong>
        <span className="cifra-nota">{ult ? relativo(ult.fecha) : 'todavía ninguna'}</span></div>
    </div>
  );
}

/** Cada compra cerrada vale 3 registros (30 XP). */
function useActividadCompras(): string[] {
  return useCompras().filas.flatMap((c) => Array(3).fill(c.fecha));
}

export const moduloCompras: Modulo = {
  id: 'compras',
  nombre: 'Compras',
  descripcion: 'Lista, precios por súper y modo compra',
  icono: ICONO,
  pantallas: [
    { ruta: '', titulo: 'Lista', componente: PantallaLista },
    { ruta: 'escanear', titulo: 'Escanear', componente: PantallaEscanear },
    { ruta: 'comprando', titulo: 'Modo compra', componente: PantallaComprando },
    { ruta: 'precios', titulo: 'Precios', componente: PantallaPrecios },
    { ruta: 'historial', titulo: 'Historial', componente: PantallaHistorial },
  ],
  Resumen: ResumenCompras,
  useSenales: useSenalesCompras,
  useActividad: useActividadCompras,
};
