import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { escribirStorage, leerStorage } from '../../core/config';
import { fechaCorta, hoy } from '../../core/format';
import { Campo, Modal, Tarjeta } from '../../ui/ui';
import { compararSemana, evaluarPreparacion, objetivoHoy, type Preparacion } from './analisis';
import { infoEjercicio, variantesDe } from './biblioteca';
import { guardarSesion, pesoSugerido, ultimaVez, useBiblioteca, useRutina, useSeries, type DiaPlan, type Sesion } from './modelo';
import { Delta, ResumenEntreno } from './Resumen';
import { SelectorEjercicio } from './Rutina';
import { describirSemana, type SemanaCiclo } from './ciclo';
import { ImagenEjercicio, Stepper } from './Controles';
import { leerManana } from './Manana';

/** `descanso` = segundos que se descansó de verdad después de la serie. */
type Hecha = { ejercicio: string; numero: number; peso: number; reps: number; rpe: number | null; tipo: 'efectiva' | 'calentamiento'; descanso?: number | null };

/** Estado del entreno en curso. Se guarda en el celular, así sobrevive si se cierra la app o no hay señal. */
interface EnCurso {
  dia: string;
  /** Copia del día al empezar (la rutina puede cambiar mientras tanto, o se cambia un ejercicio solo por hoy). */
  plan?: DiaPlan;
  fase?: 'chequeo' | 'entrenando' | 'cierre';
  prep?: Preparacion;
  inicio: number;
  ej: number;
  hechas: Hecha[];
  descansoHasta: number | null;
  /** Cuándo empezó el descanso en curso (para saber cuánto se descansó si se corta). */
  descansoDesde?: number | null;
  /** Semana del ciclo al empezar (el plan ya viene ajustado; esto se usa para el peso sugerido). */
  semana?: SemanaCiclo | null;
}

const CLAVE = 'life.entreno.encurso';
export const leerEnCurso = (): EnCurso | null => {
  try { return JSON.parse(leerStorage(CLAVE) ?? 'null'); } catch { return null; }
};
const guardar = (x: EnCurso | null) => escribirStorage(CLAVE, x ? JSON.stringify(x) : null);

export function empezarEntreno(plan: DiaPlan, semana: SemanaCiclo | null = null) {
  guardar({ dia: plan.id, plan, semana, fase: 'chequeo', inicio: Date.now(), ej: 0, hechas: [], descansoHasta: null });
}

function useAhora(activo: boolean) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, [activo]);
  return ahora;
}

const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

/** Descanso tipo bomba: arranca verde, se va poniendo roja y en los últimos segundos titila cada vez más rápido. */
function Bomba({ restante, total, onCortar, onMas, sigue }: { restante: number; total: number; onCortar: () => void; onMas: () => void; sigue?: string }) {
  const frac = total > 0 ? Math.min(1, Math.max(0, restante / total)) : 0;
  const tono = Math.round(130 * frac); // 130 = verde, 0 = rojo
  const color = `hsl(${tono} 85% 50%)`;
  const titila = restante <= 15 ? Math.max(0.18, (restante / 15) * 0.9) : 0;
  return (
    <div className="ent-bomba-caja">
      <p className="nota" style={{ margin: 0 }}>Descanso</p>
      <div className={`ent-bomba ${titila ? 'titila' : ''}`} style={{ '--c': color, '--p': `${frac * 360}deg`, animationDuration: titila ? `${titila}s` : undefined } as CSSProperties}>
        <span className="ent-bomba-mecha" aria-hidden="true">✦</span>
        <strong className="ent-bomba-num" aria-live="polite">{mmss(restante)}</strong>
        <span className="ent-bomba-ico" aria-hidden="true">💣</span>
      </div>
      {sigue && <p className="nota" style={{ margin: 0 }}>Sigue: {sigue}</p>}
      <div className="ent-bomba-btns">
        <button className="btn" onClick={onMas}>+30 s</button>
        <button className="btn btn-primario crece" onClick={onCortar}>Cortar descanso</button>
      </div>
      <p className="nota" style={{ margin: 0, fontSize: '0.75rem' }}>Si lo cortás, se guarda cuánto descansaste de verdad.</p>
    </div>
  );
}

