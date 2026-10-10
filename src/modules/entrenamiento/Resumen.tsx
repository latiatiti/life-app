import { fechaLarga } from '../../core/format';
import { Tarjeta } from '../../ui/ui';
import { evaluarPreparacion, nombreGrupo, pct, resumirSesion } from './analisis';
import { GRUPOS } from './biblioteca';
import { pesoSugerido, useRutina, useSeries, type Serie, type Sesion } from './modelo';

const kg = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-AR')} kg`;

export function Delta({ actual, previo, sufijo = '%' }: { actual: number; previo: number; sufijo?: string }) {
  const d = pct(actual, previo);
  if (d == null) return null;
  const r = Math.round(d);
  if (r === 0) return <span className="nota"> = igual</span>;
  return <span className={r > 0 ? 'ent-sube' : 'ent-baja'}> {r > 0 ? '▲' : '▼'} {Math.abs(r)}{sufijo}</span>;
}

export const chipsSeries = (xs: Serie[]) => (
  <div className="ent-series">
    {xs.map((s) => (
      <span key={s.id} className={s.tipo === 'calentamiento' ? 'cal' : ''}>
        {Number(s.peso)}×{s.reps}{s.rpe ? ` @${s.rpe}` : ''}
      </span>
    ))}
  </div>
);

const SENSACION: Record<number, string> = { 3: 'Muy mal', 5: 'Flojo', 6: 'Regular', 7: 'Bien', 8: 'Muy bien', 9: 'Excelente', 10: 'Increíble' };
const sentir = (n: number) => SENSACION[n] ?? (n >= 8 ? 'Muy bien' : n >= 6 ? 'Bien' : 'Flojo');

/** Barra que sale del centro: a la derecha (verde) si mejoró, a la izquierda (rojo) si bajó. Tope visual ±15 %. */
function BarraCambio({ d }: { d: number }) {
  const ancho = Math.min(50, (Math.abs(d) / 15) * 50);
  return (
    <div className="ent-mejora-barra" aria-hidden="true">
      <span className={d >= 0 ? 'sube' : 'baja'} style={d >= 0 ? { left: '50%', width: `${ancho}%` } : { right: '50%', width: `${ancho}%` }} />
    </div>
  );
}

