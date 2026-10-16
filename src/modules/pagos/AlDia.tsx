import { useState } from 'react';
import { escribirStorage, leerStorage } from '../../core/config';
import { dinero, hoy, parsearMonto, relativo } from '../../core/format';
import type { ActividadEnCurso } from '../../core/types';
import { avisarCambio, icoConfirmar, ModoActividad } from '../../ui/Actividad';
import { Campo, Cifra, Estado, Modal } from '../../ui/ui';
import { estadoPago, FRECUENCIAS, pagosPendientes, registrarPago, useCuentas, usePagos, type Pago } from '../economia/modelo';

/**
 * "Ponerse al día": recorre de a uno los pagos vencidos y los que vencen esta semana, como un reparto.
 * El estado queda en el celular, así se puede minimizar, ir a otra pantalla y volver.
 */

interface AlDia {
  inicio: number;
  /** Pagos a recorrer, fijados al empezar (al pagar, el vencimiento avanza y dejaría de estar pendiente). */
  ids: string[];
  hechos: Record<string, { como: 'pagado' | 'saltado'; monto?: number }>;
  minimizada?: boolean;
}

const CLAVE = 'life.pagos.aldia';
export const leerAlDia = (): AlDia | null => {
  try { return JSON.parse(leerStorage(CLAVE) ?? 'null'); } catch { return null; }
};
const guardar = (x: AlDia | null) => { escribirStorage(CLAVE, x ? JSON.stringify(x) : null); avisarCambio(); };

/** Pagos que entran en "ponerse al día": vencidos y los que vencen en los próximos 7 días. */
export const pagosParaPonerseAlDia = (pagos: Pago[]) => pagosPendientes(pagos, 7);

export function empezarAlDia(pagos: Pago[]) {
  const actual = leerAlDia();
  if (actual && actual.ids.some((id) => !actual.hechos[id])) return guardar({ ...actual, minimizada: false });
  guardar({ inicio: Date.now(), ids: pagosParaPonerseAlDia(pagos).map((p) => p.id), hechos: {} });
}

export function alDiaEnCurso(): ActividadEnCurso | null {
  const a = leerAlDia();
  if (!a) return null;
  const n = Object.keys(a.hechos).length;
  return {
    id: 'pagos-al-dia', titulo: 'Ponerse al día con los pagos', detalle: `${n} de ${a.ids.length} hechos`,
    ruta: '#/pagos', minimizada: a.minimizada,
    volver: () => { const x = leerAlDia(); if (x) escribirStorage(CLAVE, JSON.stringify({ ...x, minimizada: false })); },
  };
}

export function PonerseAlDia({ estado }: { estado: AlDia }) {
  const { filas: pagos } = usePagos();
  const { filas: cuentas } = useCuentas();
  const opciones = cuentas.filter((c) => !c.archivada);
  const lista = estado.ids.map((id) => pagos.find((p) => p.id === id)).filter((p): p is Pago => !!p);
  const actual = lista.find((p) => !estado.hechos[p.id]);
  const hechos = lista.filter((p) => estado.hechos[p.id]).length;

  const aPagar = lista.filter((p) => p.moneda === 'ARS').reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const pagado = lista.filter((p) => p.moneda === 'ARS').reduce((s, p) => s + (estado.hechos[p.id]?.monto ?? 0), 0);
  const saltadoArs = lista.filter((p) => estado.hechos[p.id]?.como === 'saltado' && p.moneda === 'ARS').reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const pagadosEsperado = lista.filter((p) => estado.hechos[p.id]?.como === 'pagado' && p.moneda === 'ARS').reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const falta = Math.max(0, aPagar - pagadosEsperado - saltadoArs);
  const pagados = Object.values(estado.hechos).filter((h) => h.como === 'pagado').length;

  const marcar = (p: Pago, h: AlDia['hechos'][string]) => guardar({ ...estado, hechos: { ...estado.hechos, [p.id]: h } });
  const salir = () => guardar(null);

  return (
    <ModoActividad
      etiqueta="Ponerse al día"
      titulo={actual ? `${hechos} de ${lista.length} hechos` : '¡Listo!'}
      total={lista.length} hechos={hechos}
      derecha={pagados > 0 ? <span className="actividad-xp">+{pagados * 10} XP</span> : undefined}
      onSalir={salir}
      onMinimizar={() => guardar({ ...estado, minimizada: true })}
      pie={actual ? null : <button className="btn btn-confirmar grande-boton crece" onClick={salir}>{icoConfirmar} Terminar</button>}
    >
      <div className="grilla-cifras actividad-cifras">
        <Cifra etiqueta="A pagar" valor={dinero(aPagar)} />
        <Cifra etiqueta="Pagado" valor={dinero(pagado)} />
        <Cifra etiqueta="Falta" valor={dinero(falta)} tono={falta > 0 ? 'mal' : 'bien'} />
      </div>

      {lista.length === 0 && <p className="nota">No hay pagos vencidos ni que venzan esta semana. Estás al día.</p>}

      <ol className="recorrido">
        {lista.map((p) => {
          const h = estado.hechos[p.id];
          if (p === actual) {
            return (
              <li key={p.id}>
                <PasoPago pago={p} opciones={opciones}
                  onPagado={(monto) => marcar(p, { como: 'pagado', monto })}
                  onSaltar={() => marcar(p, { como: 'saltado' })} />
              </li>
            );
          }
          return (
            <li key={p.id} className={`recorrido-fila ${h ? 'hecha' : ''}`}>
              <span className={`recorrido-marca ${h?.como ?? ''}`} aria-hidden="true">{h?.como === 'pagado' ? '✓' : h ? '–' : ''}</span>
              <span className="crece">{p.nombre}{h?.como === 'saltado' && <small className="nota"> · salteado</small>}</span>
              <span className="num">{dinero(h?.monto ?? (Number(p.monto) || 0), p.moneda)}</span>
            </li>
          );
        })}
      </ol>

      {!actual && lista.length > 0 && (
        <div className="actividad-final">
          <strong>{pagados === lista.length ? '¡Estás al día!' : 'Recorrido terminado'}</strong>
          <p className="nota">
            {pagados === 1 ? 'Registraste 1 pago' : `Registraste ${pagados} pagos`} por {dinero(pagado)}. Cada uno quedó como gasto en Economía y su vencimiento pasó al próximo período.
          </p>
        </div>
      )}
    </ModoActividad>
  );
}

