import { useState, type ReactNode } from 'react';
import { guardarBienvenida, usePerfil, type Bienvenida as RespuestasPerfil } from '../../core/auth';
import { ModoActividad, icoConfirmar } from '../../ui/Actividad';
import { Campo } from '../../ui/ui';
import type { FrecuenciaCobro } from '../economia/modelo';
import {
  AREAS, ATAJOS, BASICOS, CATEGORIAS_TABLERO, cargarInicio, datosVacios, FIJOS, LUGARES_PLATA, PLATOS, resumenDe, SUPERS,
  type DatosInicio, type Experiencia, type Objetivo,
} from './inicio';

/**
 * Configuración inicial (2026-11-18, boceto diseno/bienvenida-boceto.html): la primera vez que entra una cuenta
 * elige qué áreas va a usar y contesta una pantalla corta por cada una. Todo se puede saltar. Se carga solo lo
 * genérico de esas áreas (inicio.ts) y las respuestas quedan en su perfil. Se repite desde Ajustes.
 */

const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const alternar = <X,>(lista: X[], x: X) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);
const cambiar = <X,>(lista: X[], i: number, c: Partial<X>) => lista.map((x, j) => (j === i ? { ...x, ...c } : x));

function Chips({ opciones, elegidas, onCambio, etiqueta }: { opciones: string[]; elegidas: string[]; onCambio: (x: string[]) => void; etiqueta: string }) {
  return (
    <div className="bv-chips" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o} type="button" className="bv-chip" aria-pressed={elegidas.includes(o)} onClick={() => onCambio(alternar(elegidas, o))}>{o}</button>
      ))}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="bv-caja"><h3>{titulo}</h3>{children}</section>;
}

const SeCarga = ({ children }: { children: ReactNode }) => <p className="bv-carga"><b>Se carga</b>{children}</p>;