/** Resultado de un entreno: lo principal arriba (duración, cómo te sentiste, qué mejoró y qué bajó) y el detalle para abrir. */
export function ResumenEntreno({ sesion }: { sesion: Sesion }) {
  const { filas: series } = useSeries();
  const { dias, perfil } = useRutina();
  const r = resumirSesion(sesion, series);
  const plan = dias.find((d) => d.id === sesion.dia);
  const prep = evaluarPreparacion(sesion);
  const grupos = GRUPOS.filter((g) => r.porGrupo[g.id] > 0);

  // Cambio de fuerza estimada (1RM) de cada ejercicio contra la vez anterior.
  const cambios = r.ejercicios
    .map((x) => ({ x, d: x.previo ? pct(x.mejor, x.previo.mejor) : null }))
    .filter((c): c is { x: typeof c.x; d: number } => c.d != null)
    .sort((a, b) => b.d - a.d);
  const nuevos = r.ejercicios.filter((x) => !x.previo);
  const mejoras = cambios.filter((c) => Math.round(c.d) >= 2);
  const bajas = cambios.filter((c) => Math.round(c.d) <= -2).reverse(); // la que más bajó primero
  const titular = mejoras.length || bajas.length
    ? [mejoras.length ? `Mejoraste en ${mejoras.slice(0, 2).map((c) => c.x.nombre).join(' y ')}` : '',
       bajas.length ? `${mejoras.length ? 'bajaste' : 'Bajaste'} en ${bajas.slice(0, 2).map((c) => c.x.nombre).join(' y ')}` : ''].filter(Boolean).join(', ') + '.'
    : cambios.length ? 'Mantuviste la fuerza en todo: igual que la vez anterior.' : 'Primera vez con estos ejercicios: esto queda como tu punto de partida.';
  const proximas = r.ejercicios
    .map((x) => { const ej = plan?.ejercicios.find((p) => p.nombre === x.nombre); return { x, prox: ej ? pesoSugerido(series, ej, perfil) : null }; })
    .filter((p) => p.prox?.peso != null);

  return (
    <div className="pila">
      <p className="nota" style={{ margin: 0 }}>
        {fechaLarga(sesion.fecha)} · {plan ? `Día ${plan.id} · ${plan.nombre}` : sesion.dia_nombre ?? sesion.deporte}
      </p>

      <div className="ent-objetivos ent-resumen-top">
        <div className="ent-obj"><span className="ent-obj-etq">Duración</span><strong className="ent-obj-val">{sesion.duracion_min ?? '—'}<small> min</small></strong><span className="ent-obj-nota">{r.series} series</span></div>
        <div className="ent-obj"><span className="ent-obj-etq">Cómo te sentiste</span><strong className="ent-obj-val">{sesion.sensacion ? `${sesion.sensacion}/10` : '—'}</strong><span className="ent-obj-nota">{sesion.sensacion ? sentir(sesion.sensacion) : ''}</span></div>
        <div className="ent-obj"><span className="ent-obj-etq">Esfuerzo</span><strong className="ent-obj-val">{sesion.rpe_sesion ?? (r.rpeMedio != null ? r.rpeMedio.toFixed(1).replace('.', ',') : '—')}<small>/10</small></strong><span className="ent-obj-nota">{sesion.rpe_sesion ? 'de la sesión' : 'promedio'}</span></div>
      </div>
      {prep && <p className="nota" style={{ margin: 0 }}>Llegaste {prep.nivel === 'bien' ? 'bien' : prep.nivel === 'medio' ? 'regular' : 'cansada'}: dormiste {sesion.sueno_h ?? '—'} h, energía {sesion.energia ?? '—'}/5, dolor {sesion.agujetas ?? '—'}/5.</p>}
      {sesion.notas && <p className="ent-resumen-notas">“{sesion.notas}”</p>}

      <Tarjeta titulo="Cómo te fue en cada ejercicio">
        <p className="ent-resumen-titular">{titular}</p>
        {r.records > 0 && <p className="ent-record" style={{ margin: '0 0 8px' }}>🏆 {r.records === 1 ? '1 récord nuevo' : `${r.records} récords nuevos`}</p>}
        {cambios.length > 0 && (
          <div className="ent-mejoras">
            {cambios.map(({ x, d }) => (
              <div key={x.nombre} className="ent-mejora">
                <span className="ent-mejora-nombre">{x.record ? '🏆 ' : ''}{x.nombre}</span>
                <BarraCambio d={d} />
                <span className={`ent-mejora-num ${Math.round(d) > 0 ? 'ent-sube' : Math.round(d) < 0 ? 'ent-baja' : 'nota'}`}>{Math.round(d) === 0 ? '=' : `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))} %`}</span>
              </div>
            ))}
          </div>
        )}
        {nuevos.length > 0 && <p className="nota" style={{ margin: '8px 0 0' }}>Primera vez: {nuevos.map((x) => x.nombre).join(', ')}.</p>}
        <p className="nota" style={{ margin: '8px 0 0', fontSize: '0.78rem' }}>Comparado con la última vez que hiciste cada ejercicio, según la fuerza estimada de tu mejor serie (peso y reps).</p>
      </Tarjeta>

      {proximas.length > 0 && (
        <Tarjeta titulo="Para la próxima">
          <ul className="ent-proximas">
            {proximas.map(({ x, prox }) => <li key={x.nombre}><span>{x.nombre}</span><strong>{prox!.peso} kg</strong></li>)}
          </ul>
        </Tarjeta>
      )}

      <details className="ent-detalle">
        <summary>Ver el detalle completo</summary>
        <div className="pila" style={{ marginTop: 10 }}>
          <div className="grilla-cifras compacta">
            <div className="cifra"><span className="cifra-etq">Repeticiones</span><strong className="cifra-val">{r.reps}</strong></div>
            <div className="cifra"><span className="cifra-etq">Tonelaje</span><strong className="cifra-val">{kg(r.tonelaje)}</strong><span className="cifra-nota">peso × reps</span></div>
            {r.carga && <div className="cifra"><span className="cifra-etq">Carga</span><strong className="cifra-val">{r.carga}</strong><span className="cifra-nota">esfuerzo × min</span></div>}
          </div>
          {r.ejercicios.map((x) => {
            const ej = plan?.ejercicios.find((p) => p.nombre === x.nombre);
            const prox = ej ? pesoSugerido(series, ej, perfil) : null;
            return (
              <Tarjeta key={x.nombre} titulo={x.nombre} accion={x.record ? <span className="chip chip-on">🏆 Récord</span> : undefined}>
                {chipsSeries(x.series)}
                <div className="ent-comp">
                  <div><b>Tonelaje</b>{kg(x.tonelaje)}{x.previo && <Delta actual={x.tonelaje} previo={x.previo.tonelaje} />}</div>
                  <div><b>Fuerza estimada</b>{kg(x.mejor)}{x.previo && <Delta actual={x.mejor} previo={x.previo.mejor} />}</div>
                </div>
                {x.previo ? <p className="nota" style={{ margin: 0 }}>La vez anterior: {x.previo.series.map((s) => `${Number(s.peso)}×${s.reps}`).join(' · ')}</p>
                  : <p className="nota" style={{ margin: 0 }}>Primera vez que lo registrás.</p>}
                {prox?.peso != null && <p className="nota" style={{ margin: '4px 0 0' }}>Próxima vez: <strong>{prox.peso} kg</strong>. {prox.motivo}</p>}
              </Tarjeta>
            );
          })}
          {grupos.length > 0 && (
            <p className="nota" style={{ margin: 0 }}>Series por músculo: {grupos.map((g) => `${nombreGrupo(g.id)} ${String(r.porGrupo[g.id]).replace('.', ',')}`).join(' · ')}</p>
          )}
        </div>
      </details>
    </div>
  );
}
