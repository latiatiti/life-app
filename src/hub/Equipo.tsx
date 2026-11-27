import { useEffect, useState, type FormEvent } from 'react';
import { hoy, sumarDias } from '../core/format';
import {
  agenteDe, haceCuanto, pedir, recientes, responder, situacion, usePropuestas, useTrabajos,
  type AlTablero, type Propuesta, type Trabajo,
} from '../modules/panel/agentes';
import { Modal } from '../ui/ui';

/* =====================================================================================
 * "Tu equipo" en el Inicio (2026-11-27, boceto aprobado diseno/agentes-inicio-boceto.html):
 * Zonka, Gonzalito, Sapires y Lupita a mano. Compu: columna fija a la izquierda (con Accesos
 * y Mensajes); celu: tira que se desliza arriba. Cada uno con su marca, que se mueve solo
 * cuando trajo algo nuevo. Tocar uno: lo nuevo (Sí con prioridad y fecha / No / Cambiar),
 * pedirle algo (queda "pedido" hasta que Claude lo toma con agentes_ver) y qué está haciendo.
 * Los datos son los mismos de Panel → Agentes (una cosa, un solo lugar).
 * ===================================================================================== */

interface Miembro { id: string; rol: string; pistas: string[] }

/** Los cuatro que proponen. Constructor y Hermes quedan solo en el Panel. */
const EQUIPO: Miembro[] = [
  { id: 'zonka', rol: 'Mejoras y coach', pistas: ['Ideas para Entreno', '¿Qué no estoy midiendo?', 'Revisá mi comida de la semana'] },
  { id: 'gonzalito', rol: 'Seguridad', pistas: ['Revisá mis claves', '¿Está todo protegido?', 'Chequeá los respaldos'] },
  { id: 'sapires', rol: 'Estructura y diseño', pistas: ['Ordená una pantalla', 'Proponé un gráfico', 'Ideas de rediseño'] },
  { id: 'lupita', rol: 'Usabilidad', pistas: ['Pasale la lupa al Inicio', '¿Qué está vacío?', 'Revisá el celu'] },
];

/** Marca de cada agente: una forma con sentido, quieta si no hay nada nuevo. */
export function MarcaAgente({ id }: { id: string }) {
  return (
    <svg className={`eq-marca eq-m-${id}`} viewBox="0 0 40 40" aria-hidden="true">
      {id === 'zonka' && <><rect className="tenue" x="3" y="3" width="34" height="34" rx="5" /><path className="z-pulso" d="M6 22h8l3-8 5 14 3-6h9" /></>}
      {id === 'gonzalito' && <><path className="tenue" d="M20 4l14 5v10c0 9-6 15-14 18C12 34 6 28 6 19V9z" /><path className="g-barrido" d="M20 20L20 9" /><circle className="lleno" cx="20" cy="20" r="2.2" /></>}
      {id === 'sapires' && <><rect className="tenue" x="8" y="20" width="10" height="10" rx="2" /><rect className="tenue" x="20" y="8" width="10" height="10" rx="2" /><rect className="s-a" x="8" y="8" width="10" height="10" rx="2" /><rect className="s-b lleno" x="20" y="20" width="10" height="10" rx="2" /></>}
      {id === 'lupita' && <><circle cx="17" cy="17" r="11" /><circle className="l-foco tenue" cx="17" cy="17" r="6" /><path d="M25 25l9 9" /></>}
    </svg>
  );
}

