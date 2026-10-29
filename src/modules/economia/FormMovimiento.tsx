import { useState } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { dinero, hoy, parsearMonto } from '../../core/format';
import { Campo } from '../../ui/ui';
import { cambiarCompartido, filaCompartido, OTRO, TABLA_COMPARTIDOS, useCompartidos, type Compartido } from './compartidos';
import {
  T, useCategorias, useCuentas,
  type Movimiento, type TipoMovimiento,
} from './modelo';

const TIPOS: Array<{ id: TipoMovimiento; nombre: string }> = [
  { id: 'gasto', nombre: 'Gasto' },
  { id: 'ingreso', nombre: 'Ingreso' },
  { id: 'transferencia', nombre: 'Transferencia' },
];

export function FormMovimiento({ inicial, onListo }: { inicial?: Movimiento; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const activas = cuentas.filter((c) => !c.archivada || c.id === inicial?.cuenta_id);

  const [tipo, setTipo] = useState<TipoMovimiento>(inicial?.tipo ?? 'gasto');
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : '');
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy());
  const [cuenta, setCuenta] = useState(inicial?.cuenta_id ?? activas[0]?.id ?? '');
  const [destino, setDestino] = useState(inicial?.cuenta_destino_id ?? activas[1]?.id ?? '');
  const [montoDestino, setMontoDestino] = useState(inicial?.monto_destino != null ? String(inicial.monto_destino) : '');
  const [categoria, setCategoria] = useState(inicial?.categoria_id ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Parte de este gasto que es de Ulises (queda en Plata → Con Ulises).
  const { filas: compartidos } = useCompartidos();
  const enlazado = inicial ? compartidos.find((c) => c.movimiento_id === inicial.id && c.tipo === 'gasto') : undefined;
  const [compartido, setCompartido] = useState<boolean | null>(null);
  const [parte, setParte] = useState<string | null>(null);
  const esCompartido = compartido ?? !!enlazado;
  const parteTxt = parte ?? String(enlazado?.parte ?? 50);

  const cats = categorias.filter((c) => c.tipo === (tipo === 'ingreso' ? 'ingreso' : 'gasto'));
  const monedaOrigen = cuentas.find((c) => c.id === cuenta)?.moneda;
  const monedaDestino = cuentas.find((c) => c.id === destino)?.moneda;
  const cambioMoneda = tipo === 'transferencia' && monedaOrigen && monedaDestino && monedaOrigen !== monedaDestino;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto);
    if (!(m > 0)) return setError('Ingresá un monto mayor a cero.');
    if (!cuenta) return setError('Elegí una cuenta.');
    if (tipo === 'transferencia' && (!destino || destino === cuenta)) return setError('Elegí una cuenta destino distinta.');
    const md = cambioMoneda ? parsearMonto(montoDestino) : NaN;
    if (cambioMoneda && !(md > 0)) return setError(`Ingresá cuánto llega en ${monedaDestino}.`);

    const datos: Omit<Movimiento, 'id'> = {
      fecha,
      tipo,
      monto: m,
      cuenta_id: cuenta,
      cuenta_destino_id: tipo === 'transferencia' ? destino : null,
      monto_destino: cambioMoneda ? md : null,
      categoria_id: tipo === 'transferencia' ? null : categoria || null,
      descripcion: descripcion.trim(),
      pago_id: inicial?.pago_id ?? null,
    };
    const p = Number(parteTxt.replace(',', '.'));
    const conOtro = tipo === 'gasto' && esCompartido;
    if (conOtro && (Number.isNaN(p) || p <= 0 || p > 100)) return setError(`La parte de ${OTRO} va de 1 a 100 %.`);
    setGuardando(true);
    try {
      let id = inicial?.id;
      if (inicial) await modificar<Movimiento>(T.movimientos, inicial.id, datos);
      else id = (await crear<Movimiento>(T.movimientos, datos)).id;
      const dc = { fecha, tipo: 'gasto' as const, descripcion: datos.descripcion || 'Gasto compartido', total: m, pago: 'yo' as const, parte: p };
      if (conOtro && enlazado) await cambiarCompartido(enlazado, dc);
      else if (conOtro) await crear<Compartido>(TABLA_COMPARTIDOS, filaCompartido({ ...dc, movimiento_id: id }));
      else if (enlazado) await eliminar(TABLA_COMPARTIDOS, enlazado.id);
      onListo();
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  }

  if (activas.length === 0) {
    return <p className="nota">Primero creá una cuenta en Economía → Cuentas.</p>;
  }

  return (
    <form className="form" onSubmit={guardar}>
      <div className="segmentado">
        {TIPOS.map((t) => (
          <button type="button" key={t.id} className={tipo === t.id ? 'activo' : ''}
            onClick={() => { setTipo(t.id); setCategoria(''); }}>{t.nombre}</button>
        ))}
      </div>
      <div className="fila-campos">
        <Campo etiqueta={`Monto${monedaOrigen ? ` (${monedaOrigen})` : ''}`}>
          <input inputMode="decimal" autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </Campo>
      </div>
      <Campo etiqueta={tipo === 'transferencia' ? 'Desde' : 'Cuenta'}>
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </Campo>
      {tipo === 'transferencia' ? (
        <>
          <Campo etiqueta="Hacia">
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elegí…</option>
              {activas.filter((c) => c.id !== cuenta).map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </Campo>
          {cambioMoneda && (
            <Campo etiqueta={`Llega (${monedaDestino})`} ayuda="Por ejemplo, al comprar o vender dólares.">
              <input inputMode="decimal" value={montoDestino} onChange={(e) => setMontoDestino(e.target.value)} />
            </Campo>
          )}
        </>
      ) : (
        <Campo etiqueta="Categoría">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Sin categoría</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}
      {tipo === 'gasto' && (
        <label className="eco-switch">
          <input type="checkbox" checked={esCompartido} onChange={(e) => setCompartido(e.target.checked)} />
          <span><strong>Compartido con {OTRO}</strong><small>Una parte es de él: queda en lo que te debe.</small></span>
        </label>
      )}
      {tipo === 'gasto' && esCompartido && (
        <Campo etiqueta={`Parte de ${OTRO} (%)`} ayuda={(() => {
          const v = parsearMonto(monto || '0') * Number(parteTxt.replace(',', '.')) / 100;
          return v > 0 ? `${OTRO} te debe ${dinero(v)} por esto.` : 'A medias = 50.';
        })()}>
          <input inputMode="decimal" value={parteTxt} onChange={(e) => setParte(e.target.value)} />
        </Campo>
      )}
      <Campo etiqueta="Descripción">
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
      </Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
