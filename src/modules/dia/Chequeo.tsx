import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { leerStorage } from '../../core/config';
import { usePerfil, puedeEscribir, veModulo } from '../../core/auth';
import { crear, eliminar } from '../../core/db';
import { dinero, hoy, sumarDias, uid } from '../../core/format';
import { ir, useRuta } from '../../core/router';
import { ModoActividad, icoConfirmar, useCambios } from '../../ui/Actividad';
import { AhoraDia, RielDia } from '../../ui/LineaDia';
import { Modal } from '../../ui/ui';
import { FormComida } from '../alimentacion/Pantallas';
import { metasDelDia, TA, useComidas, useExtras, useMetas, type Extra } from '../alimentacion/modelo';
import { FormMovimiento } from '../economia/FormMovimiento';
import { useMovimientos } from '../economia/modelo';
import { entrenoHoy, useSesiones } from '../entrenamiento/modelo';
import { columnas, conNovedad, etapaDe, mover, ordenArriba, useConfigTablero, useTarjetas, type Tarjeta } from '../tablero/modelo';
import {
  abrirChequeo, chequeosDe, escucharChequeo, guardarChequeo, guardarEnCursoChequeo, horasDormidas, leerEnCursoChequeo,
  MOMENTOS, SINTOMAS, sumarMinutos, ultimoManana, ZONAS_CUERPO,
  type ChequeoManana, type ChequeoNoche, type Cuerpo, type EnCursoChequeo, type Momento, type NivelZona, type ZonaCuerpo,
} from './chequeo';
import { armarDia, guardarDia, TD, useDias, usePlantilla, useTareas, type Prioridad } from './modelo';
import './chequeo.css';

/* ===================================================================================
 * Chequeo del día en vivo: pantalla completa (ModoActividad), un paso por vez, botón grande abajo.
 * Mañana: Sueño → Energía → Cuerpo → Plan → Prioridades → listo.
 * Noche:  Agua → Comida → Qué hice → Plata → Cómo fue → Mañana → listo.
 * =================================================================================== */

type R = Record<string, unknown>;
type PasoProps = { r: R; set: (cambios: R) => void; escribe: boolean };

const PASOS: Record<Momento, Array<{ id: string; titulo: string }>> = {
  manana: [
    { id: 'sueno', titulo: 'Sueño' }, { id: 'energia', titulo: 'Energía' }, { id: 'cuerpo', titulo: 'Cuerpo' },
    { id: 'plan', titulo: 'Plan' }, { id: 'prioridades', titulo: 'Prioridades' },
  ],
  noche: [
    { id: 'agua', titulo: 'Agua' }, { id: 'comida', titulo: 'Comida' }, { id: 'hice', titulo: 'Qué hice' },
    { id: 'plata', titulo: 'Plata' }, { id: 'dia', titulo: 'El día' }, { id: 'manana', titulo: 'Mañana' },
  ],
};

const ENERGIA: Array<[string, string]> = [['🪫', 'Nada'], ['😴', 'Poca'], ['😐', 'Normal'], ['🙂', 'Bien'], ['⚡', 'A full']];
const DIA: Array<[string, string]> = [['😣', 'Malo'], ['😕', 'Flojo'], ['😐', 'Normal'], ['🙂', 'Bueno'], ['🔥', 'Épico']];

/* ---------- Piezas chicas ---------- */

function Pregunta({ etq, titulo, ayuda }: { etq: string; titulo: ReactNode; ayuda?: ReactNode }) {
  return (
    <header className="cq-preg">
      <span className="cq-etq">{etq}</span>
      <h2>{titulo}</h2>
      {ayuda && <p>{ayuda}</p>}
    </header>
  );
}

function Stepper({ etiqueta, valor, onMenos, onMas }: { etiqueta: ReactNode; valor: ReactNode; onMenos: () => void; onMas: () => void }) {
  return (
    <div className="cq-num">
      <span className="cq-num-lbl">{etiqueta}</span>
      <div className="cq-stepper">
        <button type="button" onClick={onMenos} aria-label="Menos">−</button>
        <output>{valor}</output>
        <button type="button" onClick={onMas} aria-label="Más">+</button>
      </div>
    </div>
  );
}

function Cinco({ ops, valor, onElegir }: { ops: Array<[string, string]>; valor: number | null; onElegir: (v: number) => void }) {
  return (
    <div className="cq-cinco" role="radiogroup">
      {ops.map(([ic, t], i) => (
        <button key={t} type="button" role="radio" aria-checked={valor === i + 1} className="cq-op" onClick={() => onElegir(i + 1)}>
          <span className="cq-ic" aria-hidden="true">{ic}</span>{t}
        </button>
      ))}
    </div>
  );
}

