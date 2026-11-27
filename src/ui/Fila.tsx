import type { ReactNode } from 'react';
import './fila.css';

/* ===================================================================================
 * Fila de lista: la pieza base de todas las listas de LIFE (Sapires, tanda "Listas", 2026-11-27,
 * dirección A "Columnas" elegida por ella + ingresos en verde). Ver docs/piezas.md.
 *
 *   [ícono]  Título                 dato   ›
 *            detalle chico          sub
 *
 * Una sola superficie (`Lista`) con filas separadas por línea fina; el dato va en una columna fija
 * alineada a la derecha. El color de categoría va solo en el ícono; el estado, en el color del dato
 * (ingreso verde, atención naranja, urgente rojo) y siempre con palabra o signo.
 * =================================================================================== */

export type TonoFila = 'ingreso' | 'bien' | 'atencion' | 'urgente';

/** Íconos de línea fina (16 × 16) para filas. */
const TRAZOS = {
  ingreso: 'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10',
  gasto: 'M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10',
  transferencia: 'M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13',
  pago: 'M1.5 3.5h13v9h-13zM1.5 6.5h13',
  caja: 'M2 5 8 2l6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6',
  pesa: 'M5 8h6M3.5 5v6M12.5 5v6M1.5 6.5v3M14.5 6.5v3',
  punto: 'M6 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
} as const;
export type IconoFila = keyof typeof TRAZOS;

export function IcoFila({ icono = 'punto', color }: { icono?: IconoFila; color?: string | null }) {
  return (
    <span className="fl-ico" style={{ color: color || 'var(--texto-2)' }} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={TRAZOS[icono]} /></svg>
    </span>
  );
}

export function Lista({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <ul className={`fl-lista ${className}`}>{children}</ul>;
}

export function Fila({ icono, color, inicio, titulo, detalle, dato, datoSub, tono, hecha, onClick, accion }: {
  icono?: IconoFila;
  /** Color de la categoría: solo pinta el ícono. */
  color?: string | null;
  /** Reemplaza el ícono (foto, tilde, etc.). */
  inicio?: ReactNode;
  titulo: ReactNode;
  detalle?: ReactNode;
  dato?: ReactNode;
  datoSub?: ReactNode;
  tono?: TonoFila;
  hecha?: boolean;
  onClick?: () => void;
  /** Botón propio a la derecha (ej. "Pagar"); va en lugar de la flecha. */
  accion?: ReactNode;
}) {
  const cuerpo = (
    <>
      {inicio ?? <IcoFila icono={icono} color={color} />}
      <span className="fl-t"><b>{titulo}</b>{detalle && <span>{detalle}</span>}</span>
      {dato !== undefined && <span className={`fl-d${tono ? ` ${tono}` : ''}`}>{dato}{datoSub && <small>{datoSub}</small>}</span>}
    </>
  );
  return (
    <li className={`fl-fila${hecha ? ' hecha' : ''}${dato === undefined ? ' sin-dato' : ''}`}>
      {onClick ? (
        <button type="button" className="fl-boton" onClick={onClick}>{cuerpo}{!accion && <span className="fl-chev" aria-hidden="true">›</span>}</button>
      ) : <div className="fl-boton">{cuerpo}</div>}
      {accion && <span className="fl-accion">{accion}</span>}
    </li>
  );
}
