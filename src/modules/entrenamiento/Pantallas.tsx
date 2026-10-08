import { useState } from 'react';
import { crear, eliminar } from '../../core/db';
import { fechaCorta, hoy, relativo } from '../../core/format';
import { Campo, Estado, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { compararSemana, necesitaDescarga, pct, semanas } from './analisis';
import { empezarEntreno, Entrenando, leerEnCurso } from './Entrenando';
import { BarrasSemanas, Linea, VolumenGrupos } from './Graficos';
import {
  pesoSugerido, progresoEjercicio, proximoDia, TE, tendencia, useBiblioteca, useRutina, useSeries, useSesiones, type Serie, type Sesion,
} from './modelo';
import { Delta, ResumenEntreno } from './Resumen';
import './entreno.css';
import { zonasDe, type Zona } from './biblioteca';
import { MapaMuscular, textoZonas } from './MapaMuscular';
import { ajustarDia, describirSemana } from './ciclo';
import { inicioSemana } from './analisis';

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

/** Las semanas del ciclo como fichas, con la actual marcada. */
export function BarraCiclo() {
  const { ciclo, estado, fila } = useRutina();
  if (!ciclo || !estado) {
    return fila ? null : (
      <Tarjeta><p className="nota" style={{ margin: 0 }}>Todavía no armaste tu ciclo de 4 semanas. <a href="#/entrenamiento/entrenador">Abrí el Preparador</a>: cargás tu peso, elegís una rutina y la app te prevé los pesos.</p></Tarjeta>
    );
  }
  return (
    <div className="ent-ciclo">
      <div className="ent-ciclo-sem">
        {ciclo.semanas.map((s, i) => (
          <span key={i} className={i === estado.indice && !estado.terminado ? 'actual' : i < estado.indice || estado.terminado ? 'hecha' : ''}>
            <b>S{i + 1}</b>{s.nombre}
          </span>
        ))}
      </div>
      <small className="nota">
        {estado.terminado
          ? <>Terminó el ciclo{ciclo.numero ? ` ${ciclo.numero}` : ''}. <a href="#/entrenamiento/entrenador">Ver la propuesta para el próximo</a></>
          : <>Ciclo{ciclo.numero ? ` ${ciclo.numero}` : ''} · semana {estado.indice + 1} de {estado.total}: {describirSemana(estado.semana)}. {estado.semana.nota ?? ''}</>}
      </small>
    </div>
  );
}

/** Series efectivas de esta semana por zona (pesadas por el mapa de cada ejercicio), escaladas a 15 = 1. */
function mapaSemana(series: Serie[]): Partial<Record<Zona, number>> {
  const lunes = inicioSemana(hoy());
  const r: Partial<Record<Zona, number>> = {};
  for (const s of series) {
    if (s.fecha < lunes || s.tipo === 'calentamiento') continue;
    for (const [z, v] of Object.entries(zonasDe(s.ejercicio)) as Array<[Zona, number]>) r[z] = (r[z] ?? 0) + v;
  }
  for (const z of Object.keys(r) as Zona[]) r[z] = Math.min(1, (r[z] ?? 0) / 15);
  return r;
}

export function PantallaHoy() {
  useBiblioteca();
  const { filas: sesiones } = useSesiones();
  const { filas: series } = useSeries();
  const { dias, perfil, semana } = useRutina();
  const [enCurso, setEnCurso] = useState(() => !!leerEnCurso());
  const [elegido, setElegido] = useState<string | null>(null);
  const [otro, setOtro] = useState(false);
  if (enCurso) return <Entrenando onSalir={() => setEnCurso(false)} />;

  const sugerido = proximoDia(sesiones, dias);
  const plan = ajustarDia(dias.find((d) => d.id === elegido) ?? sugerido, semana);
  const ult = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const descarga = necesitaDescarga(sesiones, series);

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">{ult ? `Último entreno: ${fechaCorta(ult.fecha)} (${relativo(ult.fecha)})` : 'Todavía no registraste entrenos.'}</p>
        <button className="btn" onClick={() => setOtro(true)}>{Icono.mas} Otro deporte</button>
      </div>
      <BarraCiclo />
      {descarga && !semana?.seriesPct && <Tarjeta><Estado nivel="aviso" texto="Fatiga acumulada" /><p className="nota" style={{ margin: '6px 0 0' }}>{descarga}</p></Tarjeta>}
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
            const s = pesoSugerido(series, ej, perfil, semana);
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
        <button className="btn btn-primario ancho" style={{ marginTop: 12 }} onClick={() => { empezarEntreno(plan, semana); setEnCurso(true); }}>
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
  useBiblioteca();
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
      <Tarjeta titulo="Mapa de la semana">
        <MapaMuscular valores={mapaSemana(series)} />
        <p className="nota" style={{ margin: '8px 0 0' }}>Rojo = músculo con 15 series o más esta semana; amarillo = poco trabajo; gris = nada. {textoZonas(mapaSemana(series))}</p>
      </Tarjeta>
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
  const { dias, todas } = useRutina();
  const [ver, setVer] = useState<Sesion | null>(null);
  const lista = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  if (!lista.length) return <Vacio titulo="Sin entrenos registrados"><p>Cuando guardes un entreno aparece acá, agrupado por semana y con la semana del ciclo en la que estabas.</p></Vacio>;

  // Agrupar por semana (lunes) y ubicar cada semana en su ciclo.
  const grupos = new Map<string, Sesion[]>();
  for (const s of lista) {
    const l = inicioSemana(s.fecha);
    grupos.set(l, [...(grupos.get(l) ?? []), s]);
  }
  const cicloDe = (lunes: string) => {
    const r = todas.find((x) => x.inicio && x.inicio <= lunes && x.ciclo?.semanas?.length);
    if (!r?.inicio || !r.ciclo) return null;
    const i = Math.floor((new Date(lunes).getTime() - new Date(r.inicio).getTime()) / (7 * 86400000));
    if (i >= r.ciclo.semanas.length) return null;
    return `${r.ciclo.numero ? `Ciclo ${r.ciclo.numero} · ` : ''}S${i + 1} ${r.ciclo.semanas[i].nombre}`;
  };

  return (
    <div className="pila">
      {[...grupos.entries()].map(([lunes, ss]) => {
        const gym = ss.filter((s) => s.dia !== 'otro');
        const ton = series.filter((x) => gym.some((s) => s.id === x.sesion_id) && x.tipo !== 'calentamiento').reduce((t, x) => t + Number(x.peso) * x.reps, 0);
        const etiqueta = cicloDe(lunes);
        return (
          <Tarjeta key={lunes} titulo={`Semana del ${fechaCorta(lunes)}`} accion={etiqueta ? <span className="chip chip-on">{etiqueta}</span> : undefined}>
            <small className="nota">{gym.length} {gym.length === 1 ? 'entreno' : 'entrenos'} de gimnasio{ss.length > gym.length ? ` + ${ss.length - gym.length} de otro deporte` : ''} · {Math.round(ton).toLocaleString('es-AR')} kg</small>
            <ul className="lista">
              {ss.map((s) => {
                const propias = series.filter((x) => x.sesion_id === s.id);
                const plan = dias.find((d) => d.id === s.dia);
                const tonS = propias.filter((x) => x.tipo !== 'calentamiento').reduce((t, x) => t + Number(x.peso) * x.reps, 0);
                const prep = [s.sueno_h != null ? `😴 ${s.sueno_h} h` : '', s.energia != null ? `⚡ ${s.energia}/5` : '', s.agujetas != null ? `dolor ${s.agujetas}/5` : ''].filter(Boolean).join(' · ');
                return (
                  <li key={s.id} className="lista-item">
                    <button type="button" className="crece btn-icono ent-hist-item" onClick={() => propias.length && setVer(s)}>
                      <strong>{s.dia === 'otro' ? `${/f[uú]tbol/i.test(s.deporte) ? '⚽' : '🏃'} ${s.deporte}` : `Día ${s.dia} · ${s.dia_nombre ?? plan?.nombre ?? ''}`}</strong>
                      <small className="nota">{fechaCorta(s.fecha)}{s.duracion_min ? ` · ${s.duracion_min} min` : ''}{propias.length ? ` · ${propias.filter((x) => x.tipo !== 'calentamiento').length} series · ${Math.round(tonS).toLocaleString('es-AR')} kg` : ''}{s.rpe_sesion ? ` · RPE ${s.rpe_sesion}` : ''}{s.sensacion ? ` · sensación ${s.sensacion}/10` : ''}</small>
                      {prep && <small className="nota">{prep}</small>}
                      {s.notas && <span className="ent-hist-nota">“{s.notas}”</span>}
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
          </Tarjeta>
        );
      })}
      <Modal titulo="Resultado del entreno" abierto={!!ver} onCerrar={() => setVer(null)}>
        {ver && <ResumenEntreno sesion={ver} />}
      </Modal>
    </div>
  );
}
