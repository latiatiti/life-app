import { useState } from 'react';
import { dinero, fechaCorta, hoy, relativo, sumarDias } from '../../core/format';
import type { ItemAgenda, Modulo, Senal } from '../../core/types';
import { Estado, Icono, Modal } from '../../ui/ui';
import {
  cobrosEsperados, disponible, estadoPago, FRECUENCIAS, pagosPendientes, siguienteVencimiento,
  useCuentas, useIngresos, useMovimientos, usePagos, type Pago,
} from '../economia/modelo';
import { FormPagar, PantallaPagos } from './Pagos';

/** Agenda compartida: cada pago activo publica sus vencimientos de los próximos 60 días. */
function useAgendaPagos(): ItemAgenda[] {
  const { filas: pagos } = usePagos();
  const limite = sumarDias(hoy(), 60);
  const items: ItemAgenda[] = [];
  for (const p of pagos) {
    if (!p.activo) continue;
    let fecha: string | null = p.proximo_vencimiento;
    let n = 0;
    while (fecha && fecha <= limite && n < 6) {
      items.push({
        id: `pago-${p.id}-${fecha}`, modulo: 'pagos', fecha,
        titulo: p.nombre, detalle: FRECUENCIAS[p.frecuencia].nombre,
        monto: Number(p.monto) || undefined, moneda: p.moneda, ruta: '#/pagos',
      });
      fecha = siguienteVencimiento({ ...p, proximo_vencimiento: fecha });
      n++;
    }
  }
  return items;
}

/** Señales de Pagos, incluido el cruce con Economía (¿alcanza la plata?). */
function useSenalesPagos(): Senal[] {
  const { filas: pagos } = usePagos();
  const { filas: cuentas } = useCuentas();
  const { filas: movs } = useMovimientos();
  const { filas: ingresos } = useIngresos();
  const senales: Senal[] = [];
  const pendientes = pagosPendientes(pagos, 30);

  const vencidos = pendientes.filter((p) => estadoPago(p) === 'vencido');
  if (vencidos.length) {
    senales.push({
      id: 'pag-vencidos', modulo: 'pagos', nivel: 'critico',
      titulo: vencidos.length === 1 ? `${vencidos[0].nombre} está vencido` : `${vencidos.length} pagos vencidos`,
      detalle: vencidos.map((p) => `${p.nombre} (${relativo(p.proximo_vencimiento)})`).join(', '),
      ruta: '#/pagos',
    });
  }
  const pronto = pendientes.filter((p) => estadoPago(p) === 'pronto');
  if (pronto.length) {
    senales.push({
      id: 'pag-pronto', modulo: 'pagos', nivel: 'aviso',
      titulo: pronto.length === 1 ? `${pronto[0].nombre} vence ${relativo(pronto[0].proximo_vencimiento)}` : `${pronto.length} pagos vencen esta semana`,
      detalle: pronto.map((p) => `${p.nombre} ${fechaCorta(p.proximo_vencimiento)}`).join(', '),
      ruta: '#/pagos',
    });
  }

  // Cruce Pagos × Economía
  if (cuentas.length) {
    const aPagar = pendientes.filter((p) => p.moneda === 'ARS').reduce((s, p) => s + (Number(p.monto) || 0), 0);
    // Lo que hay disponible más los cobros que van a entrar en esos 30 días (cruce con Ingresos).
    const entra = cobrosEsperados(ingresos.filter((i) => i.moneda === 'ARS'), sumarDias(hoy(), 30))
      .reduce((s, c) => s + (Number(c.ingreso.monto) || 0), 0);
    const libre = disponible(cuentas, movs, 'ARS') + entra;
    if (aPagar > 0) {
      senales.push(
        aPagar > libre
          ? {
              id: 'pag-cobertura', modulo: 'pagos', nivel: 'critico',
              titulo: 'No alcanza para los pagos del mes',
              detalle: `Vencen ${dinero(aPagar)} en 30 días y entre lo que tenés y lo que vas a cobrar suman ${dinero(libre)}. Faltan ${dinero(aPagar - libre)}.`,
              ruta: '#/pagos',
            }
          : {
              id: 'pag-cobertura', modulo: 'pagos', nivel: 'ok',
              titulo: 'Los pagos de los próximos 30 días están cubiertos',
              detalle: `Vencen ${dinero(aPagar)}; después te quedan ${dinero(libre - aPagar)}.`,
              ruta: '#/pagos',
            }
      );
    }
  }
  return senales;
}

function ResumenPagos() {
  const { filas: pagos } = usePagos();
  const [pagando, setPagando] = useState<Pago | null>(null);
  const lista = pagosPendientes(pagos, 14).slice(0, 5);
  if (pagos.length === 0) return <p className="nota">Sin pagos cargados. <a href="#/pagos">Agregar</a></p>;
  if (lista.length === 0) return <p className="nota">Nada vence en los próximos 14 días.</p>;
  return (
    <>
      <ul className="lista">
        {lista.map((p) => {
          const est = estadoPago(p);
          return (
            <li key={p.id} className="lista-item">
              <div className="crece">
                <strong>{p.nombre}</strong>
                <small className="nota">{fechaCorta(p.proximo_vencimiento)} · {relativo(p.proximo_vencimiento)}</small>
              </div>
              {est === 'vencido' && <Estado nivel="critico" texto="Vencido" />}
              <span className="num">{p.monto ? dinero(Number(p.monto), p.moneda) : '—'}</span>
              <button className="btn chico" onClick={() => setPagando(p)}>Pagar</button>
            </li>
          );
        })}
      </ul>
      <Modal titulo={pagando ? `Pagar ${pagando.nombre}` : 'Pagar'} abierto={!!pagando} onCerrar={() => setPagando(null)}>
        {pagando && <FormPagar pago={pagando} onListo={() => setPagando(null)} />}
      </Modal>
    </>
  );
}

export const moduloPagos: Modulo = {
  id: 'pagos',
  nombre: 'Pagos',
  descripcion: 'Vencimientos y pagos recurrentes',
  icono: Icono.pagos,
  pantallas: [{ ruta: '', titulo: 'Pagos', componente: PantallaPagos }],
  Resumen: ResumenPagos,
  useSenales: useSenalesPagos,
  useAgenda: useAgendaPagos,
};
