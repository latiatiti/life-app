import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { crear, modificar } from '../../core/db';
import { fechaCorta, hoy, sumarDias, uid } from '../../core/format';
import { Icono, Modal } from '../../ui/ui';
import { TD, type NivelPrioridad } from '../dia/modelo';
import {
  columnas, conNovedad, cuandoCorto, diasQuieta, estaQuieta, etapaDe, mover, ordenArriba, pasoActual, PRIORIDADES,
  siguienteEtapa, useConfigTablero, useTarjetas, type Etapa, type Tarjeta,
} from './modelo';
import { borradorDe, festejar, FormTarjeta, useEsCompu, type Borrador } from './Tablero';
import './cortina.css';

/**
 * Cortina de pendientes (2026-11-24, pedido de ella): el Tablero a mano desde cualquier pantalla, sin salir de donde estás.
 * - Compu: llevar el cursor al borde de arriba la baja; al bajar el cursor por debajo, se sube sola.
 * - Celu: arrastrar desde arriba (como las notificaciones) o tocar la pestañita flotante de arriba.
 * Lo de atrás queda igual: la cortina se dibuja encima y no cambia la ruta.
 */

const EVENTO = 'life-cortina';
/** Abre o cierra la cortina desde cualquier lado. */
export function abrirCortina(si = true) { window.dispatchEvent(new CustomEvent(EVENTO, { detail: si })); }

/** Hay algo encima (menú, ventana, modo actividad): la cortina no se mete. */
const hayAlgoEncima = () => !!document.querySelector('dialog[open], .actividad');

const CON_MOUSE = '(hover: hover) and (pointer: fine)';
/** Alto del borde de arriba que despierta la cortina. */
const BORDE_MOUSE = 6;
const BORDE_DEDO = 40;

