import { useState } from 'react';
import { crear, eliminar } from '../../core/db';
import { fechaCorta, hoy, relativo } from '../../core/format';
import { Campo, Estado, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { compararSemana, informeEntrenador, leerRutinaJson, necesitaDescarga, pct, rutinaAJson, semanas } from './analisis';
import { infoEjercicio } from './biblioteca';
import { empezarEntreno, Entrenando, leerEnCurso } from './Entrenando';
import { BarrasSemanas, Linea, VolumenGrupos } from './Graficos';
import {
  guardarRutina, pesoSugerido, progresoEjercicio, proximoDia, TE, tendencia, useRutina, useSeries, useSesiones, type Sesion,
} from './modelo';
import { Delta, ResumenEntreno } from './Resumen';
import './entreno.css';

function FormOtroDeporte({ onListo }: { onListo: () => void }) {
  const [deporte, setDeporte] = useState('');
  const [min, setMin] = useState('');
  const [rpe, setRpe] = useState('');
  const [fecha, setFecha] = useState(hoy());
  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!deporte.trim()) return;
    await crear<Sesion>(TE.sesiones, { fecha, dia: 'otro', deporte: deporte.trim(), duracion_min: Number(min) || null, rpe_sesion: Number(rpe) || null, sensacion: null, notas: '' });
    onListo();
  }
  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Deporte o actividad"><input autoFocus value={deporte} onChange={(x) => setDeporte(x.target.value)} placeholder="Fútbol, correr, bici…" /></Campo>
      <div className="fila-campos">
        <Campo etiqueta="Minutos"><input inputMode="numeric" value={min} onChange={(x) => setMin(x.target.value)} /></Campo>
        <Campo etiqueta="Esfuerzo 1–10"><input inputMode="numeric" value={rpe} onChange={(x) => setRpe(x.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(x) => setFecha(x.target.value)} /></Campo>
      <button className="btn btn-primario">Guardar</button>
    </form>
  );
}

