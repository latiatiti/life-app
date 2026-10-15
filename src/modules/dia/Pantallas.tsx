import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { desdeISO, fechaLarga, hoy, moverMes, nombreMes, relativo, sumarDias } from '../../core/format';
import { MODULOS } from '../../core/registry';
import type { ItemAgenda } from '../../core/types';
import { Campo, Icono, Modal, Tarjeta } from '../../ui/ui';
import {
  aMinutos, ahoraMinutos, armarDia, bloqueEn, celdasMes, DIAS_CORTOS, DIAS_SEMANA, deMinutos, guardarDia,
  guardarDiaPlantilla, guardarSemanaBase, horaCorta, semanaDe, semanaTipo, TD, TIPOS, useDias, usePlantilla, useTareas,
  type Bloque, type EstadoDia, type NivelPrioridad, type Prioridad, type Tarea, type TipoBloque, type VistaDia,
} from './modelo';
import './dia.css';

const PX_HORA = 72;

function useVista(fecha: string): VistaDia {
  const { filas: plantilla } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  return useMemo(() => armarDia(fecha, plantilla, dias, tareas), [fecha, plantilla, dias, tareas]);
}

/** Lo que publican los otros módulos (pagos, cobros, vencimientos). La lista es fija: el orden de hooks no cambia. */
function useAgendaOtros(): ItemAgenda[] {
  const items: ItemAgenda[] = [];
  for (const m of MODULOS) if (m.id !== 'dia' && m.useAgenda) items.push(...m.useAgenda());
  return items;
}

