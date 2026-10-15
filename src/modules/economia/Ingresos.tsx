import { useState } from 'react';
import { ir } from '../../core/router';
import { crear, eliminar, modificar } from '../../core/db';
import { dinero, fechaCorta, fechaLarga, hoy, parsearMonto, relativo, sumarDias } from '../../core/format';
import { Campo, Cifra, Estado, Icono, Modal, Vacio } from '../../ui/ui';
import {
  cobrarAdeudado, cobrosEsperados, fijarAdeudado, FRECUENCIAS_COBRO, MONEDAS, quedoPendiente,
  registrarCobro, siguienteCobro, T, useCategorias, useCuentas, useIngresos,
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
  const [puedeAdeudarse, setPuedeAdeudarse] = useState(inicial?.puede_adeudarse ?? false);
  const [adeudado, setAdeudado] = useState(inicial?.adeudado ? String(inicial.adeudado) : '');
  const [error, setError] = useState('');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto || '0');
    if (!nombre.trim()) return setError('Poné un nombre (ej. Reparto de soda).');
    if (Number.isNaN(m) || m < 0) return setError('El monto no es válido.');
    const deuda = adeudado.trim() ? parsearMonto(adeudado) : 0;
    if (Number.isNaN(deuda) || deuda < 0) return setError('Lo que te deben no es válido.');
    const datos: Omit<Ingreso, 'id'> = {
      nombre: nombre.trim(), monto: m, moneda, frecuencia, proximo_cobro: proximo,
      cuenta_id: cuenta || null, categoria_id: categoria || null,
      activo: inicial?.activo ?? true, notas: notas.trim(),
      puede_adeudarse: puedeAdeudarse, adeudado: deuda,
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
        <Campo etiqueta="Próximo cobro" ayuda={proximo ? `Cae ${fechaLarga(proximo).split(' ')[0]}` : undefined}>
          <input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} required />
        </Campo>
      </div>
      <label className="eco-switch">
        <input type="checkbox" checked={puedeAdeudarse} onChange={(e) => setPuedeAdeudarse(e.target.checked)} />
        <span><strong>A veces queda debiendo</strong><small>Sus cobros cuentan en la proyección, pero ves aparte qué pasa si no paga.</small></span>
      </label>
      {(puedeAdeudarse || Number(inicial?.adeudado) > 0) && (
        <Campo etiqueta="Hoy te debe" ayuda="Lo que se acumuló sin cobrar. Lo podés corregir cuando quieras.">
          <input inputMode="decimal" value={adeudado} onChange={(e) => setAdeudado(e.target.value)} placeholder="0" />
        </Campo>
      )}
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
  const [restoPendiente, setRestoPendiente] = useState(!!ingreso.puede_adeudarse);
  const [error, setError] = useState('');
  const m = parsearMonto(monto || '0');
  const falta = Math.max(0, (Number(ingreso.monto) || 0) - (Number.isNaN(m) ? 0 : m));

  async function cobrar(e: React.FormEvent) {
    e.preventDefault();
    if (!(m > 0)) return setError('Ingresá cuánto cobraste.');
    if (!cuenta) return setError('Elegí en qué cuenta entró.');
    try {
      await registrarCobro(ingreso, { monto: m, cuenta_id: cuenta, fecha }, restoPendiente);
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
      {falta > 0 && (
        <label className="eco-switch">
          <input type="checkbox" checked={restoPendiente} onChange={(e) => setRestoPendiente(e.target.checked)} />
          <span><strong>Los {dinero(falta)} que faltan quedan pendientes</strong><small>Se suman a lo que te debe {ingreso.nombre}.</small></span>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Registrar cobro</button>
    </form>
  );
}

/** Te pagaron lo que te debían (todo o una parte). */
function FormAdeudado({ ingreso, onListo }: { ingreso: Ingreso; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const opciones = cuentas.filter((c) => !c.archivada);
  const deuda = Number(ingreso.adeudado) || 0;
  const [monto, setMonto] = useState(String(deuda || ''));
  const [cuenta, setCuenta] = useState(ingreso.cuenta_id ?? opciones.find((c) => c.moneda === ingreso.moneda)?.id ?? '');
  const [fecha, setFecha] = useState(hoy());
  const [error, setError] = useState('');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const m = parsearMonto(monto);
    if (!(m > 0)) return setError('Ingresá cuánto te pagaron.');
    if (!cuenta) return setError('Elegí en qué cuenta entró.');
    try {
      await cobrarAdeudado(ingreso, { monto: m, cuenta_id: cuenta, fecha });
      onListo();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={guardar}>
      <p className="nota">Te debe {dinero(deuda)}. Lo que cargues entra como ingreso y baja la deuda.</p>
      <div className="fila-campos">
        <Campo etiqueta="Te pagaron"><input autoFocus inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Cuenta">
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          <option value="">Elegí…</option>
          {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </Campo>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primario">Registrar</button>
      <button type="button" className="btn ancho" onClick={async () => {
        if (!window.confirm('¿Borrar la deuda sin registrar ingreso? (ej. ya no te la van a pagar)')) return;
        await fijarAdeudado(ingreso, 0); onListo();
      }}>Ya no me lo deben</button>
    </form>
  );
}

/** Próximo sábado (o hoy si es sábado). */
function proximoSabado(): string {
  const d = new Date();
  const faltan = (6 - d.getDay() + 7) % 7;
  return sumarDias(hoy(), faltan);
}

/** Carga de un toque los dos trabajos que contó la usuaria (si no existen ya). */
async function cargarMisTrabajos(existentes: Ingreso[]) {
  const sabado = proximoSabado();
  const base = { moneda: 'ARS' as Moneda, frecuencia: 'semanal' as FrecuenciaCobro, proximo_cobro: sabado, cuenta_id: null, categoria_id: null, activo: true, adeudado: 0 };
  const tiene = (n: string) => existentes.some((i) => i.nombre.toLowerCase() === n.toLowerCase());
  if (!tiene('Reparto de soda')) await crear<Ingreso>(T.ingresos, { ...base, nombre: 'Reparto de soda', monto: 120000, notas: 'Se cobra los sábados', puede_adeudarse: false });
  if (!tiene('Fábrica')) await crear<Ingreso>(T.ingresos, { ...base, nombre: 'Fábrica', monto: 135000, notas: 'Se cobra los sábados; a veces queda debiendo', puede_adeudarse: true });
}

export function PantallaIngresos() {
  const { filas: ingresos, cargado } = useIngresos();
  const [editando, setEditando] = useState<Ingreso | 'nuevo' | null>(null);
  const [cobrando, setCobrando] = useState<Ingreso | null>(null);
  const [saldando, setSaldando] = useState<Ingreso | null>(null);
  const [cargando, setCargando] = useState(false);
  const ars = ingresos.filter((i) => i.activo && i.moneda === 'ARS');
  const en30 = cobrosEsperados(ars, sumarDias(hoy(), 30));
  const total30 = en30.reduce((s, c) => s + (Number(c.ingreso.monto) || 0), 0);
  const porSemana = ars.reduce((s, i) => {
    const m = Number(i.monto) || 0;
    return s + (i.frecuencia === 'semanal' ? m : i.frecuencia === 'quincenal' ? m / 2 : (m * 12) / 52);
  }, 0);
  const adeudado = ingresos.reduce((s, i) => s + (Number(i.adeudado) || 0), 0);

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">Cuánto cobrás, cuándo, y qué te deben.</p>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Ingreso</button>
      </div>

      {cargado && ingresos.length === 0 ? (
        <Vacio titulo="Cargá de dónde entra tu plata">
          <p>Cada trabajo con su monto y cada cuánto cobrás. Así la app proyecta cuánta plata vas a tener cada día.</p>
          <button className="btn btn-primario" disabled={cargando} onClick={async () => {
            setCargando(true); await cargarMisTrabajos(ingresos); setCargando(false);
          }}>{cargando ? 'Cargando…' : 'Cargar reparto ($120.000) y fábrica ($135.000), los sábados'}</button>
          <button className="btn" onClick={() => setEditando('nuevo')}>{Icono.mas} Cargar otro a mano</button>
        </Vacio>
      ) : (
        <>
          <div className="grilla-cifras">
            <Cifra etiqueta="Por semana" valor={dinero(porSemana)} nota="Promedio" />
            <Cifra etiqueta="Próximos 30 días" valor={dinero(total30)} nota={`${en30.length} cobros`} />
            <Cifra etiqueta="Te deben" valor={dinero(adeudado)} tono={adeudado > 0 ? 'mal' : undefined}
              nota={adeudado > 0 ? 'Pendiente, cuenta en la proyección' : 'Al día'} />
          </div>
          <button className="btn ancho" onClick={() => ir('economia/proyeccion')}>Ver la línea de tiempo de tu plata {Icono.flechaDer}</button>
          <div className="eco-fuentes">
            {ingresos.map((i) => {
              const deuda = Number(i.adeudado) || 0;
              const atrasado = i.activo && i.proximo_cobro < hoy();
              return (
                <section key={i.id} className={`tarjeta eco-fuente ${i.activo ? '' : 'pausada'}`}>
                  <button className="boton-fila eco-fuente-cab" onClick={() => setEditando(i)} aria-label={`Editar ${i.nombre}`}>
                    <div className="crece">
                      <strong>{i.nombre}</strong>
                      <small className="nota">
                        {i.activo
                          ? `${FRECUENCIAS_COBRO[i.frecuencia].nombre} · ${fechaLarga(i.proximo_cobro).split(' ')[0]} ${fechaCorta(i.proximo_cobro)} (${relativo(i.proximo_cobro)})`
                          : 'Pausado'}
                      </small>
                    </div>
                    <span className="eco-fuente-monto num">{dinero(Number(i.monto), i.moneda)}</span>
                  </button>
                  {(i.puede_adeudarse || deuda > 0) && (
                    <div className={`eco-deuda ${deuda > 0 ? 'hay' : ''}`}>
                      <span>{deuda > 0 ? <>Te debe <b className="num">{dinero(deuda, i.moneda)}</b></> : 'No te debe nada'}</span>
                      {deuda > 0 && <button className="btn chico" onClick={() => setSaldando(i)}>Me pagó</button>}
                    </div>
                  )}
                  {i.activo && (
                    <div className="eco-fuente-acciones">
                      {atrasado && <Estado nivel="aviso" texto="Sin registrar" />}
                      <button className="btn btn-primario" onClick={() => setCobrando(i)}>Cobré</button>
                      <button className="btn" onClick={async () => {
                        if (window.confirm(`¿El cobro del ${fechaCorta(i.proximo_cobro)} de ${i.nombre} quedó pendiente? Se suma a lo que te debe.`)) await quedoPendiente(i);
                      }}>Quedó pendiente</button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <Modal titulo={editando === 'nuevo' ? 'Nuevo ingreso' : 'Editar ingreso'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormIngreso inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
      <Modal titulo={cobrando ? `Cobro: ${cobrando.nombre}` : 'Cobro'} abierto={!!cobrando} onCerrar={() => setCobrando(null)}>
        {cobrando && <FormCobrar ingreso={cobrando} onListo={() => setCobrando(null)} />}
      </Modal>
      <Modal titulo={saldando ? `${saldando.nombre}: te pagó` : 'Te pagaron'} abierto={!!saldando} onCerrar={() => setSaldando(null)}>
        {saldando && <FormAdeudado ingreso={saldando} onListo={() => setSaldando(null)} />}
      </Modal>
    </div>
  );
}
