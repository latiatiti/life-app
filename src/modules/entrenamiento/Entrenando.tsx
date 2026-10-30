import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { escribirStorage, leerStorage } from '../../core/config';
import { fechaCorta, hoy } from '../../core/format';
import { avisarCambio } from '../../ui/Actividad';
import { confirmar } from '../../ui/Deshacer';
import { Medidor, Pct, useSalto } from '../../ui/nivel';
import { Campo, Modal } from '../../ui/ui';
import { evaluarPreparacion, objetivoHoy, type Preparacion } from './analisis';
import { infoEjercicio, variantesDe } from './biblioteca';
import { describirSemana, type SemanaCiclo } from './ciclo';
import { ImagenEjercicio } from './Controles';
import { guardarSesion, pesoSugerido, ultimaVez, useBiblioteca, useRutina, useSeries, type DiaPlan, type EjercicioPlan, type Sesion } from './modelo';
import { ResumenEntreno } from './Resumen';
import { SelectorEjercicio } from './Rutina';
import { calentamiento, consejoRendimiento, duracion, minutosEstimados, rendimientoVivo, repsPrevistas, type HechaVivo } from './vivo';
import './vivo.css';

/*
 * Modo entrenando en una sola vista (2026-10-29, boceto aprobado por ella:
 * https://claude.ai/artifact/19usSDfhDfmhLj5UEzr4Mo). Reglas de esta pantalla en docs/pilares-entreno.md.
 * Pasos: Llegar (chequeo + calentamiento) → Serie ↔ Descanso → Cierre → Guardado (queda en Día).
 * Todo entra en el celu sin scroll; lo que no es de cada serie va en hojas que suben (Modal).
 */

type Hecha = { ejercicio: string; numero: number; peso: number; reps: number; rpe: number | null; tipo: 'efectiva' | 'calentamiento' };

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
  /** Largo del descanso en curso (para el anillo). */
  descansoDe?: number;
  /** Semana del ciclo al empezar (el plan ya viene ajustado; esto se usa para el peso sugerido). */
  semana?: SemanaCiclo | null;
  /** Escondido en la barra de actividad ("Volver" lo abre). */
  minimizada?: boolean;
}

const CLAVE = 'life.entreno.encurso';
export const leerEnCurso = (): EnCurso | null => {
  try { return JSON.parse(leerStorage(CLAVE) ?? 'null'); } catch { return null; }
};
const guardar = (x: EnCurso | null) => {
  escribirStorage(CLAVE, x ? JSON.stringify(x) : null);
  avisarCambio();
};
export const mostrarEntreno = () => {
  const x = leerEnCurso();
  if (x?.minimizada) guardar({ ...x, minimizada: false });
};

export function empezarEntreno(plan: DiaPlan, semana: SemanaCiclo | null = null) {
  guardar({ dia: plan.id, plan, semana, fase: 'chequeo', inicio: Date.now(), ej: 0, hechas: [], descansoHasta: null });
}

function useAhora(activo: boolean) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, [activo]);
  return ahora;
}

function vibrar() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* iPhone no vibra desde la web */ }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const reloj = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : mmss(s));
const kg = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

const NOTAS_RAPIDAS = ['Dormí poco', 'Me sentí fuerte', 'Poco tiempo', 'Máquina ocupada', 'Molestia en hombro', 'Molestia en rodilla', 'Comí poco', 'Mucho estrés', 'Técnica mejor', 'Gimnasio lleno'];
/** Cómo fue todo el entreno → RPE de la sesión (carga = RPE × minutos). */
const COMO_FUE: Array<[number, string]> = [[5, 'Liviano'], [7, 'Justo'], [8, 'Duro'], [10, 'Al límite']];

const efectivasDe = (hechas: Hecha[], nombre: string) => hechas.filter((h) => h.ejercicio === nombre && h.tipo !== 'calentamiento');

/* ---------- Piezas ---------- */

function Seg<T extends number>({ valor, ops, onElegir, etiqueta }: { valor: T | null | undefined; ops: Array<[T, string]>; onElegir: (v: T) => void; etiqueta: string }) {
  return (
    <div className="ev-seg" role="group" aria-label={etiqueta}>
      {ops.map(([v, t]) => <button key={v} type="button" className={valor === v ? 'on' : ''} onClick={() => onElegir(v)}>{t}</button>)}
    </div>
  );
}

