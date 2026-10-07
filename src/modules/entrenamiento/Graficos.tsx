import { fechaCorta } from '../../core/format';
import { GRUPOS, type Grupo } from './biblioteca';
import { rangoSeries } from './analisis';

/** Mini gráfico de línea (por ejemplo, la marca estimada por sesión). */
export function Linea({ puntos, ancho = 120, alto = 32 }: { puntos: number[]; ancho?: number; alto?: number }) {
  if (puntos.length < 2) return null;
  const min = Math.min(...puntos), max = Math.max(...puntos);
  const xy = puntos.map((p, i) => `${(i / (puntos.length - 1)) * (ancho - 4) + 2},${alto - ((p - min) / (max - min || 1)) * (alto - 6) - 3}`);
  const ult = xy[xy.length - 1].split(',');
  return (
    <svg width={ancho} height={alto} aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points={xy.join(' ')} fill="none" stroke="var(--xp)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ult[0]} cy={ult[1]} r="3" fill="var(--xp)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/**
 * Series efectivas por grupo muscular: esta semana (violeta) contra la pasada (gris),
 * con la franja del rango recomendado detrás.
 */
export function VolumenGrupos({ esta, pasada }: { esta: Record<Grupo, number>; pasada: Record<Grupo, number> }) {
  const grupos = GRUPOS.filter((g) => esta[g.id] > 0 || pasada[g.id] > 0);
  if (!grupos.length) return <p className="nota">Todavía no hay series en estas dos semanas.</p>;
  const tope = Math.max(22, ...grupos.map((g) => Math.max(esta[g.id], pasada[g.id])));
  const x = (v: number) => `${(v / tope) * 100}%`;
  return (
    <div className="ent-vol">
      <div className="ent-leyenda">
        <span><i style={{ background: 'var(--accent)' }} /> Esta semana</span>
        <span><i style={{ background: 'var(--muted)' }} /> Semana pasada</span>
        <span><i className="ent-franja-muestra" /> Rango para ganar masa</span>
      </div>
      {grupos.map((g) => {
        const [lo, hi] = rangoSeries(g.id);
        const v = esta[g.id], p = pasada[g.id];
        const estado = v >= lo && v <= hi ? 'en rango' : v < lo ? `faltan ${Math.ceil(lo - v)}` : 'pasado del rango';
        return (
          <div key={g.id} className="ent-vol-fila" title={`${g.nombre}: ${v} series esta semana, ${p} la pasada. Rango ${lo}–${hi} (${estado}).`}>
            <span className="ent-vol-etq">{g.nombre}</span>
            <div className="ent-vol-pista">
              <div className="ent-franja" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
              <div className="ent-barra gris" style={{ width: x(p) }} />
              <div className="ent-barra" style={{ width: x(v) }} />
            </div>
            <span className="ent-vol-num">{fmt(v)}<small>/{lo}–{hi}</small></span>
          </div>
        );
      })}
    </div>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Barras por semana de una medida (tonelaje, series, carga). La semana actual va resaltada. */
export function BarrasSemanas({ datos, unidad }: { datos: Array<{ lunes: string; valor: number }>; unidad: string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const w = 300, h = 110, base = h - 18, gap = 6;
  const bw = (w - gap * (datos.length - 1)) / datos.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`Por semana, en ${unidad}`} className="ent-barras">
      <line x1="0" x2={w} y1={base + 0.5} y2={base + 0.5} stroke="var(--line)" />
      {datos.map((d, i) => {
        const alto = (d.valor / max) * (base - 14);
        const xx = i * (bw + gap);
        const actual = i === datos.length - 1;
        return (
          <g key={d.lunes}>
            <title>{`Semana del ${fechaCorta(d.lunes)}: ${Math.round(d.valor).toLocaleString('es-AR')} ${unidad}`}</title>
            <rect x={xx} y={0} width={bw} height={h} fill="transparent" />
            {d.valor > 0 && <path d={barra(xx, base, bw, alto)} fill={actual ? 'var(--accent)' : 'var(--surface-2)'} stroke={actual ? 'none' : 'var(--border)'} />}
            {(actual || i === datos.length - 2) && d.valor > 0 && (
              <text x={xx + bw / 2} y={base - alto - 4} textAnchor="middle" fontSize="9" fill="var(--ink-2)">{abreviar(d.valor)}</text>
            )}
            <text x={xx + bw / 2} y={h - 4} textAnchor="middle" fontSize="8.5" fill="var(--muted)">{fechaCorta(d.lunes)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barra con las esquinas de arriba redondeadas y la base recta. */
function barra(x: number, base: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + w - r} Q${x + w},${base - h} ${x + w},${base - h + r} V${base} Z`;
}

const abreviar = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(n)));
