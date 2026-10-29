import { useState } from 'react';
import { eliminar, useTabla } from '../../core/db';
import { dinero, fechaCorta, hoy, parsearMonto } from '../../core/format';
import { Campo, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import {
  anotarCompartido, cambiarCompartido, comprasSinAnotar, conSaldoCorrido, datosDeCompra, efecto, OTRO,
  saldoCon, TABLA_COMPARTIDOS, TIPOS_COMPARTIDO, useCompartidos,
  type CompraConReparto, type Compartido, type TipoCompartido,
} from './compartidos';
import { useCategorias, useCuentas } from './modelo';

/** Partes rápidas: a medias, todo del otro, o lo que escribas. */
const PARTES = [50, 100];

interface Inicio { tipo: TipoCompartido; pago: 'yo' | 'otro'; total?: number; descripcion?: string }

export function FormCompartido({ inicial, inicio, onListo }: { inicial?: Compartido; inicio?: Inicio; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const activas = cuentas.filter((c) => !c.archivada && c.moneda === 'ARS');
  const [tipo, setTipo] = useState<TipoCompartido>(inicial?.tipo ?? inicio?.tipo ?? 'gasto');
  const [pago, setPago] = useState<'yo' | 'otro'>(inicial?.pago ?? inicio?.pago ?? 'yo');
  const [total, setTotal] = useState(inicial ? String(inicial.total) : inicio?.total ? String(inicio.total) : '');
  const [parte, setParte] = useState(String(inicial?.parte ?? 50));
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? inicio?.descripcion ?? '');
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy());
  // Nuevo: por defecto también queda en tus cuentas (la plata salió o entró de verdad).
  const [cuenta, setCuenta] = useState(inicial ? '' : activas[0]?.id ?? '');
  const [categoria, setCategoria] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const t = parsearMonto(total || '0');
  const p = Number(parte.replace(',', '.'));
  const m = t > 0 && !Number.isNaN(p) ? efecto({ tipo, total: t, pago, parte: p }) : 0;
  // Gasto que pagó él: no sale plata de tus cuentas, así que no hay movimiento que anotar.
  const tocaCuenta = !inicial && !(tipo === 'gasto' && pago === 'otro');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!(t > 0)) return setError('Poné cuánto fue.');
    if (tipo === 'gasto' && (Number.isNaN(p) || p < 0 || p > 100)) return setError('La parte va de 0 a 100 %.');
    if (tipo === 'gasto' && !descripcion.trim()) return setError('Anotá qué fue (ej. Gas, verdulería).');
    const d = { fecha, tipo, descripcion, total: t, pago, parte: tipo === 'gasto' ? p : 100 };
    setGuardando(true);
    try {
      if (inicial) await cambiarCompartido(inicial, d);
      else await anotarCompartido(d, tocaCuenta && cuenta ? { cuenta_id: cuenta, categoria_id: tipo === 'gasto' && pago === 'yo' ? categoria || null : null } : null);
      onListo();
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  }

  const quien = (x: 'yo' | 'otro') => (tipo === 'pago'
    ? (x === 'yo' ? `Yo le pagué a ${OTRO}` : `${OTRO} me pagó`)
    : tipo === 'prestamo' ? (x === 'yo' ? `Yo le presté` : `${OTRO} me prestó`)
      : (x === 'yo' ? 'Pagué yo' : `Pagó ${OTRO}`));

  return (
    <form className="form" onSubmit={guardar}>
      <div className="segmentado">
        {(Object.keys(TIPOS_COMPARTIDO) as TipoCompartido[]).map((k) => (
          <button type="button" key={k} className={tipo === k ? 'activo' : ''} onClick={() => setTipo(k)}>
            {k === 'gasto' ? 'Gasto' : k === 'prestamo' ? 'Préstamo' : 'Saldar'}
          </button>
        ))}
      </div>
      <div className="segmentado">
        {(['yo', 'otro'] as const).map((x) => (
          <button type="button" key={x} className={pago === x ? 'activo' : ''} onClick={() => setPago(x)}>{quien(x)}</button>
        ))}
      </div>
      <div className="fila-campos">
        <Campo etiqueta={tipo === 'gasto' ? 'Total del gasto' : 'Monto'}>
          <input inputMode="decimal" autoFocus={!inicio?.total} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" />
        </Campo>
        <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></Campo>
      </div>
      {tipo === 'gasto' && (
        <Campo etiqueta={pago === 'yo' ? `Parte de ${OTRO}` : 'Tu parte'} ayuda="A medias = 50 %. Si era todo para el otro, 100 %.">
          <div className="eco-partes">
            {PARTES.map((x) => (
              <button type="button" key={x} className={`btn chico ${Number(parte) === x ? 'activo' : ''}`} onClick={() => setParte(String(x))}>
                {x === 50 ? 'A medias' : 'Todo'}
              </button>
            ))}
            <span className="eco-parte-input"><input inputMode="decimal" value={parte} onChange={(e) => setParte(e.target.value)} aria-label="Porcentaje" /> %</span>
          </div>
        </Campo>
      )}
      <Campo etiqueta={tipo === 'gasto' ? 'Qué fue' : 'Nota'}>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          placeholder={tipo === 'gasto' ? 'Ej. Gas, verdulería, internet' : 'Opcional'} />
      </Campo>
      {tocaCuenta && activas.length > 0 && (
        <div className="fila-campos">
          <Campo etiqueta={pago === 'yo' ? 'Sale de' : 'Entra en'} ayuda="Así también queda en tus cuentas.">
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">No anotar en mis cuentas</option>
              {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          {tipo === 'gasto' && pago === 'yo' && cuenta && (
            <Campo etiqueta="Categoría">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Sin categoría</option>
                {categorias.filter((c) => c.tipo === 'gasto').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          )}
        </div>
      )}
      {m !== 0 && (
        <p className={`eco-efecto ${m > 0 ? 'te-debe' : 'debes'}`}>
          {m > 0 ? `${OTRO} te debe ${dinero(m)} por esto` : `Le debés a ${OTRO} ${dinero(-m)} por esto`}
          {tipo === 'pago' && ' (baja la deuda)'}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      {inicial && (
        <>
          {inicial.movimiento_id && <p className="nota">El movimiento en tus cuentas sigue el mismo monto y fecha. Si lo borrás acá, el de tus cuentas queda: borralo en Movimientos si hace falta.</p>}
          <button type="button" className="btn btn-peligro ancho" onClick={async () => { await eliminar(TABLA_COMPARTIDOS, inicial.id); onListo(); }}>
            {Icono.borrar} Borrar
          </button>
        </>
      )}
    </form>
  );
}

/** Plata → Con Ulises: lo que se deben, cada cosa con el saldo corrido, y saldar con un toque. */
export function PantallaCompartidos() {
  const { filas, cargado } = useCompartidos();
  const { filas: compras } = useTabla<CompraConReparto>('com_compras');
  const { filas: supers } = useTabla<{ id: string; nombre: string }>('com_supers');
  const [form, setForm] = useState<{ inicial?: Compartido; inicio?: Inicio } | null>(null);
  const [sumando, setSumando] = useState(false);

  const saldo = saldoCon(filas);
  const lista = conSaldoCorrido(filas);
  const pendientes = comprasSinAnotar(compras, filas);
  const nombreSuper = (id?: string | null) => supers.find((s) => s.id === id)?.nombre;
  const estado = Math.abs(saldo) < 1 ? 'mano' : saldo > 0 ? 'te-debe' : 'debes';

  async function sumarCompras() {
    setSumando(true);
    for (const c of pendientes) await anotarCompartido(datosDeCompra(c, nombreSuper((c as CompraConReparto & { super_id?: string }).super_id)));
    setSumando(false);
  }

  const saldar = () => setForm({ inicio: { tipo: 'pago', pago: saldo > 0 ? 'otro' : 'yo', total: Math.abs(saldo), descripcion: '' } });

  return (
    <div className="pila">
      <section className={`tarjeta eco-saldo ${estado}`} aria-live="polite">
        <span className="cifra-etq">Cuenta con {OTRO}</span>
        <strong className="eco-saldo-val num">{estado === 'mano' ? '$ 0' : dinero(Math.abs(saldo))}</strong>
        <span className="eco-saldo-txt">
          {estado === 'mano' ? 'Están a mano' : estado === 'te-debe' ? `${OTRO} te debe` : `Le debés a ${OTRO}`}
        </span>
        <div className="eco-saldo-acciones">
          <button className="btn btn-primario" onClick={() => setForm({ inicio: { tipo: 'gasto', pago: 'yo' } })}>{Icono.mas} Gasto compartido</button>
          {estado !== 'mano' && (
            <button className="btn" onClick={saldar}>{estado === 'te-debe' ? 'Me pagó' : 'Le pagué'}</button>
          )}
          <button className="btn" onClick={() => setForm({ inicio: { tipo: 'prestamo', pago: 'yo' } })}>Préstamo</button>
        </div>
      </section>

      {pendientes.length > 0 && (
        <div className="eco-aviso-linea">
          <span>
            {pendientes.length === 1 ? 'Hay 1 compra del súper' : `Hay ${pendientes.length} compras del súper`} con cosas de {OTRO} que todavía no están en esta cuenta.
          </span>
          <button className="btn chico" disabled={sumando} onClick={sumarCompras}>{sumando ? 'Sumando…' : 'Sumarlas'}</button>
        </div>
      )}

      {cargado && lista.length === 0 ? (
        <Vacio titulo={`Llevá la cuenta con ${OTRO}`}>
          <p>Anotá lo que pagaste por los dos (y qué parte le toca), lo que te prestó o le prestaste, y cuando se pagan. La app lleva el saldo.</p>
          <p className="nota">Las compras del súper con reparto se suman solas.</p>
        </Vacio>
      ) : (
        <Tarjeta titulo="Movimientos">
          <ul className="lista eco-compartidos">
            {lista.map(({ fila: f, saldo: s }) => {
              const monto = Number(f.monto) || 0;
              const titulo = f.descripcion || TIPOS_COMPARTIDO[f.tipo];
              const detalle = f.tipo === 'gasto'
                ? `${f.pago === 'yo' ? 'Pagaste' : `Pagó ${OTRO}`} ${dinero(Number(f.total))} · ${Number(f.parte) === 50 ? 'a medias' : `${Number(f.parte)} % ${f.pago === 'yo' ? `de ${OTRO}` : 'tuyo'}`}`
                : f.tipo === 'prestamo' ? (f.pago === 'yo' ? 'Le prestaste' : 'Te prestó') : (f.pago === 'yo' ? `Le pagaste` : 'Te pagó');
              return (
                <li key={f.id}>
                  <button className="lista-item boton-fila" onClick={() => setForm({ inicial: f })}>
                    <span className="eco-ev-signo" aria-hidden>{monto >= 0 ? '+' : '−'}</span>
                    <div className="crece">
                      <strong>{titulo}{f.compra_id && <span className="eco-chip">súper</span>}</strong>
                      <small className="nota">{fechaCorta(f.fecha)} · {detalle}</small>
                    </div>
                    <div className="eco-comp-montos">
                      <span className={`num ${monto >= 0 ? 'texto-bien' : 'texto-aviso'}`}>{monto >= 0 ? '+' : '−'}{dinero(Math.abs(monto))}</span>
                      <small className="nota num" title="Saldo después de esto">{Math.abs(s) < 1 ? 'a mano' : s > 0 ? `te debe ${dinero(s)}` : `le debés ${dinero(-s)}`}</small>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="nota">+ suma a lo que {OTRO} te debe · − suma a lo que le debés.</p>
        </Tarjeta>
      )}

      <Modal titulo={form?.inicial ? 'Editar' : form?.inicio?.tipo === 'pago' ? 'Saldar' : form?.inicio?.tipo === 'prestamo' ? 'Préstamo' : 'Gasto compartido'}
        abierto={!!form} onCerrar={() => setForm(null)}>
        {form && <FormCompartido inicial={form.inicial} inicio={form.inicio} onListo={() => setForm(null)} />}
      </Modal>
    </div>
  );
}
