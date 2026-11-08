import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { fechaCorta, hoy, sumarDias, uid } from '../../core/format';
import { confirmar } from '../../ui/Deshacer';
import { Icono, Modal } from '../../ui/ui';
import { TD, type NivelPrioridad } from '../dia/modelo';
import {
  columnas, diasQuieta, estaQuieta, etapaDe, guardarConfig, mover, ordenArriba, PRIORIDADES, siguienteEtapa,
  useConfigTablero, useTarjetas, type Etapa, type PasoTarjeta, type Tarjeta,
} from './modelo';
import './tablero.css';

/** Compu = columnas + detalle al costado; celu = una pestaña por etapa + hoja que sube (pilar 2: mismo sistema). */
function useEsCompu() {
  const consulta = '(min-width: 761px)';
  const [si, setSi] = useState(() => window.matchMedia?.(consulta).matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return;
    const f = () => setSi(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return si;
}

/** "+10 XP" que sube al terminar una tarjeta. */
function festejar(x: number, y: number) {
  const p = document.createElement('div');
  p.className = 'tb-xp';
  p.textContent = '+10 XP ★';
  p.style.left = `${x - 40}px`;
  p.style.top = `${y - 20}px`;
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1200);
}

type Borrador = {
  id: string | null; titulo: string; nota: string; prioridad: NivelPrioridad; categoria: string; etapa: string;
  pasos: PasoTarjeta[]; fecha: string; hora: string;
};

let pideAnotar = false;
const EVENTO_ANOTAR = 'life-tablero-anotar';

/** Lo llama "+ Cargar": abre el formulario apenas se ve el tablero. */
export function pedirAnotar() {
  pideAnotar = true;
  window.dispatchEvent(new Event(EVENTO_ANOTAR));
}

export function PantallaTablero() {
  const { filas } = useTarjetas();
  const { fila: config, etapas, categorias } = useConfigTablero();
  const compu = useEsCompu();
  const [filtro, setFiltro] = useState<string>('todas');
  const [soloAlta, setSoloAlta] = useState(false);
  const [etapaCelu, setEtapaCelu] = useState<string>(etapas[0].id);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [editandoEtapas, setEditandoEtapas] = useState(false);

  const visibles = useMemo(
    () => filas.filter((t) => (filtro === 'todas' || (t.categoria ?? 'Sin categoría') === filtro) && (!soloAlta || t.prioridad === 'alta')),
    [filas, filtro, soloAlta],
  );
  const cols = useMemo(() => columnas(visibles, etapas), [visibles, etapas]);
  const todas = useMemo(() => columnas(filas, etapas), [filas, etapas]);
  const ult = etapas[etapas.length - 1].id;
  const etapaActual = etapas.some((e) => e.id === etapaCelu) ? etapaCelu : etapas[0].id;

  // Cifras (una sola definición por cifra, pilar 4).
  const sinTerminar = filas.filter((t) => !t.hecho);
  const altas = sinTerminar.filter((t) => t.prioridad === 'alta').length;
  const primera = todas.get(etapas[0].id)?.length ?? 0;
  const ideas = (todas.get(etapas[0].id) ?? []).filter((t) => t.categoria === 'Ideas de desarrollo').length;
  const enProceso = sinTerminar.length - primera;
  const semana = sumarDias(hoy(), -6);
  const hechas = filas.filter((t) => t.hecho && (t.movida ?? t.fecha ?? '') >= semana).length;
  const quieta = ordenarQuietas(filas)[0];

  function abrir(t: Tarjeta | null, etapa?: string) {
    setEditandoEtapas(false);
    setBorrador(t ? {
      id: t.id, titulo: t.titulo, nota: t.nota ?? '', prioridad: t.prioridad, categoria: t.categoria ?? '',
      etapa: etapaDe(t, etapas), pasos: (t.pasos ?? []).map((p) => ({ ...p })), fecha: t.fecha ?? '', hora: t.hora ?? '',
    } : {
      id: null, titulo: '', nota: '', prioridad: 'media', categoria: filtro !== 'todas' ? filtro : '',
      etapa: etapa ?? (compu ? etapas[0].id : etapaActual), pasos: [], fecha: '', hora: '',
    });
  }

  async function moverA(t: Tarjeta, etapa: string, antesDe: string | null, x?: number, y?: number) {
    const col = todas.get(etapa) ?? [];
    await mover(t, etapa, etapas, col, antesDe);
    if (etapa === ult && etapaDe(t, etapas) !== ult) festejar(x ?? window.innerWidth / 2, y ?? window.innerHeight - 120);
  }

  // "+ Cargar → Pendiente o idea" abre acá el formulario de siempre (pilar 4: un solo formulario por acción).
  useEffect(() => {
    const ver = () => { if (pideAnotar) { abrir(null); setTimeout(() => { pideAnotar = false; }, 0); } };
    ver();
    window.addEventListener(EVENTO_ANOTAR, ver);
    return () => window.removeEventListener(EVENTO_ANOTAR, ver);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gestos = useGestos({ compu, filas, etapas, onAbrir: (t) => abrir(t), onMover: moverA });

  const cifras = (
    <div className="tb-cifras">
      <div className="tb-cifra alta"><small>Alta prioridad</small><b>{altas}</b><span>sin terminar</span></div>
      <div className="tb-cifra dest"><small>{etapas[0].nombre}</small><b>{primera}</b><span>{ideas ? `${ideas} son ideas` : 'para arrancar'}</span></div>
      <div className="tb-cifra"><small>En proceso</small><b>{enProceso}</b><span>moviéndose</span></div>
      <div className="tb-cifra"><small>Hechas</small><b>{hechas}</b><span>esta semana</span></div>
    </div>
  );

  const aviso = quieta && (() => {
    const et = etapaDe(quieta, etapas);
    const sig = siguienteEtapa(etapas, et, 1);
    return (
      <div className="tb-aviso" role="status">
        <span className="tb-aviso-txt">● <b>"{quieta.titulo}"</b> está quieta en {etapas.find((e) => e.id === et)?.nombre} hace {diasQuieta(quieta)} días.</span>
        {sig && <button type="button" className="btn" onClick={() => moverA(quieta, sig.id, null)}>{sig.id === ult ? 'Ya la hice' : `Pasar a ${sig.nombre}`}</button>}
        <button type="button" className="btn" onClick={() => abrir(quieta)}>Revisar</button>
      </div>
    );
  })();

  const cats = [...categorias, ...(filas.some((t) => !t.categoria) ? ['Sin categoría'] : [])];
  const filtros = (
    <div className="tb-filtros">
      {['todas', ...cats].map((c) => (
        <button key={c} type="button" className={`chip ${filtro === c ? 'chip-on' : ''}`} aria-pressed={filtro === c} onClick={() => setFiltro(c)}>{c === 'todas' ? 'Todas' : c}</button>
      ))}
      <button type="button" className={`chip ${soloAlta ? 'chip-on' : ''}`} aria-pressed={soloAlta} onClick={() => setSoloAlta(!soloAlta)}>▲ Solo alta</button>
    </div>
  );

  const detalle = borrador && (
    <FormTarjeta key={borrador.id ?? 'nueva'} inicial={borrador} etapas={etapas} categorias={categorias} config={config}
      onListo={(etapa) => { setBorrador(null); if (!compu && etapa) setEtapaCelu(etapa); }} />
  );

  return (
    <div className={`tb ${compu ? 'tb-compu' : 'tb-celu'}`}>
      <div className="tb-principal">
        <div className="tb-cab">
          <p className="nota">{compu ? 'Ideas, pendientes y lo que estás haciendo. Arrastrá para cambiar de etapa.' : `${sinTerminar.length} sin terminar · tocá una para verla`}</p>
          {compu && (
            <div className="fila-derecha">
              <button type="button" className="btn" onClick={() => { setBorrador(null); setEditandoEtapas(true); }}>Etapas</button>
              <button type="button" className="btn btn-primario" onClick={() => abrir(null)}>{Icono.mas} Anotar</button>
            </div>
          )}
        </div>
        {cifras}
        {aviso}
        {filtros}

        {compu ? (
          <div className="tb-columnas" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}>
            {etapas.map((e) => {
              const ts = cols.get(e.id) ?? [];
              return (
                <section key={e.id} className="tb-col" data-drop={e.id}>
                  <header className="tb-col-cab">
                    <h3>{e.nombre}</h3><span className="tb-n">{ts.length}</span>
                    <button type="button" className="btn-icono" onClick={() => abrir(null, e.id)} aria-label={`Anotar en ${e.nombre}`}>{Icono.mas}</button>
                  </header>
                  <div className="tb-lista">
                    {ts.map((t) => <TarjetaVista key={t.id} t={t} etapas={etapas} elegida={borrador?.id === t.id} gestos={gestos} />)}
                    {!ts.length && <div className="tb-vacia">{filas.length ? 'Soltá una tarjeta acá' : 'Anotá tu primer pendiente con + Anotar'}</div>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <>
            <div className="tb-tabs" role="tablist">
              {etapas.map((e) => (
                <button key={e.id} type="button" role="tab" className="tb-tab" data-drop={e.id} aria-selected={etapaActual === e.id} onClick={() => setEtapaCelu(e.id)}>
                  <span>{e.nombre}</span><b>{cols.get(e.id)?.length ?? 0}</b>
                </button>
              ))}
            </div>
            <p className="tb-ayuda">
              {etapaActual === ult ? '◀ deslizá para volver' : etapaActual === etapas[0].id ? 'deslizá ▶ para avanzar' : '◀ volver · avanzar ▶'} · mantené apretado para llevarla a otra pestaña
            </p>
            <div className="tb-lista">
              {(cols.get(etapaActual) ?? []).map((t) => <TarjetaVista key={t.id} t={t} etapas={etapas} elegida={false} gestos={gestos} />)}
              {!(cols.get(etapaActual) ?? []).length && <div className="tb-vacia">Nada acá todavía</div>}
            </div>
            <div className="tb-abajo">
              <button type="button" className="btn" onClick={() => { setBorrador(null); setEditandoEtapas(true); }} aria-label="Editar etapas">⋯</button>
              <button type="button" className="btn btn-confirmar grande-boton" onClick={() => abrir(null)}>+ Anotar pendiente o idea</button>
            </div>
          </>
        )}
      </div>

      {compu && (
        <aside className="tb-panel">
          {detalle ?? (
            <div className="tb-panel-vacio">
              <b>Elegí una tarjeta</b>
              <span className="nota">Se abre acá al costado para verla o editarla, sin salir del tablero.</span>
              <span className="nota">O anotá algo nuevo con + Anotar.</span>
            </div>
          )}
        </aside>
      )}
      {!compu && (
        <Modal titulo={borrador?.id ? 'Detalle' : 'Anotar'} abierto={!!borrador} onCerrar={() => setBorrador(null)}>{detalle}</Modal>
      )}
      <Modal titulo="Etapas" abierto={editandoEtapas} onCerrar={() => setEditandoEtapas(false)}>
        <EditarEtapas etapas={etapas} filas={filas} onGuardar={async (nuevas) => { await guardarConfig(config, { etapas: nuevas }); setEditandoEtapas(false); }} />
      </Modal>
    </div>
  );
}

function ordenarQuietas(ts: Tarjeta[]) {
  const peso = { alta: 0, media: 1, baja: 2 } as const;
  return ts.filter(estaQuieta).sort((a, b) => peso[a.prioridad] - peso[b.prioridad] || diasQuieta(b) - diasQuieta(a));
}

/* ---------- Tarjeta ---------- */

function TarjetaVista({ t, etapas, elegida, gestos }: { t: Tarjeta; etapas: Etapa[]; elegida: boolean; gestos: Gestos }) {
  const pasos = t.pasos ?? [];
  const hechos = pasos.filter((p) => p.hecho).length;
  const prio = PRIORIDADES.find((p) => p.id === t.prioridad)!;
  const q = !t.hecho && estaQuieta(t) ? diasQuieta(t) : 0;
  return (
    <div className="tb-envoltura">
      <div className={`tb-tarjeta p-${t.prioridad} ${t.hecho ? 'hecha' : ''} ${elegida ? 'elegida' : ''}`} data-id={t.id} tabIndex={0} role="button"
        aria-label={`${t.titulo}, prioridad ${prio.nombre}, ${etapas.find((e) => e.id === etapaDe(t, etapas))?.nombre}`}
        onPointerDown={(e) => gestos.empezar(e, t)} onKeyDown={(e) => { if (e.key === 'Enter') gestos.abrir(t); }}
        onContextMenu={(e) => e.preventDefault()}>
        <div className="tb-sup">
          <span className={`tb-prio ${t.prioridad}`}>{prio.icono} {prio.nombre}</span>
          {t.categoria && <span className="tb-cat">{t.categoria}</span>}
          {t.origen === 'claude' && <span className="tb-origen">por chat</span>}
        </div>
        <div className="tb-titulo">{t.titulo}</div>
        {t.nota && <div className="tb-nota">{t.nota}</div>}
        {(pasos.length > 0 || t.fecha || q > 0) && (
          <div className="tb-inf">
            {pasos.length > 0 && <>
              <span className="tb-pasos" aria-hidden="true">{pasos.map((p, i) => <i key={i} className={p.hecho ? 'si' : ''} />)}</span>
              <span>{hechos}/{pasos.length} pasos</span>
            </>}
            {t.fecha && <span>📅 {fechaCorta(t.fecha)}{t.hora ? ` ${t.hora}` : ''}</span>}
            {q > 0 && <span className="tb-quieta">● quieta {q} días</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Arrastrar (mouse y dedo) y deslizar (celu) ---------- */

interface Gestos {
  empezar: (e: ReactPointerEvent, t: Tarjeta) => void;
  abrir: (t: Tarjeta) => void;
}

function useGestos({ compu, filas, etapas, onAbrir, onMover }: {
  compu: boolean; filas: Tarjeta[]; etapas: Etapa[];
  onAbrir: (t: Tarjeta) => void;
  onMover: (t: Tarjeta, etapa: string, antesDe: string | null, x?: number, y?: number) => void;
}): Gestos {
  const ultimo = useRef({ compu, filas, etapas, onAbrir, onMover });
  ultimo.current = { compu, filas, etapas, onAbrir, onMover };

  return useMemo<Gestos>(() => ({
    abrir: (t) => ultimo.current.onAbrir(t),
    empezar: (e0, t) => {
      if (e0.button > 0) return;
      const card = e0.currentTarget as HTMLElement;
      const toque = e0.pointerType !== 'mouse';
      const x0 = e0.clientX, y0 = e0.clientY;
      let tipo: null | 'arrastre' | 'desliz' = null;
      let fant: HTMLElement | null = null;
      let dx0 = 0, dy0 = 0;
      let sig: string | null = null;
      let largo: ReturnType<typeof setTimeout> | undefined;

      const limpiarMarcas = () => {
        document.querySelectorAll('.tb .encima').forEach((n) => n.classList.remove('encima'));
        document.querySelectorAll('.tb-hueco').forEach((n) => n.remove());
      };
      const destino = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y);
        const drop = el?.closest<HTMLElement>('.tb [data-drop]');
        if (!drop) return null;
        const sobre = el!.closest<HTMLElement>('.tb-tarjeta');
        return { etapa: drop.dataset.drop!, drop, sobre: sobre && sobre.dataset.id !== t.id ? sobre : null };
      };
      const arrastrar = (x: number, y: number) => {
        tipo = 'arrastre';
        const r = card.getBoundingClientRect();
        dx0 = x - r.left; dy0 = y - r.top;
        fant = card.cloneNode(true) as HTMLElement;
        fant.classList.add('tb-fantasma');
        fant.style.width = `${r.width}px`;
        document.body.appendChild(fant);
        moverFant(x, y);
        card.classList.add('levantada');
        try { navigator.vibrate?.(15); } catch { /* sin vibración */ }
      };
      const moverFant = (x: number, y: number) => { if (fant) { fant.style.left = `${x - dx0}px`; fant.style.top = `${y - dy0}px`; } };

      const mov = (e: PointerEvent) => {
        const dx = e.clientX - x0, dy = e.clientY - y0;
        if (!tipo) {
          if (!toque && Math.hypot(dx, dy) > 6) arrastrar(e.clientX, e.clientY);
          else if (toque && !ultimo.current.compu && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) { clearTimeout(largo); tipo = 'desliz'; }
          else if (toque && Math.hypot(dx, dy) > 10) { fin(); return; }
          if (!tipo) return;
        }
        if (tipo === 'arrastre') {
          moverFant(e.clientX, e.clientY);
          limpiarMarcas();
          const d = destino(e.clientX, e.clientY);
          if (d) {
            d.drop.classList.add('encima');
            if (d.sobre && ultimo.current.compu) d.sobre.parentElement!.insertAdjacentHTML('beforebegin', '<div class="tb-hueco"></div>');
          }
        } else {
          const { etapas: ets } = ultimo.current;
          const s = siguienteEtapa(ets, etapaDe(t, ets), dx > 0 ? 1 : -1);
          card.style.transition = 'none';
          card.style.transform = `translateX(${s ? dx : dx * 0.25}px)`;
          const w = card.parentElement!;
          if (s && Math.abs(dx) > 40) { w.dataset.pista = dx > 0 ? `▶ ${s.nombre}` : `${s.nombre} ◀`; w.dataset.lado = dx > 0 ? 'der' : 'izq'; } else delete w.dataset.pista;
          sig = s && Math.abs(dx) > 90 ? s.id : null;
        }
      };
      const tocar = (e: TouchEvent) => { if (tipo) e.preventDefault(); };
      const soltar = (e: PointerEvent) => fin(e, false);
      const cancelar = (e: PointerEvent) => fin(e, true);
      const fin = (e?: PointerEvent, cancelado = true) => {
        clearTimeout(largo);
        window.removeEventListener('pointermove', mov);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', cancelar);
        window.removeEventListener('touchmove', tocar);
        if (tipo === 'arrastre') {
          const d = !cancelado && e ? destino(e.clientX, e.clientY) : null;
          fant?.remove(); card.classList.remove('levantada'); limpiarMarcas();
          if (d) {
            const mismo = d.etapa === etapaDe(t, ultimo.current.etapas);
            const antesDe = ultimo.current.compu ? d.sobre?.dataset.id ?? null : null;
            if (!mismo || antesDe || ultimo.current.compu) ultimo.current.onMover(t, d.etapa, antesDe, e!.clientX, e!.clientY);
          }
        } else if (tipo === 'desliz') {
          const w = card.parentElement!;
          delete w.dataset.pista;
          card.style.transition = ''; card.style.transform = '';
          if (sig && !cancelado) { const r = card.getBoundingClientRect(); ultimo.current.onMover(t, sig, null, r.left + r.width / 2, r.top); }
        } else if (e && !cancelado) ultimo.current.onAbrir(t);
      };

      if (toque) largo = setTimeout(() => { if (!tipo) arrastrar(x0, y0); }, 260);
      window.addEventListener('pointermove', mov);
      window.addEventListener('pointerup', soltar);
      window.addEventListener('pointercancel', cancelar);
      window.addEventListener('touchmove', tocar, { passive: false });
    },
  }), []);
}

/* ---------- Formulario único (panel en la compu, hoja en el celu) ---------- */

function FormTarjeta({ inicial, etapas, categorias, config, onListo }: {
  inicial: Borrador; etapas: Etapa[]; categorias: string[]; config: ReturnType<typeof useConfigTablero>['fila'];
  onListo: (etapa?: string) => void;
}) {
  const [b, setB] = useState<Borrador>(inicial);
  const [nuevaCat, setNuevaCat] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { filas } = useTarjetas();
  const fijar = (c: Partial<Borrador>) => setB((x) => ({ ...x, ...c }));
  const ult = etapas[etapas.length - 1].id;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!b.titulo.trim()) { setError('Escribí qué es para poder anotarlo.'); return; }
    let categoria = b.categoria;
    if (nuevaCat?.trim()) {
      categoria = nuevaCat.trim();
      if (!categorias.includes(categoria)) await guardarConfig(config, { categorias: [...categorias, categoria] });
    }
    const datos = {
      titulo: b.titulo.trim(), nota: b.nota.trim() || null, prioridad: b.prioridad, categoria: categoria || null,
      etapa: b.etapa, hecho: b.etapa === ult, pasos: b.pasos.filter((p) => p.texto.trim()),
      fecha: b.fecha || null, hora: b.fecha && b.hora ? b.hora : null,
    };
    if (b.id) {
      const antes = filas.find((t) => t.id === b.id);
      const cambia = antes && etapaDe(antes, etapas) !== b.etapa;
      await modificar<Tarjeta>(TD.tareas, b.id, { ...datos, ...(cambia ? { movida: hoy() } : {}) });
    } else {
      const col = columnas(filas, etapas).get(b.etapa) ?? [];
      await crear<Tarjeta>(TD.tareas, { ...datos, id: uid(), origen: 'app', movida: hoy(), orden: ordenArriba(col) });
    }
    onListo(b.etapa);
  }

  async function borrar() {
    if (!b.id) return;
    if (await confirmar(`¿Borrar "${b.titulo}"? Vas a poder deshacerlo unos segundos.`, 'Borrar')) {
      await eliminar(TD.tareas, b.id);
      onListo();
    }
  }

  return (
    <form className="tb-form" onSubmit={guardar}>
      <div className="tb-form-cuerpo">
        <label className="campo"><span>Qué es</span>
          <input id="tb-titulo" value={b.titulo} onChange={(e) => { fijar({ titulo: e.target.value }); setError(''); }} placeholder="Ej: Ordenar el reparto" autoFocus={!b.id} />
          {error && <small className="tb-error">{error}</small>}
        </label>
        <div className="campo"><span>Prioridad</span>
          <div className="tb-opciones">
            {PRIORIDADES.map((p) => (
              <button key={p.id} type="button" className={`tb-opc ${p.id}`} aria-pressed={b.prioridad === p.id} onClick={() => fijar({ prioridad: p.id })}>{p.icono} {p.nombre}</button>
            ))}
          </div>
        </div>
        <div className="campo"><span>Etapa</span>
          <div className="tb-opciones">
            {etapas.map((e) => <button key={e.id} type="button" className="tb-opc" aria-pressed={b.etapa === e.id} onClick={() => fijar({ etapa: e.id })}>{e.nombre}</button>)}
          </div>
        </div>
        <div className="campo"><span>Categoría</span>
          <div className="tb-opciones">
            {categorias.map((c) => (
              <button key={c} type="button" className="tb-opc" aria-pressed={nuevaCat === null && b.categoria === c} onClick={() => { setNuevaCat(null); fijar({ categoria: b.categoria === c ? '' : c }); }}>{c}</button>
            ))}
            {nuevaCat === null
              ? <button type="button" className="tb-opc" onClick={() => setNuevaCat('')}>+ Otra</button>
              : <input className="tb-nueva-cat" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Nombre de la categoría" autoFocus />}
          </div>
        </div>
        {b.categoria === 'Pagos' && <div className="tb-cruce">¿Tiene monto y fecha?<a className="btn" href="#/pagos">Cargar en Pagos</a></div>}
        {b.categoria === 'Compras' && <div className="tb-cruce">Para la próxima compra<a className="btn" href="#/compras">Ir a la lista</a></div>}
        <label className="campo"><span>Nota</span>
          <textarea value={b.nota} onChange={(e) => fijar({ nota: e.target.value })} placeholder="Lo que haga falta recordar" rows={3} />
        </label>
        <div className="campo"><span>Qué implica (pasos)</span>
          {b.pasos.map((p, i) => (
            <div key={i} className="tb-paso">
              <input type="checkbox" checked={p.hecho} aria-label="Hecho" onChange={() => fijar({ pasos: b.pasos.map((x, j) => (j === i ? { ...x, hecho: !x.hecho } : x)) })} />
              <input value={p.texto} onChange={(e) => fijar({ pasos: b.pasos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })} aria-label={`Paso ${i + 1}`} />
              <button type="button" className="btn-icono" aria-label="Sacar paso" onClick={() => fijar({ pasos: b.pasos.filter((_, j) => j !== i) })}>{Icono.cerrar}</button>
            </div>
          ))}
          <button type="button" className="btn tb-sumar" onClick={() => fijar({ pasos: [...b.pasos, { texto: '', hecho: false }] })}>+ Sumar paso</button>
        </div>
        <div className="fila-campos">
          <label className="campo"><span>Fecha (opcional)</span><input type="date" value={b.fecha} onChange={(e) => fijar({ fecha: e.target.value })} /></label>
          {b.fecha && <label className="campo"><span>Hora</span><input type="time" value={b.hora} onChange={(e) => fijar({ hora: e.target.value })} /></label>}
        </div>
        {b.fecha && <small className="nota">Con fecha aparece también en tu Día y en la agenda del Inicio.</small>}
      </div>
      <div className="tb-form-pie">
        {b.id ? <button type="button" className="btn btn-peligro" onClick={borrar}>Borrar</button>
          : <button type="button" className="btn" onClick={() => onListo()}>Cancelar</button>}
        <button type="submit" className="btn btn-primario">{b.id ? 'Guardar' : 'Anotar'}</button>
      </div>
    </form>
  );
}

/* ---------- Editar etapas ---------- */

function EditarEtapas({ etapas, filas, onGuardar }: { etapas: Etapa[]; filas: Tarjeta[]; onGuardar: (e: Etapa[]) => void }) {
  const [lista, setLista] = useState<Etapa[]>(() => etapas.map((e) => ({ ...e })));
  const cuantas = (id: string) => filas.filter((t) => etapaDe(t, etapas) === id).length;
  return (
    <div className="pila">
      <p className="nota">La última es la de "hecho" (da XP). Solo se puede sacar una etapa vacía.</p>
      {lista.map((e, i) => {
        const n = cuantas(e.id);
        return (
          <div key={e.id} className="tb-paso">
            <input value={e.nombre} onChange={(ev) => setLista(lista.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)))} aria-label={`Etapa ${i + 1}`} />
            <button type="button" className="btn-icono" aria-label="Subir" disabled={i === 0}
              onClick={() => { const l = [...lista]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setLista(l); }}>▲</button>
            <button type="button" className="btn-icono" aria-label={n ? `Tiene ${n} tarjetas` : 'Sacar etapa'} title={n ? `Tiene ${n}` : undefined} disabled={n > 0}
              onClick={() => setLista(lista.filter((_, j) => j !== i))}>{Icono.cerrar}</button>
          </div>
        );
      })}
      <button type="button" className="btn tb-sumar" onClick={() => { const l = [...lista]; l.splice(l.length - 1, 0, { id: `e-${uid().slice(0, 8)}`, nombre: 'Esperando a alguien' }); setLista(l); }}>+ Sumar etapa</button>
      <button type="button" className="btn btn-primario" disabled={lista.length < 2 || lista.some((e) => !e.nombre.trim())}
        onClick={() => onGuardar(lista.map((e) => ({ ...e, nombre: e.nombre.trim() })))}>Guardar etapas</button>
    </div>
  );
}
