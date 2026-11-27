import { useEffect, useState } from 'react';
import './linea-dia.css';

/* ===================================================================================
 * Línea del día (riel): pieza compartida de LIFE (Sapires, 2026-11-27, boceto "Riel del día v2").
 * Tarjeta "Ahora" con lo que falta en grande + riel vertical con hora a la izquierda, nodo con estado
 * (pasado / ahora / próximo) y columna derecha alineada (dura / falta / ✓). Los huecos de 30 min o más
 * aparecen como "Libre". Colores de tipo = tokens --t-* de tema.css; el acento solo para lo de ahora.
 * Pensada para reusar en el Día, Mi día del Inicio y la Cortina.
 * =================================================================================== */

export type TipoLinea = 'descanso' | 'casa' | 'fabrica' | 'reparto' | 'gym' | 'comida' | 'traslado' | 'libre' | 'otro';
export interface BloqueLinea { inicio: string; fin: string; titulo: string; tipo: TipoLinea; opcional?: boolean }

const aMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hh = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
export function duracion(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h} h ${r}` : h ? `${h} h` : `${r} min`;
}

/** Íconos de línea fina (16 × 16), uno por tipo de bloque. */
const TRAZOS: Record<TipoLinea, string> = {
  descanso: 'M11.5 9.5A5 5 0 0 1 6.5 3a5 5 0 1 0 5 6.5z',
  casa: 'M2.5 7.5 8 3l5.5 4.5V13h-11zM6.5 13V9.5h3V13',
  fabrica: 'M1.5 13.5V7l4 2.5V7l4 2.5V3.5h3v10zM4 11.5h1.5M8 11.5h1.5',
  reparto: 'M1.5 4h8v7h-8zM9.5 6.5h3l2 2.5V11h-5M3.2 12.3a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0M10.7 12.3a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0',
  gym: 'M5 8h6M3.5 5v6M12.5 5v6M1.5 6.5v3M14.5 6.5v3',
  comida: 'M4.5 2v12M3 2v3.5a1.5 1.5 0 0 0 3 0V2M11 14V2c-1.7.8-2.5 2.6-2.5 5H11',
  traslado: 'M2 8h10M9 5l3 3-3 3M14 3v10',
  libre: 'M3 13c0-5 3.5-8.5 10-10-1 6.5-4.5 10-10 10zM3 13 8 8',
  otro: 'M8 2.5v6M8 11.5v.5M3 13.5h10L8 2.5z',
};
export function IcoTipo({ tipo }: { tipo: TipoLinea }) {
  return (
    <span className="ld-ico" style={{ color: `var(--t-${tipo})` }} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={TRAZOS[tipo] ?? TRAZOS.otro} /></svg>
    </span>
  );
}

/** Minutos de ahora, al día (se actualiza cada 30 s). */
export function useAhoraMin(): number {
  const calc = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [m, setM] = useState(calc);
  useEffect(() => { const t = window.setInterval(() => setM(calc()), 30_000); return () => window.clearInterval(t); }, []);
  return m;
}

interface Tramo { i: number; f: number; titulo: string; tipo: TipoLinea; opcional: boolean; hueco: boolean }
function tramos(bloques: BloqueLinea[]): Tramo[] {
  const bs = bloques.map((b) => ({ i: aMin(b.inicio), f: aMin(b.fin), titulo: b.titulo, tipo: b.tipo, opcional: !!b.opcional, hueco: false }))
    .filter((b) => b.f > b.i).sort((a, b) => a.i - b.i);
  const out: Tramo[] = [];
  bs.forEach((b, k) => {
    const prev = bs[k - 1];
    if (prev && b.i - prev.f >= 30) out.push({ i: prev.f, f: b.i, titulo: 'Libre', tipo: 'libre', opcional: false, hueco: true });
    out.push(b);
  });
  return out;
}
const estado = (t: Tramo, a: number) => (a >= t.f ? 'pasado' : a >= t.i ? 'ahora' : 'futuro');

/** Tarjeta "Ahora": qué estás haciendo, lo que falta en grande, avance y qué sigue. */
export function AhoraDia({ bloques, ahora }: { bloques: BloqueLinea[]; ahora?: number }) {
  const vivo = useAhoraMin();
  const a = ahora ?? vivo;
  const ts = tramos(bloques);
  const act = ts.find((t) => !t.hueco && estado(t, a) === 'ahora') ?? ts.find((t) => estado(t, a) === 'ahora');
  const prox = ts.find((t) => !t.hueco && t !== act && t.i >= (act ? act.f : a));
  if (!act) {
    return (
      <div className="ld-ahora nada">
        <div className="ld-que">
          <span className="ld-etq">Ahora</span>
          <b>Nada fijo</b>
          <span>{prox ? `${prox.titulo} arranca a las ${hh(prox.i)} · en ${duracion(prox.i - a)}` : 'Ya terminó lo fijo del día'}</span>
        </div>
      </div>
    );
  }
  const falta = act.f - a, h = Math.floor(falta / 60), m = falta % 60;
  return (
    <div className="ld-ahora" role="status">
      <div className="ld-que">
        <span className="ld-etq">Ahora</span>
        <b><IcoTipo tipo={act.tipo} /> {act.hueco ? 'Tiempo libre' : act.titulo}</b>
        <span>{hh(act.i)} → {hh(act.f)}</span>
      </div>
      <div className="ld-falta" aria-label={`Falta ${duracion(falta)}`}>
        <span className="ld-etq gris">Falta</span>
        <span className="ld-n">{h ? <>{h}<small>h</small> {String(m).padStart(2, '0')}<small>m</small></> : <>{m}<small>min</small></>}</span>
      </div>
      <div className="ld-prog"><i style={{ width: `${((a - act.i) / (act.f - act.i)) * 100}%` }} /></div>
      {prox && <div className="ld-prox"><span>Después: <b>{prox.titulo}</b></span><span>{hh(prox.i)}</span></div>}
    </div>
  );
}

/** Riel vertical del día. */
export function RielDia({ bloques, ahora }: { bloques: BloqueLinea[]; ahora?: number }) {
  const vivo = useAhoraMin();
  const a = ahora ?? vivo;
  return (
    <ul className="ld-riel">
      {tramos(bloques).map((t) => {
        const e = estado(t, a);
        return (
          <li key={`${t.i}-${t.titulo}`} className={`${e}${t.hueco ? ' hueco' : ''}`}>
            <span className="ld-h">{hh(t.i)}</span>
            <span className="ld-eje"><i /></span>
            <div className="ld-tj">
              <IcoTipo tipo={t.tipo} />
              <span className="ld-t">
                <b>{t.titulo}{t.opcional && <span className="ld-tag">si se da</span>}</b>
                {!t.hueco && <span>hasta {hh(t.f)}</span>}
              </span>
              <span className="ld-d">{e === 'ahora' ? <><small>falta</small>{duracion(t.f - a)}</> : e === 'pasado' ? '✓' : duracion(t.f - t.i)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
