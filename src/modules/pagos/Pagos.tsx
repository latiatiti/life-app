import { useState } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { desdeISO, dinero, fechaCorta, hoy, parsearMonto, relativo, sumarDias } from '../../core/format';
import { Campo, Estado, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import {
  estadoPago, FRECUENCIAS, MONEDAS, registrarPago, saltearVencimiento, T,
  useCategorias, useCuentas, useMovimientos, usePagos,
  type Frecuencia, type Moneda, type Pago,
} from '../economia/modelo';

/* ---------- Alta / edición ---------- */

function FormPago({ inicial, onListo }: { inicial?: Pago; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : '');
  const [moneda, setMoneda] = useState<Moneda>(inicial?.moneda ?? 'ARS');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(inicial?.frecuencia ?? 'mensual');
  const [vence, setVence] = useState(inicial?.proximo_vencimiento ?? hoy());
  const [categoria, setCategoria] = useState(inicial?.categoria_id ?? categorias.find((c) => c.nombre === 'Servicios')?.id ?? '');
  const [cuenta, setCuenta] = useState(inicial?.cuenta_id ?? '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');
  const [error, setError] = useState('');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto || '0');
    if (!nombre.trim()) return setError('Poné un nombre (ej. Luz, Internet, Alquiler).');
    if (Number.isNaN(m) || m < 0) return setError('El monto no es válido.');
    const datos: Omit<Pago, 'id'> = {
      nombre: nombre.trim(), monto: m, moneda, frecuencia,
      dia: desdeISO(vence).getDate(),
      proximo_vencimiento: vence,
      categoria_id: categoria || null,
      cuenta_id: cuenta || null,
      activo: inicial?.activo ?? true,
      notas: notas.trim(),
    };
    try {
      if (inicial) await modificar<Pago>(T.pagos, inicial.id, datos);
      else await crear<Pago>(T.pagos, datos);
      onListo();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Nombre"><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Internet" /></Campo>
      <div className="fila-campos">
        <Campo etiqueta="Monto estimado"><input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" /></Campo>
        <Campo etiqueta="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
        </Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Frecuencia">
          <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
            {Object.entries(FRECUENCIAS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Próximo vencimiento"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} required /></Campo>
      </div>
      <Campo etiqueta="Categoría">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Sin categoría</option>
          {categorias.filter((c) => c.tipo === 'gasto').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Se paga normalmente desde">
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          <option value="">Elegir al pagar</option>
          {cuentas.filter((c) => !c.archivada).map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Notas"><input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="N.º de cliente, link de pago…" /></Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Guardar</button>
      {inicial && (
        <>
          <button type="button" className="btn ancho" onClick={async () => {
            await modificar<Pago>(T.pagos, inicial.id, { activo: !inicial.activo }); onListo();
          }}>{inicial.activo ? 'Pausar (ya no lo pago)' : 'Reactivar'}</button>
          <button type="button" className="btn btn-peligro ancho" onClick={async () => {
            if (!window.confirm('¿Borrar este pago? Los gastos ya registrados se conservan.')) return;
            await eliminar(T.pagos, inicial.id); onListo();
          }}>{Icono.borrar} Borrar pago</button>
        </>
      )}
    </form>
  );
}

/* ---------- Registrar un pago ---------- */

export function FormPagar({ pago, onListo }: { pago: Pago; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const opciones = cuentas.filter((c) => !c.archivada);
  const [monto, setMonto] = useState(pago.monto ? String(pago.monto) : '');
  const [cuenta, setCuenta] = useState(pago.cuenta_id ?? opciones.find((c) => c.moneda === pago.moneda)?.id ?? '');
  const [fecha, setFecha] = useState(hoy());
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto);
    if (!(m > 0)) return setError('Ingresá cuánto pagaste.');
    if (!cuenta) return setError('Elegí desde qué cuenta pagaste.');
    setGuardando(true);
    try {
      await registrarPago(pago, { monto: m, cuenta_id: cuenta, fecha, categoria_id: pago.categoria_id });
      onListo();
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  }

  if (opciones.length === 0) return <p className="nota">Necesitás al menos una cuenta en Economía para registrar el pago.</p>;

  return (
    <form className="form" onSubmit={pagar}>
      <p className="nota">Vence {fechaCorta(pago.proximo_vencimiento)}. Se registra como gasto en Economía y el vencimiento pasa al período siguiente.</p>
      <div className="fila-campos">
        <Campo etiqueta="Monto pagado"><input autoFocus inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Campo etiqueta="Fecha de pago"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Desde la cuenta">
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          <option value="">Elegí…</option>
          {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar pago'}</button>
      {pago.frecuencia !== 'unico' && (
        <button type="button" className="btn ancho" onClick={async () => {
          if (!window.confirm('¿Saltear este vencimiento sin registrar gasto?')) return;
          await saltearVencimiento(pago); onListo();
        }}>Saltear este vencimiento</button>
      )}
    </form>
  );
}

/* ---------- Pantalla ---------- */

function FilaPago({ p, onPagar, onEditar }: { p: Pago; onPagar: () => void; onEditar: () => void }) {
  const est = estadoPago(p);
  return (
    <li className="lista-item">
      <button className="boton-fila crece" onClick={onEditar}>
        <div className="crece">
          <strong>{p.nombre}</strong>
          <small className="nota">
            {p.activo ? `Vence ${fechaCorta(p.proximo_vencimiento)} (${relativo(p.proximo_vencimiento)})` : 'Pausado'}
            {' · '}{FRECUENCIAS[p.frecuencia].nombre}
          </small>
        </div>
        <span className="num">{p.monto ? dinero(Number(p.monto), p.moneda) : 'Monto variable'}</span>
      </button>
      {p.activo && (
        <div className="fila-derecha">
          {est === 'vencido' && <Estado nivel="critico" texto="Vencido" />}
          {est === 'pronto' && <Estado nivel="aviso" texto="Vence pronto" />}
          <button className="btn btn-primario chico" onClick={onPagar}>Pagar</button>
        </div>
      )}
    </li>
  );
}

export function PantallaPagos() {
  const { filas: pagos, cargado } = usePagos();
  const { filas: movs } = useMovimientos();
  const [editando, setEditando] = useState<Pago | 'nuevo' | null>(null);
  const [pagando, setPagando] = useState<Pago | null>(null);

  const activos = pagos.filter((p) => p.activo).sort((a, b) => a.proximo_vencimiento.localeCompare(b.proximo_vencimiento));
  const vencidos = activos.filter((p) => estadoPago(p) === 'vencido');
  const proximos = activos.filter((p) => estadoPago(p) !== 'vencido' && p.proximo_vencimiento <= sumarDias(hoy(), 30));
  const resto = activos.filter((p) => p.proximo_vencimiento > sumarDias(hoy(), 30));
  const pausados = pagos.filter((p) => !p.activo);

  const historial = movs.filter((m) => m.pago_id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  const nombrePago = new Map(pagos.map((p) => [p.id, p.nombre]));

  const grupo = (titulo: string, lista: Pago[]) => lista.length > 0 && (
    <Tarjeta titulo={`${titulo} (${lista.length})`}>
      <ul className="lista">
        {lista.map((p) => <FilaPago key={p.id} p={p} onPagar={() => setPagando(p)} onEditar={() => setEditando(p)} />)}
      </ul>
    </Tarjeta>
  );

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">Servicios, tarjetas, alquiler y todo lo que vence.</p>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Pago</button>
      </div>

      {cargado && pagos.length === 0 && (
        <Vacio titulo="Cargá tus pagos recurrentes">
          <p>Luz, gas, internet, alquiler, tarjeta, gimnasio… Te aviso antes de que venzan y, al pagarlos, se registran solos como gasto.</p>
          <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Primer pago</button>
        </Vacio>
      )}

      {grupo('Vencidos', vencidos)}
      {grupo('Próximos 30 días', proximos)}
      {grupo('Más adelante', resto)}
      {grupo('Pausados', pausados)}

      {historial.length > 0 && (
        <Tarjeta titulo="Últimos pagos registrados">
          <ul className="lista">
            {historial.map((m) => (
              <li key={m.id} className="lista-item">
                <div className="crece">
                  <strong>{nombrePago.get(m.pago_id!) ?? m.descripcion}</strong>
                  <small className="nota">{fechaCorta(m.fecha)}</small>
                </div>
                <span className="num">{dinero(Number(m.monto))}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Modal titulo={editando === 'nuevo' ? 'Nuevo pago recurrente' : 'Editar pago'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormPago inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
      <Modal titulo={pagando ? `Pagar ${pagando.nombre}` : 'Pagar'} abierto={!!pagando} onCerrar={() => setPagando(null)}>
        {pagando && <FormPagar pago={pagando} onListo={() => setPagando(null)} />}
      </Modal>
    </div>
  );
}