export function CortinaPendientes({ escribe, ocultarPestana }: { escribe: boolean; ocultarPestana: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [tirando, setTirando] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);
  const abiertaRef = useRef(abierta);
  abiertaRef.current = abierta;

  // Abrir/cerrar desde afuera y con Esc.
  useEffect(() => {
    const ev = (e: Event) => setAbierta((e as CustomEvent<boolean>).detail);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && abiertaRef.current && !document.querySelector('dialog[open]')) setAbierta(false); };
    window.addEventListener(EVENTO, ev);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener(EVENTO, ev); window.removeEventListener('keydown', tecla); };
  }, []);

  // Al cambiar de pantalla (por un link de adentro) se sube sola.
  useEffect(() => {
    const f = () => setAbierta(false);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // Compu: cursor arriba de todo un ratito → baja; cursor por debajo de la cortina → sube.
  useEffect(() => {
    if (!window.matchMedia?.(CON_MOUSE).matches) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const cancelar = () => { clearTimeout(espera); espera = undefined; };
    const mov = (e: MouseEvent) => {
      if (!abiertaRef.current) {
        if (e.clientY <= BORDE_MOUSE && !hayAlgoEncima()) {
          // Un ratito quieto arriba: si solo pasa de largo hacia las pestañas del navegador, no se abre.
          if (!espera) espera = setTimeout(() => { espera = undefined; if (!hayAlgoEncima()) setAbierta(true); }, 160);
        } else cancelar();
        return;
      }
      if (document.querySelector('dialog[open]') || e.buttons) return;
      // Dónde termina cuando está abierta del todo (offsetHeight no cambia con la animación: así no se cierra sola mientras baja).
      const el = ref.current;
      const abajo = el ? el.offsetTop + el.offsetHeight : 0;
      if (e.clientY > abajo + 6) setAbierta(false);
    };
    const salir = (e: MouseEvent) => { if (!e.relatedTarget) cancelar(); };
    window.addEventListener('mousemove', mov, { passive: true });
    document.addEventListener('mouseout', salir);
    return () => { cancelar(); window.removeEventListener('mousemove', mov); document.removeEventListener('mouseout', salir); };
  }, []);

  // Celu: arrastrar hacia abajo desde el borde de arriba, la barra de arriba o la pestañita.
  useEffect(() => {
    let y0 = 0, x0 = 0, t0 = 0;
    let siguiendo = false, tirandoYa = false, dy = 0;
    const ini = (e: TouchEvent) => {
      if (abiertaRef.current || e.touches.length !== 1 || hayAlgoEncima()) return;
      const t = e.touches[0];
      const el = e.target as HTMLElement | null;
      const enBorde = t.clientY <= BORDE_DEDO;
      const enBarra = !!el?.closest?.('.barra-sup, .cortina-pestana') && !el.closest('input, textarea, select');
      if (!enBorde && !enBarra) return;
      siguiendo = true; tirandoYa = false; dy = 0; y0 = t.clientY; x0 = t.clientX; t0 = Date.now();
    };
    const mov = (e: TouchEvent) => {
      if (!siguiendo) return;
      const t = e.touches[0];
      dy = t.clientY - y0;
      const dx = t.clientX - x0;
      if (!tirandoYa) {
        if (dy > 10 && dy > Math.abs(dx) * 1.3) tirandoYa = true;
        else if (Math.abs(dx) > 12 || dy < -10) { siguiendo = false; return; }
        else return;
      }
      e.preventDefault(); // que no se mueva la página ni recargue
      setTirando(Math.max(0, dy));
    };
    const fin = () => {
      if (!siguiendo) return;
      siguiendo = false;
      if (tirandoYa) {
        const rapido = dy / Math.max(1, Date.now() - t0) > 0.5;
        setTirando(null);
        if (dy > 90 || (rapido && dy > 30)) setAbierta(true);
      }
    };
    window.addEventListener('touchstart', ini, { passive: true });
    window.addEventListener('touchmove', mov, { passive: false });
    window.addEventListener('touchend', fin);
    window.addEventListener('touchcancel', fin);
    return () => {
      window.removeEventListener('touchstart', ini);
      window.removeEventListener('touchmove', mov);
      window.removeEventListener('touchend', fin);
      window.removeEventListener('touchcancel', fin);
    };
  }, []);

  // Subirla arrastrando el tirador de abajo (celu y compu).
  const [subiendo, setSubiendo] = useState(0);
  function tirador(e0: ReactPointerEvent) {
    const y = e0.clientY;
    let d = 0;
    const mov = (e: PointerEvent) => { d = Math.min(0, e.clientY - y); setSubiendo(d); };
    const fin = () => {
      window.removeEventListener('pointermove', mov);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', fin);
      setSubiendo(0);
      if (d < -50 || Math.abs(d) < 4) setAbierta(false); // arrastrar para arriba o tocar = cerrar
    };
    window.addEventListener('pointermove', mov);
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', fin);
  }

  const { filas } = useTarjetas();
  const pendientes = filas.filter((t) => !t.hecho).length;
  const altas = filas.filter((t) => !t.hecho && t.prioridad === 'alta').length;

  const visible = abierta || tirando !== null;
  const [montada, setMontada] = useState(false);
  useEffect(() => { if (visible) setMontada(true); }, [visible]);
  const estilo = tirando !== null
    ? { transform: `translateY(calc(-100% + ${Math.min(tirando, window.innerHeight)}px))`, transition: 'none' }
    : subiendo ? { transform: `translateY(${subiendo}px)`, transition: 'none' } : undefined;

  return (
    <>
      {!ocultarPestana && (
        <button type="button" className={`cortina-pestana cortina-pestana-flota ${altas ? 'con-alta' : ''} ${visible ? 'oculta' : ''}`} onClick={() => setAbierta(true)}
          // Compu: pasar el cursor por encima ya la abre (sin esperar ni hacer clic).
          onMouseEnter={() => { if (window.matchMedia?.(CON_MOUSE).matches && !hayAlgoEncima()) setAbierta(true); }}
          tabIndex={visible ? -1 : 0}
          aria-label={`Abrir pendientes: ${pendientes} sin terminar${altas ? `, ${altas} de prioridad alta` : ''}`} title="Pendientes">
          <i className="cortina-pestana-linea" aria-hidden="true" />
          <span className="cortina-pestana-txt"><span aria-hidden="true">▾</span> Pendientes <b>{pendientes}</b></span>
          <i className="cortina-pestana-linea" aria-hidden="true" />
        </button>
      )}
      <div className={`cortina-fondo ${visible ? 'ver' : ''}`} onClick={() => setAbierta(false)} aria-hidden="true" />
      <section ref={ref} className={`cortina ${abierta ? 'abierta' : ''}`} style={estilo} aria-label="Pendientes" aria-hidden={!visible} inert={!visible}>
        {/* Una vez abierta queda armada: así al cerrarse sube con su contenido, suave */}
        {(visible || montada) && <Contenido escribe={escribe} abierta={abierta} onCerrar={() => setAbierta(false)} />}
        <div className="cortina-tirador" onPointerDown={tirador} role="button" tabIndex={0} aria-label="Cerrar pendientes"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAbierta(false); }}>
          <i aria-hidden="true" />
        </div>
      </section>
    </>
  );
}

