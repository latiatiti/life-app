import { useEffect, useState } from 'react';
import { crear } from '../../core/db';
import { dinero, fechaCorta, relativo } from '../../core/format';
import { Campo, Modal, Tarjeta, Vacio } from '../../ui/ui';
import {
  confirmar, crearRecordatorio, cuentaMP, hayNube, ignorar, importar, leerResumen, repetidosSinRecordatorio, sugerir,
  traerDeMP, ultimaTraida, useMovimientosMP, type MovMP, type Sugerencia,
} from './mercadopago';
import { saldoCuenta, T, useCategorias, useCuentas, useIngresos, useMovimientos, usePagos, type Categoria, type Cuenta } from './modelo';

/** Cada cuánto se vuelve a preguntar a MP sola al abrir la pestaña. */
const CADA_HORAS = 3;

/** Texto corto de lo que se va a hacer con el movimiento. */
function queEs(s: Sugerencia, categorias: Categoria[]): string {
  if (s.tipo === 'pago') return `Pago de "${s.pago.nombre}"`;
  if (s.tipo === 'cobro') return `Cobro de "${s.ingreso.nombre}"`;
  const cat = categorias.find((c) => c.id === s.categoria_id)?.nombre;
  return `${s.tipo === 'gasto' ? 'Gasto' : 'Ingreso'}${cat ? ` · ${cat}` : ' sin categoría'}`;
}

function FilaRevisar({ m, sug, categorias, cuenta }: { m: MovMP; sug: Sugerencia; categorias: Categoria[]; cuenta: Cuenta }) {
  const [elegida, setElegida] = useState<Sugerencia>(sug);
  const [ocupado, setOcupado] = useState(false);
  const tipoCat = m.sentido === 'sale' ? 'gasto' : 'ingreso';
  const suelta = elegida.tipo === 'gasto' || elegida.tipo === 'ingreso';

  async function hacer(f: () => Promise<unknown>) {
    setOcupado(true);
    try { await f(); } finally { setOcupado(false); }
  }

  return (
    <li className="mp-item">
      <div className="mp-item-cab">
        <div className="crece">
          <strong>{m.descripcion}</strong>
          <small className="nota">{fechaCorta(m.fecha)}{m.origen === 'api' ? ' · de Mercado Pago' : m.origen === 'mail' ? ' · del aviso por mail' : ''}</small>
        </div>
        <span className={`num mp-monto ${m.sentido}`}>{m.sentido === 'sale' ? '▼ −' : '▲ +'}{dinero(Number(m.monto))}</span>
      </div>
      <div className="mp-item-que">
        {suelta ? (
          <select value={elegida.categoria_id ?? ''} aria-label="Categoría"
            onChange={(e) => setElegida({ tipo: tipoCat, categoria_id: e.target.value || null })}>
            <option value="">{tipoCat === 'gasto' ? 'Gasto' : 'Ingreso'} sin categoría</option>
            {categorias.filter((c) => c.tipo === tipoCat).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        ) : (
          <span className="chip chip-on">{queEs(elegida, categorias)}</span>
        )}
        {!suelta && (
          <button className="btn chico" onClick={() => setElegida({ tipo: tipoCat, categoria_id: null })}>No es eso</button>
        )}
      </div>
      <div className="mp-item-acciones">
        <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => ignorar(m))}>Ignorar</button>
        <button className="btn btn-primario chico" disabled={ocupado} onClick={() => hacer(() => confirmar(m, elegida, cuenta.id))}>
          {elegida.tipo === 'pago' ? 'Registrar pago' : elegida.tipo === 'cobro' ? 'Registrar cobro' : 'Cargar'}
        </button>
      </div>
    </li>
  );
}