export function PantallaHoy() {
  const { filas: sesiones } = useSesiones();
  const { filas: series } = useSeries();
  const { dias } = useRutina();
  const [enCurso, setEnCurso] = useState(() => !!leerEnCurso());
  const [elegido, setElegido] = useState<string | null>(null);
  const [otro, setOtro] = useState(false);
  if (enCurso) return <Entrenando onSalir={() => setEnCurso(false)} />;

  const sugerido = proximoDia(sesiones, dias);
  const plan = dias.find((d) => d.id === elegido) ?? sugerido;
  const ult = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const descarga = necesitaDescarga(sesiones, series);

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">{ult ? `Último entreno: ${fechaCorta(ult.fecha)} (${relativo(ult.fecha)})` : 'Todavía no registraste entrenos.'}</p>
        <button className="btn" onClick={() => setOtro(true)}>{Icono.mas} Otro deporte</button>
      </div>
      {descarga && <Tarjeta><Estado nivel="aviso" texto="Fatiga acumulada" /><p className="nota" style={{ margin: '6px 0 0' }}>{descarga}</p></Tarjeta>}
      <div className="segmentado" style={{ flexWrap: 'wrap' }}>
        {dias.map((d) => (
          <button key={d.id} className={plan.id === d.id ? 'activo' : ''} onClick={() => setElegido(d.id)}>
            {d.id} · {d.nombre}{d.id === sugerido.id ? ' ★' : ''}
          </button>
        ))}
      </div>
      <Tarjeta titulo={`Día ${plan.id}: ${plan.nombre}`} accion={plan.id === sugerido.id ? <span className="chip chip-on">Te toca hoy</span> : undefined}>
        <ul className="lista">
          {plan.ejercicios.map((ej) => {
            const s = pesoSugerido(series, ej);
            const c = compararSemana(series, ej.nombre);
            return (
              <li key={ej.nombre} className="lista-item">
                <div className="crece">
                  <strong>{ej.nombre}</strong>
                  <small className="nota">
                    {ej.series} × {ej.repsMin}–{ej.repsMax} · RPE {ej.rpe} · descanso {Math.round(ej.descanso / 60 * 10) / 10} min
                    {c.pasada.series ? ` · semana pasada ${c.pasada.series} series, ${Math.round(c.pasada.tonelaje)} kg` : ''}
                  </small>
                </div>
                <span className="num">{s.peso != null ? `${s.peso} kg` : '—'}</span>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-primario ancho" style={{ marginTop: 12 }} onClick={() => { empezarEntreno(plan); setEnCurso(true); }}>
          ▶ Empezar entreno
        </button>
      </Tarjeta>
      <p className="nota">Doble progresión: cuando completás el tope de repeticiones en todas las series, la app te sube el peso. Antes de empezar te pregunta cómo dormiste y cómo llegás, y ajusta el entreno. Funciona sin señal. <a href="#/entrenamiento/rutina">Editar rutina</a></p>
      <Modal titulo="Otro deporte" abierto={otro} onCerrar={() => setOtro(false)}>
        {otro && <FormOtroDeporte onListo={() => setOtro(false)} />}
      </Modal>
    </div>
  );
}

type Medida = 'tonelaje' | 'series' | 'carga';

export function PantallaProgreso() {
  const { filas: sesiones } = useSesiones();
  const { filas: series } = useSeries();
  const { dias } = useRutina();
  const [medida, setMedida] = useState<Medida>('tonelaje');
  if (!series.length) return <Vacio titulo="Sin datos todavía"><p>Cuando registres entrenos, acá ves tu volumen por semana, cómo sube tu fuerza en cada ejercicio y si te estancaste.</p></Vacio>;

  const ss = semanas(sesiones, series, 8);
  const [pasada, esta] = ss.slice(-2);
  const unidades: Record<Medida, string> = { tonelaje: 'kg', series: 'series', carga: 'puntos de carga' };
  const enRutina = new Set(dias.flatMap((d) => d.ejercicios.map((x) => x.nombre)));
  const otros = [...new Set(series.map((s) => s.ejercicio))].filter((n) => !enRutina.has(n));

  const fila = (nombre: string) => {
    const pts = progresoEjercicio(series, nombre);
    const t = tendencia(pts);
    const c = compararSemana(series, nombre);
    return (
      <li key={nombre} className="lista-item">
        <div className="crece">
          <strong>{nombre}</strong>
          <small className="nota">
            {pts.length ? `1RM estimado ${Math.round(pts[pts.length - 1].mejor)} kg · ${pts.length} sesiones` : 'Sin registros'}
            {c.esta.tonelaje && c.pasada.tonelaje ? <> · semana <Delta actual={c.esta.tonelaje} previo={c.pasada.tonelaje} /></> : null}
          </small>
        </div>
        <Linea puntos={pts.map((p) => p.mejor)} />
        {t === 'subiendo' && <Estado nivel="ok" texto="Subiendo" />}
        {t === 'estancado' && <Estado nivel="aviso" texto="Estancado" />}
      </li>
    );
  };

  const cambio = pct(esta[medida], pasada[medida]);
  return (
    <div className="pila">
      <Tarjeta titulo="Series por músculo">
        <VolumenGrupos esta={esta.porGrupo} pasada={pasada.porGrupo} />
        <p className="nota" style={{ margin: '8px 0 0' }}>Para ganar masa, la evidencia apunta a unas 10–20 series efectivas por músculo por semana (menos en brazos y gemelos, que trabajan de rebote). El músculo principal suma 1 serie y los que ayudan, media.</p>
      </Tarjeta>
      <Tarjeta titulo="Semana a semana">
        <div className="segmentado" style={{ marginBottom: 8 }}>
          {([['tonelaje', 'Kilos'], ['series', 'Series'], ['carga', 'Carga']] as Array<[Medida, string]>).map(([id, n]) => (
            <button key={id} type="button" className={medida === id ? 'activo' : ''} onClick={() => setMedida(id)}>{n}</button>
          ))}
        </div>
        <BarrasSemanas datos={ss.map((s) => ({ lunes: s.lunes, valor: s[medida] }))} unidad={unidades[medida]} />
        <p className="nota" style={{ margin: '6px 0 0' }}>
          Esta semana (en curso): {Math.round(esta[medida]).toLocaleString('es-AR')} {unidades[medida]}
          {cambio != null && <> (<Delta actual={esta[medida]} previo={pasada[medida]} /> contra la pasada)</>}.
          {medida === 'carga' && ' Carga = esfuerzo de la sesión × minutos. Subirla más de ~30 % de golpe aumenta el riesgo de sobrecarga.'}
          {medida === 'tonelaje' && ' Kilos = peso × repeticiones de todas las series efectivas.'}
        </p>
      </Tarjeta>
      {dias.map((d) => (
        <Tarjeta key={d.id} titulo={`${d.id} · ${d.nombre}`}>
          <ul className="lista">{d.ejercicios.map((x) => fila(x.nombre))}</ul>
        </Tarjeta>
      ))}
      {otros.length > 0 && <Tarjeta titulo="Otros ejercicios"><ul className="lista">{otros.map(fila)}</ul></Tarjeta>}
      <p className="nota">El 1RM estimado es el peso máximo que podrías levantar una vez, calculado con la fórmula de Epley a partir de tu mejor serie.</p>
    </div>
  );
}

export function PantallaHistorial() {
  const { filas: sesiones } = useSesiones();
  const { filas: series } = useSeries();
  const { dias } = useRutina();
  const [ver, setVer] = useState<Sesion | null>(null);
  const lista = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  if (!lista.length) return <Vacio titulo="Sin entrenos registrados" />;
  return (
    <Tarjeta>
      <ul className="lista">
        {lista.map((s) => {
          const propias = series.filter((x) => x.sesion_id === s.id);
          const plan = dias.find((d) => d.id === s.dia);
          const ton = propias.filter((x) => x.tipo !== 'calentamiento').reduce((t, x) => t + Number(x.peso) * x.reps, 0);
          return (
            <li key={s.id} className="lista-item">
              <button type="button" className="crece btn-icono" style={{ textAlign: 'left', color: 'var(--ink)', display: 'block', minWidth: 0 }} onClick={() => propias.length && setVer(s)}>
                <strong>{s.dia === 'otro' ? s.deporte : `Día ${s.dia} · ${s.dia_nombre ?? plan?.nombre ?? ''}`}</strong>
                <small className="nota">{fechaCorta(s.fecha)}{s.duracion_min ? ` · ${s.duracion_min} min` : ''}{propias.length ? ` · ${propias.length} series · ${Math.round(ton).toLocaleString('es-AR')} kg` : ''}{s.sensacion ? ` · sensación ${s.sensacion}/10` : ''}{s.notas ? ` · ${s.notas}` : ''}</small>
              </button>
              <button className="btn-icono" aria-label="Borrar" onClick={async () => {
                if (!window.confirm('¿Borrar este entreno?')) return;
                for (const x of propias) await eliminar(TE.series, x.id);
                await eliminar(TE.sesiones, s.id);
              }}>{Icono.borrar}</button>
            </li>
          );
        })}
      </ul>
      <Modal titulo="Resultado del entreno" abierto={!!ver} onCerrar={() => setVer(null)}>
        {ver && <ResumenEntreno sesion={ver} />}
      </Modal>
    </Tarjeta>
  );
}

async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

/** Herramientas para que Claude funcione como entrenador: informe para pasarle y rutina para pegar de vuelta. */
export function PantallaEntrenador() {
  const { filas: sesiones } = useSesiones();
  const { filas: series } = useSeries();
  const { dias, fila } = useRutina();
  const [msg, setMsg] = useState('');
  const [pegado, setPegado] = useState('');
  const [vista, setVista] = useState<ReturnType<typeof leerRutinaJson> | null>(null);
  const [error, setError] = useState('');
  const informe = informeEntrenador(sesiones, series, dias, fila?.notas ?? '');
  const propios = [...new Set(dias.flatMap((d) => d.ejercicios.map((x) => x.nombre)))].filter((n) => !infoEjercicio(n));

  return (
    <div className="pila">
      <Tarjeta titulo="1 · Pasale tus datos a Claude">
        <p className="nota" style={{ marginTop: 0 }}>Copiá el informe (últimas 4 semanas: series, pesos, esfuerzo, cansancio, volumen por músculo y progreso) y pegalo en el chat del proyecto. Claude lo analiza y te devuelve ajustes.</p>
        <div className="acciones">
          <button className="btn btn-primario crece" onClick={async () => setMsg((await copiar(informe)) ? 'Informe copiado. Pegalo en el chat con Claude.' : 'No pude copiar solo: seleccioná el texto de abajo y copialo.')}>Copiar informe</button>
        </div>
        {msg && <p className="nota">{msg}</p>}
        <details><summary className="nota">Ver informe</summary><pre className="ent-pre">{informe}</pre></details>
      </Tarjeta>

      <Tarjeta titulo="2 · Pegá la rutina que te arme Claude">
        <p className="nota" style={{ marginTop: 0 }}>Cuando Claude te pase una rutina en formato JSON, pegala acá. Vas a ver una vista previa antes de activarla; tu historial no se toca.</p>
        <textarea rows={6} value={pegado} onChange={(x) => { setPegado(x.target.value); setVista(null); setError(''); }} placeholder='```json { "nombre": "…", "dias": [ … ] } ```' />
        <div className="acciones" style={{ marginTop: 8 }}>
          <button className="btn" disabled={!pegado.trim()} onClick={() => {
            try { setVista(leerRutinaJson(pegado)); setError(''); } catch (x) { setError((x as Error).message); setVista(null); }
          }}>Revisar</button>
        </div>
        {error && <p className="ent-baja">{error}</p>}
        {vista && (
          <div style={{ marginTop: 8 }}>
            <strong>{vista.nombre}</strong>
            {vista.notas && <p className="nota" style={{ whiteSpace: 'pre-wrap' }}>{vista.notas}</p>}
            <ul className="lista">
              {vista.dias.map((d) => (
                <li key={d.id} className="lista-item"><div className="crece"><strong>Día {d.id} · {d.nombre}</strong>
                  <small className="nota">{d.ejercicios.map((x) => `${x.nombre} ${x.series}×${x.repsMin}-${x.repsMax}`).join(' · ')}</small></div></li>
              ))}
            </ul>
            <button className="btn btn-primario ancho" onClick={async () => {
              await guardarRutina(vista.dias, { nombre: vista.nombre, notas: vista.notas }, fila);
              setVista(null); setPegado(''); setMsg('Rutina activada. Ya la ves en Hoy y en Rutina.');
            }}>Activar esta rutina</button>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Copiar mi rutina actual">
        <p className="nota" style={{ marginTop: 0 }}>Por si querés pedirle a Claude que la modifique.</p>
        <button className="btn" onClick={async () => setMsg((await copiar(rutinaAJson(dias, fila?.nombre ?? 'Rutina base', fila?.notas ?? ''))) ? 'Rutina copiada.' : 'No pude copiar.')}>Copiar rutina en JSON</button>
        {propios.length > 0 && <p className="nota">Ejercicios fuera de la biblioteca (no suman al conteo por músculo): {propios.join(', ')}.</p>}
      </Tarjeta>
    </div>
  );
}
