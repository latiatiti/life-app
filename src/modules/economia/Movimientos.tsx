import { useState } from 'react';
import { eliminar } from '../../core/db';
import { dinero, fechaCorta, mesActual } from '../../core/format';
import { Icono, Modal, Tarjeta } from '../../ui/ui';
import { FormMovimiento } from './FormMovimiento';
import { SelectorMes } from './Resumen';
import { T, useCategorias, useCuentas, useMovimientos, usePagos, type Movimiento, type TipoMovimiento } from './modelo';

export function PantallaMovimientos() {
  const [mes, setMes] = useState(mesActual());
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimiento | ''>('');
  const [filtroCuenta, setFiltroCuenta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Movimiento | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const { filas: movs } = useMovimientos();
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: pagos } = usePagos();

  const cuentaDe = new Map(cuentas.map((c) => [c.id, c]));
  const catDe = new Map(categorias.map((c) => [c.id, c]));
  const pagoDe = new Map(pagos.map((p) => [p.id, p]));
  const q = busqueda.trim().toLowerCase();

  const lista = movs
    .filter((m) => m.fecha.startsWith(mes))
    .filter((m) => !filtroTipo || m.tipo === filtroTipo)
    .filter((m) => !filtroCuenta || m.cuenta_id === filtroCuenta || m.cuenta_destino_id === filtroCuenta)
    .filter((m) => !q || m.descripcion.toLowerCase().includes(q) || (catDe.get(m.categoria_id ?? '')?.nombre ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  // Agrupar por día
  const dias = new Map<string, Movimiento[]>();
  for (const m of lista) dias.set(m.fecha, [...(dias.get(m.fecha) ?? []), m]);

  async function borrar(m: Movimiento) {
    if (!window.confirm('¿Borrar este movimiento?')) return;
    await eliminar(T.movimientos, m.id);
    setEditando(null);
  }

  return (
    <div className="pila">
      <div className="barra-acciones">
        <SelectorMes mes={mes} onCambio={setMes} />
        <button className="btn btn-primario" onClick={() => setNuevo(true)}>{Icono.mas} Movimiento</button>
      </div>
      <div className="filtros">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoMovimiento | '')} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="gasto">Gastos</option>
          <option value="ingreso">Ingresos</option>
          <option value="transferencia">Transferencias</option>
        </select>
        <select value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)} aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input type="search" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {lista.length === 0 ? (
        <Tarjeta><p className="nota">No hay movimientos con estos filtros.</p></Tarjeta>
      ) : (
        [...dias.entries()].map(([dia, ms]) => (
          <Tarjeta key={dia} titulo={fechaCorta(dia)}>
            <ul className="lista">
              {ms.map((m) => {
                const cuenta = cuentaDe.get(m.cuenta_id);
                const cat = catDe.get(m.categoria_id ?? '');
                const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '−' : '';
                const titulo = m.descripcion || cat?.nombre || (m.tipo === 'transferencia' ? 'Transferencia' : 'Sin descripción');
                const sub = m.tipo === 'transferencia'
                  ? `${cuenta?.nombre ?? '?'} → ${cuentaDe.get(m.cuenta_destino_id ?? '')?.nombre ?? '?'}`
                  : `${cat?.nombre ?? 'Sin categoría'} · ${cuenta?.nombre ?? '?'}`;
                return (
                  <li key={m.id}>
                    <button className="lista-item boton-fila" onClick={() => setEditando(m)}>
                      <span className="punto" style={{ background: cat?.color ?? 'var(--muted)' }} />
                      <div className="crece">
                        <strong>{titulo}</strong>
                        <small className="nota">
                          {sub}
                          {m.pago_id && ` · pago: ${pagoDe.get(m.pago_id)?.nombre ?? 'recurrente'}`}
                        </small>
                      </div>
                      <span className={`num ${m.tipo === 'ingreso' ? 'texto-bien' : ''}`}>
                        {signo}{dinero(Number(m.monto), cuenta?.moneda)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        ))
      )}

      <Modal titulo="Nuevo movimiento" abierto={nuevo} onCerrar={() => setNuevo(false)}>
        <FormMovimiento onListo={() => setNuevo(false)} />
      </Modal>
      <Modal titulo="Editar movimiento" abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && (
          <>
            <FormMovimiento inicial={editando} onListo={() => setEditando(null)} />
            <button className="btn btn-peligro ancho" onClick={() => borrar(editando)}>{Icono.borrar} Borrar movimiento</button>
          </>
        )}
      </Modal>
    </div>
  );
}