export function PantallaMercadoPago() {
  const { filas: movsMP, cargado: mpCargado } = useMovimientosMP();
  const { filas: movs } = useMovimientos();
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: pagos } = usePagos();
  const { filas: ingresos } = useIngresos();
  const [subir, setSubir] = useState(false);
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState('');
  const [saldoMP, setSaldoMP] = useState<number | null>(null);
  const [trayendo, setTrayendo] = useState(false);
  const [errorMP, setErrorMP] = useState('');

  const cuenta = cuentaMP(cuentas);
  const nuevos = movsMP.filter((m) => m.estado === 'nuevo').sort((a, b) => a.fecha.localeCompare(b.fecha));
  const repetidos = repetidosSinRecordatorio(movsMP, pagos);
  const cargados = movsMP.filter((m) => m.estado === 'cargado').length;

  async function traer() {
    setTrayendo(true); setErrorMP('');
    try {
      const r = await traerDeMP(30);
      setSaldoMP(r.saldo);
      const n = await importar(r.movimientos, movsMP, 'api');
      setResultado(n ? `Entraron ${n} movimientos nuevos de Mercado Pago.` : 'Mercado Pago no tiene nada nuevo.');
    } catch (e) {
      setErrorMP((e as Error).message);
    } finally {
      setTrayendo(false);
    }
  }

  // Al abrir la pestaña pregunta sola a MP (si pasaron unas horas desde la última vez).
  useEffect(() => {
    if (!hayNube() || !mpCargado || !cuenta) return;
    const u = ultimaTraida();
    if (!u || Date.now() - Date.parse(u) > CADA_HORAS * 3600e3) void traer();
  }, [mpCargado, cuenta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function leer(contenido: string) {
    const leidos = leerResumen(contenido);
    if (!leidos.length) return setResultado('No encontré movimientos. Probá con el archivo CSV del resumen de Mercado Pago.');
    const n = await importar(leidos, movsMP);
    setResultado(n ? `Entraron ${n} movimientos para revisar.` : 'Ya estaban todos cargados.');
    if (n) { setTexto(''); setSubir(false); }
  }

  if (!cuenta) {
    return (
      <Tarjeta titulo="Mercado Pago">
        <Vacio titulo="Falta la cuenta de Mercado Pago">
          <p className="nota">Los pagos que hacés con Mercado Pago salen de esa billetera. Creala y cargá cuánto tenés hoy ahí.</p>
          <button className="btn btn-primario" onClick={() => crear<Cuenta>(T.cuentas, {
            nombre: 'Mercado Pago', tipo: 'billetera', moneda: 'ARS', saldo_inicial: 0, archivada: false,
          })}>Crear cuenta Mercado Pago</button>
        </Vacio>
      </Tarjeta>
    );
  }

  const saldoLife = saldoCuenta(cuenta, movs);
  const diferencia = saldoMP == null ? 0 : Math.round(saldoMP - saldoLife);
  const u = ultimaTraida();

  return (
    <div className="pila">
      {hayNube() && (
        <Tarjeta titulo="Tu cuenta de Mercado Pago"
          accion={<button className="btn chico" disabled={trayendo} onClick={traer}>{trayendo ? 'Trayendo…' : 'Actualizar'}</button>}>
          <div className="mp-saldos">
            <div><span className="etiqueta">En Mercado Pago</span><strong className="num">{saldoMP == null ? '—' : dinero(saldoMP)}</strong></div>
            <div><span className="etiqueta">En LIFE</span><strong className="num">{dinero(saldoLife)}</strong></div>
          </div>
          {diferencia !== 0 && (
            <p className="nota mp-diferencia">⚠ No coinciden por {dinero(Math.abs(diferencia))}: {diferencia > 0 ? 'en MP hay más' : 'en MP hay menos'}. Revisá abajo lo que falta confirmar.</p>
          )}
          {errorMP && <p className="error">{errorMP}</p>}
          {!errorMP && u && <small className="nota">Última vez: {relativo(u.slice(0, 10))}</small>}
        </Tarjeta>
      )}

      <Tarjeta titulo={`Para revisar${nuevos.length ? ` · ${nuevos.length}` : ''}`}
        accion={<button className="btn chico" onClick={() => { setResultado(''); setSubir(true); }}>Subir resumen</button>}>
        {nuevos.length === 0 ? (
          <p className="nota">
            Nada nuevo de Mercado Pago. {cargados ? `Ya confirmaste ${cargados}. ` : ''}
            Lo nuevo que traiga Mercado Pago (o el resumen que subas) aparece acá para confirmarlo con un toque.
          </p>
        ) : (
          <ul className="mp-lista">
            {nuevos.map((m) => (
              <FilaRevisar key={m.id} m={m} cuenta={cuenta} categorias={categorias}
                sug={sugerir(m, pagos, ingresos, categorias)} />
            ))}
          </ul>
        )}
        {resultado && <p className="nota">{resultado}</p>}
      </Tarjeta>

      {repetidos.length > 0 && (
        <Tarjeta titulo="Se repite y no tiene recordatorio">
          <ul className="mp-lista">
            {repetidos.map((r) => (
              <li key={r.nombre} className="lista-item">
                <div className="crece">
                  <strong>{r.nombre}</strong>
                  <small className="nota">{r.veces} meses seguidos · cerca del día {r.dia} · ~{dinero(r.monto)}</small>
                </div>
                <button className="btn btn-primario chico" onClick={() => crearRecordatorio(r, cuenta.id, null)}>Avisarme cada mes</button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Modal titulo="Subir resumen de Mercado Pago" abierto={subir} onCerrar={() => setSubir(false)}>
        <div className="form">
          <p className="nota">
            En Mercado Pago (en la compu): Tu dinero → Actividad → Descargar, elegí las fechas y formato CSV.
            También podés pegar acá el texto copiado de la actividad.
          </p>
          <Campo etiqueta="Archivo del resumen">
            <input type="file" accept=".csv,.txt,text/csv,text/plain"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) await leer(await f.text()); }} />
          </Campo>
          <Campo etiqueta="O pegá el texto">
            <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          {resultado && <p className="nota">{resultado}</p>}
          <button className="btn btn-primario" disabled={!texto.trim()} onClick={() => leer(texto)}>Leer</button>
        </div>
      </Modal>
    </div>
  );
}
