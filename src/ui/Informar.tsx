import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { almacen, crear } from '../core/db';
import {
  TABLA_INFORMES, TIPOS, URGENCIAS, abierto, aparato, cerrarInformar, iconoTipo, infoEstado, informarError, nombreTipo,
  pantallaActual, pedirInformar, useInformes, usePedidoInformar, type Informe, type TipoInforme, type Urgencia,
} from '../core/informes';
import { fechaCorta } from '../core/format';
import { VERSION } from '../core/version';
import { Estado, Modal, Vacio } from './ui';

/** Botón de la barra de arriba (compu y celu): abre "¿Qué querés contarnos?". */
export function BotonInformar() {
  return (
    <button type="button" className="btn-informar" onClick={() => pedirInformar()} aria-label="Informar un problema o una idea" title="Informar un problema o una idea">
      <span aria-hidden="true">!</span><b>Informar</b>
    </button>
  );
}

/** El formulario: va una sola vez en App y se abre con pedirInformar() desde cualquier lado. */
export function VentanaInformar() {
  const pedido = usePedidoInformar();
  return (
    <Modal titulo="¿Qué querés contarnos?" abierto={pedido.abierto} onCerrar={cerrarInformar}>
      <FormInformar tipoInicial={pedido.tipo} textoInicial={pedido.texto} />
    </Modal>
  );
}

function FormInformar({ tipoInicial, textoInicial }: { tipoInicial?: TipoInforme; textoInicial?: string }) {
  const [tipo, setTipo] = useState<Exclude<TipoInforme, 'error'>>(tipoInicial && tipoInicial !== 'error' ? tipoInicial : 'problema');
  const [texto, setTexto] = useState(textoInicial ?? '');
  const [urgencia, setUrgencia] = useState<Urgencia>('normal');
  const [conPantalla, setConPantalla] = useState(true);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const pantalla = pantallaActual();
  const { filas } = useInformes();
  const mios = filas.filter((i) => i.origen === 'persona');
  const ayuda = TIPOS.find((t) => t.id === tipo)?.ayuda;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) { setError('Contanos qué pasó en una o dos líneas.'); return; }
    setOcupado(true);
    setError('');
    try {
      await crear<Informe>(TABLA_INFORMES, {
        tipo, origen: 'persona', texto: texto.trim(), urgencia: tipo === 'problema' ? urgencia : 'normal',
        pantalla: conPantalla ? pantalla : null, aparato: aparato(), version: VERSION, estado: 'nuevo',
      });
      cerrarInformar();
    } catch (err) {
      const m = (err as Error).message;
      setError(/life_informes|relation|schema cache/.test(m) ? 'Todavía no está activado en la nube. Avisale a la administradora.' : `No se pudo mandar: ${m}`);
      setOcupado(false);
    }
  }

  return (
    <form className="form informar" onSubmit={enviar}>
      <div className="informar-tipos" role="radiogroup" aria-label="Qué es">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id}
            className={`informar-tipo ${tipo === t.id ? 'activo' : ''}`} onClick={() => setTipo(t.id)}>
            <span aria-hidden="true">{t.icono}</span>{t.nombre}
          </button>
        ))}
      </div>
      <label className="campo">
        <span>Contalo como te salga</span>
        <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus maxLength={4000}
          placeholder={tipo === 'problema' ? 'Ej.: toqué Cerrar compra y se quedó cargando' : tipo === 'idea' ? 'Ej.: que el Día me muestre cuánto gasté hoy' : 'Escribí acá'} />
        {ayuda && <small>{ayuda}</small>}
      </label>
      {tipo === 'problema' && (
        <div className="informar-urgencia" role="radiogroup" aria-label="Cuánto te afecta">
          {URGENCIAS.map((u) => (
            <button key={u.id} type="button" role="radio" aria-checked={urgencia === u.id}
              className={`chip-elegir ${urgencia === u.id ? 'activo' : ''}`} onClick={() => setUrgencia(u.id)}>{u.nombre}</button>
          ))}
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={conPantalla} onChange={(e) => setConPantalla(e.target.checked)} />
        Pasó en esta pantalla <code>{pantalla}</code>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-confirmar grande-boton" disabled={ocupado}>{ocupado ? 'Mandando…' : 'Mandar'}</button>
      {almacen.tipo === 'nube' && mios.length > 0 && (
        <a className="nota informar-mios" href="#/ajustes/informes" onClick={cerrarInformar}>
          Ver lo que ya mandaste ({mios.length}{mios.some((i) => i.respuesta && abierto(i)) ? ', con respuesta' : ''}) →
        </a>
      )}
    </form>
  );
}

