import { useState } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { dinero, parsearMonto } from '../../core/format';
import { Campo, Icono, Modal, Tarjeta } from '../../ui/ui';
import {
  COLORES, MONEDAS, T, TIPOS_CUENTA, saldoCuenta, useCategorias, useCuentas, useMovimientos, usePagos,
  type Categoria, type Cuenta, type Moneda, type Movimiento, type Pago, type TipoCategoria, type TipoCuenta,
} from './modelo';

/* ---------- Cuentas ---------- */

function FormCuenta({ inicial, onListo }: { inicial?: Cuenta; onListo: () => void }) {
  const { filas: movs } = useMovimientos();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCuenta>(inicial?.tipo ?? 'banco');
  const [moneda, setMoneda] = useState<Moneda>(inicial?.moneda ?? 'ARS');
  const [saldo, setSaldo] = useState(inicial ? String(inicial.saldo_inicial) : '0');
  const [error, setError] = useState('');
  const usada = !!inicial && movs.some((m) => m.cuenta_id === inicial.id || m.cuenta_destino_id === inicial.id);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const s = parsearMonto(saldo || '0');
    if (!nombre.trim()) return setError('Poné un nombre.');
    if (Number.isNaN(s)) return setError('El saldo inicial no es un número válido.');
    const datos = { nombre: nombre.trim(), tipo, moneda, saldo_inicial: s };
    try {
      if (inicial) await modificar<Cuenta>(T.cuentas, inicial.id, datos);
      else await crear<Cuenta>(T.cuentas, { ...datos, archivada: false });
      onListo();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Nombre"><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Banco Nación" /></Campo>
      <div className="fila-campos">
        <Campo etiqueta="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)}>
            {Object.entries(TIPOS_CUENTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} disabled={usada}>
            {MONEDAS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Saldo inicial" ayuda={tipo === 'tarjeta' ? 'En tarjetas, lo que debés va en negativo (ej. -50000).' : 'Lo que tenías al empezar a usar LIFE.'}>
        <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
      </Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Guardar</button>
      {inicial && (
        usada ? (
          <button type="button" className="btn ancho" onClick={async () => {
            await modificar<Cuenta>(T.cuentas, inicial.id, { archivada: !inicial.archivada }); onListo();
          }}>{inicial.archivada ? 'Reactivar cuenta' : 'Archivar cuenta (tiene movimientos)'}</button>
        ) : (
          <button type="button" className="btn btn-peligro ancho" onClick={async () => {
            if (!window.confirm('¿Borrar esta cuenta?')) return;
            await eliminar(T.cuentas, inicial.id); onListo();
          }}>{Icono.borrar} Borrar cuenta</button>
        )
      )}
    </form>
  );
}

/* ---------- Categorías ---------- */

function FormCategoria({ inicial, onListo }: { inicial?: Categoria; onListo: () => void }) {
  const { filas: categorias } = useCategorias();
  const { filas: movs } = useMovimientos();
  const { filas: pagos } = usePagos();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCategoria>(inicial?.tipo ?? 'gasto');
  const [color, setColor] = useState(inicial?.color ?? COLORES[categorias.length % COLORES.length]);
  const [presupuesto, setPresupuesto] = useState(inicial?.presupuesto ? String(inicial.presupuesto) : '');
  const [error, setError] = useState('');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError('Poné un nombre.');
    const p = presupuesto.trim() ? parsearMonto(presupuesto) : null;
    if (p !== null && !(p > 0)) return setError('El presupuesto tiene que ser mayor a cero, o dejalo vacío.');
    const datos = { nombre: nombre.trim(), tipo, color, presupuesto: tipo === 'gasto' ? p : null };
    try {
      if (inicial) await modificar<Categoria>(T.categorias, inicial.id, datos);
      else await crear<Categoria>(T.categorias, datos);
      onListo();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function borrar() {
    if (!inicial) return;
    const usos = movs.filter((m) => m.categoria_id === inicial.id).length + pagos.filter((p) => p.categoria_id === inicial.id).length;
    const aviso = usos ? `Se usa en ${usos} movimientos o pagos, que quedarán “Sin categoría”. ` : '';
    if (!window.confirm(`${aviso}¿Borrar la categoría?`)) return;
    for (const m of movs.filter((m) => m.categoria_id === inicial.id)) await modificar<Movimiento>(T.movimientos, m.id, { categoria_id: null });
    for (const p of pagos.filter((p) => p.categoria_id === inicial.id)) await modificar<Pago>(T.pagos, p.id, { categoria_id: null });
    await eliminar(T.categorias, inicial.id);
    onListo();
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Nombre"><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
      <div className="segmentado">
        <button type="button" className={tipo === 'gasto' ? 'activo' : ''} onClick={() => setTipo('gasto')}>Gasto</button>
        <button type="button" className={tipo === 'ingreso' ? 'activo' : ''} onClick={() => setTipo('ingreso')}>Ingreso</button>
      </div>
      <Campo etiqueta="Color">
        <div className="colores">
          {COLORES.map((c) => (
            <button type="button" key={c} className={color === c ? 'sel' : ''} style={{ background: c }}
              onClick={() => setColor(c)} aria-label={`Color ${c}`} />
          ))}
        </div>
      </Campo>
      {tipo === 'gasto' && (
        <Campo etiqueta="Presupuesto mensual (ARS)" ayuda="Opcional. Te aviso al llegar al 80 % y al 100 %.">
          <input inputMode="decimal" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="Sin presupuesto" />
        </Campo>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Guardar</button>
      {inicial && <button type="button" className="btn btn-peligro ancho" onClick={borrar}>{Icono.borrar} Borrar categoría</button>}
    </form>
  );
}

/* ---------- Pantalla ---------- */

export function PantallaCuentas() {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: movs } = useMovimientos();
  const [cuenta, setCuenta] = useState<Cuenta | 'nueva' | null>(null);
  const [categoria, setCategoria] = useState<Categoria | 'nueva' | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const visibles = cuentas.filter((c) => verArchivadas || !c.archivada);
  const archivadas = cuentas.filter((c) => c.archivada).length;

  return (
    <div className="pila">
      <Tarjeta titulo="Cuentas" accion={<button className="btn" onClick={() => setCuenta('nueva')}>{Icono.mas} Cuenta</button>}>
        {visibles.length === 0 ? <p className="nota">Todavía no hay cuentas.</p> : (
          <ul className="lista">
            {visibles.map((c) => (
              <li key={c.id}>
                <button className="lista-item boton-fila" onClick={() => setCuenta(c)}>
                  <div className="crece">
                    <strong>{c.nombre}{c.archivada && ' (archivada)'}</strong>
                    <small className="nota">{TIPOS_CUENTA[c.tipo]} · {c.moneda}</small>
                  </div>
                  <span className="num">{dinero(saldoCuenta(c, movs), c.moneda)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {archivadas > 0 && (
          <button className="btn-link" onClick={() => setVerArchivadas(!verArchivadas)}>
            {verArchivadas ? 'Ocultar archivadas' : `Ver archivadas (${archivadas})`}
          </button>
        )}
      </Tarjeta>

      <Tarjeta titulo="Categorías y presupuestos" accion={<button className="btn" onClick={() => setCategoria('nueva')}>{Icono.mas} Categoría</button>}>
        {(['gasto', 'ingreso'] as const).map((tipo) => (
          <div key={tipo}>
            <h3 className="subtitulo">{tipo === 'gasto' ? 'Gastos' : 'Ingresos'}</h3>
            <ul className="lista">
              {categorias.filter((c) => c.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => (
                <li key={c.id}>
                  <button className="lista-item boton-fila" onClick={() => setCategoria(c)}>
                    <span className="punto" style={{ background: c.color }} />
                    <span className="crece">{c.nombre}</span>
                    {c.presupuesto ? <span className="nota num">{dinero(Number(c.presupuesto))}/mes</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Tarjeta>

      <Modal titulo={cuenta === 'nueva' ? 'Nueva cuenta' : 'Editar cuenta'} abierto={!!cuenta} onCerrar={() => setCuenta(null)}>
        {cuenta && <FormCuenta inicial={cuenta === 'nueva' ? undefined : cuenta} onListo={() => setCuenta(null)} />}
      </Modal>
      <Modal titulo={categoria === 'nueva' ? 'Nueva categoría' : 'Editar categoría'} abierto={!!categoria} onCerrar={() => setCategoria(null)}>
        {categoria && <FormCategoria inicial={categoria === 'nueva' ? undefined : categoria} onListo={() => setCategoria(null)} />}
      </Modal>
    </div>
  );
}