/** Pantalla que tapa todo mientras se entrena (como la vista de reparto): una sola cosa a la vez, botones grandes. */
function Capa({ children }: { children: ReactNode }) {
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);
  return <div className="ent-pantalla" role="dialog" aria-modal="true" aria-label="Modo entrenando"><div className="ent-pantalla-int pila">{children}</div></div>;
}

function vibrar() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* iPhone no vibra desde la web */ }
}

const NOTAS_RAPIDAS = ['Dormí poco', 'Me sentí fuerte', 'Poco tiempo', 'Máquina ocupada', 'Molestia en hombro', 'Molestia en rodilla', 'Comí poco', 'Mucho estrés', 'Técnica mejor', 'Gimnasio lleno'];

const efectivasDe = (hechas: Hecha[], nombre: string) => hechas.filter((h) => h.ejercicio === nombre && h.tipo !== 'calentamiento');

/* ---------- Paso 1: chequeo antes de entrenar ---------- */

function Chequeo({ onListo }: { onListo: (p: Preparacion) => void }) {
  // Si ya contestó a la mañana, solo falta el dolor muscular.
  const manana = leerManana();
  const [p, setP] = useState<Preparacion>({ sueno_h: manana?.sueno_h ?? null, energia: manana?.energia ?? null, agujetas: null });
  const [todo, setTodo] = useState(!(manana?.sueno_h != null && manana?.energia != null));
  const ev = evaluarPreparacion(p);
  const seg = (k: keyof Preparacion, ops: Array<[number, string]>) => (
    <div className="segmentado">
      {ops.map(([v, t]) => <button key={v} type="button" className={p[k] === v ? 'activo' : ''} onClick={() => setP({ ...p, [k]: v })}>{t}</button>)}
    </div>
  );
  return (
    <Tarjeta titulo="¿Cómo llegás hoy?">
      <div className="ent-check">
        {todo ? (
          <>
            <p className="subtitulo">Horas de sueño anoche</p>
            {seg('sueno_h', [[4, '≤4'], [5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, '9+']])}
            <p className="subtitulo">Energía (1 = sin nafta, 5 = a full)</p>
            {seg('energia', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']])}
          </>
        ) : (
          <p className="nota" style={{ margin: 0 }}>A la mañana dijiste: {p.sueno_h} h de sueño y energía {p.energia}/5. <button type="button" className="btn-link" onClick={() => setTodo(true)}>cambiar</button></p>
        )}
        <p className="subtitulo">Dolor muscular (1 = nada, 5 = mucho)</p>
        {seg('agujetas', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']])}
      </div>
      {ev && <p className={ev.nivel === 'bajo' ? 'ent-baja' : ev.nivel === 'bien' ? 'ent-sube' : ''} style={{ margin: '12px 0 0' }}>Preparación {ev.puntaje}/100. {ev.consejo}</p>}
      <div className="acciones" style={{ marginTop: 12 }}>
        <button className="btn btn-primario crece" onClick={() => onListo(p)}>Empezar</button>
        <button className="btn" onClick={() => onListo({ sueno_h: null, energia: null, agujetas: null })}>Saltar</button>
      </div>
    </Tarjeta>
  );
}

/* ---------- Pantalla principal del modo entrenando ---------- */

export function Entrenando({ onSalir }: { onSalir: () => void }) {
  useBiblioteca();
  const { filas: series } = useSeries();
  const { dias, perfil } = useRutina();
  const [st, setSt] = useState<EnCurso | null>(leerEnCurso);
  const [guardada, setGuardada] = useState<Sesion | null>(null);
  const ahora = useAhora(!!st);
  const plan = st?.plan ?? dias.find((d) => d.id === st?.dia) ?? dias[0];
  const fase = st?.fase ?? 'entrenando';
  const ev = st?.prep ? evaluarPreparacion(st.prep) : null;
  const ej = plan.ejercicios[st?.ej ?? 0];
  const hechasEj = st && ej ? st.hechas.filter((h) => h.ejercicio === ej.nombre) : [];
  const efEj = st && ej ? efectivasDe(st.hechas, ej.nombre) : [];
  const [peso, setPeso] = useState(0);
  const [reps, setReps] = useState(0);
  const [rpe, setRpe] = useState<number | null>(null);
  const [calent, setCalent] = useState(false);
  const [sensacion, setSensacion] = useState(7);
  const [rpeSesion, setRpeSesion] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [cambiar, setCambiar] = useState(false);
  /** Avisos antes de guardar una serie con datos raros (el usuario confirma o corrige). */
  const [duda, setDuda] = useState<string[] | null>(null);
  const [avisoDescanso, setAvisoDescanso] = useState('');
  const restante = st?.descansoHasta ? Math.max(0, Math.ceil((st.descansoHasta - ahora) / 1000)) : 0;

  // Ajuste por cansancio: día bajo = una serie menos y ~10 % menos peso; día medio = sin subir peso y tope RPE 8.
  const seriesObjetivo = ej ? (ev?.nivel === 'bajo' ? Math.max(2, ej.series - 1) : ej.series) : 0;
  const rpeObjetivo = ej ? (ev && ev.nivel !== 'bien' ? Math.min(ej.rpe, ev.nivel === 'bajo' ? 7 : 8) : ej.rpe) : 0;
  const sugBase = ej ? pesoSugerido(series, ej, perfil, st?.semana) : { peso: null, motivo: '' };
  const ultimoPeso = ej ? Math.max(0, ...ultimaVez(series, ej.nombre).map((s) => Number(s.peso) || 0)) : 0;
  const sug = !ev || ev.nivel === 'bien' || sugBase.peso == null ? sugBase
    : ev.nivel === 'medio' ? { peso: Math.min(sugBase.peso, ultimoPeso || sugBase.peso), motivo: 'Día medio: mismo peso que la última vez, sin forzar.' }
      : { peso: Math.round((ultimoPeso || sugBase.peso) * 0.9 / 1.25) * 1.25, motivo: 'Día de poca energía: 10 % menos de peso y una serie menos.' };

  // Al cambiar de ejercicio o de serie, dejar todo previsto para confirmar con un toque:
  // peso = el de la serie anterior de hoy o el sugerido; reps = lo que hiciste en esa serie la última vez
  // (si fue con el mismo peso) o el mínimo del rango; esfuerzo = el objetivo.
  useEffect(() => {
    if (!ej) return;
    const ult = efEj[efEj.length - 1];
    const p = ult ? ult.peso : sug.peso ?? 0;
    const antes = ultimaVez(series, ej.nombre)[efEj.length];
    const r = antes && Number(antes.peso) === p ? Math.min(ej.repsMax, Math.max(ej.repsMin, antes.reps)) : ej.repsMin;
    setPeso(p);
    setReps(r);
    setRpe(Math.round(rpeObjetivo));
    setCalent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.ej, ej?.nombre, hechasEj.length, fase]);

  useEffect(() => {
    if (st?.descansoHasta && restante === 0) {
      vibrar();
      cerrarDescanso(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante]);

  function actualizar(n: EnCurso | null) {
    guardar(n);
    setSt(n);
  }

  /** Termina el descanso y anota en la última serie cuánto se descansó (lo real si se cortó, lo previsto si se cumplió). */
  function cerrarDescanso(cortado: boolean) {
    if (!st) return;
    const desde = st.descansoDesde ?? null;
    const fin = cortado ? Date.now() : (st.descansoHasta ?? Date.now());
    const seg = desde ? Math.max(0, Math.round((fin - desde) / 1000)) : null;
    const hechas = st.hechas.slice();
    const i = hechas.length - 1;
    if (i >= 0 && seg != null) hechas[i] = { ...hechas[i], descanso: seg };
    actualizar({ ...st, hechas, descansoHasta: null, descansoDesde: null });
    setAvisoDescanso(seg != null ? `Descansaste ${mmss(seg)}${cortado ? ' (cortado)' : ''}` : '');
  }

  if (guardada) {
    return (
      <Capa>
        <h2>Resultado del entreno</h2>
        <ResumenEntreno sesion={guardada} />
        <button className="btn btn-primario ancho" onClick={onSalir}>Listo</button>
      </Capa>
    );
  }
  if (!st) return null;

  if (fase === 'chequeo') {
    return (
      <Capa>
        <h2>Día {plan.id} · {plan.nombre}</h2>
        <Chequeo onListo={(prep) => actualizar({ ...st, prep, fase: 'entrenando', inicio: Date.now() })} />
        <button className="btn" onClick={() => { if (window.confirm('¿Salir sin entrenar?')) { actualizar(null); onSalir(); } }}>Salir</button>
      </Capa>
    );
  }

  const pendiente = (i: number) => {
    const x = plan.ejercicios[i];
    const obj = ev?.nivel === 'bajo' ? Math.max(2, x.series - 1) : x.series;
    return efectivasDe(st.hechas, x.nombre).length < obj;
  };
  /** Próximo ejercicio con series pendientes, empezando por el siguiente al actual. */
  const siguiente = (desde: number) => {
    for (let k = 1; k <= plan.ejercicios.length; k++) {
      const i = (desde + k) % plan.ejercicios.length;
      if (pendiente(i)) return i;
    }
    return plan.ejercicios.length;
  };
  const terminado = fase === 'cierre' || st.ej >= plan.ejercicios.length;
  const totalSeries = plan.ejercicios.reduce((s, x) => s + (ev?.nivel === 'bajo' ? Math.max(2, x.series - 1) : x.series), 0);
  const nEfectivas = st.hechas.filter((h) => h.tipo !== 'calentamiento').length;

  /** Revisa que la serie tenga sentido antes de guardarla; si algo es raro, pregunta. */
  function revisarSerie(): string[] {
    if (!ej) return [];
    const p: string[] = [];
    const ref = efEj[efEj.length - 1]?.peso || sug.peso || ultimoPeso || 0;
    const corporal = info?.equipo === 'peso corporal';
    if (!calent) {
      if (reps > ej.repsMax + 4) p.push(`Marcaste ${reps} repeticiones y el objetivo es ${ej.repsMin}–${ej.repsMax}. Si te sobraron tantas, la próxima subí el peso.`);
      if (reps < Math.max(1, ej.repsMin - 3)) p.push(`Marcaste ${reps} repeticiones y el objetivo es ${ej.repsMin}–${ej.repsMax}.`);
      if (!peso && ref > 0 && !corporal) p.push('No pusiste peso.');
      if (peso && ref > 0 && peso > ref * 1.25) p.push(`El peso (${peso} kg) es ${Math.round((peso / ref - 1) * 100)} % más que lo previsto (${ref} kg).`);
      if (peso && ref > 0 && peso < ref * 0.7) p.push(`El peso (${peso} kg) es mucho menos que lo previsto (${ref} kg).`);
      if (rpe == null) p.push('No marcaste cuánto te costó (RPE).');
      if (rpe != null && rpe <= 6 && reps < ej.repsMin) p.push(`Esfuerzo ${rpe} con pocas repeticiones no cuadra: ¿no te quedaban más?`);
    }
    return p;
  }

  function serieHecha(forzar = false) {
    if (!st || !ej) return;
    const p = peso;
    const r = reps;
    if (!(r > 0)) return;
    if (!forzar) {
      const dudas = revisarSerie();
      if (dudas.length) { setDuda(dudas); return; }
    }
    setDuda(null);
    setAvisoDescanso('');
    const tipo = calent ? 'calentamiento' : 'efectiva';
    const hechas = [...st.hechas, { ejercicio: ej.nombre, numero: hechasEj.length + 1, peso: p || 0, reps: r, rpe, tipo } as Hecha];
    const completo = !calent && efEj.length + 1 >= seriesObjetivo;
    const prox = completo ? siguienteCon(hechas, st.ej) : st.ej;
    actualizar({ ...st, hechas, ej: prox, descansoHasta: calent ? null : Date.now() + ej.descanso * 1000, descansoDesde: calent ? null : Date.now() });
  }
  function siguienteCon(hechas: Hecha[], desde: number) {
    for (let k = 1; k <= plan.ejercicios.length; k++) {
      const i = (desde + k) % plan.ejercicios.length;
      const x = plan.ejercicios[i];
      const obj = ev?.nivel === 'bajo' ? Math.max(2, x.series - 1) : x.series;
      if (efectivasDe(hechas, x.nombre).length < obj) return i;
    }
    return plan.ejercicios.length;
  }

  async function finalizar() {
    if (!st) return;
    const s = await guardarSesion(
      {
        fecha: hoy(), dia: st.dia, dia_nombre: plan.nombre, deporte: 'Gimnasio',
        duracion_min: Math.max(1, Math.round((Date.now() - st.inicio) / 60000)), sensacion, rpe_sesion: rpeSesion, notas: notas.trim(),
        sueno_h: st.prep?.sueno_h ?? null, energia: st.prep?.energia ?? null, agujetas: st.prep?.agujetas ?? null,
      },
      st.hechas.map(({ descanso, ...h }) => ({ ...h, descanso_seg: descanso ?? null })),
    );
    actualizar(null);
    setGuardada(s);
  }

  const prev = ej ? ultimaVez(series, ej.nombre) : [];
  const comp = ej ? compararSemana(series, ej.nombre) : null;
  const obj = ej ? objetivoHoy(series, ej) : null;
  const tonHoy = efEj.reduce((t, h) => t + h.peso * h.reps, 0);
  const info = ej ? infoEjercicio(ej.nombre) : undefined;

  return (
    <Capa>
      <div className="ent-fijo-arriba">
        <div className="barra-acciones">
          <div className="crece">
            <h2>Día {plan.id} · {plan.nombre}</h2>
            <small className="nota">{nEfectivas} de {totalSeries} series · {Math.round((ahora - st.inicio) / 60000)} min{ev ? ` · preparación ${ev.puntaje}/100` : ''}</small>
          </div>
          <button className="btn chico btn-peligro" onClick={() => {
            if (window.confirm('¿Cancelar el entreno? Se pierde lo anotado.')) { actualizar(null); onSalir(); }
          }}>Cancelar</button>
        </div>
        <div className="barra-xp"><div style={{ width: `${Math.min(1, nEfectivas / totalSeries) * 100}%` }} /></div>
        {st.semana && <small className="nota">Ciclo · {st.semana.nombre}: {describirSemana(st.semana)}</small>}
      </div>
      {ev && ev.nivel !== 'bien' && <p className="nota" style={{ margin: 0 }}>{ev.consejo}</p>}

      {restante > 0 && (
        <Bomba
          restante={restante}
          total={Math.max(1, Math.round(((st.descansoHasta ?? 0) - (st.descansoDesde ?? Date.now())) / 1000))}
          onMas={() => actualizar({ ...st, descansoHasta: (st.descansoHasta ?? Date.now()) + 30000 })}
          onCortar={() => cerrarDescanso(true)}
          sigue={!terminado && ej ? `${ej.nombre}, serie ${efEj.length + 1}` : undefined}
        />
      )}
      {restante === 0 && avisoDescanso && <p className="nota centro" style={{ margin: 0 }}>⏱ {avisoDescanso}</p>}

      {!terminado && restante === 0 && ej && (
        <Tarjeta>
          <div className="ent-cabeza-ej">
            <span className="chip chip-on">Serie {efEj.length + 1} de {seriesObjetivo}</span>
            <h1 className="ent-nombre-ej">{ej.nombre}</h1>
          </div>
          <ImagenEjercicio nombre={ej.nombre} />
          <div className="ent-objetivos">
            <div><span>Repeticiones</span><strong>{ej.repsMin}–{ej.repsMax}</strong></div>
            <div><span>Esfuerzo</span><strong>RPE {rpeObjetivo}</strong><small>{10 - rpeObjetivo} en reserva</small></div>
            <div><span>Peso sugerido</span><strong>{sug.peso != null ? `${String(sug.peso).replace('.', ',')} kg` : '—'}</strong></div>
          </div>
          <p className="nota" style={{ margin: '8px 0 0' }}>{sug.motivo}</p>
          {ej.nota && <p className="nota" style={{ margin: '4px 0 0' }}>💡 {ej.nota}</p>}

          {prev.length > 0 && comp && (
            <div className="ent-comp">
              <div><b>Última vez · {fechaCorta(prev[0].fecha)}</b>{prev.map((s) => `${Number(s.peso)}×${s.reps}`).join(' · ')}</div>
              <div><b>Volumen hoy vs. última</b>{Math.round(tonHoy)} / {Math.round(obj?.tonelajePrevio ?? 0)} kg{tonHoy > 0 && <Delta actual={tonHoy} previo={obj?.tonelajePrevio ?? 0} />}</div>
              <div><b>Semana pasada</b>{comp.pasada.series ? `${comp.pasada.series} series · ${Math.round(comp.pasada.tonelaje)} kg` : 'No lo hiciste'}</div>
              <div><b>Para progresar</b>{obj?.texto}</div>
            </div>
          )}

          <div className="ent-steppers">
            <Stepper etiqueta="Peso" sufijo="kg" valor={peso} onCambio={setPeso} paso={ej.salto > 0 ? Math.min(ej.salto, 2.5) : 1} decimales />
            <Stepper etiqueta="Reps" sufijo={`objetivo ${ej.repsMin}–${ej.repsMax}`} valor={reps} onCambio={setReps} min={0} />
          </div>
          <div className="ent-reps-rapidas" aria-label="Repeticiones rápidas">
            {Array.from({ length: Math.max(1, ej.repsMax - ej.repsMin + 3) }, (_, i) => ej.repsMin - 1 + i).filter((n) => n > 0).map((n) => (
              <button key={n} type="button" className={`${reps === n ? 'activo' : ''} ${n < ej.repsMin ? 'bajo' : n > ej.repsMax ? 'alto' : ''}`} onClick={() => setReps(n)}>{n}</button>
            ))}
          </div>
          <p className="subtitulo">¿Cuánto te costó? RPE {rpeObjetivo} es el objetivo (10 = no podías ni una más)</p>
          <div className="segmentado grande-toque">
            {[6, 7, 8, 9, 10].map((n) => <button key={n} type="button" className={rpe === n ? 'activo' : ''} onClick={() => setRpe(n)}>{n}</button>)}
          </div>
          <label className="ent-check-cal">
            <input type="checkbox" checked={calent} onChange={(x) => setCalent(x.target.checked)} />
            Serie de calentamiento (no cuenta para el progreso)
          </label>
          {hechasEj.length > 0 && (
            <p className="nota" style={{ marginTop: 8 }}>Hoy: {hechasEj.map((h) => `${h.tipo === 'calentamiento' ? '(cal) ' : ''}${h.peso}×${h.reps}${h.rpe ? ` @${h.rpe}` : ''}${h.descanso != null ? ` (desc. ${mmss(h.descanso)})` : ''}`).join(' · ')}</p>
          )}
          <div className="ent-acciones-ej">
            <button className="btn chico" onClick={() => actualizar({ ...st, ej: siguiente(st.ej) })}>Siguiente ejercicio</button>
            <button className="btn chico" onClick={() => setCambiar(true)}>Cambiar por otro</button>
            {st.hechas.length > 0 && <button className="btn chico" onClick={() => {
              const ult = st.hechas[st.hechas.length - 1];
              const i = plan.ejercicios.findIndex((x) => x.nombre === ult.ejercicio);
              actualizar({ ...st, hechas: st.hechas.slice(0, -1), ej: i >= 0 ? i : st.ej, descansoHasta: null, descansoDesde: null });
            }}>Deshacer última serie</button>}
            <button className="btn chico" onClick={() => actualizar({ ...st, fase: 'cierre', descansoHasta: null })}>Terminar ya</button>
          </div>
          {info == null && <p className="nota" style={{ marginTop: 6 }}>Ejercicio propio: no suma al conteo por músculo.</p>}
        </Tarjeta>
      )}

      {!terminado && restante === 0 && (
        <Tarjeta titulo="Ejercicios de hoy">
          <ul className="lista">
            {plan.ejercicios.map((x, i) => {
              const n = efectivasDe(st.hechas, x.nombre).length;
              const objX = ev?.nivel === 'bajo' ? Math.max(2, x.series - 1) : x.series;
              return (
                <li key={`${x.nombre}-${i}`}>
                  <button type="button" className="lista-item btn-icono" style={{ color: i === st.ej ? 'var(--accent)' : 'var(--ink)', textAlign: 'left' }}
                    onClick={() => actualizar({ ...st, ej: i })}>
                    <span className="crece">{n >= objX ? '✓ ' : ''}{x.nombre}</span>
                    <span className="num">{n}/{objX}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}

      {terminado && restante === 0 && (
        <Tarjeta titulo={st.ej >= plan.ejercicios.length ? '¡Entreno completo!' : 'Cerrar entreno'}>
          <p className="nota">Anotaste {nEfectivas} {nEfectivas === 1 ? 'serie' : 'series'} en {Math.round((ahora - st.inicio) / 60000)} minutos.</p>
          <p className="subtitulo">¿Qué tan duro fue todo el entreno? (1 = muy fácil, 10 = máximo)</p>
          <div className="segmentado grande-toque">
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <button key={n} type="button" className={rpeSesion === n ? 'activo' : ''} onClick={() => setRpeSesion(n)}>{n}</button>)}
          </div>
          <p className="subtitulo">Sensación general (1 = horrible, 10 = excelente)</p>
          <div className="segmentado grande-toque">
            {[3, 5, 6, 7, 8, 9, 10].map((n) => <button key={n} type="button" className={sensacion === n ? 'activo' : ''} onClick={() => setSensacion(n)}>{n}</button>)}
          </div>
          <p className="subtitulo">Notas rápidas</p>
          <div className="ent-chips-notas">
            {NOTAS_RAPIDAS.map((n) => (
              <button key={n} type="button" className={notas.includes(n) ? 'activo' : ''}
                onClick={() => setNotas((t) => (t.includes(n) ? t.replace(n, '').replace(/^[.\s]+|\s*\.\s*\.|[.\s]+$/g, '').trim() : [t.trim(), n].filter(Boolean).join('. ')))}>{n}</button>
            ))}
          </div>
          <Campo etiqueta="Notas"><textarea rows={2} value={notas} onChange={(x) => setNotas(x.target.value)} placeholder="Dormí poco, me dolía el hombro…" /></Campo>
          <div className="pila" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn-primario ancho btn-grande" onClick={finalizar} disabled={!st.hechas.length}>Guardar y ver resultado (+50 XP)</button>
            {fase === 'cierre' && <button className="btn" onClick={() => actualizar({ ...st, fase: 'entrenando', ej: siguiente(-1) >= plan.ejercicios.length ? 0 : siguiente(-1) })}>Seguir entrenando</button>}
          </div>
        </Tarjeta>
      )}

      {!terminado && restante === 0 && ej && (
        <div className="barra-fija-abajo">
          <button className="btn btn-confirmar ancho btn-grande" onClick={() => serieHecha()} disabled={!(reps > 0)}>
            ✓ Confirmar {calent ? 'calentamiento' : `serie ${efEj.length + 1}`} · {String(peso).replace('.', ',')} kg × {reps}{rpe ? ` @${rpe}` : ''}
          </button>
        </div>
      )}
      <Modal titulo="¿Estás seguro?" abierto={!!duda} onCerrar={() => setDuda(null)}>
        {duda && (
          <div className="pila" style={{ gap: 10 }}>
            <ul className="ent-dudas">{duda.map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="acciones">
              <button className="btn crece" onClick={() => setDuda(null)}>Corregir</button>
              <button className="btn btn-confirmar crece" onClick={() => serieHecha(true)}>Sí, está bien</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal titulo="Cambiar ejercicio (solo hoy)" abierto={cambiar} onCerrar={() => setCambiar(false)}>
        {cambiar && ej && (() => {
          const elegir = (nombre: string) => {
            const nuevo = { ...ej, nombre, salto: infoEjercicio(nombre)?.salto ?? ej.salto };
            actualizar({ ...st, plan: { ...plan, ejercicios: plan.ejercicios.map((x, i) => (i === st.ej ? nuevo : x)) } });
            setCambiar(false);
          };
          return (
            <>
              <p className="subtitulo" style={{ margin: 0 }}>Variantes</p>
              <div className="ent-variantes-rapidas">
                {variantesDe(ej.nombre, ej.variantes).map((v) => <button key={v} className="btn chico" onClick={() => elegir(v)}>{v}</button>)}
              </div>
              <p className="subtitulo" style={{ margin: 0 }}>O cualquier otro</p>
              <SelectorEjercicio grupoInicial={info?.grupo} onElegir={elegir} />
            </>
          );
        })()}
      </Modal>
    </Capa>
  );
}

