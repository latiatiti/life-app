import { useState } from 'react';
import { Pct } from '../../ui/nivel';
import { Modal, Pestanas, Vacio } from '../../ui/ui';
import {
  AGENTES, abierto, darOk, devolver, estacionActual, feed, frenar, haceCuanto, nombreAgente, recientes, responder, situacion,
  usePropuestas, useTrabajos, type Propuesta, type Trabajo,
} from './agentes';

type Vista = 'equipo' | 'relevo' | 'vos';

const ETIQUETA = { trabaja: 'Trabajando', espera: 'Espera tu OK', libre: 'Libre', analisis: 'En análisis' } as const;
const ICONO_EST = { hecho: '✓', ahora: '◉', falta: '○' } as const;

/**
 * Panel → Agentes: el equipo de agentes en vivo. Compu: las tres partes a la vez (Equipo · Tareas en relevo · Para vos).
 * Celu: una por vez con pestañas. Los datos los escriben los agentes con el conector (agentes_anotar / agentes_proponer).
 */
export function PantallaAgentes() {
  const { filas: trabajos, cargado, error } = useTrabajos();
  const { filas: propuestas } = usePropuestas();
  const [vista, setVista] = useState<Vista>('equipo');
  const [elegido, setElegido] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState<Trabajo | null>(null);
  const [cambiando, setCambiando] = useState<Propuesta | null>(null);
  const [texto, setTexto] = useState('');

  if (error && !trabajos.length) return (
    <Vacio titulo="Falta activar el panel de agentes en la nube">
      <p>Cuando se aplique <code>supabase/agentes.sql</code>, cada agente va a anotar acá lo que hace.</p>
    </Vacio>
  );

  const abiertos = recientes(trabajos.filter(abierto));
  const cerrados = recientes(trabajos.filter((t) => !abierto(t))).slice(0, 8);
  const actual = trabajos.find((t) => t.id === elegido) ?? abiertos[0] ?? null;
  const pendientes = propuestas.filter((p) => p.estado === 'pendiente').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const respondidas = propuestas.filter((p) => p.estado !== 'pendiente').sort((a, b) => (b.respondida_at ?? '').localeCompare(a.respondida_at ?? '')).slice(0, 6);
  const esperan = pendientes.length + abiertos.filter((t) => t.estado === 'espera_ok').length;
  const trabajando = AGENTES.filter((a) => situacion(a, trabajos, propuestas).estado === 'trabaja').length;
  const novedades = feed(actual ? [actual] : trabajos, 12);

  function abrirTrabajo(t: Trabajo) { setElegido(t.id); setVista('relevo'); }

  return (
    <div className="agentes-pantalla" data-vista={vista}>
      <div className="agentes-celu-pestanas">
        <Pestanas<Vista> valor={vista} onCambio={setVista} opciones={[
          { id: 'equipo', nombre: `Equipo${trabajando ? ` (${trabajando})` : ''}` },
          { id: 'relevo', nombre: `En relevo${abiertos.length ? ` (${abiertos.length})` : ''}` },
          { id: 'vos', nombre: `Para vos${esperan ? ` (${esperan})` : ''}` },
        ]} />
      </div>

      <section className="tarjeta ag-col" data-col="equipo" aria-label="Equipo">
        <header className="tarjeta-cab"><h2>Equipo</h2><span className="etq-dato">{trabajando} trabajando</span></header>
        <div className="ag-lista">
          {AGENTES.map((a) => {
            const s = situacion(a, trabajos, propuestas);
            return (
              <button type="button" key={a.id} className={`ag-agente ag-${s.estado}`} disabled={!s.trabajo}
                onClick={() => s.trabajo && abrirTrabajo(s.trabajo)}>
                <span className="ag-ava" aria-hidden="true">{a.inicial}</span>
                <span className="ag-nom">{a.nombre}</span>
                <span className={`ag-est ag-est-${s.estado}`}>{ETIQUETA[s.estado]}</span>
                <span className="ag-hace">{s.texto}</span>
              </button>
            );
          })}
        </div>
        <p className="nota">Se los llama desde el chat ("Llamá a Lupita"). Cada uno anota acá lo que va haciendo.</p>
      </section>

      <section className="tarjeta ag-col" data-col="relevo" aria-label="Tareas en relevo">
        <header className="tarjeta-cab"><h2>Tareas en relevo</h2>
          {abiertos.length > 1 && (
            <select value={actual?.id ?? ''} onChange={(e) => setElegido(e.target.value)} aria-label="Qué tarea ver">
              {abiertos.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
            </select>
          )}
        </header>
        {!actual && cargado && (
          <Vacio titulo="Ninguna tarea en marcha">
            <p>Cuando le pidas algo a un agente, la tarea aparece acá con sus estaciones: quién planifica, quién hace, quién controla y tu OK.</p>
          </Vacio>
        )}
        {actual && (
          <div className="ag-trabajo">
            <div className="ag-trabajo-cab">
              <strong className="ag-titulo">{actual.titulo}</strong>
              <span className="nota">{actual.receta ? `${actual.receta} · ` : ''}la tiene {nombreAgente(estacionActual(actual)?.agente ?? actual.agente)} · {haceCuanto(actual.updated_at ?? actual.created_at)}</span>
            </div>
            {actual.estaciones?.length > 0 && (
              <ol className="ag-estaciones">
                {actual.estaciones.map((e, i) => (
                  <li key={`${e.nombre}-${i}`} className={`ag-estacion ag-e-${e.estado}`}>
                    <span className="ag-e-ic" aria-hidden="true">{ICONO_EST[e.estado]}</span>
                    <span className="ag-e-nom">{e.nombre}</span>
                    {e.agente && <span className="ag-e-quien">{nombreAgente(e.agente)}</span>}
                  </li>
                ))}
                <li className={`ag-estacion ag-e-vos ${actual.estado === 'espera_ok' ? 'ag-e-ahora' : ''}`}>
                  <span className="ag-e-ic" aria-hidden="true">{actual.estado === 'hecho' ? '✓' : '?'}</span>
                  <span className="ag-e-nom">Tu OK</span><span className="ag-e-quien">vos</span>
                </li>
              </ol>
            )}
            {actual.vueltas > 0 && (
              <p className="ag-vuelta" role="status">↺ Volvió {actual.vueltas} {actual.vueltas === 1 ? 'vez' : 'veces'} para corregir{actual.vueltas >= 3 ? '. Ya van 3: mirala vos.' : '.'}</p>
            )}
            {actual.estado === 'espera_ok' && (
              <div className="ag-botones">
                <button className="btn btn-primario" onClick={() => void darOk(actual)}>Va, está bien</button>
                <button className="btn" onClick={() => { setTexto(''); setDevolviendo(actual); }}>Devolver con nota</button>
                {actual.link && <a className="btn" href={actual.link} target="_blank" rel="noreferrer">Ver</a>}
              </div>
            )}
            {actual.estado === 'en_curso' && (
              <div className="ag-botones">
                {actual.link && <a className="btn" href={actual.link} target="_blank" rel="noreferrer">Ver lo que hizo</a>}
                <button className="btn" onClick={() => void frenar(actual)}>Frenar</button>
              </div>
            )}
            <p className="etq-dato">Lo que va pasando</p>
            <ul className="ag-feed">
              {novedades.map((n, i) => (
                <li key={`${n.fecha}-${i}`}>
                  <span className="ag-h">{haceCuanto(n.fecha)}</span>
                  <span><b>{n.agente === 'vos' ? 'Vos' : nombreAgente(n.agente ?? n.trabajo.agente)}</b> {n.texto}</span>
                </li>
              ))}
              {!novedades.length && <li className="nota">Todavía no anotó nada.</li>}
            </ul>
          </div>
        )}
        {cerrados.length > 0 && (
          <>
            <p className="etq-dato">Terminadas</p>
            <ul className="ag-cerrados">
              {cerrados.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setElegido(t.id)}>{t.titulo}</button>
                  {t.estado === 'frenado' ? <span className="nota">Frenada</span> : t.nota != null ? <Pct pct={t.nota} /> : <span className="nota">✓ Hecha</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="tarjeta ag-col" data-col="vos" aria-label="Para vos">
        <header className="tarjeta-cab"><h2>Para vos</h2><span className="etq-dato">{pendientes.length ? `${pendientes.length} esperan` : 'Nada pendiente'}</span></header>
        {!pendientes.length && <p className="nota">Cuando un agente quiera mejorar algo (de LIFE o de cómo trabaja él), te lo deja acá para que digas Sí, No o Cambiar.</p>}
        {pendientes.map((p) => (
          <article key={p.id} className="ag-prop">
            <span className="etq-dato">{nombreAgente(p.agente)} · {haceCuanto(p.created_at)}</span>
            <p>{p.texto}</p>
            {p.porque && <p className="nota">Se basa en: {p.porque}</p>}
            <div className="ag-botones">
              <button className="btn btn-primario" onClick={() => void responder(p, 'si')}>Sí</button>
              <button className="btn" onClick={() => void responder(p, 'no')}>No</button>
              <button className="btn" onClick={() => { setTexto(''); setCambiando(p); }}>Cambiar</button>
              {p.link && <a className="btn" href={p.link} target="_blank" rel="noreferrer">Ver</a>}
            </div>
          </article>
        ))}
        {respondidas.length > 0 && (
          <>
            <p className="etq-dato">Ya respondiste</p>
            <ul className="ag-cerrados">
              {respondidas.map((p) => (
                <li key={p.id}><span>{p.texto.split('\n')[0].slice(0, 70)}</span>
                  <span className="nota">{p.estado === 'si' ? '✓ Sí · al Tablero' : p.estado === 'no' ? '✕ No' : '✎ Cambiar'}</span></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Modal titulo="Devolver con nota" abierto={!!devolviendo} onCerrar={() => setDevolviendo(null)}>
        <label className="campo"><span>¿Qué hay que corregir?</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Ej. el botón de guardar queda chico en el celu" /></label>
        <div className="ag-botones">
          <button className="btn btn-primario" onClick={() => { if (devolviendo) void devolver(devolviendo, texto.trim()); setDevolviendo(null); }}>Devolver</button>
        </div>
      </Modal>
      <Modal titulo="¿Qué le cambiarías?" abierto={!!cambiando} onCerrar={() => setCambiando(null)}>
        <p className="nota">{cambiando?.texto}</p>
        <label className="campo"><span>Tu cambio</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} /></label>
        <div className="ag-botones">
          <button className="btn btn-primario" disabled={!texto.trim()} onClick={() => { if (cambiando) void responder(cambiando, 'cambiar', texto.trim()); setCambiando(null); }}>Mandar</button>
        </div>
      </Modal>
    </div>
  );
}