function Tilde({ hecho, children, sub, onClick, disabled }: { hecho: boolean; children: ReactNode; sub?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="cq-check" aria-pressed={hecho} onClick={onClick} disabled={disabled}>
      <span className="cq-caja" aria-hidden="true">{hecho ? '✓' : ''}</span>
      <span className="crece">{children}{sub && <small>{sub}</small>}</span>
    </button>
  );
}

const DatoApp = ({ children }: { children: ReactNode }) => <div className="cq-dato">{children}</div>;

/* ---------- Mañana ---------- */

function PasoSueno({ r, set }: PasoProps) {
  const { filas: dias } = useDias();
  const ult = ultimoManana(dias);
  const acoste = (r.acoste as string) ?? ult?.acoste ?? '00:30';
  const levante = (r.levante as string) ?? ult?.levante ?? '07:30';
  const h = horasDormidas(acoste, levante);
  const fmt = (x: number) => `${String(x).replace('.', ',')} h`;
  return (
    <>
      <Pregunta etq="Sueño" titulo="¿Cómo dormiste?" ayuda="Ajustá las horas si cambiaron; lo dormido sale solo." />
      <div className={`cq-grande ${h < 6 ? 'poco' : h >= 7 ? 'bien' : ''}`}>{fmt(h)}<small>{h < 6 ? 'dormiste poco' : h >= 9.5 ? 'dormiste mucho' : 'horas dormidas'}</small></div>
      <Stepper etiqueta="Me acosté" valor={acoste} onMenos={() => set({ acoste: sumarMinutos(acoste, -15), levante })} onMas={() => set({ acoste: sumarMinutos(acoste, 15), levante })} />
      <Stepper etiqueta="Me levanté" valor={levante} onMenos={() => set({ levante: sumarMinutos(levante, -15), acoste })} onMas={() => set({ levante: sumarMinutos(levante, 15), acoste })} />
      <div className="cq-opciones tres">
        {([['corrido', '😌', 'De corrido'], ['cortado', '😵', 'Me desperté'], ['mal', '😫', 'Dormí mal']] as const).map(([v, ic, t]) => (
          <button key={v} type="button" className="cq-op" aria-pressed={r.sueno === v} onClick={() => set({ sueno: r.sueno === v ? null : v, acoste, levante })}>
            <span className="cq-ic" aria-hidden="true">{ic}</span>{t}
          </button>
        ))}
      </div>
    </>
  );
}

function PasoEnergia({ r, set }: PasoProps) {
  return (
    <>
      <Pregunta etq="Energía" titulo="¿Con cuánta pila arrancás?" ayuda="El entreno de hoy lo usa para ajustar series y peso." />
      <Cinco ops={ENERGIA} valor={(r.energia as number) ?? null} onElegir={(v) => set({ energia: v, _auto: true })} />
    </>
  );
}

/* Figura del cuerpo de frente y de espalda. Cada zona se toca: nada → cargada → duele → nada. */
type Pieza = [ZonaCuerpo, number, number, number, number];
const COMUN: Pieza[] = [
  ['cuello', 53, 33, 14, 9],
  ['hombros', 28, 42, 17, 14], ['hombros', 75, 42, 17, 14],
  ['brazos', 24, 58, 13, 46], ['brazos', 83, 58, 13, 46],
  ['munecas', 22, 106, 15, 16], ['munecas', 83, 106, 15, 16],
  ['piernas', 42, 128, 17, 50], ['piernas', 61, 128, 17, 50],
  ['rodillas', 42, 180, 17, 13], ['rodillas', 61, 180, 17, 13],
  ['gemelos', 43, 195, 15, 40], ['gemelos', 62, 195, 15, 40],
  ['pies', 39, 237, 19, 10], ['pies', 62, 237, 19, 10],
];
const FRENTE: Pieza[] = [['pecho', 46, 42, 28, 30], ['panza', 46, 74, 28, 30], ['cadera', 42, 106, 36, 20], ...COMUN];
const ESPALDA: Pieza[] = [['espalda_alta', 46, 42, 28, 30], ['espalda_baja', 46, 74, 28, 30], ['cadera', 42, 106, 36, 20], ...COMUN];

function Figura({ titulo, piezas, zonas, onZona }: { titulo: string; piezas: Pieza[]; zonas: Cuerpo['zonas']; onZona: (z: ZonaCuerpo) => void }) {
  const nombre = (z: ZonaCuerpo) => ZONAS_CUERPO.find((x) => x.id === z)?.nombre ?? z;
  const clase = (z: ZonaCuerpo) => (zonas[z] === 2 ? 'duele' : zonas[z] === 1 ? 'cargada' : '');
  return (
    <svg viewBox="0 0 120 262" className="cq-figura" role="group" aria-label={titulo}>
      <circle cx="60" cy="18" r="14" className={`cq-zona ${clase('cabeza')}`} onClick={() => onZona('cabeza')}>
        <title>{nombre('cabeza')}</title>
      </circle>
      {piezas.map(([z, x, y, w, h], i) => (
        <rect key={`${z}-${i}`} x={x} y={y} width={w} height={h} rx="3" className={`cq-zona ${clase(z)}`} onClick={() => onZona(z)}>
          <title>{nombre(z)}</title>
        </rect>
      ))}
      <text x="60" y="259" textAnchor="middle" className="cq-fig-tit">{titulo}</text>
    </svg>
  );
}