/** Re-render cada minuto para que "ahora" avance solo. */
function useReloj() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => set((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return ahoraMinutos();
}

const ESTADOS: Record<EstadoDia, string> = { normal: 'Normal', libre: 'Libre', feriado: 'Feriado', especial: 'Especial' };

/* ---------- Cabecera del día ---------- */

function Cabecera({ vista }: { vista: VistaDia }) {
  const d = desdeISO(vista.fecha);
  const esHoy = vista.fecha === hoy();
  const mes = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
  return (
    <div className={`dia-cab ${esHoy ? 'es-hoy' : ''}`}>
      <div className="dia-fecha"><strong>{d.getDate()}</strong><small>{mes}</small></div>
      <div className="crece">
        <div className="dia-tit">{esHoy ? 'HOY · ' : ''}{DIAS_SEMANA[vista.diaSemana].toUpperCase()}</div>
        <div className="dia-chips">
          {!esHoy && <span className="dchip">{relativo(vista.fecha)}</span>}
          {vista.feriado && <span className="dchip rojo">🇦🇷 {vista.feriado.nombre}</span>}
          {vista.estado === 'libre' && <span className="dchip cian">Día libre</span>}
          {vista.estado === 'especial' && <span className="dchip naranja">{vista.marcado?.nombre || 'Especial'}</span>}
          {vista.estado === 'feriado' && !vista.feriado && <span className="dchip rojo">{vista.marcado?.nombre || 'Feriado'}</span>}
          {!vista.tipo && <span className="dchip">Horario propio</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Ahora (solo hoy) ---------- */

function Ahora({ vista, min }: { vista: VistaDia; min: number }) {
  const actual = bloqueEn(vista.bloques, min);
  const siguiente = vista.bloques.find((x) => aMinutos(x.inicio) > min);
  if (!actual && !siguiente) return null;
  const pct = actual ? ((min - aMinutos(actual.inicio)) / Math.max(1, aMinutos(actual.fin) - aMinutos(actual.inicio))) * 100 : 0;
  const faltan = actual ? aMinutos(actual.fin) - min : 0;
  return (
    <div className="dia-ahora" style={{ '--c': TIPOS[(actual ?? siguiente)!.tipo].color } as CSSProperties}>
      {actual && (
        <>
          <span className="etq">AHORA</span>
          <div className="dia-ahora-fila">
            <span className="dia-emoji">{TIPOS[actual.tipo].emoji}</span>
            <strong className="crece">{actual.titulo}</strong>
            <span className="num">{faltan >= 60 ? `${Math.floor(faltan / 60)} h ${faltan % 60 ? `${faltan % 60} min` : ''}` : `${faltan} min`}</span>
          </div>
          <div className="dia-prog"><div style={{ width: `${pct}%` }} /></div>
        </>
      )}
      {siguiente && <small className="dia-despues">DESPUÉS · {horaCorta(siguiente.inicio)} {TIPOS[siguiente.tipo].emoji} {siguiente.titulo}</small>}
    </div>
  );
}

/* ---------- Línea de tiempo deslizable ---------- */

/** Dónde empieza la pista dentro del scroll (hay un margen para que las 0 y las 24 lleguen al centro). */
const inicioPista = (el: HTMLElement) => (el.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0;

function Linea({ vista, min }: { vista: VistaDia; min: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const esHoy = vista.fecha === hoy();
  const [centro, setCentro] = useState(esHoy ? min : 9 * 60);

  // Al cambiar de día, centra en la hora actual (hoy) o en el primer bloque despierto.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const despierto = vista.bloques.find((x) => x.tipo !== 'descanso');
    const objetivo = esHoy ? min : despierto ? aMinutos(despierto.inicio) + 30 : 9 * 60;
    el.scrollTo({ left: (objetivo / 60) * PX_HORA + inicioPista(el) - el.clientWidth / 2, behavior: 'smooth' });
    setCentro(objetivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.fecha]);

  function alDeslizar() {
    const el = ref.current;
    if (!el) return;
    const m = Math.round(((el.scrollLeft + el.clientWidth / 2 - inicioPista(el)) / PX_HORA) * 60);
    setCentro(Math.max(0, Math.min(24 * 60 - 1, m)));
  }

  const enCentro = bloqueEn(vista.bloques, centro);
  const tareasHora = vista.tareas.filter((t) => t.hora);

  return (
    <div className="linea">
      <div className="linea-lectura">
        <span className="num">{deMinutos(Math.round(centro / 15) * 15)}</span>
        {enCentro ? <span>{TIPOS[enCentro.tipo].emoji} {enCentro.titulo}{enCentro.opcional ? ' (si se da)' : ''}</span> : <span className="nota">Nada planificado</span>}
      </div>
      <div className="linea-marco">
        <div className="linea-cursor" aria-hidden="true" />
        <div className="linea-scroll" ref={ref} onScroll={alDeslizar} aria-label="Línea de tiempo del día, deslizá para ver cada hora">
          <div className="linea-pista" style={{ width: 24 * PX_HORA }}>
            {Array.from({ length: 25 }, (_, h) => (
              <span key={h} className="linea-hora" style={{ left: h * PX_HORA }}>{h < 24 ? `${h}` : ''}</span>
            ))}
            {vista.bloques.map((x, i) => {
              const ini = aMinutos(x.inicio), fin = aMinutos(x.fin);
              return (
                <div key={i} className={`linea-bloque ${x.opcional ? 'opcional' : ''} ${x.tipo === 'descanso' ? 'tenue' : ''}`}
                  style={{ left: (ini / 60) * PX_HORA, width: Math.max(4, ((fin - ini) / 60) * PX_HORA - 3), '--c': TIPOS[x.tipo].color } as CSSProperties}
                  title={`${x.inicio}–${x.fin} ${x.titulo}`}>
                  <small>{x.inicio}</small>
                  <span>{x.titulo}</span>
                </div>
              );
            })}
            {tareasHora.map((t) => (
              <div key={t.id} className={`linea-tarea ${t.hecho ? 'hecha' : ''}`} style={{ left: (aMinutos(t.hora!) / 60) * PX_HORA }} title={t.titulo}>
                <span>📌 {t.titulo}</span>
              </div>
            ))}
            {esHoy && <div className="linea-ahora" style={{ left: (min / 60) * PX_HORA }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Lista de bloques ---------- */

function ListaBloques({ vista, min }: { vista: VistaDia; min: number }) {
  const esHoy = vista.fecha === hoy();
  const visibles = vista.bloques.filter((x) => !(x.tipo === 'descanso' && x.inicio === '00:00'));
  return (
    <ol className="bloques">
      {visibles.map((x, i) => {
        const pasado = esHoy && aMinutos(x.fin) <= min;
        const actual = esHoy && aMinutos(x.inicio) <= min && min < aMinutos(x.fin);
        return (
          <li key={i} className={`${pasado ? 'pasado' : ''} ${actual ? 'actual' : ''} ${x.opcional ? 'opcional' : ''}`}
            style={{ '--c': TIPOS[x.tipo].color } as CSSProperties}>
            <span className="bloques-hora num">{x.inicio}<small>{x.fin === '24:00' ? '' : x.fin}</small></span>
            <span className="bloques-ico">{TIPOS[x.tipo].emoji}</span>
            <span className="crece">
              <strong>{x.titulo}</strong>
              {(x.nota || x.opcional || x.come_alla) && (
                <small>{[x.opcional && 'Si se da', x.come_alla && 'Como allá', x.nota].filter(Boolean).join(' · ')}</small>
              )}
            </span>
            {actual && <span className="dchip violeta">AHORA</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Tareas y prioridades del día ---------- */

const PRIOS: Record<NivelPrioridad, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

function Tareas({ vista, otros }: { vista: VistaDia; otros: ItemAgenda[] }) {
  const { filas: dias } = useDias();
  const [texto, setTexto] = useState('');
  const [hora, setHora] = useState('');
  const [prio, setPrio] = useState<NivelPrioridad>('media');
  const prioridades = vista.marcado?.prioridades ?? [];
  const pendientes = vista.tareas.filter((t) => !t.hecho).length;

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    await crear<Tarea>(TD.tareas, { fecha: vista.fecha, hora: hora || null, titulo: texto.trim(), hecho: false, prioridad: prio, nota: null, origen: 'app' });
    setTexto(''); setHora('');
  }

  async function tildarPrioridad(i: number) {
    const nuevas = prioridades.map((p, j) => (j === i ? { ...p, hecho: !p.hecho } : p));
    await guardarDia(dias, vista.fecha, { prioridades: nuevas });
  }

  return (
    <Tarjeta titulo={<span className="etq-tit">TAREAS · {pendientes}</span>}>
      {prioridades.length > 0 && (
        <ul className="prioridades">
          {prioridades.map((p, i) => (
            <li key={i}>
              <button className={`tilde ${p.hecho ? 'si' : ''}`} onClick={() => tildarPrioridad(i)} aria-label={p.hecho ? 'Desmarcar' : 'Marcar hecha'}>{p.hecho ? '✓' : i + 1}</button>
              <span className={`crece ${p.hecho ? 'tachado' : ''}`}><small className="etq">PRIORIDAD</small>{p.texto}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="tareas">
        {vista.tareas.map((t) => (
          <li key={t.id}>
            <button className={`tilde ${t.hecho ? 'si' : ''}`} onClick={() => modificar<Tarea>(TD.tareas, t.id, { hecho: !t.hecho })} aria-label={t.hecho ? 'Desmarcar' : 'Marcar hecha'}>{t.hecho ? '✓' : ''}</button>
            <span className={`crece ${t.hecho ? 'tachado' : ''}`}>
              {t.titulo}
              <small>{[t.hora, t.prioridad !== 'media' && PRIOS[t.prioridad], t.origen === 'claude' && 'cargada por Claude', t.nota].filter(Boolean).join(' · ')}</small>
            </span>
            {t.prioridad === 'alta' && <span className="dchip rojo">ALTA</span>}
            <button className="btn-icono" onClick={() => eliminar(TD.tareas, t.id)} aria-label="Borrar tarea">{Icono.borrar}</button>
          </li>
        ))}
        {otros.map((o) => (
          <li key={o.id} className="tarea-otro">
            <span className="tilde fija">•</span>
            <a className="crece" href={o.ruta ?? '#/'}>{o.titulo}<small>{MODULOS.find((m) => m.id === o.modulo)?.nombre}</small></a>
          </li>
        ))}
      </ul>
      {!vista.tareas.length && !otros.length && !prioridades.length && <p className="nota">Nada cargado para este día.</p>}
      <form className="tarea-nueva" onSubmit={agregar}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nueva tarea…" aria-label="Nueva tarea" />
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Hora (opcional)" />
        <select value={prio} onChange={(e) => setPrio(e.target.value as NivelPrioridad)} aria-label="Prioridad">
          {Object.entries(PRIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-primario" aria-label="Agregar tarea">{Icono.mas}</button>
      </form>
    </Tarjeta>
  );
}

/** Color de lo principal del día (fábrica > reparto > libre), o el de feriado. */
function colorPrincipal(v: VistaDia): string {
  if (v.estado === 'feriado' || v.feriado) return 'var(--critical)';
  if (v.estado === 'libre') return TIPOS.libre.color;
  const p = (['fabrica', 'reparto', 'libre'] as TipoBloque[]).find((t) => v.bloques.some((x) => x.tipo === t && !x.opcional));
  return p ? TIPOS[p].color : 'transparent';
}

/* ---------- Calendario ---------- */

function Calendario({ sel, onSel }: { sel: string; onSel: (f: string) => void }) {
  const [mes, setMes] = useState(sel.slice(0, 7));
  const { filas: plantilla } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  const otros = useAgendaOtros();
  useEffect(() => setMes(sel.slice(0, 7)), [sel]);
  const h = hoy();

  return (
    <Tarjeta className="cal" titulo={<span className="etq-tit">CALENDARIO</span>} accion={
      <div className="selector-mes">
        <button className="btn-icono" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">{Icono.flechaIzq}</button>
        <span>{nombreMes(mes)}</span>
        <button className="btn-icono" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">{Icono.flechaDer}</button>
      </div>
    }>
      <div className="cal-grilla" role="grid">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
        {celdasMes(mes).map((f) => {
          const v = armarDia(f, plantilla, dias, tareas);
          const pend = v.tareas.filter((t) => !t.hecho).length + otros.filter((o) => o.fecha === f).length;
          const principal = v.bloques.find((x) => x.tipo === 'fabrica') ?? v.bloques.find((x) => x.tipo === 'reparto') ?? v.bloques.find((x) => x.tipo === 'libre');
          return (
            <button key={f} role="gridcell" onClick={() => onSel(f)}
              className={`cal-dia ${f.slice(0, 7) !== mes ? 'fuera' : ''} ${f === h ? 'hoy' : ''} ${f === sel ? 'sel' : ''} ${v.estado === 'feriado' || v.feriado ? 'feriado' : ''} ${v.estado === 'libre' ? 'libre' : ''}`}
              aria-label={`${fechaLarga(f)}${v.feriado ? `, ${v.feriado.nombre}` : ''}${pend ? `, ${pend} cosas` : ''}`}>
              <span className="cal-num">{desdeISO(f).getDate()}</span>
              {principal && v.estado !== 'libre' && <span className="cal-barra" style={{ background: TIPOS[principal.tipo].color }} />}
              {pend > 0 && <span className="cal-cuenta">{pend}</span>}
              {v.marcado?.prioridades?.length ? <span className="cal-estrella">★</span> : null}
            </button>
          );
        })}
      </div>
      <div className="cal-leyenda">
        <span><i style={{ background: TIPOS.fabrica.color }} />Fábrica</span>
        <span><i style={{ background: TIPOS.reparto.color }} />Reparto</span>
        <span><i style={{ background: TIPOS.libre.color }} />Libre</span>
        <span><i className="rojo" />Feriado</span>
      </div>
    </Tarjeta>
  );
}

/* ---------- Editor de bloques (semana tipo u horario propio) ---------- */

function EditorBloques({ inicial, onGuardar, onCancelar, textoGuardar = 'Guardar' }: {
  inicial: Bloque[]; onGuardar: (b: Bloque[]) => Promise<void>; onCancelar?: () => void; textoGuardar?: string;
}) {
  const [bloques, setBloques] = useState<Bloque[]>(inicial.map((x) => ({ ...x })));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setBloques(inicial.map((x) => ({ ...x }))), [inicial]);

  const cambiar = (i: number, c: Partial<Bloque>) => setBloques((bs) => bs.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const errores = bloques.some((x) => !x.titulo.trim() || aMinutos(x.fin) <= aMinutos(x.inicio));

  function agregar() {
    const ultimo = bloques[bloques.length - 1];
    const ini = ultimo ? ultimo.fin : '09:00';
    const fin = deMinutos(Math.min(24 * 60, aMinutos(ini) + 60));
    setBloques([...bloques, { inicio: ini === '24:00' ? '23:00' : ini, fin: ini === '24:00' ? '24:00' : fin, titulo: '', tipo: 'otro' }]);
  }

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar(bloques.map((x) => ({ ...x, titulo: x.titulo.trim() })));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="editor-bloques">
      {bloques.map((x, i) => (
        <div key={i} className="eb-fila" style={{ '--c': TIPOS[x.tipo].color } as CSSProperties}>
          <div className="eb-horas">
            <input type="time" value={x.inicio} onChange={(e) => cambiar(i, { inicio: e.target.value })} aria-label="Desde" />
            <span>a</span>
            <input type="time" value={x.fin === '24:00' ? '23:59' : x.fin} onChange={(e) => cambiar(i, { fin: e.target.value === '23:59' ? '24:00' : e.target.value })} aria-label="Hasta" />
          </div>
          <input value={x.titulo} onChange={(e) => cambiar(i, { titulo: e.target.value })} placeholder="Qué hago" aria-label="Qué hago" />
          <div className="eb-extra">
            <select value={x.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value as TipoBloque })} aria-label="Tipo">
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.emoji} {t.nombre}</option>)}
            </select>
            <label className="eb-check"><input type="checkbox" checked={!!x.opcional} onChange={(e) => cambiar(i, { opcional: e.target.checked })} />Si se da</label>
            <label className="eb-check"><input type="checkbox" checked={!!x.come_alla} onChange={(e) => cambiar(i, { come_alla: e.target.checked })} />Como allá</label>
            <button className="btn-icono" onClick={() => setBloques(bloques.filter((_, j) => j !== i))} aria-label="Quitar bloque">{Icono.borrar}</button>
          </div>
          <input className="eb-nota" value={x.nota ?? ''} onChange={(e) => cambiar(i, { nota: e.target.value })} placeholder="Nota (opcional)" aria-label="Nota" />
        </div>
      ))}
      <button className="btn ancho" onClick={agregar}>{Icono.mas} Agregar bloque</button>
      {errores && <p className="error">Cada bloque necesita nombre y que termine después de empezar.</p>}
      <div className="acciones">
        {onCancelar && <button className="btn" onClick={onCancelar}>Cancelar</button>}
        <button className="btn btn-primario" disabled={errores || guardando} onClick={guardar}>{guardando ? 'Guardando…' : textoGuardar}</button>
      </div>
    </div>
  );
}

/* ---------- Editar un día ---------- */

function ModalDia({ vista, abierto, onCerrar }: { vista: VistaDia; abierto: boolean; onCerrar: () => void }) {
  const { filas: dias } = useDias();
  const [estado, setEstado] = useState<EstadoDia>(vista.estado);
  const [nombre, setNombre] = useState(vista.marcado?.nombre ?? '');
  const [nota, setNota] = useState(vista.marcado?.nota ?? '');
  const [prios, setPrios] = useState<Prioridad[]>(vista.marcado?.prioridades ?? []);
  const [editarHorario, setEditarHorario] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setEstado(vista.estado); setNombre(vista.marcado?.nombre ?? ''); setNota(vista.marcado?.nota ?? '');
    setPrios(vista.marcado?.prioridades ?? []); setEditarHorario(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, vista.fecha]);

  async function guardar() {
    await guardarDia(dias, vista.fecha, {
      estado, nombre: nombre.trim() || null, nota: nota.trim() || null,
      prioridades: prios.filter((p) => p.texto.trim()).map((p) => ({ ...p, texto: p.texto.trim() })),
    });
    onCerrar();
  }

  return (
    <Modal titulo={fechaLarga(vista.fecha)} abierto={abierto} onCerrar={onCerrar}>
      {editarHorario ? (
        <>
          <p className="nota">Horario solo para este día. La semana tipo no cambia.</p>
          <EditorBloques inicial={vista.bloques} textoGuardar="Guardar horario del día" onCancelar={() => setEditarHorario(false)}
            onGuardar={async (bs) => { await guardarDia(dias, vista.fecha, { bloques: bs }); setEditarHorario(false); }} />
        </>
      ) : (
        <div className="form">
          <div className="segmentado" role="radiogroup" aria-label="Cómo es el día">
            {(Object.keys(ESTADOS) as EstadoDia[]).map((k) => (
              <button key={k} role="radio" aria-checked={estado === k} className={estado === k ? 'activo' : ''} onClick={() => setEstado(k)}>{ESTADOS[k]}</button>
            ))}
          </div>
          {vista.feriado && <p className="nota">🇦🇷 {vista.feriado.nombre}{vista.feriado.tipo === 'puente' ? ' (no laborable: depende del trabajo)' : ''}</p>}
          {(estado === 'feriado' || estado === 'especial') && (
            <Campo etiqueta={estado === 'feriado' ? 'Nombre del feriado' : 'Nombre del día'}>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={vista.feriado?.nombre ?? 'Ej.: Cumple de mamá'} />
            </Campo>
          )}
          <div className="campo">
            <span>Prioridades del día (hasta 3)</span>
            {prios.map((p, i) => (
              <div key={i} className="prio-fila">
                <span className="tilde fija">{i + 1}</span>
                <input value={p.texto} onChange={(e) => setPrios(prios.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} aria-label={`Prioridad ${i + 1}`} />
                <button className="btn-icono" onClick={() => setPrios(prios.filter((_, j) => j !== i))} aria-label="Quitar">{Icono.cerrar}</button>
              </div>
            ))}
            {prios.length < 3 && <button className="btn chico" onClick={() => setPrios([...prios, { texto: '' }])}>{Icono.mas} Prioridad</button>}
          </div>
          <Campo etiqueta="Nota">
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo para recordar de ese día" />
          </Campo>
          <div className="campo">
            <span>Horario</span>
            <div className="acciones">
              <button className="btn chico" onClick={() => setEditarHorario(true)}>{Icono.editar} {vista.tipo ? 'Cambiar solo este día' : 'Editar horario del día'}</button>
              {!vista.tipo && <button className="btn chico" onClick={() => guardarDia(dias, vista.fecha, { bloques: null })}>Volver a la semana tipo</button>}
            </div>
          </div>
          <button className="btn btn-primario ancho" onClick={guardar}>Guardar</button>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Pantalla principal ---------- */

export function PantallaDia() {
  const [fecha, setFecha] = useState(hoy());
  const vista = useVista(fecha);
  const min = useReloj();
  const otros = useAgendaOtros().filter((o) => o.fecha === fecha);
  const [editar, setEditar] = useState(false);
  const { filas: plantilla, cargado } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  const semana = semanaDe(fecha);
  const arriba = useRef<HTMLDivElement>(null);

  function elegir(f: string) {
    setFecha(f);
    arriba.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="pila dia" ref={arriba}>
      <div className="dia-barra">
        <Cabecera vista={vista} />
        <div className="acciones">
          {fecha !== hoy() && <button className="btn" onClick={() => setFecha(hoy())}>Hoy</button>}
          <button className="btn btn-primario" onClick={() => setEditar(true)}>{Icono.editar} Editar día</button>
        </div>
      </div>

      <div className="semana-tira capa" role="tablist" aria-label="Semana">
        <button className="btn-icono" onClick={() => setFecha(sumarDias(fecha, -7))} aria-label="Semana anterior">{Icono.flechaIzq}</button>
        {semana.map((f) => (
          <button key={f} role="tab" aria-selected={f === fecha} onClick={() => setFecha(f)}
            className={`semana-dia ${f === fecha ? 'sel' : ''} ${f === hoy() ? 'hoy' : ''}`}>
            <small>{DIAS_CORTOS[desdeISO(f).getDay()]}</small>
            <strong>{desdeISO(f).getDate()}</strong>
            <span className="semana-punto" style={{ background: colorPrincipal(armarDia(f, plantilla, dias, tareas)) }} />
          </button>
        ))}
        <button className="btn-icono" onClick={() => setFecha(sumarDias(fecha, 7))} aria-label="Semana siguiente">{Icono.flechaDer}</button>
      </div>

      {fecha === hoy() && <Ahora vista={vista} min={min} />}

      <div key={fecha} className="dia-entra pila">
        <Tarjeta titulo={<span className="etq-tit">LÍNEA DEL DÍA</span>} accion={<small className="nota">Deslizá →</small>}>
          <Linea vista={vista} min={min} />
          {vista.marcado?.nota && <p className="dia-nota">📝 {vista.marcado.nota}</p>}
        </Tarjeta>

        <div className="dia-grilla">
          <Tarjeta titulo={<span className="etq-tit">PLAN · {vista.bloques.length} BLOQUES</span>}>
            <ListaBloques vista={vista} min={min} />
          </Tarjeta>
          <Tareas vista={vista} otros={otros} />
        </div>
      </div>

      <Calendario sel={fecha} onSel={elegir} />

      {cargado && !plantilla.length && (
        <p className="nota">La semana tipo está armada con lo que contaste. Podés ajustarla en <a href="#/dia/semana">Semana tipo</a>.</p>
      )}

      <ModalDia vista={vista} abierto={editar} onCerrar={() => setEditar(false)} />
    </div>
  );
}

/* ---------- Semana tipo ---------- */

export function PantallaSemana() {
  const { filas: plantilla } = usePlantilla();
  const [dia, setDia] = useState(desdeISO(hoy()).getDay());
  const [aviso, setAviso] = useState('');
  const bloques = useMemo(
    () => semanaTipo(plantilla).filter((x) => x.dia_semana === dia)
      .map(({ inicio, fin, titulo, tipo, nota, opcional, come_alla }) => ({ inicio, fin, titulo, tipo, nota, opcional, come_alla }))
      .sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio)),
    [plantilla, dia],
  );
  const orden = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="pila dia">
      <p className="nota">Así es una semana normal. El calendario la usa para cada día, salvo los que cambies a mano.</p>
      <div className="semana-tira tipo" role="tablist">
        {orden.map((d) => (
          <button key={d} role="tab" aria-selected={d === dia} className={`semana-dia ${d === dia ? 'sel' : ''}`} onClick={() => setDia(d)}>
            <small>{DIAS_CORTOS[d]}</small>
            <strong>{(['fabrica', 'reparto', 'gym', 'libre'] as TipoBloque[]).filter((t) => semanaTipo(plantilla).some((x) => x.dia_semana === d && x.tipo === t && !x.opcional)).slice(0, 2).map((t) => TIPOS[t].emoji).join('')}</strong>
          </button>
        ))}
      </div>
      {aviso && <p className="aviso-msg" role="status">{aviso}</p>}
      <Tarjeta titulo={<span className="etq-tit">{DIAS_SEMANA[dia].toUpperCase()}</span>}>
        <EditorBloques inicial={bloques} textoGuardar={`Guardar ${DIAS_SEMANA[dia].toLowerCase()}`} onGuardar={async (bs) => {
          await guardarDiaPlantilla(plantilla, dia, bs);
          setAviso(`Listo: ${DIAS_SEMANA[dia].toLowerCase()} guardado.`);
          window.setTimeout(() => setAviso(''), 2500);
        }} />
      </Tarjeta>
      {!plantilla.length && (
        <button className="btn" onClick={async () => { const n = await guardarSemanaBase(plantilla); setAviso(`Semana tipo guardada (${n} bloques).`); }}>
          Guardar toda la semana tipo tal como está
        </button>
      )}
      <p className="nota">El gimnasio no abre los domingos y los sábados abre a las 7. Tus entrenos duran alrededor de 1 h 30.</p>
    </div>
  );
}

