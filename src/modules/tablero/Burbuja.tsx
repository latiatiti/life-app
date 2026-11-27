import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { etapaDe, useConfigTablero, useTarjetas } from './modelo';
import { PantallaTablero } from './Tablero';
import './burbuja.css';

/**
 * Burbuja de pendientes (2026-11-27, pedido de ella): una viñetita que flota en cualquier pantalla.
 * - Se agarra y se arrastra a donde quieras (queda pegada al costado más cercano y se acuerda dónde la dejaste).
 * - Compu: al pasar el cursor se agranda y muestra lo primero que hay. Celu: sin hover, se toca.
 * - Tocarla / hacer clic despliega el Tablero completo encima de lo que estás viendo.
 */

const CLAVE = 'life.burbuja.pos';
const TAM = 56;
const MARGEN = 10;
/** Más de esto en píxeles ya es arrastrar, no tocar. */
const UMBRAL = 6;

type Pos = { lado: 'izq' | 'der'; y: number }; // y = 0..1 del alto disponible

function leerPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? '');
    if ((p?.lado === 'izq' || p?.lado === 'der') && typeof p.y === 'number') return { lado: p.lado, y: Math.min(1, Math.max(0, p.y)) };
  } catch { /* sin guardar */ }
  return { lado: 'der', y: 0.62 };
}
function guardarPos(p: Pos) { try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* privado */ } }

/** Hay algo encima (ventana, modo actividad, cortina): la burbuja se corre. */
const hayAlgoEncima = () => !!document.querySelector('dialog[open], .actividad, .cortina.abierta');

function aPixeles(p: Pos, w: number, h: number) {
  const arriba = MARGEN + 56; // debajo de la barra de arriba
  const abajo = h - TAM - MARGEN - (w <= 760 ? 84 : 0); // en el celu, arriba de la barra de abajo
  return { x: p.lado === 'izq' ? MARGEN : w - TAM - MARGEN, y: arriba + p.y * Math.max(0, abajo - arriba), arriba, abajo };
}

export function BurbujaPendientes({ ocultar }: { ocultar: boolean }) {
  const { filas } = useTarjetas();
  const { etapas } = useConfigTablero();
  const [pos, setPos] = useState<Pos>(leerPos);
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [tam, setTam] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const movio = useRef(false);

  useEffect(() => {
    const f = () => setTam({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  // Esc cierra; cambiar de pantalla (un link de adentro) también.
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setAbierto(false); };
    const ruta = () => setAbierto(false);
    window.addEventListener('keydown', tecla);
    window.addEventListener('hashchange', ruta);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('hashchange', ruta); };
  }, [abierto]);
  useEffect(() => { if (ocultar) setAbierto(false); }, [ocultar]);

  const sinTerminar = filas.filter((t) => !t.hecho);
  const altas = sinTerminar.filter((t) => t.prioridad === 'alta').length;
  const ult = etapas[etapas.length - 1]?.id;
  // Lo primero: en proceso o alta, después el resto (igual que "Ahora" en la cortina).
  const primeras = [...sinTerminar]
    .sort((a, b) => peso(b) - peso(a))
    .slice(0, 3);
  function peso(t: (typeof filas)[number]) {
    const et = etapaDe(t, etapas);
    return (t.prioridad === 'alta' ? 2 : t.prioridad === 'media' ? 1 : 0) + (et !== etapas[0]?.id && et !== ult ? 3 : 0);
  }

  const base = aPixeles(pos, tam.w, tam.h);
  const x = arrastre?.x ?? base.x;
  const y = arrastre?.y ?? base.y;

  function agarrar(e0: ReactPointerEvent<HTMLButtonElement>) {
    if (e0.button !== 0) return;
    const el = e0.currentTarget;
    el.setPointerCapture?.(e0.pointerId);
    const dx = e0.clientX - x, dy = e0.clientY - y;
    const x0 = e0.clientX, y0 = e0.clientY;
    movio.current = false;
    const mov = (e: PointerEvent) => {
      if (!movio.current && Math.hypot(e.clientX - x0, e.clientY - y0) < UMBRAL) return;
      movio.current = true;
      setArrastre({
        x: Math.min(tam.w - TAM - 4, Math.max(4, e.clientX - dx)),
        y: Math.min(tam.h - TAM - 4, Math.max(4, e.clientY - dy)),
      });
    };
    const fin = (e: PointerEvent) => {
      el.removeEventListener('pointermove', mov);
      el.removeEventListener('pointerup', fin);
      el.removeEventListener('pointercancel', fin);
      if (!movio.current) return;
      // Queda pegada al costado más cercano, a la altura donde la soltaste.
      const cx = e.clientX - dx + TAM / 2;
      const { arriba, abajo } = aPixeles(pos, tam.w, tam.h);
      const yy = Math.min(abajo, Math.max(arriba, e.clientY - dy));
      const nueva: Pos = { lado: cx < tam.w / 2 ? 'izq' : 'der', y: abajo > arriba ? (yy - arriba) / (abajo - arriba) : 0 };
      setPos(nueva);
      guardarPos(nueva);
      setArrastre(null);
    };
    el.addEventListener('pointermove', mov);
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
  }

  function tocar() {
    if (movio.current) { movio.current = false; return; } // venía de arrastrar
    if (hayAlgoEncima()) return;
    setAbierto(true);
  }

  if (ocultar && !abierto) return null;

  return (
    <>
      {!abierto && (
        <div className={`burbuja ${pos.lado} ${arrastre ? 'arrastrando' : ''} ${altas ? 'con-alta' : ''}`}
          style={{ transform: `translate(${x}px, ${y}px)` }}>
          <button type="button" className="burbuja-boton" onPointerDown={agarrar} onClick={tocar}
            aria-label={`Abrir pendientes: ${sinTerminar.length} sin terminar${altas ? `, ${altas} de prioridad alta` : ''}. Se puede arrastrar.`}
            title="Pendientes (arrastrala para moverla)">
            <span className="burbuja-icono" aria-hidden="true">
              <i /><i /><i />
            </span>
            <b className="burbuja-num">{sinTerminar.length}</b>
          </button>
          {/* Compu: al pasar el cursor se agranda y muestra lo primero */}
          <div className="burbuja-vista" aria-hidden="true">
            <div className="burbuja-vista-cab">
              <span>Pendientes</span>
              <b>{sinTerminar.length}</b>
              {altas > 0 && <em>{altas} alta{altas === 1 ? '' : 's'}</em>}
            </div>
            {primeras.length ? (
              <ul>
                {primeras.map((t) => <li key={t.id} className={`p-${t.prioridad ?? 'media'}`}>{t.titulo}</li>)}
              </ul>
            ) : <p>Nada pendiente. ✓</p>}
            <small>Clic para ver el tablero · arrastrala para moverla</small>
          </div>
        </div>
      )}

      {abierto && (
        <>
          <div className="burbuja-fondo" onClick={() => setAbierto(false)} aria-hidden="true" />
          <section className="burbuja-panel" role="dialog" aria-modal="false" aria-label="Tablero de pendientes">
            <header className="burbuja-panel-cab">
              <b>Pendientes</b>
              <span>{sinTerminar.length} sin terminar{altas ? ` · ${altas} alta${altas === 1 ? '' : 's'}` : ''}</span>
              <a href="#/tablero" className="btn chico">Ir al Tablero</a>
              <button type="button" className="btn-icono" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
            </header>
            <div className="burbuja-panel-cuerpo">
              <PantallaTablero />
            </div>
          </section>
        </>
      )}
    </>
  );
}
