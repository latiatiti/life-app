/* Estadísticas de Progreso (2026-11-04): descanso contra rendimiento, fuerza por ejercicio y su historia,
 * y qué falta de la semana para medir la fuerza de todo. Va dentro de la pestaña Progreso (mapa de estructura). */
import { useState } from 'react';
import { fechaCorta, hoy } from '../../core/format';
import { Modal, Tarjeta } from '../../ui/ui';
import { Pct, type InfoNivel } from '../../ui/nivel';
import { inicioSemana } from './analisis';
import { Linea } from './Graficos';
import {
  caidas, conCuerpo, descansosRutina, fuerzaDe, historiaEjercicio, META_RETENCION, mmss, pesoPorFuerza, porTramo, type SugDescanso,
} from './fuerza';
import { baseDe, diasBase, guardarRutina, type DiaPlan, type Rutina, type Serie, type Sesion } from './modelo';

/** Escala para "cuánto sostenés de una serie a otra" (100 % = igual que la anterior; a RPE 8-9 perder hasta 5 % es normal). */
export const NIVELES_RETENCION: InfoNivel[] = [
  { id: 'critico', nombre: 'Se cae mucho', icono: '⚠', hasta: 85 },
  { id: 'mal', nombre: 'Se cae', icono: '▼', hasta: 90 },
  { id: 'regular', nombre: 'Algo de caída', icono: '●', hasta: META_RETENCION },
  { id: 'bien', nombre: 'Sostenés', icono: '✓', hasta: 101 },
  { id: 'muy', nombre: 'Sumás', icono: '◆', hasta: 106 },
  { id: 'epico', nombre: 'Épico', icono: '★', hasta: Infinity },
];

const kg = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');

/** Qué días de la rutina ya hiciste esta semana: con los tres, ya hay fuerza medida de cada ejercicio. */
export function FaltaSemana({ dias, sesiones, series }: { dias: DiaPlan[]; sesiones: Sesion[]; series: Serie[] }) {
  const lunes = inicioSemana(hoy());
  const hechos = new Set(sesiones.filter((s) => s.fecha >= lunes).map((s) => baseDe(s.dia, dias)));
  const base = diasBase(dias);
  const ejercicios = [...new Set(base.flatMap((d) => d.ejercicios.map((x) => x.nombre)))];
  const medidos = ejercicios.filter((n) => series.some((s) => s.ejercicio === n && s.tipo !== 'calentamiento'));
  const faltan = base.filter((d) => !hechos.has(d.id));
  return (
    <Tarjeta titulo="Tu fuerza, ejercicio por ejercicio">
      <div className="ent-semana-dias">
        {base.map((d) => <span key={d.id} className={hechos.has(d.id) ? 'on' : ''}>{hechos.has(d.id) ? '✓' : '○'} {d.id} · {d.nombre}</span>)}
      </div>
      <p className="nota" style={{ margin: '8px 0 0' }}>
        Medida en {medidos.length} de {ejercicios.length} ejercicios.{' '}
        {faltan.length
          ? `Falta esta semana: ${faltan.map((d) => `${d.id} (${d.nombre.toLowerCase()})`).join(' y ')}. Lo que todavía no hiciste arranca con un estimado corregido por lo que ya rendís; después del primer entreno, el peso sale de tu fuerza real.`
          : 'Semana completa: cada peso sugerido sale de tu fuerza real (1RM estimado) y se mueve con cada entreno.'}
        {' '}Tocá un ejercicio abajo para ver su historia.
      </p>
    </Tarjeta>
  );
}

