import './economia.css';
import { dinero, hoy, mesActual, sumarDias } from '../../core/format';
import type { ItemAgenda, Modulo, Senal, Vital } from '../../core/types';
import { Icono } from '../../ui/ui';
import { PantallaCompartidos } from './Compartidos';
import { OTRO, saldoCon, textoSaldo, useCompartidos } from './compartidos';
import { PantallaCuentas } from './Cuentas';
import { PantallaIngresos } from './Ingresos';
import { PantallaMovimientos } from './Movimientos';
import { PantallaProyeccion } from './Proyeccion';
import { PantallaResumen, ResumenHub } from './Resumen';
import {
  cobrosEsperados, disponible, FRECUENCIAS_COBRO, gastoPorCategoria, proyectar, totalesMes,
  useCategorias, useCuentas, useIngresos, useMovimientos, usePagos,
} from './modelo';

/** Tarjeta Plata del tablero: lo disponible hoy en pesos. */
function useVitalEconomia(): Vital {
  const { filas: cuentas } = useCuentas();
  const { filas: movs } = useMovimientos();
  if (!cuentas.length) return { cifra: '—', sub: 'Cargá tus cuentas para ver tu plata', accion: { texto: 'Empezar', ruta: '#/economia/cuentas' } };
  const { ingresos, gastos } = totalesMes(movs, cuentas, mesActual(), 'ARS');
  return {
    cifra: dinero(disponible(cuentas, movs, 'ARS')),
    sub: `Disponible hoy · balance del mes ${dinero(ingresos - gastos)}`,
    accion: { texto: 'Ver plata', ruta: '#/economia' },
  };
}

/** Agenda: los cobros esperados de los próximos 60 días. */
function useAgendaEconomia(): ItemAgenda[] {
  const { filas: ingresos } = useIngresos();
  return cobrosEsperados(ingresos, sumarDias(hoy(), 60)).map(({ ingreso: i, fecha }) => ({
    id: `cobro-${i.id}-${fecha}`, modulo: 'economia', fecha,
    titulo: `Cobro: ${i.nombre}`,
    detalle: FRECUENCIAS_COBRO[i.frecuencia].nombre + (i.puede_adeudarse ? ' · puede quedar pendiente' : ''),
    monto: Number(i.monto) || undefined, moneda: i.moneda, ruta: '#/economia/ingresos',
  }));
}

/** Cada movimiento registrado suma experiencia. */
function useActividadEconomia(): string[] {
  const movs = useMovimientos().filas;
  const compartidos = useCompartidos().filas;
  const ids = new Set(movs.map((m) => m.id));
  // Lo compartido sin movimiento propio (ej. lo pagó Ulises) también suma.
  return [...movs.map((m) => m.fecha), ...compartidos.filter((c) => !c.movimiento_id || !ids.has(c.movimiento_id)).map((c) => c.fecha)];
}

function useSenalesEconomia(): Senal[] {
  const { filas: cuentas, cargado } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: movs } = useMovimientos();
  const { filas: fuentes } = useIngresos();
  const { filas: pagos } = usePagos();
  const { filas: compartidos } = useCompartidos();
  const senales: Senal[] = [];

  // Cuenta con Ulises: se ve aunque no haya cuentas cargadas.
  const saldo = saldoCon(compartidos);
  if (Math.abs(saldo) >= 1) {
    senales.push({
      id: 'eco-compartido', modulo: 'economia', nivel: 'info',
      titulo: textoSaldo(saldo),
      detalle: 'Gastos compartidos, préstamos y compras del súper.',
      ruta: '#/economia/ulises',
      accion: { texto: saldo > 0 ? 'Me pagó' : 'Le pagué', ruta: '#/economia/ulises' },
    });
  }

  if (!cargado || cuentas.length === 0) return senales;
  const mes = mesActual();

  const deben = fuentes.filter((i) => Number(i.adeudado) > 0);
  if (deben.length) {
    senales.push({
      id: 'eco-adeudado', modulo: 'economia', nivel: 'info',
      titulo: `Te deben ${dinero(deben.reduce((s, i) => s + Number(i.adeudado), 0))}`,
      detalle: deben.map((i) => `${i.nombre}: ${dinero(Number(i.adeudado))}`).join(' · '),
      ruta: '#/economia/ingresos',
    });
  }

  if (fuentes.length) {
    const p = proyectar(cuentas, movs, fuentes, pagos, 30);
    const rojo = p.dias.find((d) => d.seguro < 0);
    if (rojo) {
      const conTodo = rojo.conTodo >= 0;
      senales.push({
        id: 'eco-proyeccion', modulo: 'economia', nivel: conTodo ? 'aviso' : 'critico',
        titulo: conTodo ? 'Si no te pagan lo pendiente, no llegás' : 'La plata no alcanza en los próximos 30 días',
        detalle: `El ${rojo.fecha.slice(8)}/${rojo.fecha.slice(5, 7)} quedarías en ${dinero(conTodo ? rojo.seguro : rojo.conTodo)}.`,
        ruta: '#/economia/proyeccion',
      });
    }
  }

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
    { ruta: 'proyeccion', titulo: 'Proyección', componente: PantallaProyeccion },
    { ruta: 'ulises', titulo: `Con ${OTRO}`, componente: PantallaCompartidos },
    { ruta: 'cuentas', titulo: 'Cuentas y categorías', componente: PantallaCuentas },
  ],
  Resumen: ResumenHub,
  useVital: useVitalEconomia,
  useSenales: useSenalesEconomia,
  useAgenda: useAgendaEconomia,
  useActividad: useActividadEconomia,
};