/**
 * Compu: la pestaña es la punta de la barra de arriba (va adentro de `barra-sup`, pegada al borde de la ventana).
 * Pasar el cursor por encima la abre al instante; tocarla también.
 */
export function PestanaPendientes() {
  const { filas } = useTarjetas();
  const pendientes = filas.filter((t) => !t.hecho).length;
  const altas = filas.filter((t) => !t.hecho && t.prioridad === 'alta').length;
  const abrir = () => { if (!hayAlgoEncima()) abrirCortina(true); };
  return (
    <button type="button" className={`cortina-pestana cortina-pestana-barra ${altas ? 'con-alta' : ''}`} onClick={abrir}
      onMouseEnter={() => { if (window.matchMedia?.(CON_MOUSE).matches) abrir(); }}
      aria-label={`Abrir pendientes: ${pendientes} sin terminar${altas ? `, ${altas} de prioridad alta` : ''}`} title="Pendientes">
      <i className="cortina-pestana-linea" aria-hidden="true" />
      <span className="cortina-pestana-txt"><span aria-hidden="true">▾</span> Pendientes <b>{pendientes}</b></span>
      <i className="cortina-pestana-linea" aria-hidden="true" />
    </button>
  );
}

/* ---------- Lo de adentro: cifras → ahora → lista → anotar ---------- */

