import { hoy } from '../../core/format';
import type { ItemAgenda, Modulo, Senal } from '../../core/types';
import { Icono } from '../../ui/ui';
import { faltantes, porVencer, useProductos } from './modelo';
import { PantallaLista, PantallaStock } from './Pantallas';

function useSenalesStock(): Senal[] {
  const { filas: productos } = useProductos();
  const senales: Senal[] = [];
  const vencidos = porVencer(productos, -1);
  const pronto = porVencer(productos).filter((p) => (p.vence ?? '') >= hoy());
  const falta = faltantes(productos);
  if (vencidos.length) senales.push({ id: 'stk-vencidos', modulo: 'stock', nivel: 'critico', titulo: `${vencidos.length} producto${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}`, detalle: vencidos.map((p) => p.nombre).join(', '), ruta: '#/stock/lista' });
  if (pronto.length) senales.push({ id: 'stk-vencen', modulo: 'stock', nivel: 'aviso', titulo: 'Usá pronto: se vence', detalle: pronto.map((p) => p.nombre).join(', '), ruta: '#/stock/lista' });
  if (falta.length) senales.push({ id: 'stk-faltan', modulo: 'stock', nivel: falta.some((p) => p.basico) ? 'aviso' : 'info', titulo: `Faltan ${falta.length} cosas en casa`, detalle: falta.slice(0, 6).map((p) => p.nombre).join(', ') + (falta.length > 6 ? '…' : ''), ruta: '#/stock/lista' });
  return senales;
}

function useAgendaStock(): ItemAgenda[] {
  return useProductos().filas.filter((p) => p.vence && Number(p.cantidad) > 0).map((p) => ({
    id: `vence-${p.id}`, modulo: 'stock', fecha: p.vence!, titulo: `Vence: ${p.nombre}`, ruta: '#/stock',
  }));
}

function ResumenStock() {
  const { filas: productos } = useProductos();
  const falta = faltantes(productos);
  return (
    <div className="grilla-cifras compacta">
      <div className="cifra"><span className="cifra-etq">Productos</span><strong className="cifra-val">{productos.length}</strong></div>
      <div className="cifra"><span className="cifra-etq">Para comprar</span><strong className={`cifra-val ${falta.length ? 'mal' : 'bien'}`}>{falta.length}</strong><span className="cifra-nota"><a href="#/stock/lista">Ver lista</a></span></div>
    </div>
  );
}

export const moduloStock: Modulo = {
  id: 'stock',
  nombre: 'Stock',
  descripcion: 'Lo que hay en casa y lo que falta',
  icono: Icono.stock,
  pantallas: [
    { ruta: '', titulo: 'En casa', componente: PantallaStock },
    { ruta: 'lista', titulo: 'Lista de compras', componente: PantallaLista },
  ],
  Resumen: ResumenStock,
  useSenales: useSenalesStock,
  useAgenda: useAgendaStock,
};
