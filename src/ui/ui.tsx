import { useEffect, useRef, type ReactNode } from 'react';
import type { NivelSenal } from '../core/types';

/* ---------- Íconos (trazo simple, heredan el color del texto) ---------- */

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const Icono = {
  inicio: svg(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>),
  economia: svg(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M16 15h2" /></>),
  pagos: svg(<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M9 15l2 2 4-4" /></>),
  ajustes: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>),
  entreno: svg(<><path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" /></>),
  stock: svg(<><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>),
  comida: svg(<><path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10" /><path d="M17 21V3c-2 1-3 4-3 7h3" /></>),
  menos: svg(<path d="M5 12h14" />),
  mas: svg(<path d="M12 5v14M5 12h14" />),
  cerrar: svg(<path d="M6 6l12 12M18 6L6 18" />),
  critico: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></>),
  aviso: svg(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>),
  ok: svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>),
  flechaIzq: svg(<path d="M15 5l-7 7 7 7" />),
  flechaDer: svg(<path d="M9 5l7 7-7 7" />),
  editar: svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /></>),
  borrar: svg(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
};

/* ---------- Bloques ---------- */

export function Tarjeta({ titulo, accion, children, className = '' }: {
  titulo?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`tarjeta ${className}`}>
      {(titulo || accion) && (
        <header className="tarjeta-cab">
          {titulo && <h2>{titulo}</h2>}
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Cifra({ etiqueta, valor, nota, tono }: {
  etiqueta: string; valor: ReactNode; nota?: ReactNode; tono?: 'bien' | 'mal';
}) {
  return (
    <div className="cifra">
      <span className="cifra-etq">{etiqueta}</span>
      <strong className={`cifra-val ${tono ?? ''}`}>{valor}</strong>
      {nota && <span className="cifra-nota">{nota}</span>}
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <p className="vacio-tit">{titulo}</p>
      {children}
    </div>
  );
}

const NOMBRE_NIVEL: Record<NivelSenal, string> = {
  critico: 'Urgente', aviso: 'Atención', info: 'Info', ok: 'Bien',
};

/** Estado siempre con ícono + texto, nunca solo color. */
export function Estado({ nivel, texto }: { nivel: NivelSenal; texto?: string }) {
  return (
    <span className={`estado estado-${nivel}`}>
      {Icono[nivel]}
      {texto ?? NOMBRE_NIVEL[nivel]}
    </span>
  );
}

/** Medidor de presupuesto: barra de uso con la marca del 100 %. */
export function Medidor({ uso, color }: { uso: number; color?: string }) {
  const nivel = uso >= 1 ? 'critico' : uso >= 0.8 ? 'aviso' : 'normal';
  const ancho = Math.min(uso, 1) * 100;
  return (
    <div className="medidor" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uso * 100)}>
      <div className={`medidor-barra medidor-${nivel}`}
        style={{ width: `${ancho}%`, background: nivel === 'normal' ? color : undefined }} />
    </div>
  );
}

export function Modal({ titulo, abierto, onCerrar, children }: {
  titulo: string; abierto: boolean; onCerrar: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} className="modal" onClose={onCerrar}
      onClick={(e) => { if (e.target === ref.current) onCerrar(); }}>
      <div className="modal-cuerpo">
        <header className="modal-cab">
          <h2>{titulo}</h2>
          <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar">{Icono.cerrar}</button>
        </header>
        {abierto && children}
      </div>
    </dialog>
  );
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

export function Pestanas<K extends string>({ opciones, valor, onCambio }: {
  opciones: Array<{ id: K; nombre: string }>; valor: K; onCambio: (k: K) => void;
}) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map((o) => (
        <button key={o.id} role="tab" aria-selected={valor === o.id}
          className={valor === o.id ? 'activa' : ''} onClick={() => onCambio(o.id)}>
          {o.nombre}
        </button>
      ))}
    </div>
  );
}
