import { useEffect, useRef } from 'react';
import { desdeISO, hoy, sumarDias } from '../core/format';

const LETRA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Tira de días tocable: se desliza con el dedo, marca hoy, el día elegido y con un punto los días
 * que tienen algo. La usan el Inicio y (más adelante) la sección Día / Calendario.
 */
export function Semana({ desde, cantidad = 14, elegido, onElegir, conAlgo }: {
  desde: string;
  cantidad?: number;
  elegido: string;
  onElegir: (dia: string) => void;
  /** Días (YYYY-MM-DD) que llevan el punto. */
  conAlgo?: Set<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dias = Array.from({ length: cantidad }, (_, i) => sumarDias(desde, i));
  const h = hoy();

  // Que el día elegido quede a la vista si la tira está corrida.
  useEffect(() => {
    const tira = ref.current;
    const b = tira?.querySelector<HTMLElement>('.elegido');
    if (!tira || !b) return;
    // Solo se corre la tira, nunca la página.
    if (b.offsetLeft < tira.scrollLeft || b.offsetLeft + b.offsetWidth > tira.scrollLeft + tira.clientWidth) {
      tira.scrollTo({ left: b.offsetLeft - 8, behavior: 'smooth' });
    }
  }, [elegido]);

  return (
    <div className="semana" ref={ref} role="group" aria-label="Elegí un día">
      {dias.map((d) => {
        const f = desdeISO(d);
        return (
          <button key={d} type="button" onClick={() => onElegir(d)} aria-pressed={d === elegido}
            className={`${d === h ? 'hoy' : ''} ${d === elegido ? 'elegido' : ''}`}>
            <small>{d === h ? 'Hoy' : LETRA[f.getDay()]}</small>
            <strong>{f.getDate()}</strong>
            <i className={conAlgo?.has(d) ? 'hay' : ''} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