function Contenido({ escribe, abierta, onCerrar }: { escribe: boolean; abierta: boolean; onCerrar: () => void }) {
  const { filas } = useTarjetas();
  const { fila: config, etapas, categorias } = useConfigTablero();
  const compu = useEsCompu();
  const [etapa, setEtapa] = useState(etapas[0].id);
  const [soloAlta, setSoloAlta] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const ult = etapas[etapas.length - 1].id;
  const etapaVista = etapas.some((e) => e.id === etapa) ? etapa : etapas[0].id;

  const todas = useMemo(() => columnas(filas, etapas), [filas, etapas]);
  const sinTerminar = filas.filter((t) => !t.hecho);
  const altas = sinTerminar.filter((t) => t.prioridad === 'alta').length;
  const enProceso = sinTerminar.filter((t) => etapaDe(t, etapas) !== etapas[0].id).length;
  const semana = sumarDias(hoy(), -6);
  const hechas = filas.filter((t) => t.hecho && (t.movida ?? t.fecha ?? '') >= semana).length;

  // "Ahora": lo que está en marcha y más pesa (en proceso primero, después alta sin empezar).
  const peso = { alta: 0, media: 1, baja: 2 } as const;
  const foco = [...sinTerminar].sort((a, b) =>
    Number(etapaDe(a, etapas) === etapas[0].id) - Number(etapaDe(b, etapas) === etapas[0].id)
    || peso[a.prioridad] - peso[b.prioridad] || (a.orden ?? 0) - (b.orden ?? 0))[0];

  let lista = todas.get(etapaVista) ?? [];
  if (etapaVista === ult) lista = [...lista].sort((a, b) => (b.movida ?? '').localeCompare(a.movida ?? '')).slice(0, 20);
  if (soloAlta) lista = lista.filter((t) => t.prioridad === 'alta');

  // Lo que viene: con fecha o aviso en los próximos 7 días.
  const limite = sumarDias(hoy(), 7);
  const proximos = sinTerminar
    .map((t) => ({ t, cuando: t.recordar_en ? t.recordar_en.slice(0, 10) : t.fecha ?? '' }))
    .filter((x) => x.cuando && x.cuando <= limite)
    .sort((a, b) => a.cuando.localeCompare(b.cuando)).slice(0, 5);

  async function moverA(t: Tarjeta, destino: string, e?: { clientX: number; clientY: number }) {
    await mover(t, destino, etapas, todas.get(destino) ?? [], null);
    if (destino === ult) festejar(e?.clientX ?? window.innerWidth / 2, e?.clientY ?? 120);
  }

  async function pasoHecho(t: Tarjeta) {
    const pasos = (t.pasos ?? []).map((p) => ({ ...p }));
    const i = pasos.findIndex((p) => !p.hecho && p.texto.trim());
    if (i < 0) return;
    pasos[i].hecho = true;
    await modificar<Tarjeta>(TD.tareas, t.id, { pasos, movida: hoy(), novedades: conNovedad(t, `Paso hecho: ${pasos[i].texto}`) });
  }

  const abrir = (t: Tarjeta | null) => setBorrador(borradorDe(t, etapas, etapaVista === ult ? etapas[0].id : etapaVista));
  const detalle = borrador && (
    <FormTarjeta key={borrador.id ?? 'nueva'} inicial={borrador} etapas={etapas} categorias={categorias} config={config}
      onListo={(e) => { setBorrador(null); if (e) setEtapa(e); }} />
  );

  return (
    <div className="cortina-cuerpo">
      <div className="cortina-principal">
        <header className="cortina-cab">
          <h2>Pendientes</h2>
          <div className="cortina-cifras" aria-label="Cómo venís">
            <span className={altas ? 'alta' : ''} title="Prioridad alta sin terminar"><b>{altas}</b> ▲ alta</span>
            <span title="Ya arrancadas, sin terminar"><b>{enProceso}</b> en marcha</span>
            <span className="xp" title="Terminadas en los últimos 7 días"><b>{hechas}</b> ★ esta semana</span>
          </div>
          <a href="#/tablero" className="btn cortina-ir">Tablero completo</a>
          <button type="button" className="btn-icono" onClick={onCerrar} aria-label="Cerrar">{Icono.cerrar}</button>
        </header>

        {foco && (
          <Foco t={foco} etapas={etapas} escribe={escribe} onAbrir={() => abrir(foco)} onPaso={() => pasoHecho(foco)} onMover={moverA} />
        )}

        <div className="cortina-tabs" role="tablist">
          {etapas.map((e) => (
            <button key={e.id} type="button" role="tab" aria-selected={etapaVista === e.id} className="cortina-tab" onClick={() => setEtapa(e.id)}>
              {e.nombre} <b>{e.id === ult ? hechas : (todas.get(e.id)?.length ?? 0)}</b>
            </button>
          ))}
          <button type="button" className={`chip ${soloAlta ? 'chip-on' : ''}`} aria-pressed={soloAlta} onClick={() => setSoloAlta(!soloAlta)}>▲<span> Alta</span></button>
        </div>

        <ul className="cortina-lista">
          {lista.map((t) => (
            <Item key={t.id} t={t} etapas={etapas} escribe={escribe} elegida={borrador?.id === t.id} onAbrir={() => abrir(t)} onMover={moverA} />
          ))}
          {!lista.length && <li className="cortina-vacia">{etapaVista === ult ? 'Todavía nada terminado.' : soloAlta ? 'Nada de prioridad alta acá.' : 'Nada acá. Anotá abajo lo que se te ocurra.'}</li>}
        </ul>

        {escribe && <Anotar etapas={etapas} todas={todas} enfocar={abierta && compu} />}
      </div>

      {compu && (
        <aside className="cortina-lado">
          {detalle ?? (
            <div className="cortina-proximos">
              <h3>Lo que viene (7 días)</h3>
              {proximos.length ? (
                <ul>
                  {proximos.map(({ t }) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => abrir(t)}>
                        <time>{t.recordar_en ? `⏰ ${cuandoCorto(t.recordar_en)}` : `📅 ${fechaCorta(t.fecha!)}${t.hora ? ` ${t.hora}` : ''}`}</time>
                        <span>{t.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="nota">Nada con fecha ni aviso en la semana.</p>}
              <p className="nota">Tocá una tarjeta para verla o editarla acá, sin salir de la pantalla en la que estás.</p>
            </div>
          )}
        </aside>
      )}
      {!compu && (
        <Modal titulo={borrador?.id ? 'Detalle' : 'Anotar'} abierto={!!borrador} onCerrar={() => setBorrador(null)}>{detalle}</Modal>
      )}
    </div>
  );
}

/** La tarjeta en la que estás: su paso actual y el botón para avanzar. */
function Foco({ t, etapas, escribe, onAbrir, onPaso, onMover }: {
  t: Tarjeta; etapas: Etapa[]; escribe: boolean; onAbrir: () => void; onPaso: () => void;
  onMover: (t: Tarjeta, etapa: string, e?: { clientX: number; clientY: number }) => void;
}) {
  const paso = pasoActual(t);
  const pasos = t.pasos ?? [];
  const hechos = pasos.filter((p) => p.hecho).length;
  const sig = siguienteEtapa(etapas, etapaDe(t, etapas), 1);
  const ult = etapas[etapas.length - 1].id;
  const q = estaQuieta(t) ? diasQuieta(t) : 0;
  return (
    <div className={`cortina-foco p-${t.prioridad}`}>
      <button type="button" className="cortina-foco-txt" onClick={onAbrir}>
        <small>Ahora · {etapas.find((e) => e.id === etapaDe(t, etapas))?.nombre}{q ? ` · ● quieta ${q} días` : ''}</small>
        <b>{t.titulo}</b>
        {paso && <span>Paso: {paso} <em>({hechos}/{pasos.length})</em></span>}
      </button>
      {escribe && (paso
        ? <button type="button" className="btn btn-confirmar" onClick={onPaso}>✓ Paso hecho</button>
        : sig && <button type="button" className="btn btn-confirmar" onClick={(e) => onMover(t, sig.id, e)}>{sig.id === ult ? '✓ Ya la hice' : `Pasar a ${sig.nombre}`}</button>)}
    </div>
  );
}

function Item({ t, etapas, escribe, elegida, onAbrir, onMover }: {
  t: Tarjeta; etapas: Etapa[]; escribe: boolean; elegida: boolean; onAbrir: () => void;
  onMover: (t: Tarjeta, etapa: string, e?: { clientX: number; clientY: number }) => void;
}) {
  const et = etapaDe(t, etapas);
  const ant = siguienteEtapa(etapas, et, -1);
  const sig = siguienteEtapa(etapas, et, 1);
  const ult = etapas[etapas.length - 1].id;
  const prio = PRIORIDADES.find((p) => p.id === t.prioridad)!;
  const paso = !t.hecho ? pasoActual(t) : null;
  const pasos = t.pasos ?? [];
  const q = !t.hecho && estaQuieta(t) ? diasQuieta(t) : 0;
  return (
    <li className={`cortina-item p-${t.prioridad} ${t.hecho ? 'hecha' : ''} ${elegida ? 'elegida' : ''}`}>
      <button type="button" className="cortina-item-abrir" onClick={onAbrir}>
        <span className={`tb-prio ${t.prioridad}`} aria-label={`Prioridad ${prio.nombre}`}>{prio.icono}</span>
        <span className="cortina-item-txt">
          <b>{t.titulo}</b>
          {(paso || t.categoria || t.fecha || t.recordar_en || q > 0) && (
            <small>
              {paso && <span>Ahora: {paso} ({pasos.filter((p) => p.hecho).length}/{pasos.length})</span>}
              {t.categoria && <span>{t.categoria}</span>}
              {t.fecha && <span>📅 {fechaCorta(t.fecha)}</span>}
              {!t.hecho && t.recordar_en && <span>⏰ {cuandoCorto(t.recordar_en)}</span>}
              {q > 0 && <span className="tb-quieta">● quieta {q} días</span>}
            </small>
          )}
        </span>
      </button>
      {escribe && ant && (
        <button type="button" className="btn-icono cortina-mover" onClick={(e) => onMover(t, ant.id, e)} aria-label={`Volver a ${ant.nombre}`} title={`Volver a ${ant.nombre}`}>◀</button>
      )}
      {escribe && sig && (
        <button type="button" className={`btn-icono cortina-mover ${sig.id === ult ? 'terminar' : ''}`} onClick={(e) => onMover(t, sig.id, e)}
          aria-label={sig.id === ult ? 'Ya la hice' : `Pasar a ${sig.nombre}`} title={sig.id === ult ? 'Ya la hice' : `Pasar a ${sig.nombre}`}>{sig.id === ult ? '✓' : '▶'}</button>
      )}
    </li>
  );
}

/** Anotar al toque: escribir + Enter. Va arriba de la primera etapa; el detalle se completa después. */
function Anotar({ etapas, todas, enfocar }: { etapas: Etapa[]; todas: Map<string, Tarjeta[]>; enfocar: boolean }) {
  const [titulo, setTitulo] = useState('');
  const [prioridad, setPrioridad] = useState<NivelPrioridad>('media');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (enfocar) input.current?.focus({ preventScroll: true }); }, [enfocar]);
  const prio = PRIORIDADES.find((p) => p.id === prioridad)!;
  const otra = () => setPrioridad(PRIORIDADES[(PRIORIDADES.findIndex((p) => p.id === prioridad) + 1) % PRIORIDADES.length].id);

  async function anotar(e: FormEvent) {
    e.preventDefault();
    const txt = titulo.trim();
    if (!txt) { input.current?.focus(); return; }
    const etapa = etapas[0].id;
    await crear<Tarjeta>(TD.tareas, {
      id: uid(), titulo: txt, fecha: null, prioridad, etapa, hecho: false, origen: 'app', movida: hoy(),
      orden: ordenArriba(todas.get(etapa) ?? []), novedades: conNovedad(undefined, 'Anotada desde la cortina'),
    });
    setTitulo('');
    setPrioridad('media');
  }

  return (
    <form className="cortina-anotar" onSubmit={anotar}>
      <button type="button" className={`cortina-prio ${prioridad}`} onClick={otra} aria-label={`Prioridad ${prio.nombre}, tocá para cambiarla`} title="Cambiar prioridad">
        {prio.icono} <span>{prio.nombre}</span>
      </button>
      <input ref={input} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Anotá un pendiente o una idea…" aria-label="Pendiente o idea nueva" enterKeyHint="done" />
      <button type="submit" className="btn btn-primario">{Icono.mas}<span>Anotar</span></button>
    </form>
  );
}