function useCelu() {
  const q = '(max-width: 900px)';
  const [celu, setCelu] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setCelu(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return celu;
}

/** Sí a una propuesta: antes pregunta prioridad y fecha (pedido de ella). Se usa acá y en Panel → Agentes. */
export function PreguntaSi({ onListo, onVolver }: { onListo: (t: AlTablero) => void; onVolver: () => void }) {
  const [prioridad, setPrioridad] = useState<'alta' | 'media' | 'baja'>('media');
  const [fecha, setFecha] = useState('');
  const atajos = [{ t: 'Hoy', f: hoy() }, { t: 'Mañana', f: sumarDias(hoy(), 1) }, { t: 'En una semana', f: sumarDias(hoy(), 7) }];
  return (
    <div className="eq-si">
      <span className="etq-dato">Prioridad</span>
      <div className="eq-opciones">
        {(['alta', 'media', 'baja'] as const).map((p) => (
          <button type="button" key={p} className={`eq-chip ${prioridad === p ? 'activo' : ''}`} aria-pressed={prioridad === p} onClick={() => setPrioridad(p)}>{p[0].toUpperCase() + p.slice(1)}</button>
        ))}
      </div>
      <span className="etq-dato">Fecha (si querés)</span>
      <div className="eq-opciones">
        {atajos.map((a) => (
          <button type="button" key={a.t} className={`eq-chip ${fecha === a.f ? 'activo' : ''}`} aria-pressed={fecha === a.f} onClick={() => setFecha(fecha === a.f ? '' : a.f)}>{a.t}</button>
        ))}
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Otra fecha" />
      </div>
      <div className="ag-botones">
        <button type="button" className="btn btn-primario" onClick={() => onListo({ prioridad, fecha: fecha || null })}>Al Tablero</button>
        <button type="button" className="btn" onClick={onVolver}>Volver</button>
      </div>
    </div>
  );
}

function Detalle({ m, trabajos, propuestas, sinNube }: { m: Miembro; trabajos: Trabajo[]; propuestas: Propuesta[]; sinNube: boolean }) {
  const [diciendoSi, setDiciendoSi] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [pedido, setPedido] = useState('');
  const nuevas = propuestas.filter((p) => p.agente === m.id && p.estado === 'pendiente');
  const mios = recientes(trabajos.filter((t) => t.agente === m.id && t.estado !== 'hecho' && t.estado !== 'frenado')).slice(0, 4);

  function mandar(e: FormEvent) {
    e.preventDefault();
    if (!pedido.trim()) return;
    void pedir(m.id, pedido);
    setPedido('');
  }

  return (
    <div className="eq-detalle">
      <div className="eq-bloque">
        <span className="etq-dato">Lo nuevo</span>
        {!nuevas.length && <p className="nota">No trajo nada nuevo. Pedile algo abajo.</p>}
        {nuevas.map((p) => (
          <article key={p.id} className="eq-prop">
            <span className="etq-dato">{haceCuanto(p.created_at)}</span>
            <p>{p.texto}</p>
            {p.porque && <p className="nota">Se basa en: {p.porque}</p>}
            {diciendoSi === p.id ? (
              <PreguntaSi onVolver={() => setDiciendoSi(null)} onListo={(t) => { void responder(p, 'si', '', t); setDiciendoSi(null); }} />
            ) : cambiando === p.id ? (
              <div className="eq-si">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="¿Qué le cambiarías?" aria-label="Tu cambio" />
                <div className="ag-botones">
                  <button type="button" className="btn btn-primario" disabled={!texto.trim()} onClick={() => { void responder(p, 'cambiar', texto.trim()); setCambiando(null); }}>Mandar</button>
                  <button type="button" className="btn" onClick={() => setCambiando(null)}>Volver</button>
                </div>
              </div>
            ) : (
              <div className="ag-botones">
                <button type="button" className="btn btn-primario" onClick={() => setDiciendoSi(p.id)}>Sí</button>
                <button type="button" className="btn" onClick={() => void responder(p, 'no')}>No</button>
                <button type="button" className="btn" onClick={() => { setTexto(''); setCambiando(p.id); }}>Cambiar</button>
                {p.link && <a className="btn" href={p.link} target="_blank" rel="noreferrer">Ver</a>}
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="eq-bloque">
        <span className="etq-dato">Pedile algo</span>
        {sinNube ? <p className="nota">Para pedirle cosas hace falta activar el panel de agentes en la nube.</p> : <>
          <div className="eq-opciones">
            {m.pistas.map((t) => <button type="button" key={t} className="eq-chip" onClick={() => setPedido(t)}>{t}</button>)}
          </div>
          <form className="eq-pedir" onSubmit={mandar}>
            <input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ej.: proponé cómo ordenar Compras" aria-label={`Pedido para ${agenteDe(m.id)?.nombre}`} />
            <button className="btn btn-primario" disabled={!pedido.trim()}>Pedir</button>
          </form>
          <p className="nota">Lo hace Claude la próxima vez que le hables.</p>
        </>}
      </div>
      <div className="eq-bloque">
        <span className="etq-dato">Qué está haciendo</span>
        {!mios.length && <p className="nota">Nada en curso.</p>}
        <ul className="eq-trabajos">
          {mios.map((t) => (
            <li key={t.id} className={`eq-t-${t.estado}`}>
              <span className="eq-pt" aria-hidden="true" />
              <span className="crece">{t.titulo}</span>
              <span className="nota">{t.estado === 'pedido' ? 'esperando a Claude' : t.estado === 'espera_ok' ? 'espera tu OK' : 'en curso'}</span>
            </li>
          ))}
        </ul>
        <a className="nota" href="#/panel/agentes">Ver todo en Panel → Agentes</a>
      </div>
    </div>
  );
}

/** Tu equipo: lista de agentes (columna en la compu, tira en el celu) + el detalle del elegido. */
export function Equipo() {
  const { filas: trabajos, error } = useTrabajos();
  const { filas: propuestas } = usePropuestas();
  const celu = useCelu();
  const [elegido, setElegido] = useState<string | null>(null);
  const sinNube = !!error && !trabajos.length;
  const actual = EQUIPO.find((m) => m.id === elegido);

  return (
    <section className="tarjeta eq" aria-label="Tu equipo">
      <header className="midia-cab"><h2>Tu equipo</h2><a className="midia-config" href="#/panel/agentes" title="Panel → Agentes">→</a></header>
      <div className="eq-lista">
        {EQUIPO.map((m) => {
          const a = agenteDe(m.id)!;
          const nuevas = propuestas.filter((p) => p.agente === m.id && p.estado === 'pendiente').length;
          const s = situacion(a, trabajos, propuestas);
          const texto = nuevas ? `${nuevas} ${nuevas === 1 ? 'propuesta nueva' : 'propuestas nuevas'}` : s.estado === 'trabaja' ? `Trabajando: ${s.texto}` : s.estado === 'espera' ? s.texto : 'Al día';
          return (
            <button type="button" key={m.id} className={`eq-agente eq-c-${m.id} ${nuevas ? 'vivo' : ''} ${elegido === m.id ? 'elegido' : ''}`}
              aria-expanded={elegido === m.id} onClick={() => setElegido(elegido === m.id ? null : m.id)}>
              <MarcaAgente id={m.id} />
              <span className="eq-nom">{a.nombre}<small>{m.rol}</small></span>
              {nuevas > 0 && <b className="eq-cuenta">{nuevas}</b>}
              <span className={`eq-est ${nuevas ? 'nuevo' : ''}`}>{texto}</span>
            </button>
          );
        })}
      </div>
      {!celu && actual && <div className={`eq-c-${actual.id}`}><Detalle m={actual} trabajos={trabajos} propuestas={propuestas} sinNube={sinNube} /></div>}
      {celu && (
        <Modal titulo={actual ? `${agenteDe(actual.id)?.nombre} · ${actual.rol}` : ''} abierto={!!actual} onCerrar={() => setElegido(null)}>
          {actual && <div className={`eq-c-${actual.id}`}><Detalle m={actual} trabajos={trabajos} propuestas={propuestas} sinNube={sinNube} /></div>}
        </Modal>
      )}
    </section>
  );
}
