import { useState } from 'react';
import { crear, modificar } from '../../core/db';
import { hoy, parsearMonto } from '../../core/format';
import { Campo } from '../../ui/ui';
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
    setGuardando(true);
    try {
      if (inicial) await modificar<Movimiento>(T.movimientos, inicial.id, datos);
      else await crear<Movimiento>(T.movimientos, datos);
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
      <Campo etiqueta="Descripción">
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
      </Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