function PasoCuerpo({ r, set }: PasoProps) {
  const { filas: dias } = useDias();
  const c: Cuerpo = (r.cuerpo as Cuerpo) ?? { zonas: {}, sintomas: [], peso: null };
  const pesoPrevio = ultimoManana(dias.filter((d) => d.chequeo?.manana?.cuerpo?.peso))?.cuerpo.peso ?? 80;
  const fijar = (cambios: Partial<Cuerpo>) => set({ cuerpo: { ...c, ...cambios } });
  const tocarZona = (z: ZonaCuerpo) => {
    const ahora = c.zonas[z];
    const sig: NivelZona | undefined = !ahora ? 1 : ahora === 1 ? 2 : undefined;
    const zonas = { ...c.zonas };
    if (sig) zonas[z] = sig; else delete zonas[z];
    fijar({ zonas });
  };
  const marcadas = ZONAS_CUERPO.filter((z) => c.zonas[z.id]);
  const nada = !marcadas.length && !c.sintomas.length;
  return (
    <>
      <Pregunta etq="Cuerpo" titulo="¿Cómo está el cuerpo?" ayuda={<>Tocá donde sentís algo: una vez <b className="cq-t-cargada">cargado</b>, dos <b className="cq-t-duele">duele</b>, tres lo borra.</>} />
      <div className="cq-cuerpo">
        <div className="cq-figuras">
          <Figura titulo="Frente" piezas={FRENTE} zonas={c.zonas} onZona={tocarZona} />
          <Figura titulo="Espalda" piezas={ESPALDA} zonas={c.zonas} onZona={tocarZona} />
        </div>
        <div className="cq-cuerpo-lado">
          <p className="cq-marcadas" aria-live="polite">
            {marcadas.length
              ? marcadas.map((z) => <span key={z.id} className={c.zonas[z.id] === 2 ? 'duele' : 'cargada'}>{c.zonas[z.id] === 2 ? '▲' : '●'} {z.nombre}</span>)
              : <span className="nada">Nada marcado</span>}
          </p>
          <div className="cq-chips">
            {SINTOMAS.map((s) => (
              <button key={s} type="button" className="cq-chip" aria-pressed={c.sintomas.includes(s)}
                onClick={() => fijar({ sintomas: c.sintomas.includes(s) ? c.sintomas.filter((x) => x !== s) : [...c.sintomas, s] })}>{s}</button>
            ))}
          </div>
          {c.peso == null ? (
            <button type="button" className="btn" onClick={() => fijar({ peso: pesoPrevio })}>⚖ Me pesé</button>
          ) : (
            <Stepper etiqueta={<>Peso <button type="button" className="cq-quitar" onClick={() => fijar({ peso: null })}>sacar</button></>}
              valor={`${String(c.peso).replace('.', ',')} kg`}
              onMenos={() => fijar({ peso: Math.round((c.peso! - 0.1) * 10) / 10 })} onMas={() => fijar({ peso: Math.round((c.peso! + 0.1) * 10) / 10 })} />
          )}
          {nada && <p className="cq-ayuda">¿Todo bien? Tocá Seguir.</p>}
        </div>
      </div>
    </>
  );
}