/** Un número grande con − y + (peso, reps o RPE). Tocar el número deja escribirlo. */
function Param({ etiqueta, valor, plan, distinto, onCambio, paso, min = 0, max, decimales }: {
  etiqueta: string; valor: number | null; plan: string; distinto?: boolean; onCambio: (n: number) => void;
  paso: number; min?: number; max?: number; decimales?: boolean;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const ref = useSalto<HTMLInputElement>(valor);
  const fijar = (n: number) => onCambio(Math.min(max ?? Infinity, Math.max(min, Math.round(n * 100) / 100)));
  return (
    <div className={`ev-param ${valor == null ? 'sin-valor' : ''}`}>
      <span className="ev-etq">{etiqueta}</span>
      <input
        ref={ref} className="ev-param-val" inputMode={decimales ? 'decimal' : 'numeric'} aria-label={etiqueta}
        value={texto ?? (valor == null ? '?' : kg(valor))}
        onFocus={(e) => { setTexto(valor == null ? '' : kg(valor)); e.target.select(); }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const n = Number((texto ?? '').replace(',', '.'));
          if (isFinite(n) && (texto ?? '').trim() !== '') fijar(n);
          setTexto(null);
        }}
      />
      <span className={`ev-plan ${distinto ? 'dif' : ''}`}>{plan}</span>
      <div className="ev-mm">
        <button type="button" aria-label={`Menos ${etiqueta}`} onClick={() => fijar((valor ?? 0) - paso)}>−</button>
        <button type="button" aria-label={`Más ${etiqueta}`} onClick={() => fijar((valor ?? 0) + paso)}>+</button>
      </div>
    </div>
  );
}

/** Tira de progreso: un cuadrito por serie, agrupados por ejercicio. */
function Tira({ plan, hechas, actual, objetivo, onClick }: { plan: DiaPlan; hechas: Hecha[]; actual: number; objetivo: (e: EjercicioPlan) => number; onClick: () => void }) {
  return (
    <button type="button" className="ev-tira" onClick={onClick} aria-label="Ver los ejercicios de hoy">
      {plan.ejercicios.map((x, i) => {
        const n = efectivasDe(hechas, x.nombre).length;
        const obj = objetivo(x);
        return (
          <span key={`${x.nombre}-${i}`} className="ev-tira-ej" style={{ flex: obj }}>
            {Array.from({ length: obj }, (_, k) => <i key={k} className={k < n ? 'h' : i === actual && k === n ? 'a' : ''} />)}
          </span>
        );
      })}
    </button>
  );
}

function Capa({ children, className = '' }: { children: ReactNode; className?: string }) {
  useEffect(() => {
    document.documentElement.classList.add('con-actividad');
    return () => document.documentElement.classList.remove('con-actividad');
  }, []);
  return createPortal(<div className={`actividad ent-vivo ${className}`} role="dialog" aria-modal="true" aria-label="Entrenando">{children}</div>, document.body);
}

/* ---------- Pantalla ---------- */

type Hoja = 'lista' | 'como' | 'tecnica' | 'cambiar' | 'mas' | 'nota' | null;

