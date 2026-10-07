import { dinero, hoy, mesActual, sumarDias } from '../../core/format';
import type { ItemAgenda, Modulo, Senal } from '../../core/types';
import { Icono } from '../../ui/ui';
import { PantallaCuentas } from './Cuentas';
import { PantallaIngresos } from './Ingresos';
import { PantallaMovimientos } from './Movimientos';
import { PantallaResumen, ResumenHub } from './Resumen';
import {
  cobrosEsperados, FRECUENCIAS_COBRO, gastoPorCategoria, totalesMes,
  useCategorias, useCuentas, useIngresos, useMovimientos,
} from './modelo';

/** Agenda: los cobros esperados de los próximos 60 días. */
function useAgendaEconomia(): ItemAgenda[] {
  const { filas: ingresos } = useIngresos();
  return cobrosEsperados(ingresos, sumarDias(hoy(), 60)).map(({ ingreso: i, fecha }) => ({
    id: `cobro-${i.id}-${fecha}`, modulo: 'economia', fecha,
    titulo: `Cobro: ${i.nombre}`, detalle: FRECUENCIAS_COBRO[i.frecuencia].nombre,
    monto: Number(i.monto) || undefined, moneda: i.moneda, ruta: '#/economia/ingresos',
  }));
}

/** Cada movimiento registrado suma experiencia. */
function useActividadEconomia(): string[] {
  return useMovimientos().filas.map((m) => m.fecha);
}

function useSenalesEconomia(): Senal[] {
  const { filas: cuentas, cargado } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: movs } = useMovimientos();
  if (!cargado || cuentas.length === 0) return [];
  const mes = mesActual();
  const senales: Senal[] = [];

  for (const g of gastoPorCategoria(movs, cuentas, categorias, mes)) {
    if (g.uso == null || !g.categoria) continue;
    if (g.uso >= 1) {
      senales.push({
        id: `eco-pres-${g.categoria.id}`, modulo: 'economia', nivel: 'critico',
        titulo: `${g.categoria.nombre}: presupuesto superado`,
        detalle: `Gastaste ${dinero(g.gastado)} de ${dinero(g.presupuesto!)} (${Math.round(g.uso * 100)} %).`,
        ruta: '#/economia',
      });
    } else if (g.uso >= 0.8) {
      senales.push({
        id: `eco-pres-${g.categoria.id}`, modulo: 'economia', nivel: 'aviso',
        titulo: `${g.categoria.nombre}: cerca del límite`,
        detalle: `Quedan ${dinero(g.presupuesto! - g.gastado)} para el resto del mes.`,
        ruta: '#/economia',
      });
    }
  }

  const { ingresos, gastos } = totalesMes(movs, cuentas, mes, 'ARS');
  if (gastos > 0 && ingresos > 0 && gastos > ingresos) {
    senales.push({
      id: 'eco-balance', modulo: 'economia', nivel: 'aviso',
      titulo: 'Este mes gastás más de lo que entra',
      detalle: `Gastos ${dinero(gastos)} contra ingresos ${dinero(ingresos)}.`,
      ruta: '#/economia',
    });
  }
  return senales;
}

export const moduloEconomia: Modulo = {
  id: 'economia',
  nombre: 'Economía',
  descripcion: 'Cuentas, ingresos, gastos y presupuestos',
  icono: Icono.economia,
  pantallas: [
    { ruta: '', titulo: 'Resumen', componente: PantallaResumen },
    { ruta: 'movimientos', titulo: 'Movimientos', componente: PantallaMovimientos },
    { ruta: 'ingresos', titulo: 'Ingresos', componente: PantallaIngresos },
    { ruta: 'cuentas', titulo: 'Cuentas y categorías', componente: PantallaCuentas },
  ],
  Resumen: ResumenHub,
  useSenales: useSenalesEconomia,
  useAgenda: useAgendaEconomia,
  useActividad: useActividadEconomia,
};