function PasoPlan({ r, set }: PasoProps) {
  const { filas: plantilla } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  const v = useMemo(() => armarDia(hoy(), plantilla, dias, tareas), [plantilla, dias, tareas]);
  const fijos = v.bloques.filter((b) => b.tipo !== 'descanso' && b.tipo !== 'libre');
  const nombreDia = new Date().toLocaleDateString('es-AR', { weekday: 'long' });
  return (
    <>
      <Pregunta etq="Plan" titulo={`Tu ${nombreDia}`} ayuda="¿Se mantiene lo de siempre?" />
      {fijos.length ? (
        <div className="cq-linea">
          <AhoraDia bloques={fijos} />
          <RielDia bloques={fijos} />
        </div>
      ) : <DatoApp>{v.estado === 'libre' || v.feriado ? 'Hoy figura como día libre.' : 'No hay nada fijo cargado para hoy.'}</DatoApp>}
      <div className={`cq-opciones${fijos.length ? " tres plan" : ""}`}>
        {([['si', '✓', 'Sí, como siempre', ''], ['cambio', '✎', 'Cambió algo', 'Al terminar te llevo al Día para editarlo'], ['libre', '🏖', 'Hoy es libre', 'Lo marca libre en el Día']] as const).map(([val, ic, t, sub]) => (
          <button key={val} type="button" className="cq-op" aria-pressed={r.plan === val} onClick={() => set({ plan: val, _auto: true })}>
            <span className="cq-ic" aria-hidden="true">{ic}</span><span>{t}{sub && <small>{sub}</small>}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function PasoPrioridades({ r, set }: PasoProps) {
  const { filas: dias } = useDias();
  const { filas: tarjetas } = useTarjetas();
  const h = hoy();
  const actuales = (dias.find((d) => d.fecha === h)?.prioridades ?? []).map((p) => p.texto).filter(Boolean);
  const sugeridas = tarjetas
    .filter((t) => !t.hecho && ((t.fecha && t.fecha <= h) || (!t.fecha && t.prioridad === 'alta')))
    .sort((a, b) => (a.prioridad === 'alta' ? 0 : 1) - (b.prioridad === 'alta' ? 0 : 1))
    .map((t) => t.titulo);
  const elegidas = (r.prioridades as string[]) ?? actuales;
  const opciones = [...new Set([...elegidas, ...actuales, ...sugeridas])].slice(0, 7);
  const [otra, setOtra] = useState('');
  const tocar = (t: string) => {
    if (elegidas.includes(t)) set({ prioridades: elegidas.filter((x) => x !== t) });
    else if (elegidas.length < 3) set({ prioridades: [...elegidas, t] });
  };
  return (
    <>
      <Pregunta etq="Prioridades" titulo="Lo importante de hoy" ayuda={`Elegí hasta 3. ${sugeridas.length ? 'Las de abajo salen del Tablero.' : ''}`} />
      <div className="cq-lista">
        {opciones.map((t) => (
          <Tilde key={t} hecho={elegidas.includes(t)} onClick={() => tocar(t)} disabled={!elegidas.includes(t) && elegidas.length >= 3}>{t}</Tilde>
        ))}
      </div>
      <form className="cq-otra" onSubmit={(e) => { e.preventDefault(); const t = otra.trim(); if (t && elegidas.length < 3) { set({ prioridades: [...elegidas, t] }); setOtra(''); } }}>
        <input value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="Otra cosa…" aria-label="Otra prioridad" disabled={elegidas.length >= 3} />
        <button type="submit" className="btn" disabled={!otra.trim() || elegidas.length >= 3}>Sumar</button>
      </form>
      <p className="cq-ayuda">{elegidas.length} de 3</p>
    </>
  );
}

/* ---------- Noche ---------- */

const VASO = 500;

function PasoAgua({ r, set }: PasoProps) {
  const { filas: extras } = useExtras();
  const { filas: metas } = useMetas();
  const { filas: sesiones } = useSesiones();
  const h = hoy();
  const cargada = extras.filter((x) => x.fecha === h && x.tipo === 'agua').reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
  const meta = metasDelDia(metas, entrenoHoy(sesiones)).agua || 3000;
  const total = (r.agua_ml as number) ?? cargada;
  const vasos = Math.max(8, Math.ceil(meta / VASO));
  const llenos = Math.round(total / VASO);
  const l = (ml: number) => `${String(Math.round(ml / 100) / 10).replace('.', ',')} L`;
  return (
    <>
      <Pregunta etq="Agua" titulo="¿Cuánta agua tomaste?" ayuda="Cada vaso es medio litro. Tocá hasta el último que tomaste." />
      <div className={`cq-grande ${total >= meta ? 'bien' : total < meta / 2 ? 'poco' : ''}`}>{l(total)}<small>de {l(meta)} · {total >= meta ? 'meta cumplida ✓' : `faltan ${l(meta - total)}`}</small></div>
      <div className="cq-vasos">
        {Array.from({ length: vasos }, (_, i) => (
          <button key={i} type="button" className={i < llenos ? 'lleno' : ''} aria-label={`${(i + 1) / 2} litros`}
            onClick={() => set({ agua_ml: (i + 1) * VASO === total ? i * VASO : (i + 1) * VASO, agua_cargada: cargada })}>💧</button>
        ))}
      </div>
      {cargada > 0 && <DatoApp>Ya tenías <b>{l(cargada)}</b> cargados en el día.</DatoApp>}
    </>
  );
}

function PasoComida({ escribe }: PasoProps) {
  const { filas: comidas } = useComidas();
  const [form, setForm] = useState(false);
  const deHoy = comidas.filter((c) => c.fecha === hoy());
  const prot = deHoy.reduce((s, c) => s + (Number(c.proteina) || 0), 0);
  return (
    <>
      <Pregunta etq="Comida" titulo="¿Comiste algo más?" ayuda="Si falta algo, sumalo; si está todo, Seguir." />
      {deHoy.length ? (
        <ul className="cq-plan">
          {deHoy.map((c) => <li key={c.id}><b>{c.momento}</b><span>{c.descripcion}</span></li>)}
        </ul>
      ) : <DatoApp>Hoy no cargaste comidas.</DatoApp>}
      {deHoy.length > 0 && <p className="cq-ayuda">≈ {Math.round(prot)} g de proteína en el día.</p>}
      <button type="button" className="btn cq-ancho" onClick={() => setForm(true)} disabled={!escribe}>+ Sumar algo que comí</button>
      <Modal titulo="Qué comiste" abierto={form} onCerrar={() => setForm(false)}>
        <FormComida onListo={() => setForm(false)} />
      </Modal>
    </>
  );
}

function PasoHice({ escribe }: PasoProps) {
  const { filas: dias } = useDias();
  const { filas: tarjetas } = useTarjetas();
  const { etapas } = useConfigTablero();
  const { filas: extras } = useExtras();
  const { filas: metas } = useMetas();
  const { filas: sesiones } = useSesiones();
  const h = hoy();
  const dia = dias.find((d) => d.fecha === h);
  const prios = (dia?.prioridades ?? []).map((p, i) => ({ p, i })).filter(({ p }) => p.texto?.trim());
  const deHoy = tarjetas.filter((t) => t.fecha === h || (t.hecho && t.movida === h && (!t.fecha || t.fecha <= h)));
  const supl = (metas[0]?.suplementos ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const tomados = extras.filter((x) => x.fecha === h && x.tipo === 'suplemento');
  const ult = etapas[etapas.length - 1].id;

  async function tildarPrio(i: number) {
    const nuevas: Prioridad[] = (dia!.prioridades ?? []).map((p, j) => (j === i ? { ...p, hecho: !p.hecho } : p));
    await guardarDia(dias, h, { prioridades: nuevas });
  }
  async function tildarTarjeta(t: Tarjeta) {
    const cols = columnas(tarjetas, etapas);
    const destino = t.hecho ? etapas[0].id : ult;
    await mover(t, destino, etapas, cols.get(destino) ?? [], null);
  }
  async function tildarSupl(nombre: string) {
    const ya = tomados.find((x) => x.nombre === nombre);
    if (ya) await eliminar(TA.extras, ya.id);
    else await crear<Extra>(TA.extras, { fecha: h, tipo: 'suplemento', nombre, cantidad: 1 });
  }
  const nada = !prios.length && !deHoy.length && !supl.length;
  return (
    <>
      <Pregunta etq="Qué hice" titulo="¿Qué hiciste hoy?" ayuda="Tildá lo que sí. Queda tildado en el Día y el Tablero." />
      <div className="cq-lista">
        <div className={`cq-fijo ${entrenoHoy(sesiones) ? 'si' : ''}`}>{entrenoHoy(sesiones) ? '✓ Entreno guardado' : '— Hoy no entrenaste'}</div>
        {prios.map(({ p, i }) => <Tilde key={`p${i}`} hecho={!!p.hecho} sub="Prioridad" onClick={() => void tildarPrio(i)} disabled={!escribe}>{p.texto}</Tilde>)}
        {deHoy.map((t) => <Tilde key={t.id} hecho={t.hecho} sub={etapaDe(t, etapas) === ult ? 'Hecho' : t.hora ?? 'Pendiente de hoy'} onClick={() => void tildarTarjeta(t)} disabled={!escribe}>{t.titulo}</Tilde>)}
        {supl.map((s) => <Tilde key={s} hecho={tomados.some((x) => x.nombre === s)} sub="Suplemento" onClick={() => void tildarSupl(s)} disabled={!escribe}>Tomé {s}</Tilde>)}
        {nada && <DatoApp>Hoy no tenías prioridades ni pendientes con fecha.</DatoApp>}
      </div>
    </>
  );
}

function PasoPlata({ escribe }: PasoProps) {
  const { filas: movs } = useMovimientos();
  const [form, setForm] = useState(false);
  const gastos = movs.filter((m) => m.fecha === hoy() && m.tipo === 'gasto');
  const total = gastos.reduce((s, m) => s + Number(m.monto), 0);
  return (
    <>
      <Pregunta etq="Plata" titulo="¿Gastaste algo que no cargaste?" ayuda="Lo chico en efectivo es lo que más se olvida." />
      <DatoApp>{gastos.length ? <>Hoy cargaste <b>{gastos.length} gasto{gastos.length > 1 ? 's' : ''}</b> por <b>{dinero(total)}</b>.</> : 'Hoy no cargaste gastos.'}</DatoApp>
      {gastos.length > 0 && (
        <ul className="cq-plan">
          {gastos.slice(-4).map((m) => <li key={m.id}><b>{dinero(Number(m.monto))}</b><span>{m.descripcion || 'Gasto'}</span></li>)}
        </ul>
      )}
      <button type="button" className="btn cq-ancho" onClick={() => setForm(true)} disabled={!escribe}>$ Cargar un gasto</button>
      <Modal titulo="Nuevo gasto" abierto={form} onCerrar={() => setForm(false)}>
        <FormMovimiento onListo={() => setForm(false)} />
      </Modal>
    </>
  );
}

function PasoDia({ r, set }: PasoProps) {
  return (
    <>
      <Pregunta etq="El día" titulo="¿Cómo fue el día?" />
      <Cinco ops={DIA} valor={(r.dia as number) ?? null} onElegir={(v) => set({ dia: v })} />
      <label className="cq-nota">
        <span>Una línea, si querés</span>
        <input value={(r.nota as string) ?? ''} onChange={(e) => set({ nota: e.target.value })} placeholder="Ej. mucho reparto, poco tiempo para comer" maxLength={160} />
      </label>
    </>
  );
}

function PasoManana({ escribe }: PasoProps) {
  const { filas: tarjetas } = useTarjetas();
  const { etapas } = useConfigTablero();
  const [txt, setTxt] = useState('');
  const manana = sumarDias(hoy(), 1);
  const ya = tarjetas.filter((t) => t.fecha === manana && !t.hecho);
  const atajos = ['Comprar algo', 'Llamar a alguien', 'Pagar algo', 'Lavar ropa'];
  async function anotar(titulo: string) {
    const t = titulo.trim();
    if (!t) return;
    const etapa = etapas[0].id;
    await crear<Tarjeta>(TD.tareas, {
      id: uid(), titulo: t, fecha: manana, prioridad: 'media', etapa, hecho: false, origen: 'app', movida: hoy(), nota: null,
      orden: ordenArriba(columnas(tarjetas, etapas).get(etapa) ?? []), novedades: conNovedad(undefined, 'Anotada en el cierre del día'),
    });
    setTxt('');
  }
  return (
    <>
      <Pregunta etq="Mañana" titulo="¿Algo para mañana?" ayuda="Queda en el Tablero con fecha de mañana." />
      {ya.length > 0 && (
        <ul className="cq-plan">
          {ya.map((t) => <li key={t.id}><b>▸</b><span>{t.titulo}</span></li>)}
        </ul>
      )}
      <form className="cq-otra" onSubmit={(e) => { e.preventDefault(); void anotar(txt); }}>
        <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej. ir a la feria" aria-label="Algo para mañana" disabled={!escribe} />
        <button type="submit" className="btn" disabled={!txt.trim() || !escribe}>Anotar</button>
      </form>
      <div className="cq-chips">
        {atajos.map((a) => <button key={a} type="button" className="cq-chip" onClick={() => setTxt(a + ' ')}>{a}…</button>)}
      </div>
    </>
  );
}

/* ---------- Cierre ---------- */

function Final({ e }: { e: EnCursoChequeo }) {
  const r = e.r;
  const noche = e.momento === 'noche';
  const datos: Array<[string, string]> = noche
    ? [
      [`${String(Math.round(((r.agua_ml as number) ?? 0) / 100) / 10).replace('.', ',')} L`, 'agua'],
      [r.dia ? `${DIA[(r.dia as number) - 1][0]} ${DIA[(r.dia as number) - 1][1]}` : '—', 'el día'],
    ]
    : [
      [`${String(horasDormidas((r.acoste as string) ?? '00:30', (r.levante as string) ?? '07:30')).replace('.', ',')} h`, 'dormidas'],
      [r.energia ? `${ENERGIA[(r.energia as number) - 1][0]} ${ENERGIA[(r.energia as number) - 1][1]}` : '—', 'energía'],
      [`${((r.prioridades as string[]) ?? []).length}`, 'prioridades'],
      [`${Object.keys(((r.cuerpo as Cuerpo)?.zonas) ?? {}).length || '✓'}`, Object.keys(((r.cuerpo as Cuerpo)?.zonas) ?? {}).length ? 'zonas a cuidar' : 'cuerpo bien'],
    ];
  return (
    <div className="cq-final">
      <div className="cq-trofeo" aria-hidden="true">{noche ? '🌙' : '☀'}</div>
      <h2>{noche ? 'Día cerrado' : 'Día arrancado'}</h2>
      <p className="cq-xp">+30 XP</p>
      <div className="cq-resumen">{datos.map(([b, t]) => <div key={t}><b>{b}</b><span>{t}</span></div>)}</div>
      {!noche && r.plan === 'cambio' && <p className="cq-ayuda">Al guardar te llevo al Día para que cambies el horario.</p>}
    </div>
  );
}

/* ---------- La actividad ---------- */

function useEnCurso(): EnCursoChequeo | null {
  useCambios();
  useSyncExternalStore(escucharChequeo, () => leerStorage('life.dia.chequeo'));
  return leerEnCursoChequeo();
}

const COMPONENTES: Record<string, (p: PasoProps) => ReactNode> = {
  sueno: PasoSueno, energia: PasoEnergia, cuerpo: PasoCuerpo, plan: PasoPlan, prioridades: PasoPrioridades,
  agua: PasoAgua, comida: PasoComida, hice: PasoHice, plata: PasoPlata, dia: PasoDia, manana: PasoManana,
};

/** Montado una vez en App.tsx: si hay un chequeo abierto (y no minimizado), lo muestra encima de todo. */
export function ChequeoEnVivo() {
  const perfil = usePerfil();
  const escribe = puedeEscribir(perfil);
  const ruta = useRuta();
  const e = useEnCurso();
  const { filas: dias } = useDias();
  const [guardando, setGuardando] = useState(false);

  // Links directos (#/chequeo/manana o #/chequeo/noche, por ej. desde un recordatorio): abre y vuelve al Inicio.
  useEffect(() => {
    const m = ruta.match(/^chequeo\/(manana|noche)$/);
    if (m) { abrirChequeo(m[1] as Momento); ir(''); }
  }, [ruta]);

  if (!e || e.minimizada || !veModulo(perfil, 'dia')) return null;
  const pasos = PASOS[e.momento];
  const enFinal = e.paso >= pasos.length;
  const paso = pasos[Math.min(e.paso, pasos.length - 1)];
  const Comp = COMPONENTES[paso.id];
  const actualizar = (x: Partial<EnCursoChequeo>) => guardarEnCursoChequeo({ ...e, ...x });

  // Al pasar cada paso se guarda lo que es de otra sección (agua, prioridades, día libre).
  // Lee lo último guardado (las respuestas de un toque llegan justo antes).
  async function seguir(saltar = false) {
    const x = leerEnCursoChequeo();
    if (!x) return;
    const p = PASOS[x.momento][x.paso];
    const r = { ...x.r };
    if (escribe && !saltar && p) {
      if (p.id === 'agua' && typeof r.agua_ml === 'number') {
        const dif = r.agua_ml - ((r.agua_cargada as number) ?? 0);
        if (dif > 0) await crear<Extra>(TA.extras, { fecha: x.fecha, tipo: 'agua', nombre: 'Agua', cantidad: dif });
        r.agua_cargada = r.agua_ml;
      }
      if (p.id === 'prioridades' && Array.isArray(r.prioridades)) {
        const previas = dias.find((d) => d.fecha === x.fecha)?.prioridades ?? [];
        const nuevas: Prioridad[] = (r.prioridades as string[]).map((texto) => ({ texto, hecho: previas.find((q) => q.texto === texto)?.hecho ?? false }));
        await guardarDia(dias, x.fecha, { prioridades: nuevas });
      }
      if (p.id === 'plan' && r.plan === 'libre') await guardarDia(dias, x.fecha, { estado: 'libre' });
    }
    guardarEnCursoChequeo({ ...x, r, paso: x.paso + 1 });
  }

  async function terminar() {
    if (!e) return;
    setGuardando(true);
    const r = e.r;
    try {
      if (escribe) {
        if (e.momento === 'manana') {
          const acoste = (r.acoste as string) ?? '00:30', levante = (r.levante as string) ?? '07:30';
          const datos: ChequeoManana = {
            hecho_at: new Date().toISOString(), acoste, levante, horas: horasDormidas(acoste, levante),
            sueno: (r.sueno as ChequeoManana['sueno']) ?? null, energia: (r.energia as number) ?? null,
            cuerpo: (r.cuerpo as Cuerpo) ?? { zonas: {}, sintomas: [], peso: null }, plan: (r.plan as ChequeoManana['plan']) ?? null,
          };
          await guardarChequeo(dias, e.fecha, 'manana', datos);
        } else {
          const datos: ChequeoNoche = {
            hecho_at: new Date().toISOString(), agua_ml: (r.agua_ml as number) ?? ((r.agua_cargada as number) ?? 0),
            dia: (r.dia as number) ?? null, nota: ((r.nota as string) ?? '').trim(),
          };
          await guardarChequeo(dias, e.fecha, 'noche', datos);
        }
      }
      const aDia = e.momento === 'manana' && r.plan === 'cambio';
      guardarEnCursoChequeo(null);
      if (aDia) ir('dia');
    } finally {
      setGuardando(false);
    }
  }

  const set = (cambios: R) => {
    const auto = cambios._auto;
    delete cambios._auto;
    const nuevo = { ...e, r: { ...e.r, ...cambios } };
    guardarEnCursoChequeo(nuevo);
    // Las preguntas de un toque (energía, plan) pasan solas al siguiente paso.
    if (auto) setTimeout(() => { const x = leerEnCursoChequeo(); if (x && x.paso === e.paso && x.momento === e.momento) void seguir(); }, 280);
  };

  const m = MOMENTOS[e.momento];
  return (
    <ModoActividad
      etiqueta={`${m.icono} ${m.titulo}`}
      titulo={enFinal ? 'Listo' : paso.titulo}
      total={pasos.length} hechos={Math.min(e.paso, pasos.length)}
      derecha={<span className="actividad-xp">{enFinal ? '✓' : `${e.paso + 1}/${pasos.length}`}</span>}
      onSalir={() => guardarEnCursoChequeo(null)}
      onMinimizar={() => actualizar({ minimizada: true })}
      pie={enFinal ? (
        <button type="button" className="btn btn-confirmar grande-boton crece" disabled={guardando} onClick={() => void terminar()}>
          {icoConfirmar} {e.momento === 'noche' ? 'Guardar y a dormir' : 'Guardar y a darle'}
        </button>
      ) : (
        <>
          {e.paso > 0 && <button type="button" className="btn grande-boton" onClick={() => actualizar({ paso: e.paso - 1 })} aria-label="Paso anterior">◀</button>}
          <button type="button" className="btn grande-boton" onClick={() => void seguir(true)}>Saltar</button>
          <button type="button" className="btn btn-confirmar grande-boton crece" onClick={() => void seguir()}>Seguir</button>
        </>
      )}
    >
      <div key={`${e.momento}-${e.paso}`} className="cq-paso entra-adelante">
        {enFinal ? <Final e={e} /> : <Comp r={e.r} set={set} escribe={escribe} />}
      </div>
    </ModoActividad>
  );
}

/* ---------- Tarjetas del Inicio: siempre a la vista si lo hiciste o no ---------- */

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/** Dos tarjetas arriba del Inicio: ☀ Arranque y ☾ Cierre, con hecho / sin hacer. */
export function TarjetasChequeo() {
  const perfil = usePerfil();
  const { filas: dias } = useDias();
  const e = useEnCurso();
  if (!veModulo(perfil, 'dia')) return null;
  const h = hoy();
  const ch = chequeosDe(dias, h);
  const horaAhora = new Date().getHours();

  const tarjeta = (mo: Momento) => {
    const m = MOMENTOS[mo];
    const hecho = mo === 'manana' ? ch.manana : ch.noche;
    const aMedias = e && e.momento === mo && e.fecha === h && e.paso > 0;
    const temprano = mo === 'noche' && horaAhora < m.desde;
    let sub: string;
    if (hecho) {
      sub = mo === 'manana'
        ? `✓ ${hora(hecho.hecho_at)} · ${String((hecho as ChequeoManana).horas).replace('.', ',')} h de sueño`
        : `✓ ${hora(hecho.hecho_at)}`;
    } else if (aMedias) sub = `A medias · paso ${e!.paso + 1} de ${PASOS[mo].length}`;
    else if (temprano) sub = `Desde las ${m.desde}:00 · ${PASOS[mo].length} pasos`;
    else sub = mo === 'manana' ? `Sin hacer · ${PASOS.manana.length} pasos, ~40 s` : `Sin hacer · ${PASOS.noche.length} pasos, ~1 min`;
    const estado = hecho ? 'hecho' : aMedias ? 'medias' : temprano ? 'espera' : 'falta';
    return (
      <button key={mo} type="button" className={`cq-tarjeta ${mo} ${estado}`} onClick={() => abrirChequeo(mo)}
        aria-label={`${m.nombre}: ${hecho ? 'hecho' : 'sin hacer'}`}>
        <span className="cq-t-ic" aria-hidden="true">{m.icono}</span>
        <span className="crece">
          <strong>{m.nombre}</strong>
          <small>{sub}</small>
        </span>
        <span className="cq-t-estado">{hecho ? '✓ Hecho' : aMedias ? 'Seguir' : temprano ? 'Más tarde' : mo === 'manana' ? 'Empezar' : 'Cerrar'}</span>
      </button>
    );
  };
  return (
    <section className="cq-tarjetas" aria-label="Chequeos del día">
      {tarjeta('manana')}
      {tarjeta('noche')}
    </section>
  );
}

/** Para la barra de "Volver" (Modulo.enCurso del Día). */
export function chequeoEnCurso() {
  const e = leerEnCursoChequeo();
  if (!e || e.fecha !== hoy()) return null;
  if (!e.minimizada) return null;
  const m = MOMENTOS[e.momento];
  return {
    id: 'dia-chequeo', titulo: `${m.icono} ${m.titulo}`, detalle: `Paso ${Math.min(e.paso + 1, PASOS[e.momento].length)} de ${PASOS[e.momento].length}`,
    ruta: '#/', minimizada: true, volver: () => guardarEnCursoChequeo({ ...e, minimizada: false }),
  };
}