/** Descanso contra rendimiento: cuánto sostenés de una serie a otra según lo que descansás, y qué descanso usar. */
export function TarjetaDescansos({ dias, series, pesoCorporal, fila }: { dias: DiaPlan[]; series: Serie[]; pesoCorporal: number; fila: Rutina | null }) {
  const sug = descansosRutina(dias, series, pesoCorporal).filter((s) => s.muestras > 0);
  if (!sug.length) return null;
  const plan = new Map<string, number>();
  for (const d of dias) for (const x of d.ejercicios) if (!plan.has(x.nombre)) plan.set(x.nombre, x.descanso);
  const cs = caidas(series, (n) => plan.get(n) ?? null, pesoCorporal);
  const tramos = porTramo(cs);
  const medidas = cs.filter((c) => c.real).length;
  const cambian = sug.filter((s) => s.sugerido !== s.plan);
  // Cuánto cambia el entreno: diferencia de descanso × (series − 1) de cada ejercicio.
  const series1 = (n: string) => Math.max(0, (dias.flatMap((d) => d.ejercicios).find((x) => x.nombre === n)?.series ?? 3) - 1);
  const difMin = Math.round(cambian.reduce((t, s) => t + (s.sugerido - s.plan) * series1(s.nombre), 0) / 60);

  async function aplicar() {
    const nuevo = new Map(sug.map((s) => [s.nombre, s.sugerido]));
    await guardarRutina(dias.map((d) => ({ ...d, ejercicios: d.ejercicios.map((x) => ({ ...x, descanso: nuevo.get(x.nombre) ?? x.descanso })) })), {}, fila);
  }

  return (
    <Tarjeta titulo="Descanso y rendimiento">
      <p className="nota" style={{ margin: '0 0 8px' }}>
        Cuánto sostenés de una serie a la siguiente (fuerza estimada con peso, reps y RPE). A RPE 8-9 perder hasta 5 % es normal;
        más que eso, el descanso no te alcanzó.
      </p>
      {tramos.length > 0 && <BarrasTramos tramos={tramos} />}
      <ul className="lista">
        {sug.map((s) => <FilaDescanso key={s.nombre} s={s} />)}
      </ul>
      <p className="nota" style={{ margin: '8px 0' }}>
        {medidas
          ? `${medidas} series con el descanso medido de verdad.`
          : 'Todavía no hay descansos medidos: estos entrenos se guardaron sin la hora de cada serie, así que se compara con el descanso del plan. Desde ahora el modo entrenando anota cuánto descansás realmente y la cuenta se afina sola.'}
      </p>
      {cambian.length > 0 && (
        <>
          <button className="btn btn-primario ancho" onClick={aplicar}>Usar estos descansos</button>
          <p className="nota" style={{ margin: '6px 0 0', textAlign: 'center' }}>
            {cambian.length} {cambian.length === 1 ? 'cambio' : 'cambios'} en la rutina · {difMin === 0 ? 'el entreno dura lo mismo' : `${difMin > 0 ? '+' : '−'}${Math.abs(difMin)} min por entreno`} · se puede deshacer
          </p>
        </>
      )}
    </Tarjeta>
  );
}

function FilaDescanso({ s }: { s: SugDescanso }) {
  const cambio = s.sugerido - s.plan;
  return (
    <li className="lista-item">
      <div className="crece">
        <strong>{s.nombre}</strong>
        <small className="nota">{s.motivo}{s.real != null ? ` Descansás ${mmss(s.real)} de verdad.` : ''}</small>
      </div>
      <Pct pct={s.retencion} niveles={NIVELES_RETENCION} />
      <span className="ent-desc">
        <b>{mmss(s.sugerido)}</b>
        <small>{cambio === 0 ? 'igual' : `${cambio > 0 ? '+' : '−'}${Math.abs(cambio)} s · era ${mmss(s.plan)}`}</small>
      </span>
    </li>
  );
}

