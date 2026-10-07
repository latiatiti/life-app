import { useState } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { dinero, fechaCorta, hoy, parsearMonto, relativo, sumarDias } from '../../core/format';
import { Campo, Cifra, Estado, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import {
  cobrosEsperados, FRECUENCIAS_COBRO, MONEDAS, registrarCobro, siguienteCobro, T,
  useCategorias, useCuentas, useIngresos,
  type FrecuenciaCobro, type Ingreso, type Moneda,
} from './modelo';

function FormIngreso({ inicial, onListo }: { inicial?: Ingreso; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : '');
  const [moneda, setMoneda] = useState<Moneda>(inicial?.moneda ?? 'ARS');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCobro>(inicial?.frecuencia ?? 'semanal');
  const [proximo, setProximo] = useState(inicial?.proximo_cobro ?? hoy());
  const [cuenta, setCuenta] = useState(inicial?.cuenta_id ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria_id ?? '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');
  const [error, setError] = useState('');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto || '0');
    if (!nombre.trim()) return setError('Poné un nombre (ej. Reparto de soda).');
    if (Number.isNaN(m) || m < 0) return setError('El monto no es válido.');
    const datos: Omit<Ingreso, 'id'> = {
      nombre: nombre.trim(), monto: m, moneda, frecuencia, proximo_cobro: proximo,
      cuenta_id: cuenta || null, categoria_id: categoria || null,
      activo: inicial?.activo ?? true, notas: notas.trim(),
    };
    try {
      if (inicial) await modificar<Ingreso>(T.ingresos, inicial.id, datos);
      else await crear<Ingreso>(T.ingresos, datos);
      onListo();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Nombre"><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Fábrica" /></Campo>
      <div className="fila-campos">
        <Campo etiqueta="Monto que cobrás"><input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" /></Campo>
        <Campo etiqueta="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
        </Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Cada cuánto cobrás">
          <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaCobro)}>
            {Object.entries(FRECUENCIAS_COBRO).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Próximo cobro"><input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} required /></Campo>
      </div>
      <Campo etiqueta="Entra en la cuenta">
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          <option value="">Elegir al cobrar</option>
          {cuentas.filter((c) => !c.archivada).map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Categoría">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Sin categoría</option>
          {categorias.filter((c) => c.tipo === 'ingreso').map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Notas"><input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. 3 días por semana" /></Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Guardar</button>
      {inicial && (
        <>
          <button type="button" className="btn ancho" onClick={async () => {
            await modificar<Ingreso>(T.ingresos, inicial.id, { activo: !inicial.activo }); onListo();
          }}>{inicial.activo ? 'Pausar' : 'Reactivar'}</button>
          <button type="button" className="btn btn-peligro ancho" onClick={async () => {
            if (!window.confirm('¿Borrar este ingreso? Los cobros ya registrados se conservan.')) return;
            await eliminar(T.ingresos, inicial.id); onListo();
          }}>{Icono.borrar} Borrar</button>
        </>
      )}
    </form>
  );
}

export function FormCobrar({ ingreso, onListo }: { ingreso: Ingreso; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const opciones = cuentas.filter((c) => !c.archivada);
  const [monto, setMonto] = useState(String(ingreso.monto || ''));
  const [cuenta, setCuenta] = useState(ingreso.cuenta_id ?? opciones.find((c) => c.moneda === ingreso.moneda)?.id ?? '');
  const [fecha, setFecha] = useState(hoy());
  const [error, setError] = useState('');

  async function cobrar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto);
    if (!(m > 0)) return setError('Ingresá cuánto cobraste.');
    if (!cuenta) return setError('Elegí en qué cuenta entró.');
    try {
      await registrarCobro(ingreso, { monto: m, cuenta_id: cuenta, fecha });
      onListo();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (opciones.length === 0) return <p className="nota">Necesitás al menos una cuenta en Economía para registrar el cobro.</p>;
  return (
    <form className="form" onSubmit={cobrar}>
      <p className="nota">Se registra como ingreso y el próximo cobro pasa al {fechaCorta(siguienteCobro(ingreso))}.</p>
      <div className="fila-campos">
        <Campo etiqueta="Monto cobrado"><input autoFocus inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Cuenta">
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          <option value="">Elegí…</option>
          {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Registrar cobro</button>
    </form>
  );
}

export function PantallaIngresos() {
  const { filas: ingresos, cargado } = useIngresos();
  const [editando, setEditando] = useState<Ingreso | 'nuevo' | null>(null);
  const [cobrando, setCobrando] = useState<Ingreso | null>(null);
  const en30 = cobrosEsperados(ingresos.filter((i) => i.moneda === 'ARS'), sumarDias(hoy(), 30));
  const total30 = en30.reduce((s, c) => s + (Number(c.ingreso.monto) || 0), 0);
  const porSemana = ingresos.filter((i) => i.activo && i.moneda === 'ARS').reduce((s, i) => {
    const m = Number(i.monto) || 0;
    return s + (i.frecuencia === 'semanal' ? m : i.frecuencia === 'quincenal' ? m / 2 : (m * 12) / 52);
  }, 0);

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">Tus trabajos y lo que cobrás en cada uno.</p>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Ingreso</button>
      </div>

      {cargado && ingresos.length === 0 ? (
        <Vacio titulo="Cargá de dónde entra tu plata">
          <p>Cada trabajo con su monto y cada cuánto cobrás. Así la app sabe cuánto va a entrar y puede proyectar.</p>
          <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Primer ingreso</button>
        </Vacio>
      ) : (
        <>
          <div className="grilla-cifras">
            <Cifra etiqueta="Por semana (promedio)" valor={dinero(porSemana)} />
            <Cifra etiqueta="Próximos 30 días" valor={dinero(total30)} nota={`${en30.length} cobros`} />
          </div>
          <Tarjeta titulo="Fuentes de ingreso">
            <ul className="lista">
              {ingresos.map((i) => (
                <li key={i.id} className="lista-item">
                  <button className="boton-fila crece" onClick={() => setEditando(i)}>
                    <div className="crece">
                      <strong>{i.nombre}</strong>
                      <small className="nota">
                        {i.activo ? `${FRECUENCIAS_COBRO[i.frecuencia].nombre} · próximo ${fechaCorta(i.proximo_cobro)} (${relativo(i.proximo_cobro)})` : 'Pausado'}
                      </small>
                    </div>
                    <span className="num">{dinero(Number(i.monto), i.moneda)}</span>
                  </button>
                  {i.activo && (
                    <div className="fila-derecha">
                      {i.proximo_cobro < hoy() && <Estado nivel="aviso" texto="Sin registrar" />}
                      <button className="btn btn-primario chico" onClick={() => setCobrando(i)}>Cobré</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Tarjeta>
        </>
      )}

      <Modal titulo={editando === 'nuevo' ? 'Nuevo ingreso' : 'Editar ingreso'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormIngreso inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
      <Modal titulo={cobrando ? `Cobro: ${cobrando.nombre}` : 'Cobro'} abierto={!!cobrando} onCerrar={() => setCobrando(null)}>
        {cobrando && <FormCobrar ingreso={cobrando} onListo={() => setCobrando(null)} />}
      </Modal>
    </div>
  );
}
