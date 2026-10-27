import { hoy } from '../../core/format';
import type { ItemAgenda, Modulo, Senal, Vital } from '../../core/types';
import { Icono } from '../../ui/ui';
import { faltantes, porVencer, useProductos } from './modelo';
import { PantallaStock } from './Pantallas';

function useSenalesStock(): Senal[] {
  const { filas: productos } = useProductos();
  const senales: Senal[] = [];
  const vencidos = porVencer(productos, -1);
  const pronto = porVencer(productos).filter((p) => (p.vence ?? '') >= hoy());
  const falta = faltantes(productos);
  if (vencidos.length) senales.push({ id: 'stk-vencidos', modulo: 'stock', nivel: 'critico', titulo: `${vencidos.length} producto${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}`, detalle: vencidos.map((p) => p.nombre).join(', '), ruta: '#/stock' });
  if (pronto.length) senales.push({ id: 'stk-vencen', modulo: 'stock', nivel: 'aviso', titulo: 'Usá pronto: se vence', detalle: pronto.map((p) => p.nombre).join(', '), ruta: '#/stock' });
  if (falta.length) senales.push({ id: 'stk-faltan', modulo: 'stock', nivel: falta.some((p) => p.basico) ? 'aviso' : 'info', titulo: `Faltan ${falta.length} cosas en casa`, detalle: falta.slice(0, 6).map((p) => p.nombre).join(', ') + (falta.length > 6 ? '…' : ''), ruta: '#/stock' });
  return senales;
}

function useAgendaStock(): ItemAgenda[] {
  return useProductos().filas.filter((p) => p.vence && Number(p.cantidad) > 0).map((p) => ({
    id: `vence-${p.id}`, modulo: 'stock', fecha: p.vence!, titulo: `Vence: ${p.nombre}`, ruta: '#/stock',
  }));
}

function useVitalStock(): Vital {
  const { filas: productos } = useProductos();
  const falta = faltantes(productos);
  const vencen = porVencer(productos);
  return {
    cifra: falta.length ? `${falta.length} faltan` : 'Nada falta',
    sub: `${productos.length} productos en casa${vencen.length ? ` · ${vencen.length} se vence${vencen.length > 1 ? 'n' : ''} pronto` : ''}`,
    barra: productos.length ? 1 - falta.length / productos.length : undefined,
    accion: falta.length ? { texto: 'Sumar a la lista', ruta: '#/compras' } : { texto: 'Ver la casa', ruta: '#/stock' },
  };
}

function ResumenStock() {
  const { filas: productos } = useProductos();
  const falta = faltantes(productos);
  return (
    <div className="grilla-cifras compacta">
      <div className="cifra"><span className="cifra-etq">Productos</span><strong className="cifra-val">{productos.length}</strong></div>
      <div className="cifra"><span className="cifra-etq">Para comprar</span><strong className={`cifra-val ${falta.length ? 'mal' : 'bien'}`}>{falta.length}</strong><span className="cifra-nota"><a href="#/compras">Ver lista</a></span></div>
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
  ],
  Resumen: ResumenStock,
  useVital: useVitalStock,
  useSenales: useSenalesStock,
  useAgenda: useAgendaStock,
};