/** El paso actual: el pago grande, con monto y cuenta, y los botones fijos abajo. */
function PasoPago({ pago, opciones, onPagado, onSaltar }: {
  pago: Pago; opciones: Array<{ id: string; nombre: string; moneda: string }>;
  onPagado: (monto: number) => void; onSaltar: () => void;
}) {
  const [monto, setMonto] = useState(pago.monto ? String(pago.monto) : '');
  const [cuenta, setCuenta] = useState(pago.cuenta_id ?? opciones.find((c) => c.moneda === pago.moneda)?.id ?? '');
  const [fecha, setFecha] = useState(hoy());
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [dudoso, setDudoso] = useState<number | null>(null);
  const est = estadoPago(pago);
  const esperado = Number(pago.monto) || 0;

  async function registrar(m: number) {
    setDudoso(null);
    setGuardando(true);
    try {
      await registrarPago(pago, { monto: m, cuenta_id: cuenta, fecha, categoria_id: pago.categoria_id });
      onPagado(m);
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto);
    if (!(m > 0)) return setError('Ingresá cuánto pagaste.');
    if (!cuenta) return setError('Elegí desde qué cuenta pagaste.');
    setError('');
    // Control de coherencia: si se aleja mucho de lo de siempre, se pregunta antes de guardar.
    if (esperado > 0 && Math.abs(m - esperado) / esperado > 0.3) return setDudoso(m);
    registrar(m);
  }

  return (
    <form className="paso-actual" onSubmit={confirmar}>
      <div className="paso-cab">
        <span className="actividad-etq">Ahora</span>
        {est === 'vencido' ? <Estado nivel="critico" texto={`Venció ${relativo(pago.proximo_vencimiento)}`} />
          : <Estado nivel="aviso" texto={`Vence ${relativo(pago.proximo_vencimiento)}`} />}
      </div>
      <div className="paso-titulo">
        <h2>{pago.nombre}</h2>
        {esperado > 0 && <strong className="num">{dinero(esperado, pago.moneda)}</strong>}
      </div>
      <div className="vinetas"><span>{FRECUENCIAS[pago.frecuencia].nombre}</span></div>
      {pago.notas && <p className="nota">{pago.notas}</p>}

      {opciones.length === 0 ? (
        <p className="nota">Necesitás al menos una cuenta en Economía para registrar el pago. Podés saltearlo por ahora.</p>
      ) : (
        <>
          <Campo etiqueta="Monto pagado">
            <input className="input-grande" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Campo>
          <div className="fila-campos">
            <Campo etiqueta="Desde la cuenta">
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                <option value="">Elegí…</option>
                {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}

      <div className="actividad-pie-fijo">
        <div className="actividad-ancho actividad-botones">
          <button type="button" className="btn btn-secundario-grande" onClick={onSaltar} disabled={guardando}>Saltar</button>
          {opciones.length > 0 && (
            <button className="btn btn-confirmar grande-boton crece" disabled={guardando}>
              {icoConfirmar} {guardando ? 'Registrando…' : 'Pagado, siguiente'}
            </button>
          )}
        </div>
      </div>

      <Modal titulo="¿Está bien este monto?" abierto={dudoso != null} onCerrar={() => setDudoso(null)}>
        <p className="nota">Siempre pagás alrededor de <strong>{dinero(esperado, pago.moneda)}</strong> y cargaste <strong>{dinero(dudoso ?? 0, pago.moneda)}</strong>.</p>
        <button type="button" className="btn btn-primario grande-boton" onClick={() => setDudoso(null)}>Corregir el monto</button>
        <button type="button" className="btn grande-boton" onClick={() => dudoso != null && registrar(dudoso)}>Sí, está bien así</button>
      </Modal>
    </form>
  );
}