/** Ajustes → Mis informes: lo que mandó esta cuenta, en qué estado está y la respuesta. */
export function MisInformes() {
  const { filas, cargado } = useInformes();
  const mios = filas.filter((i) => i.origen === 'persona');
  return (
    <div className="pila">
      <div className="acciones"><button className="btn btn-primario" onClick={() => pedirInformar()}>Informar algo nuevo</button></div>
      {cargado && !mios.length && (
        <Vacio titulo="Todavía no mandaste nada">
          <p>Cuando algo no ande o se te ocurra una mejora, tocá <strong>! Informar</strong> arriba. Acá vas a ver en qué quedó cada cosa.</p>
        </Vacio>
      )}
      {mios.map((i) => <TarjetaInforme key={i.id} i={i} />)}
    </div>
  );
}

export function TarjetaInforme({ i, quien, children }: { i: Informe; quien?: string; children?: ReactNode }) {
  const est = infoEstado(i.estado);
  return (
    <article className={`tarjeta informe informe-${i.tipo} ${abierto(i) ? '' : 'informe-cerrado'}`}>
      <header className="informe-cab">
        <span className="informe-tipo"><span aria-hidden="true">{iconoTipo(i.tipo)}</span>{nombreTipo(i.tipo)}</span>
        {i.tipo === 'problema' && i.urgencia === 'frena' && <Estado nivel="critico" texto="Le frena" />}
        {i.tipo === 'problema' && i.urgencia === 'molesta' && <Estado nivel="aviso" texto="Molesta" />}
        <Estado nivel={est.nivel} texto={est.nombre} />
      </header>
      <p className="informe-texto">{i.texto}</p>
      <p className="nota informe-meta">
        {quien && <><strong>{quien}</strong> · </>}
        {i.created_at ? fechaCorta(i.created_at.slice(0, 10)) : ''}
        {i.pantalla ? ` · ${i.pantalla}` : ''}{i.aparato ? ` · ${i.aparato}` : ''}
      </p>
      {i.respuesta && <p className="informe-respuesta"><span className="etiqueta">Respuesta</span>{i.respuesta}</p>}
      {children}
    </article>
  );
}

/**
 * Si una pantalla se rompe, en vez de quedar en blanco muestra qué pasó, manda el error solo
 * y ofrece contar qué estaba haciendo (pilar 8: avisar lo raro, con su botón).
 */
export class Tropiezo extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void informarError(error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="tarjeta tropiezo" role="alert">
        <h2>Esta pantalla tropezó</h2>
        <p>Ya nos llegó el aviso automático. Si nos contás qué estabas haciendo, lo arreglamos más rápido.</p>
        <div className="acciones">
          <button className="btn btn-primario" onClick={() => pedirInformar({ tipo: 'problema', texto: `La pantalla ${pantallaActual()} se rompió cuando…` })}>Contar qué hacía</button>
          <button className="btn" onClick={() => this.setState({ error: null })}>Probar de nuevo</button>
          <a className="btn" href="#/" onClick={() => this.setState({ error: null })}>Ir al inicio</a>
        </div>
      </section>
    );
  }
}
