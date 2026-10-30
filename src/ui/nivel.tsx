import { useEffect, useRef, type ReactNode } from 'react';

/* ---------- Escala de rendimiento (toda la app) ----------
 * Un porcentaje contra lo esperado (100 % = justo lo que tocaba) toma un nivel con color, palabra e ícono.
 * Cuanto mejor, más brilla: verde → azul → morado. Para abajo: naranja → rojo → rojo que parpadea.
 * Colores en tema.css (--n-*), piezas en styles.css (.nv, .medidor). Ver DISENO.md, "Escala de rendimiento". */

export type Nivel = 'critico' | 'mal' | 'regular' | 'bien' | 'muy' | 'epico';

export interface InfoNivel { id: Nivel; nombre: string; icono: string; hasta: number }

/** Límites por defecto (el % que deja de ser ese nivel). Cada módulo puede pasar los suyos. */
export const NIVELES: InfoNivel[] = [
  { id: 'critico', nombre: 'Muy mal', icono: '⚠', hasta: 75 },
  { id: 'mal', nombre: 'Mal', icono: '▼', hasta: 90 },
  { id: 'regular', nombre: 'Regular', icono: '●', hasta: 97 },
  { id: 'bien', nombre: 'Bien', icono: '✓', hasta: 105 },
  { id: 'muy', nombre: 'Muy bien', icono: '◆', hasta: 115 },
  { id: 'epico', nombre: 'Épico', icono: '★', hasta: Infinity },
];

export function nivelDe(pct: number, niveles = NIVELES): InfoNivel {
  return niveles.find((n) => pct < n.hasta) ?? niveles[niveles.length - 1];
}

/** Hace "saltar" un elemento cuando cambia su valor (número que sube, nivel que cambia). */
export function useSalto<T extends HTMLElement>(valor: unknown) {
  const ref = useRef<T>(null);
  const antes = useRef(valor);
  useEffect(() => {
    const el = ref.current;
    if (!el || antes.current === valor) return;
    antes.current = valor;
    el.classList.remove('salta');
    void el.offsetWidth;
    el.classList.add('salta');
  }, [valor]);
  return ref;
}

/** Porcentaje chico con su color y su ícono, para filas y tablas. */
export function Pct({ pct, niveles }: { pct: number | null; niveles?: InfoNivel[] }) {
  if (pct == null) return null;
  const n = nivelDe(pct, niveles);
  return <span className="nv pct-chico" data-n={n.id} title={n.nombre}>{n.icono} {Math.round(pct)} %</span>;
}

/**
 * Medidor de rendimiento: el % grande con brillo, el nombre del nivel y una línea de qué hacer.
 * Si se le pasa onClick queda como botón (abre el detalle).
 */
export function Medidor({ pct, texto, vacio, onClick, niveles }: {
  pct: number | null;
  texto?: ReactNode;
  /** Lo que se muestra cuando todavía no hay con qué comparar. */
  vacio?: ReactNode;
  onClick?: () => void;
  niveles?: InfoNivel[];
}) {
  const n = pct == null ? null : nivelDe(pct, niveles);
  const ref = useSalto<HTMLSpanElement>(pct == null ? null : Math.round(pct));
  const cont = (
    <>
      <span className="medidor-pct" ref={ref}>{pct == null ? '—' : `${Math.round(pct)} %`}</span>
      <span className="medidor-texto">
        <span className="medidor-nombre">{n ? `${n.icono} ${n.nombre}` : 'Sin comparar'}</span>
        {n ? texto : vacio}
      </span>
      {onClick && <span className="medidor-flecha" aria-hidden="true">›</span>}
    </>
  );
  const props = { className: 'medidor nv', 'data-n': n?.id ?? 'vacio' };
  return onClick
    ? <button type="button" {...props} onClick={onClick}>{cont}</button>
    : <div {...props}>{cont}</div>;
}