/** Retención media por tramo de descanso, con la línea de la meta (95 %). */
function BarrasTramos({ tramos }: { tramos: Array<{ id: string; nombre: string; n: number; retencion: number }> }) {
  const w = 300, h = 120, base = h - 30, lo = 70, hi = 110;
  const y = (v: number) => base - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (base - 10);
  const gap = 10, bw = (w - gap * (tramos.length - 1)) / tramos.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Rendimiento que sostenés según el descanso" className="ent-barras">
      <line x1="0" x2={w} y1={y(META_RETENCION)} y2={y(META_RETENCION)} stroke="var(--n-bien, var(--good-text))" strokeDasharray="4 3" />
      <text x={w - 2} y={y(META_RETENCION) - 3} textAnchor="end" fontSize="8.5" fill="var(--ink-2)">meta {META_RETENCION} %</text>
      {tramos.map((t, i) => {
        const x = i * (bw + gap);
        const ok = t.retencion >= META_RETENCION;
        return (
          <g key={t.id}>
            <title>{`${t.nombre}: sostenés ${Math.round(t.retencion)} % (${t.n} series)`}</title>
            <rect x={x} y={y(t.retencion)} width={bw} height={base - y(t.retencion)} rx="3" fill={ok ? 'var(--accent)' : 'var(--surface-2)'} stroke={ok ? 'none' : 'var(--border)'} />
            <text x={x + bw / 2} y={y(t.retencion) - 4} textAnchor="middle" fontSize="9" fill="var(--ink-2)">{Math.round(t.retencion)} %</text>
            <text x={x + bw / 2} y={h - 16} textAnchor="middle" fontSize="8.5" fill="var(--muted)">{t.nombre}</text>
            <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize="8" fill="var(--muted)">{t.n} series</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Historia de un ejercicio: 1RM estimado, serie top, volumen y descanso por sesión, y la última sesión serie a serie. */
export function DetalleEjercicio({ nombre, dias, series, pesoCorporal, onCerrar }: { nombre: string | null; dias: DiaPlan[]; series: Serie[]; pesoCorporal: number; onCerrar: () => void }) {
  const [ver, setVer] = useState<'rm' | 'volumen'>('rm');
  const h = nombre ? historiaEjercicio(series, nombre, pesoCorporal) : [];
  const f = nombre ? fuerzaDe(series, nombre, pesoCorporal) : null;
  const ej = nombre ? dias.flatMap((d) => d.ejercicios).find((x) => x.nombre === nombre) : undefined;
  const trabajo = ej ? pesoPorFuerza(series, ej, pesoCorporal) : null;
  const ult = h[h.length - 1];
  const ultSeries = ult ? series.filter((s) => s.sesion_id === ult.sesion_id && s.ejercicio === nombre && s.tipo !== 'calentamiento').sort((a, b) => a.numero - b.numero) : [];
  return (
    <Modal titulo={nombre ?? ''} abierto={!!nombre} onCerrar={onCerrar}>
      {!h.length ? <p className="nota">Todavía no lo hiciste.</p> : (
        <div className="pila">
          <div className="ent-comp">
            <div><b>1RM estimado</b>{kg(f!.rm)} kg{f!.cambio != null && <small className={f!.cambio >= 0 ? 'ent-sube' : 'ent-baja'}> {f!.cambio >= 0 ? '▲' : '▼'} {Math.abs(Math.round(f!.cambio))} %</small>}</div>
            <div><b>Peso de trabajo</b>{trabajo && ej ? `${kg(trabajo.peso)} kg × ${trabajo.reps} @${ej.rpe}` : '—'}</div>
          </div>
          {h.length >= 2 && (
            <div>
              <div className="segmentado" style={{ marginBottom: 6 }}>
                <button type="button" className={ver === 'rm' ? 'activo' : ''} onClick={() => setVer('rm')}>1RM</button>
                <button type="button" className={ver === 'volumen' ? 'activo' : ''} onClick={() => setVer('volumen')}>Kilos movidos</button>
              </div>
              <Linea puntos={h.map((p) => (ver === 'rm' ? p.rm : p.volumen))} ancho={300} alto={60} />
            </div>
          )}
          <table className="ent-tabla">
            <thead><tr><th>Día</th><th>Top</th><th>Series</th><th>Kilos</th><th>1RM</th><th>Desc.</th></tr></thead>
            <tbody>
              {[...h].reverse().map((p) => (
                <tr key={p.sesion_id}>
                  <td>{fechaCorta(p.fecha)}</td>
                  <td>{kg(p.top.peso)}×{p.top.reps}{p.top.rpe ? ` @${p.top.rpe}` : ''}</td>
                  <td>{p.series} · {p.reps} reps</td>
                  <td>{Math.round(p.volumen).toLocaleString('es-AR')}</td>
                  <td>{Math.round(p.rm)}</td>
                  <td>{p.descanso != null ? mmss(p.descanso) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <span className="ev-etq">Última vez, serie a serie</span>
            <ul className="lista">
              {ultSeries.map((s, i) => {
                const prev = ultSeries[i - 1];
                const c = prev ? caidas([prev, s], () => ej?.descanso ?? null, pesoCorporal)[0] : null;
                return (
                  <li key={s.id} className="lista-item">
                    <span className="crece">Serie {i + 1}: {kg(Number(s.peso))} kg × {s.reps}{s.rpe ? ` @${s.rpe}` : ''}</span>
                    <small className="nota">{c ? (c.real ? `descansó ${mmss(c.descanso!)}` : `plan ${mmss(c.descanso ?? 0)}`) : ''}</small>
                    {c && <Pct pct={c.retencion} niveles={NIVELES_RETENCION} />}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="nota">1RM = el máximo que podrías levantar una vez, estimado de tu mejor serie contando las reps que te quedaban en reserva (RPE).{pesoCorporal && nombre && conCuerpo(nombre) ? ` Acá suma tu peso (${pesoCorporal} kg) al lastre.` : ''}</p>
        </div>
      )}
    </Modal>
  );
}