export function Bienvenida({ onListo }: { onListo: () => void }) {
  const perfil = usePerfil();
  /** Áreas del plan de esta cuenta (lo que prende quien administra). null = todas. */
  const plan = perfil.modulos;
  const enPlan = (id: string) => !plan || plan.includes(id);
  const previas = perfil.bienvenida as Partial<DatosInicio> | null | undefined;
  const [d, setD] = useState<DatosInicio>(() => {
    const base = { ...datosVacios(perfil.nombre), ...(previas?.version === 2 ? previas : {}) };
    return { ...base, areas: base.areas.filter(enPlan) };
  });
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const poner = (c: Partial<DatosInicio>) => setD((x) => ({ ...x, ...c }));
  const usa = (id: string) => d.areas.includes(id);

  const pasos = ['vos', 'areas', ...AREAS.map((a) => a.id).filter((id) => usa(id) && id !== 'whatsapp'), 'listo'];
  const id = pasos[Math.min(paso, pasos.length - 1)];
  const ultimo = id === 'listo';
  const salteable = !['vos', 'areas', 'listo'].includes(id);
  const TITULOS: Record<string, string> = {
    vos: 'Hola', areas: '¿Qué querés llevar?', economia: 'Tu plata', pagos: 'Lo que pagás todos los meses', dia: 'Tu semana',
    tablero: 'Tus pendientes', entrenamiento: 'Entreno', alimentacion: 'Comida', stock: 'En casa', compras: 'Compras', listo: 'Listo',
  };

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await cargarInicio(d);
      await guardarBienvenida({ ...d, fecha: new Date().toISOString().slice(0, 10) } as unknown as RespuestasPerfil, d.nombre.trim() || undefined);
      onListo();
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`);
      setGuardando(false);
    }
  }

  const pie = (
    <>
      {paso > 0 && <button className="btn grande-boton" onClick={() => setPaso(paso - 1)} disabled={guardando}>Atrás</button>}
      {salteable && <button className="btn grande-boton" onClick={() => { poner({ saltadas: [...new Set([...d.saltadas, id])] }); setPaso(paso + 1); }}>Saltar</button>}
      {ultimo
        ? <button className="btn btn-confirmar grande-boton crece" onClick={guardar} disabled={guardando}>{icoConfirmar} {guardando ? 'Guardando…' : 'Guardar y empezar'}</button>
        : <button className="btn btn-confirmar grande-boton crece" onClick={() => { poner({ saltadas: d.saltadas.filter((x) => x !== id) }); setPaso(paso + 1); }} disabled={id === 'areas' && !d.areas.length}>Seguir</button>}
    </>
  );

  return (
    <ModoActividad etiqueta="Configuración inicial" titulo={TITULOS[id]} total={pasos.length} hechos={paso} pie={pie} onSalir={onListo}>
      {id === 'vos' && (
        <>
          <p>Con estas preguntas LIFE arranca con <strong>tus</strong> cosas. Son unos minutos y todo se puede saltar o cambiar después.</p>
          <Campo etiqueta="¿Cómo te decimos?"><input value={d.nombre} onChange={(e) => poner({ nombre: e.target.value })} placeholder="Tu nombre" /></Campo>
        </>
      )}

      {id === 'areas' && (
        <>
          <p>Marcá las áreas que vas a usar. Las otras no aparecen en el menú (las sumás después desde Ajustes).</p>
          <div className="bv-chips" role="group" aria-label="Atajos">
            {ATAJOS.map(([nombre, ids]) => {
              const disp = ids.filter(enPlan);
              const activo = disp.length === d.areas.length && disp.every(usa);
              return <button key={nombre} type="button" className="bv-chip" aria-pressed={activo} onClick={() => poner({ areas: disp })}>{nombre}</button>;
            })}
          </div>
          <div className="bv-areas">
            {AREAS.map((a) => {
              const bloq = !enPlan(a.id);
              return (
                <button key={a.id} type="button" className={`bv-area ${bloq ? 'bloq' : ''}`} aria-pressed={usa(a.id)} aria-disabled={bloq}
                  onClick={() => !bloq && poner({ areas: alternar(d.areas, a.id) })}>
                  <span className="bv-ico" aria-hidden="true">{a.icono}</span>
                  <b>{a.nombre}</b>
                  <small>{a.ayuda}</small>
                  {bloq ? <span className="bv-marca aviso">🔒 No está en tu plan</span> : usa(a.id) && <span className="bv-marca">✓ La uso</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {id === 'economia' && (
        <>
          <Seccion titulo="¿Dónde tenés la plata?">
            <Chips etiqueta="Lugares" opciones={LUGARES_PLATA.map(([n]) => n)} elegidas={Object.keys(d.plata)}
              onCambio={(xs) => poner({ plata: Object.fromEntries(xs.map((x) => [x, d.plata[x] ?? ''])) })} />
            <div className="bv-fila">
              {Object.keys(d.plata).map((x) => (
                <Campo key={x} etiqueta={`${x} hoy (opcional)`}>
                  <input inputMode="decimal" placeholder="$" value={d.plata[x]} onChange={(e) => poner({ plata: { ...d.plata, [x]: e.target.value } })} />
                </Campo>
              ))}
            </div>
          </Seccion>
          <Seccion titulo="¿Qué cobrás seguido?">
            {d.cobros.map((c, i) => (
              <div key={i} className="bv-fila">
                <Campo etiqueta="De dónde"><input value={c.nombre} placeholder="Ej. Sueldo" onChange={(e) => poner({ cobros: cambiar(d.cobros, i, { nombre: e.target.value }) })} /></Campo>
                <Campo etiqueta="Cuánto"><input inputMode="decimal" placeholder="$" value={c.monto} onChange={(e) => poner({ cobros: cambiar(d.cobros, i, { monto: e.target.value }) })} /></Campo>
                <Campo etiqueta="Cada cuánto">
                  <select value={c.frecuencia} onChange={(e) => poner({ cobros: cambiar(d.cobros, i, { frecuencia: e.target.value as FrecuenciaCobro }) })}>
                    <option value="mensual">Cada mes</option><option value="quincenal">Cada 15 días</option><option value="semanal">Cada semana</option>
                  </select>
                </Campo>
              </div>
            ))}
            <button type="button" className="btn-link" onClick={() => poner({ cobros: [...d.cobros, { nombre: '', monto: '', frecuencia: 'mensual' }] })}>+ {d.cobros.length ? 'Otro cobro' : 'Agregar un cobro'}</button>
          </Seccion>
          <SeCarga>Tus lugares de plata, tus cobros y categorías comunes (súper, verdulería, salidas, transporte, salud, servicios…). Las cambiás cuando quieras.</SeCarga>
        </>
      )}

      {id === 'pagos' && (
        <>
          <p>Tocá lo que pagás y poné cuánto y qué día vence. Te avisamos antes.</p>
          <Chips etiqueta="Gastos fijos" opciones={FIJOS.map(([n]) => n)} elegidas={d.fijos.map((f) => f.nombre)}
            onCambio={(xs) => poner({ fijos: xs.map((x) => d.fijos.find((f) => f.nombre === x) ?? { nombre: x, monto: '', dia: String(FIJOS.find(([n]) => n === x)?.[1] ?? 10) }) })} />
          {d.fijos.map((f, i) => (
            <Seccion key={f.nombre} titulo={f.nombre}>
              <div className="bv-fila">
                <Campo etiqueta="Cuánto"><input inputMode="decimal" placeholder="$" value={f.monto} onChange={(e) => poner({ fijos: cambiar(d.fijos, i, { monto: e.target.value }) })} /></Campo>
                <Campo etiqueta="Día del mes"><input inputMode="numeric" value={f.dia} onChange={(e) => poner({ fijos: cambiar(d.fijos, i, { dia: e.target.value }) })} /></Campo>
              </div>
            </Seccion>
          ))}
          {d.fijos.length > 0 && <p className="nota">Los que dejes sin monto no se cargan.</p>}
        </>
      )}

      {id === 'dia' && (
        <>
          <div className="bv-fila">
            <Campo etiqueta="Me despierto"><input type="time" value={d.despierta} onChange={(e) => poner({ despierta: e.target.value })} /></Campo>
            <Campo etiqueta="Me duermo"><input type="time" value={d.duerme} onChange={(e) => poner({ duerme: e.target.value })} /></Campo>
          </div>
          {d.actividades.map((t, i) => (
            <Seccion key={i} titulo="Trabajo o actividad fija">
              <Campo etiqueta="Qué"><input value={t.nombre} placeholder="Ej. Oficina, facultad" onChange={(e) => poner({ actividades: cambiar(d.actividades, i, { nombre: e.target.value }) })} /></Campo>
              <div className="bv-chips" role="group" aria-label="Qué días">
                {DIAS.map((x, dia) => (
                  <button key={dia} type="button" className="bv-chip bv-dia" aria-pressed={t.dias.includes(dia)}
                    onClick={() => poner({ actividades: cambiar(d.actividades, i, { dias: alternar(t.dias, dia) }) })}>{x}</button>
                ))}
              </div>
              <div className="bv-fila">
                <Campo etiqueta="Desde"><input type="time" value={t.desde} onChange={(e) => poner({ actividades: cambiar(d.actividades, i, { desde: e.target.value }) })} /></Campo>
                <Campo etiqueta="Hasta"><input type="time" value={t.hasta} onChange={(e) => poner({ actividades: cambiar(d.actividades, i, { hasta: e.target.value }) })} /></Campo>
              </div>
              <button type="button" className="btn-link" onClick={() => poner({ actividades: d.actividades.filter((_, j) => j !== i) })}>Quitar</button>
            </Seccion>
          ))}
          {d.actividades.length < 4 && (
            <button type="button" className="btn-link" onClick={() => poner({ actividades: [...d.actividades, { nombre: '', dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '17:00' }] })}>
              + {d.actividades.length ? 'Otra actividad' : 'Agregar trabajo o actividad'}
            </button>
          )}
          <SeCarga>Tu semana tipo: dormir, tus actividades y el resto "en casa". Con eso LIFE calcula tu tiempo libre. Si ya tenías una, no se toca.</SeCarga>
        </>
      )}

      {id === 'tablero' && (
        <>
          <p>¿En qué grupos querés ordenar tus pendientes e ideas?</p>
          <Chips etiqueta="Categorías" opciones={[...new Set([...CATEGORIAS_TABLERO, ...d.categorias])]} elegidas={d.categorias} onCambio={(categorias) => poner({ categorias })} />
          <Propia texto="Categoría propia" onSumar={(x) => poner({ categorias: [...new Set([...d.categorias, x])] })} />
          <SeCarga>Tablero con Por hacer / En proceso / Hecho y estas categorías.</SeCarga>
        </>
      )}

      {id === 'entrenamiento' && (
        <>
          <div className="bv-fila">
            <Campo etiqueta="Días por semana">
              <select value={d.diasGym} onChange={(e) => poner({ diasGym: Number(e.target.value) })}>{[2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </Campo>
            <Campo etiqueta="Experiencia">
              <select value={d.experiencia} onChange={(e) => poner({ experiencia: e.target.value as Experiencia })}>
                <option value="empiezo">Recién empiezo</option><option value="intermedio">Más de 6 meses</option><option value="avanzado">Hace años</option>
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Objetivo">
            <select value={d.objetivo} onChange={(e) => poner({ objetivo: e.target.value as Objetivo })}>
              <option value="salud">Estar bien / salud</option><option value="masa">Ganar músculo</option><option value="fuerza">Ganar fuerza</option><option value="bajar">Bajar grasa</option>
            </select>
          </Campo>
          <SeCarga>{resumenDe({ ...d, areas: ['entrenamiento'] })[0]?.[1]} para el gimnasio, con la primera semana liviana. Después el Preparador la ajusta con lo que vas haciendo. Si ya tenías una rutina, no se toca.</SeCarga>
        </>
      )}

      {id === 'alimentacion' && (
        <>
          <div className="bv-fila">
            <Campo etiqueta="Peso (kg)"><input inputMode="decimal" value={d.peso} onChange={(e) => poner({ peso: e.target.value })} /></Campo>
            <Campo etiqueta="Altura (cm)"><input inputMode="numeric" value={d.altura} onChange={(e) => poner({ altura: e.target.value })} /></Campo>
            <Campo etiqueta="Edad"><input inputMode="numeric" value={d.edad} onChange={(e) => poner({ edad: e.target.value })} /></Campo>
          </div>
          {!usa('entrenamiento') && (
            <Campo etiqueta="Objetivo">
              <select value={d.objetivo} onChange={(e) => poner({ objetivo: e.target.value as Objetivo })}>
                <option value="salud">Estar bien / salud</option><option value="masa">Ganar músculo</option><option value="bajar">Bajar grasa</option>
              </select>
            </Campo>
          )}
          <Campo etiqueta="¿Algo que no comas?"><input value={d.noCome} placeholder="Alergias, vegetariano, lo que no te gusta" onChange={(e) => poner({ noCome: e.target.value })} /></Campo>
          <p className="nota">Platos que hacés seguido (tocá los tuyos):</p>
          <Chips etiqueta="Platos" opciones={PLATOS.map((p) => p.nombre)} elegidas={d.platos} onCambio={(platos) => poner({ platos })} />
          <SeCarga>Metas de proteína, calorías y agua según tu peso (sin peso quedan las generales) y los platos que tocaste. Tus datos del cuerpo los ves solo vos.</SeCarga>
        </>
      )}

      {id === 'stock' && (
        <>
          <p>¿Qué querés tener siempre? Tildalo y te avisamos cuando se acabe.</p>
          {BASICOS.map((g) => (
            <Seccion key={g.grupo} titulo={g.grupo}>
              <Chips etiqueta={g.grupo} opciones={g.cosas.map(([n]) => n)} elegidas={d.basicos} onCambio={(basicos) => poner({ basicos })} />
            </Seccion>
          ))}
          <SeCarga>Cada básico con cantidad 0: contá lo que tenés y ajustalo con + y −.</SeCarga>
        </>
      )}

      {id === 'compras' && (
        <>
          <p>¿Dónde comprás?</p>
          <Chips etiqueta="Súper" opciones={SUPERS.map(([n]) => n)} elegidas={d.supers} onCambio={(supers) => poner({ supers })} />
          <Campo etiqueta="¿Compartís compras con alguien? (opcional)">
            <input value={d.comparte} placeholder="Nombre de con quien vivís" onChange={(e) => poner({ comparte: e.target.value })} />
          </Campo>
          <SeCarga>Tus súper (Carrefour, Vea y Jumbo traen precios de referencia){d.comparte.trim() ? ` y el reparto "Yo / ${d.comparte.trim()} / Los dos" en el carro y el ticket` : ''}.</SeCarga>
        </>
      )}

      {ultimo && (
        <>
          <p>Esto es lo que se carga en tu cuenta:</p>
          <ul className="bv-resumen">
            {resumenDe(d).filter(([area]) => !d.saltadas.includes(area)).map(([area, texto]) => {
              const a = AREAS.find((x) => x.id === area)!;
              return <li key={area}><b>{a.icono} {a.nombre}</b> · {texto}</li>;
            })}
          </ul>
          <p className="nota">Si ya tenías algo con el mismo nombre, no se duplica. Todo se cambia después desde cada sección, y al guardar podés DESHACER.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}
    </ModoActividad>
  );
}

function Propia({ texto, onSumar }: { texto: string; onSumar: (x: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form className="bv-fila bv-propia" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onSumar(v.trim()); setV(''); } }}>
      <input value={v} placeholder={texto} aria-label={texto} onChange={(e) => setV(e.target.value)} />
      <button className="btn" disabled={!v.trim()}>Sumar</button>
    </form>
  );
}