export function Entrenando({ onSalir }: { onSalir: () => void }) {
  useBiblioteca();
  const { filas: series } = useSeries();
  const { dias, perfil } = useRutina();
  const [st, setSt] = useState<EnCurso | null>(leerEnCurso);
  const [guardada, setGuardada] = useState<Sesion | null>(null);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [peso, setPeso] = useState<number | null>(0);
  const [reps, setReps] = useState(0);
  const [rpe, setRpe] = useState<number>(8);
  const [calent, setCalent] = useState(false);
  const [rpeSesion, setRpeSesion] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [prep, setPrep] = useState<Preparacion>({ sueno_h: null, energia: null, agujetas: null });
  const [flash, setFlash] = useState(false);
  const [rendFinal, setRendFinal] = useState<number | null>(null);
  const ahora = useAhora(!!st);
  const plan = st?.plan ?? dias.find((d) => d.id === st?.dia) ?? dias[0];
  const fase = st?.fase ?? 'entrenando';
  const ev = st?.prep ? evaluarPreparacion(st.prep) : null;
  const objetivo = (x: EjercicioPlan) => (ev?.nivel === 'bajo' ? Math.max(2, x.series - 1) : x.series);
  const ej = plan.ejercicios[st?.ej ?? 0];
  const hechasEj = st && ej ? st.hechas.filter((h) => h.ejercicio === ej.nombre) : [];
  const efEj = st && ej ? efectivasDe(st.hechas, ej.nombre) : [];
  const restante = st?.descansoHasta ? Math.max(0, Math.ceil((st.descansoHasta - ahora) / 1000)) : 0;

  // Ajuste por cansancio: día bajo = una serie menos y ~10 % menos peso; día medio = sin subir peso y tope RPE 8.
  const seriesObjetivo = ej ? objetivo(ej) : 0;
  const rpeObjetivo = ej ? (ev && ev.nivel !== 'bien' ? Math.min(ej.rpe, ev.nivel === 'bajo' ? 7 : 8) : ej.rpe) : 0;
  const sugerir = (x: EjercicioPlan) => {
    const base = pesoSugerido(series, x, perfil, st?.semana);
    const ult = Math.max(0, ...ultimaVez(series, x.nombre).map((s) => Number(s.peso) || 0));
    if (!ev || ev.nivel === 'bien' || base.peso == null) return base;
    return ev.nivel === 'medio' ? { peso: Math.min(base.peso, ult || base.peso), motivo: 'Día medio: mismo peso que la última vez, sin forzar.' }
      : { peso: Math.round((ult || base.peso) * 0.9 / 1.25) * 1.25, motivo: 'Día de poca energía: 10 % menos de peso y una serie menos.' };
  };
  const sug = ej ? sugerir(ej) : { peso: null, motivo: '' };
  /** Lo que pedía el plan para la serie i de un ejercicio (peso × reps), para el % de cómo venís. */
  const esperado = (nombre: string, i: number) => {
    const x = plan.ejercicios.find((e) => e.nombre === nombre);
    const p = x ? sugerir(x).peso : null;
    return x && p != null ? (p || 1) * repsPrevistas(series, x, p, i) : null;
  };
  const rendDe = (hs: HechaVivo[]) => rendimientoVivo(hs, esperado);

  // Al cambiar de ejercicio o de serie, dejar todo previsto para confirmar con un toque:
  // peso = el de la serie anterior de hoy o el sugerido; reps = lo que hiciste en esa serie la última vez
  // (si fue con el mismo peso) o el mínimo del rango; esfuerzo = el objetivo.
  useEffect(() => {
    if (!ej) return;
    const ult = efEj[efEj.length - 1];
    const p = ult ? ult.peso : sug.peso;
    setPeso(p);
    setReps(repsPrevistas(series, ej, p, efEj.length));
    setRpe(Math.round(rpeObjetivo));
    setCalent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.ej, ej?.nombre, hechasEj.length, fase]);

  useEffect(() => {
    if (st?.descansoHasta && restante === 0) {
      vibrar();
      actualizar({ ...st, descansoHasta: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante]);

  function actualizar(n: EnCurso | null) {
    guardar(n);
    setSt(n);
  }

  /* ----- Guardado: queda en Día ----- */
  if (guardada) {
    return (
      <Capa className="ev-scroll">
        <div className="ev-cuerpo actividad-ancho aparece-escalonado">
          <div className="ev-cab-final"><span className="ev-etq">Guardado en tu día · +50 XP</span><h2>✓ Entreno guardado</h2></div>
          <Medidor pct={rendFinal} texto={rendFinal != null ? consejoRendimiento(rendFinal) : undefined} vacio="Primera vez de estos ejercicios: desde el próximo te comparo." />
          <ResumenEntreno sesion={guardada} />
        </div>
        <div className="ev-pie actividad-ancho"><button className="btn btn-primario ancho ev-principal" onClick={onSalir}>Listo</button></div>
      </Capa>
    );
  }
  if (!st) return null;

  const nEfectivas = st.hechas.filter((h) => h.tipo !== 'calentamiento').length;
  const totalSeries = plan.ejercicios.reduce((s, x) => s + objetivo(x), 0);
  const seg = Math.floor((ahora - st.inicio) / 1000);
  const estimado = minutosEstimados(plan, objetivo);
  const efTodas = st.hechas.filter((h) => h.tipo !== 'calentamiento');
  // Lo que debería llevar: ~45 s por serie hecha más los descansos ya cumplidos (el de la última todavía corre).
  const esperadoSeg = efTodas.reduce((t, h, i) => t + 45 + (i < efTodas.length - 1 ? plan.ejercicios.find((x) => x.nombre === h.ejercicio)?.descanso ?? 90 : 0), 0);
  const atraso = Math.round((seg - esperadoSeg) / 60);
  const ritmo = !nEfectivas ? 'vas a tiempo' : atraso > 2 ? `${atraso}' atrás` : atraso < -2 ? `${-atraso}' adelante` : 'vas a tiempo';
  const rend = rendDe(st.hechas);
  const etqDia = `Día ${plan.id}${st.semana ? ` · ${st.semana.nombre}` : ''}`;

  const cabecera = (titulo: ReactNode) => (
    <header className="ev-cab actividad-ancho">
      <button type="button" className="ev-icono" aria-label="Ejercicios de hoy" onClick={() => setHoja('lista')}>☰</button>
      <div className="crece"><span className="ev-etq">{etqDia}</span><strong>{titulo}</strong></div>
      <button type="button" className="ev-icono" aria-label="Más opciones" onClick={() => setHoja('mas')}>⋯</button>
    </header>
  );

  function siguienteCon(hechas: Hecha[], desde: number) {
    for (let k = 1; k <= plan.ejercicios.length; k++) {
      const i = (desde + k) % plan.ejercicios.length;
      if (efectivasDe(hechas, plan.ejercicios[i].nombre).length < objetivo(plan.ejercicios[i])) return i;
    }
    return plan.ejercicios.length;
  }

  function serieHecha() {
    if (!st || !ej || peso == null || !(reps > 0)) return;
    const tipo = calent ? 'calentamiento' : 'efectiva';
    const hechas = [...st.hechas, { ejercicio: ej.nombre, numero: hechasEj.length + 1, peso: peso || 0, reps, rpe: calent ? null : rpe, tipo } as Hecha];
    const completo = !calent && efEj.length + 1 >= seriesObjetivo;
    const prox = completo ? siguienteCon(hechas, st.ej) : st.ej;
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
    actualizar({
      ...st, hechas, ej: prox,
      fase: prox >= plan.ejercicios.length ? 'cierre' : st.fase,
      descansoHasta: calent || prox >= plan.ejercicios.length ? null : Date.now() + ej.descanso * 1000,
      descansoDe: ej.descanso,
    });
  }

  function deshacer() {
    if (!st?.hechas.length) return;
    const ult = st.hechas[st.hechas.length - 1];
    const i = plan.ejercicios.findIndex((x) => x.nombre === ult.ejercicio);
    actualizar({ ...st, hechas: st.hechas.slice(0, -1), ej: i >= 0 ? i : st.ej, descansoHasta: null, fase: 'entrenando' });
  }

  async function finalizar() {
    if (!st) return;
    const s = await guardarSesion(
      {
        fecha: hoy(), dia: st.dia, dia_nombre: plan.nombre, deporte: 'Gimnasio',
        duracion_min: Math.max(1, Math.round((Date.now() - st.inicio) / 60000)), sensacion: null, rpe_sesion: rpeSesion, notas: notas.trim(),
        sueno_h: st.prep?.sueno_h ?? null, energia: st.prep?.energia ?? null, agujetas: st.prep?.agujetas ?? null,
      },
      st.hechas,
    );
    setRendFinal(rendDe(st.hechas));
    actualizar(null);
    setGuardada(s);
  }

  /* ----- Hojas que suben (lo que no es de cada serie) ----- */
  const hojas = (
    <>
      <Modal titulo={`Día ${plan.id} · ${plan.nombre}`} abierto={hoja === 'lista'} onCerrar={() => setHoja(null)}>
        <div className="ev-lista">
          {plan.ejercicios.map((x, i) => {
            const n = efectivasDe(st.hechas, x.nombre).length;
            const obj = objetivo(x);
            const p = sugerir(x).peso;
            return (
              <button key={`${x.nombre}-${i}`} type="button" className={`${i === st.ej && fase === 'entrenando' ? 'act' : ''} ${n >= obj ? 'listo' : ''}`}
                onClick={() => { actualizar({ ...st, ej: i, fase: 'entrenando', descansoHasta: null }); setHoja(null); }}>
                <span>{n >= obj ? '✓ ' : i === st.ej ? '▸ ' : ''}{x.nombre}</span>
                <span className="ev-dato">{n}/{obj} · {p != null ? `${kg(p)} kg` : '?'}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal titulo="Cómo venís hoy" abierto={hoja === 'como'} onCerrar={() => setHoja(null)}>
        {(() => {
          const prev = ej ? ultimaVez(series, ej.nombre) : [];
          const obj = ej ? objetivoHoy(series, ej) : null;
          return (
            <div className="pila">
              <Medidor pct={rend} texto={rend != null ? consejoRendimiento(rend) : undefined} vacio="Cargá series de ejercicios que ya hiciste y te comparo con la vez pasada." />
              <div className="ev-tabla">
                <span /><span className="ev-etq">Hoy</span><span className="ev-etq">Plan</span>
                <span className="ev-etq">Series</span><span>{nEfectivas}</span><span>{totalSeries}</span>
                <span className="ev-etq">Tiempo</span><span>{Math.round(seg / 60)} min</span><span>~{duracion(estimado)}</span>
              </div>
              {ej && prev.length > 0 && <p className="nota">{ej.nombre}, la última vez ({fechaCorta(prev[0].fecha)}): {prev.map((s) => `${kg(Number(s.peso))}×${s.reps}`).join(' · ')}</p>}
              {obj && <p className="nota">Para progresar: {obj.texto}</p>}
              {sug.motivo && <p className="nota">Peso de hoy: {sug.motivo}</p>}
              {st.semana && <p className="nota">Ciclo · {st.semana.nombre}: {describirSemana(st.semana)}.{st.semana.nota ? ` ${st.semana.nota}` : ''}</p>}
              {ev && <p className="nota">Llegaste {ev.nivel === 'bien' ? 'bien' : ev.nivel === 'medio' ? 'regular' : 'con poca energía'} ({ev.puntaje}/100). {ev.consejo}</p>}
            </div>
          );
        })()}
      </Modal>

      <Modal titulo={ej?.nombre ?? 'Técnica'} abierto={hoja === 'tecnica'} onCerrar={() => setHoja(null)}>
        {ej && (
          <div className="pila">
            {ej.nota && <p style={{ margin: 0 }}>💡 {ej.nota}</p>}
            <ImagenEjercicio nombre={ej.nombre} />
            {infoEjercicio(ej.nombre) == null && <p className="nota">Ejercicio propio: no suma al conteo por músculo.</p>}
          </div>
        )}
      </Modal>

      <Modal titulo="Cambiar ejercicio (solo hoy)" abierto={hoja === 'cambiar'} onCerrar={() => setHoja(null)}>
        {ej && (() => {
          const elegir = (nombre: string) => {
            const nuevo = { ...ej, nombre, salto: infoEjercicio(nombre)?.salto ?? ej.salto };
            actualizar({ ...st, plan: { ...plan, ejercicios: plan.ejercicios.map((x, i) => (i === st.ej ? nuevo : x)) } });
            setHoja(null);
          };
          return (
            <>
              <p className="subtitulo" style={{ margin: 0 }}>Variantes</p>
              <div className="ent-variantes-rapidas">
                {variantesDe(ej.nombre, ej.variantes).map((v) => <button key={v} className="btn chico" onClick={() => elegir(v)}>{v}</button>)}
              </div>
              <p className="subtitulo" style={{ margin: 0 }}>O cualquier otro</p>
              <SelectorEjercicio grupoInicial={infoEjercicio(ej.nombre)?.grupo} onElegir={elegir} />
            </>
          );
        })()}
      </Modal>

      <Modal titulo="Opciones" abierto={hoja === 'mas'} onCerrar={() => setHoja(null)}>
        <div className="pila">
          {fase === 'entrenando' && <button className="btn ancho" onClick={() => { actualizar({ ...st, fase: 'cierre', descansoHasta: null }); setHoja(null); }}>Terminar ya y ver el resumen</button>}
          {fase === 'cierre' && <button className="btn ancho" onClick={() => { const i = siguienteCon(st.hechas, -1); actualizar({ ...st, fase: 'entrenando', ej: i >= plan.ejercicios.length ? 0 : i }); setHoja(null); }}>Seguir entrenando</button>}
          <button className="btn ancho" onClick={() => { setHoja(null); actualizar({ ...st, minimizada: true }); onSalir(); }}>Minimizar (sigue en la barra)</button>
          <button className="btn ancho btn-peligro" onClick={async () => {
            setHoja(null);
            if (await confirmar('¿Cancelar el entreno? Se pierde lo anotado de hoy.')) { actualizar(null); onSalir(); }
          }}>Cancelar entreno</button>
        </div>
      </Modal>

      <Modal titulo="Nota del entreno" abierto={hoja === 'nota'} onCerrar={() => setHoja(null)}>
        <div className="ent-chips-notas">
          {NOTAS_RAPIDAS.map((n) => (
            <button key={n} type="button" className={notas.includes(n) ? 'activo' : ''}
              onClick={() => setNotas((t) => (t.includes(n) ? t.replace(n, '').replace(/^[.\s]+|\s*\.\s*\.|[.\s]+$/g, '').trim() : [t.trim(), n].filter(Boolean).join('. ')))}>{n}</button>
          ))}
        </div>
        <Campo etiqueta="Nota"><textarea rows={2} value={notas} onChange={(x) => setNotas(x.target.value)} placeholder="Dormí poco, me dolía el hombro…" /></Campo>
        <button className="btn btn-primario ancho" style={{ marginTop: 10 }} onClick={() => setHoja(null)}>Listo</button>
      </Modal>
    </>
  );

  /* ----- 1. Llegar: día, calentamiento y cómo llegás ----- */
  if (fase === 'chequeo') {
    const ev0 = evaluarPreparacion(prep);
    const primero = plan.ejercicios[0];
    const pesoPrimero = primero ? sugerir(primero).peso : null;
    return (
      <Capa>
        <header className="ev-cab actividad-ancho">
          <button type="button" className="ev-icono" aria-label="Salir" onClick={() => { actualizar(null); onSalir(); }}>✕</button>
          <div className="crece"><span className="ev-etq">{fechaCorta(hoy())}{st.semana ? ` · ${st.semana.nombre}` : ''}</span><strong>Entrenar</strong></div>
        </header>
        <div className="ev-cuerpo actividad-ancho entra-adelante">
          <div className="ev-dia">
            <span className="ev-etq">Te toca</span>
            <h2>Día {plan.id} · {plan.nombre}</h2>
            <p><span className="ev-dato">{plan.ejercicios.length} ejercicios · {totalSeries} series · ~{duracion(estimado)}</span>{st.semana?.nota ? <><br />{st.semana.nota}</> : null}</p>
          </div>
          <div className="ev-calent">
            <span className="ev-etq">Calentamiento sugerido</span>
            <ul>{calentamiento(primero, pesoPrimero).map((c) => <li key={c.texto + c.valor}>{c.texto}<span className="ev-dato">{c.valor}</span></li>)}</ul>
          </div>
          <span className="ev-etq">¿Cómo llegás? Un toque cada una</span>
          <div className="ev-preg"><span className="ev-etq">Dormí</span><Seg etiqueta="Horas de sueño" valor={prep.sueno_h} onElegir={(v) => setPrep({ ...prep, sueno_h: v })} ops={[[5, '≤5'], [6, '6'], [7, '7'], [8, '8+']]} /></div>
          <div className="ev-preg"><span className="ev-etq">Energía</span><Seg etiqueta="Energía" valor={prep.energia} onElegir={(v) => setPrep({ ...prep, energia: v })} ops={[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]} /></div>
          <div className="ev-preg"><span className="ev-etq">Dolor</span><Seg etiqueta="Dolor muscular" valor={prep.agujetas} onElegir={(v) => setPrep({ ...prep, agujetas: v })} ops={[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]} /></div>
          <p className="ev-lectura">{ev0 ? `${ev0.nivel === 'bien' ? 'Llegás bien' : ev0.nivel === 'medio' ? 'Día medio' : 'Día flojo'} (${ev0.puntaje}/100). ${ev0.consejo}` : 'Si no tocás nada, se empieza con el plan completo.'}</p>
        </div>
        <div className="ev-pie actividad-ancho">
          <button className="btn btn-primario ancho ev-principal" onClick={() => actualizar({ ...st, prep, fase: 'entrenando', inicio: Date.now() })}>
            Empezar entreno<small>arranca el cronómetro</small>
          </button>
        </div>
      </Capa>
    );
  }

  /* ----- 4. Cierre: cómo te fue y guardar en el día ----- */
  if (fase === 'cierre' || st.ej >= plan.ejercicios.length) {
    const rpes = st.hechas.filter((h) => h.tipo !== 'calentamiento' && h.rpe != null);
    const rpeMedio = rpes.length ? rpes.reduce((t, h) => t + (h.rpe ?? 0), 0) / rpes.length : null;
    const nombres = [...new Set(st.hechas.filter((h) => h.tipo !== 'calentamiento').map((h) => h.ejercicio))];
    return (
      <Capa>
        {cabecera(st.ej >= plan.ejercicios.length ? '¡Entreno completo!' : 'Cerrar entreno')}
        <div className="ev-cuerpo actividad-ancho entra-adelante">
          <Medidor pct={rend} texto={rend != null ? consejoRendimiento(rend) : undefined} vacio="Primera vez de estos ejercicios: desde el próximo te comparo." />
          <div className="ev-cifras aparece-escalonado">
            <div><b>{nEfectivas}/{totalSeries}</b><span>series hechas</span></div>
            <div><b>{duracion(Math.round(seg / 60))}</b><span>duración (estimado {duracion(estimado)})</span></div>
            <div><b>{rpeMedio != null ? `RPE ${rpeMedio.toFixed(1).replace('.', ',')}` : '—'}</b><span>esfuerzo medio</span></div>
          </div>
          <div className="ev-ejs aparece-escalonado">
            {nombres.map((n) => {
              const xs = efectivasDe(st.hechas, n);
              return (
                <div key={n}>
                  <span>{n}</span>
                  <span className="ev-dato">{kg(Math.max(...xs.map((h) => h.peso)))}×{xs.map((h) => h.reps).join(',')}</span>
                  <span className="ev-ejs-pct">{rendDe(xs) != null ? <Pct pct={rendDe(xs)} /> : <span className="nota">nuevo</span>}</span>
                </div>
              );
            })}
          </div>
          <span className="ev-etq">¿Cómo fue todo? Un toque</span>
          <Seg etiqueta="Cómo fue el entreno" valor={rpeSesion} onElegir={setRpeSesion} ops={COMO_FUE} />
          <button type="button" className="ev-enlace" onClick={() => setHoja('nota')}>{notas ? `📝 ${notas}` : '+ Agregar nota (opcional)'}</button>
        </div>
        <div className="ev-pie actividad-ancho">
          <button className="btn btn-primario ancho ev-principal" onClick={finalizar} disabled={!st.hechas.length}>
            Guardar en mi día<small>queda en Día · {fechaCorta(hoy())} · +50 XP</small>
          </button>
        </div>
        {hojas}
      </Capa>
    );
  }

  /* ----- 3. Descanso ----- */
  if (restante > 0) {
    const de = st.descansoDe ?? ej?.descanso ?? 90;
    const ult = st.hechas[st.hechas.length - 1];
    const nUlt = ult ? st.hechas.filter((h) => h.ejercicio === ult.ejercicio && h.tipo !== 'calentamiento').length : 0;
    const vuelta = 2 * Math.PI * 45;
    return (
      <Capa>
        {cabecera(`${nEfectivas} de ${totalSeries} series`)}
        <Tira plan={plan} hechas={st.hechas} actual={st.ej} objetivo={objetivo} onClick={() => setHoja('lista')} />
        <div className="ev-cuerpo actividad-ancho entra-adelante">
          <div className="ev-anillo">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="45" className="ev-anillo-fondo" />
              <circle cx="50" cy="50" r="45" className="ev-anillo-arco" strokeDasharray={vuelta} strokeDashoffset={vuelta * (1 - restante / de)} />
            </svg>
            <div className="ev-anillo-num"><span className="ev-etq">Descansá</span><b>{mmss(restante)}</b><span className="ev-etq">de {mmss(de)} · entreno {reloj(seg)}</span></div>
          </div>
          <div className="ev-fila2">
            <button className="btn" onClick={() => actualizar({ ...st, descansoHasta: (st.descansoHasta ?? Date.now()) + 30000, descansoDe: de + 30 })}>+30 s</button>
            <button className="btn" onClick={() => actualizar({ ...st, descansoHasta: null })}>Ya estoy</button>
          </div>
          {ult && (
            <div className="ev-recien">
              <span className="crece">✓ Serie {nUlt} guardada · {kg(ult.peso)} kg × {ult.reps}{ult.rpe ? ` @${ult.rpe}` : ''}</span>
              <button type="button" onClick={deshacer}>Deshacer</button>
            </div>
          )}
          {ej && (
            <div className="ev-sigue">
              <span className="ev-etq">Sigue</span>
              <div><span>{ej.nombre} · serie {efEj.length + 1} de {seriesObjetivo}</span><span className="ev-dato">{peso != null ? `${kg(peso)} × ${reps}` : 'elegí peso'}</span></div>
            </div>
          )}
          <Medidor pct={rend} texto={rend != null ? `${consejoRendimiento(rend)} Ritmo: ${ritmo}.` : undefined} vacio={`Ritmo: ${ritmo}.`} onClick={() => setHoja('como')} />
        </div>
        <p className="ev-pie-nota actividad-ancho">Al terminar vibra y vuelve sola a la serie</p>
        {hojas}
      </Capa>
    );
  }

  /* ----- 2. Serie ----- */
  const rango = ej ? `${ej.repsMin}–${ej.repsMax}` : '';
  const prev = ej ? ultimaVez(series, ej.nombre) : [];
  return (
    <Capa>
      {cabecera(`${nEfectivas} de ${totalSeries} series`)}
      <Tira plan={plan} hechas={st.hechas} actual={st.ej} objetivo={objetivo} onClick={() => setHoja('lista')} />
      {ej && (
        <div className="ev-cuerpo actividad-ancho" key={`${st.ej}`}>
          <div className="ev-ejercicio entra-adelante">
            <span className="ev-etq">Ejercicio {st.ej + 1} de {plan.ejercicios.length}</span>
            <h2>{ej.nombre}</h2>
            <span className={`ev-serie ${calent ? 'cal' : ''}`}>{calent ? 'Calentamiento · no cuenta' : `Serie ${efEj.length + 1} de ${seriesObjetivo} · objetivo ${rango} reps`}</span>
          </div>
          <div className="ev-crono">
            <span className="ev-etq">Tiempo de entreno</span>
            <b>{reloj(seg)}</b>
            <span className="ev-ritmo">estimado {duracion(estimado)} · <em>{ritmo}</em></span>
          </div>
          <div className="ev-params">
            <Param etiqueta="Peso kg" valor={peso} onCambio={setPeso} paso={ej.salto > 0 ? Math.min(ej.salto, 2.5) : 1} decimales
              plan={peso == null ? 'elegí el peso' : sug.peso == null ? 'semana 1: libre' : `plan ${kg(sug.peso)}`} distinto={peso == null || (sug.peso != null && peso !== sug.peso)} />
            <Param etiqueta="Reps" valor={reps} onCambio={setReps} paso={1} min={1} plan={`obj ${rango}`} distinto={reps < ej.repsMin || reps > ej.repsMax} />
            <Param etiqueta="RPE" valor={calent ? null : rpe} onCambio={setRpe} paso={1} min={5} max={10} plan={calent ? 'calentando' : `obj ${rpeObjetivo}`} distinto={!calent && rpe > rpeObjetivo + 1} />
          </div>
          <Medidor pct={rend} texto={rend != null ? consejoRendimiento(rend) : undefined} vacio="Cargá la primera serie y te digo cómo venís." onClick={() => setHoja('como')} />
          <button type="button" className="ev-como" onClick={() => setHoja('como')}>
            {prev.length
              ? <><b>La vez pasada:</b> {prev.map((s) => `${kg(Number(s.peso))}×${s.reps}`).join(' · ')}{(() => {
                const antes = Math.max(...prev.map((s) => Number(s.peso) || 0));
                return sug.peso == null || sug.peso === antes ? '. Hoy: sumá una rep.' : `. Hoy el plan ${sug.peso > antes ? 'sube' : 'baja'} a ${kg(sug.peso)} kg.`;
              })()}</>
              : <><b>Primera vez.</b> Elegí un peso que te deje 2 o 3 reps en reserva; desde la próxima ya queda puesto.</>}
          </button>
          <div className="ev-herram">
            <button type="button" onClick={() => setHoja('tecnica')}><span>◎</span>Técnica</button>
            <button type="button" onClick={() => setHoja('cambiar')}><span>⇄</span>Cambiar</button>
            <button type="button" className={calent ? 'on' : ''} onClick={() => {
              if (calent) { setCalent(false); setPeso(efEj[efEj.length - 1]?.peso ?? sug.peso); setReps(ej.repsMin); return; }
              setCalent(true);
              if (peso) setPeso(Math.round((peso * 0.5) / 2.5) * 2.5);
              setReps(10);
            }}><span>♨</span>Calentar</button>
            <button type="button" onClick={deshacer} disabled={!st.hechas.length}><span>↶</span>Deshacer</button>
          </div>
        </div>
      )}
      <div className="ev-pie actividad-ancho">
        <button className={`btn btn-primario ancho ev-principal ${calent ? 'cal' : ''} ${flash ? 'ok' : ''}`} onClick={serieHecha} disabled={peso == null || !(reps > 0)}>
          ✓ {calent ? 'Cargar calentamiento' : `Cargar serie ${efEj.length + 1}`}
          <small>{peso == null ? 'primero elegí el peso' : `${kg(peso)} kg × ${reps}${calent ? '' : ` · RPE ${rpe} · arranca el descanso`}`}</small>
        </button>
      </div>
      {hojas}
    </Capa>
  );
}
