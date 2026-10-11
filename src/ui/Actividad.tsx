import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MODULOS } from '../core/registry';
import { useRuta } from '../core/router';
import type { ActividadEnCurso } from '../core/types';
import { Icono } from './ui';

/* ---------- Aviso de cambios ----------
 * Las actividades guardan su estado en localStorage. Cuando una lo cambia (minimizar, volver, terminar)
 * llama a avisarCambio() y la barra y las pantallas que escuchan con useCambios() se vuelven a dibujar. */

let version = 0;
const oyentes = new Set<() => void>();
export function avisarCambio() {
  version++;
  oyentes.forEach((f) => f());
}
export function useCambios() {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => version);
}

const icoMinimizar = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
);
export const icoConfirmar = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
);

/**
 * Modo actividad: una capa a pantalla completa, encima de todo (también del menú), para hacer
 * una cosa por vez con el pulgar. Arriba: salir, de qué se trata y el progreso. En el medio: el paso
 * actual. Abajo, fijo: los botones (el de confirmar, verde y grande). En la compu queda centrado.
 *
 * Para una pregunta o un dato raro se usa el Modal de siempre, que en el celular sube desde abajo.
 */
export function ModoActividad({ etiqueta, titulo, total, hechos, derecha, onSalir, onMinimizar, pie, children }: {
  etiqueta: string;
  titulo: ReactNode;
  /** Pasos totales y hechos, para la barra de progreso. */
  total?: number;
  hechos?: number;
  /** Algo chico a la derecha del título (XP, un tiempo). */
  derecha?: ReactNode;
  onSalir: () => void;
  onMinimizar?: () => void;
  /** Botones de abajo. */
  pie?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.add('con-actividad');
    return () => document.documentElement.classList.remove('con-actividad');
  }, []);

  const segmentos = total && total <= 12;
  return createPortal(
    <div className="actividad" role="dialog" aria-modal="true" aria-label={etiqueta}>
      <header className="actividad-cab">
        <div className="actividad-ancho">
          <div className="actividad-fila">
            <button className="actividad-boton" onClick={onSalir} aria-label="Salir">{Icono.cerrar}</button>
            <div className="crece">
              <span className="actividad-etq">{etiqueta}</span>
              <strong className="actividad-tit">{titulo}</strong>
            </div>
            {derecha}
            {onMinimizar && <button className="actividad-boton" onClick={onMinimizar} aria-label="Minimizar">{icoMinimizar}</button>}
          </div>
          {total != null && total > 0 && (segmentos ? (
            <div className="actividad-pasos" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={i < (hechos ?? 0) ? 'hecho' : i === (hechos ?? 0) ? 'actual' : ''} />
              ))}
            </div>
          ) : (
            <div className="actividad-progreso" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos ?? 0}>
              <span style={{ width: `${((hechos ?? 0) / total) * 100}%` }} />
            </div>
          ))}
        </div>
      </header>
      <main className="actividad-cuerpo">
        <div className="actividad-ancho pila">{children}</div>
      </main>
      {pie && (
        <footer className="actividad-pie">
          <div className="actividad-ancho actividad-botones">{pie}</div>
        </footer>
      )}
    </div>,
    document.body
  );
}

/** Lo que está a medias en todos los módulos (se lee de localStorage, sin hooks). */
function leerEnCurso(): ActividadEnCurso[] {
  const out: ActividadEnCurso[] = [];
  for (const m of MODULOS) {
    try {
      const a = m.enCurso?.();
      if (a) out.push(a);
    } catch { /* un módulo con datos viejos no rompe la barra */ }
  }
  return out;
}

/**
 * Barra de actividad: si dejaste algo a medias (o lo minimizaste), queda flotando arriba del menú
 * en el celular y abajo a la derecha en la compu, con "Volver" para seguir.
 */
export function BarraActividad() {
  const ruta = useRuta();
  useCambios();
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const aqui = `#/${ruta}`;
  const visibles = leerEnCurso().filter((a) => a.minimizada || aqui !== a.ruta);
  if (!visibles.length) return null;

  return (
    <div className="barra-actividad" aria-label="Actividades en curso">
      {visibles.map((a) => (
        <a key={a.id} href={a.ruta} className="barra-actividad-item"
          onClick={() => { a.volver?.(); avisarCambio(); }}>
          <span className="barra-actividad-punto" aria-hidden="true" />
          <span className="crece">
            <strong>{a.titulo}</strong>
            {a.detalle && <small>{a.detalle}</small>}
          </span>
          <span className="barra-actividad-volver">Volver</span>
        </a>
      ))}
    </div>
  );
}

/** Para que la app sepa si tiene que dejar lugar abajo para la barra. */
export function useHayBarra() {
  const ruta = useRuta();
  useCambios();
  const aqui = `#/${ruta}`;
  return leerEnCurso().some((a) => a.minimizada || aqui !== a.ruta);
}
