import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Atrapa errores de una parte de la pantalla para que un dato raro no deje toda la app en negro.
 * - `silencioso`: si falla, esa parte simplemente no se muestra (ej. los avisos flotantes).
 * - si no, muestra un cartel con "Reintentar" y el detalle técnico.
 * `clave` (ej. la ruta) lo resetea al cambiar de pantalla.
 */
export class Protegido extends Component<
  { children: ReactNode; nombre?: string; silencioso?: boolean; pantallaCompleta?: boolean; clave?: string },
  { error: Error | null; clave?: string }
> {
  state: { error: Error | null; clave?: string } = { error: null, clave: this.props.clave };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { clave?: string }, state: { error: Error | null; clave?: string }) {
    if (props.clave !== state.clave) return { error: null, clave: props.clave };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[LIFE] Falló ${this.props.nombre ?? 'una parte de la pantalla'}:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.silencioso) return null;
    const cartel = (
      <div className="tarjeta" role="alert" style={{ margin: '1rem auto', maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Algo falló en {this.props.nombre ?? 'esta pantalla'}</h2>
        <p>Probablemente un dato quedó incompleto. El resto de LIFE sigue andando.</p>
        <p style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <button type="button" className="btn" onClick={() => location.reload()}>Recargar la app</button>
          {this.props.pantallaCompleta && (
            <button type="button" className="btn" onClick={() => { location.hash = '#/'; location.reload(); }}>Ir al Inicio</button>
          )}
        </p>
        <details>
          <summary>Detalle para Claude</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.8em' }}>{String(error?.stack ?? error)}</pre>
        </details>
      </div>
    );
    return this.props.pantallaCompleta ? <div style={{ padding: '1rem' }}>{cartel}</div> : cartel;
  }
}
