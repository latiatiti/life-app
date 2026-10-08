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

/** Resultado de un entreno: totales, cada ejercicio contra la vez anterior, récords y qué hacer la próxima. */
export function ResumenEntreno({ sesion }: { sesion: Sesion }) {
  const { filas: series } = useSeries();
  const { dias, perfil } = useRutina();
  const r = resumirSesion(sesion, series);
  const plan = dias.find((d) => d.id === sesion.dia);
  const prep = evaluarPreparacion(sesion);
  const grupos = GRUPOS.filter((g) => r.porGrupo[g.id] > 0);

  return (
    <div className="pila">
      <p className="nota" style={{ margin: 0 }}>
        {fechaLarga(sesion.fecha)} · {plan ? `Día ${plan.id} · ${plan.nombre}` : sesion.dia_nombre ?? sesion.deporte}
      </p>
      <div className="grilla-cifras compacta">
        <div className="cifra"><span className="cifra-etq">Series</span><strong className="cifra-val">{r.series}</strong><span className="cifra-nota">{r.reps} repeticiones</span></div>
        <div className="cifra"><span className="cifra-etq">Tonelaje</span><strong className="cifra-val">{kg(r.tonelaje)}</strong><span className="cifra-nota">peso × reps</span></div>
        <div className="cifra"><span className="cifra-etq">Duración</span><strong className="cifra-val">{sesion.duracion_min ?? '—'} min</strong><span className="cifra-nota">{sesion.duracion_min && r.tonelaje ? `${Math.round(r.tonelaje / sesion.duracion_min)} kg/min` : ''}</span></div>
        <div className="cifra"><span className="cifra-etq">Esfuerzo</span><strong className="cifra-val">{r.rpeMedio != null ? `RPE ${r.rpeMedio.toFixed(1).replace('.', ',')}` : '—'}</strong><span className="cifra-nota">{r.carga ? `carga ${r.carga} (RPE × min)` : 'promedio por serie'}</span></div>
      </div>
      {r.records > 0 && <p className="ent-record" style={{ margin: 0 }}>🏆 {r.records === 1 ? '1 récord nuevo' : `${r.records} récords nuevos`} de fuerza estimada</p>}
      {prep && <p className="nota" style={{ margin: 0 }}>Llegaste {prep.nivel === 'bien' ? 'bien' : prep.nivel === 'medio' ? 'regular' : 'cansado'} ({prep.puntaje}/100): sueño {sesion.sueno_h ?? '—'} h, energía {sesion.energia ?? '—'}/5, dolor {sesion.agujetas ?? '—'}/5.</p>}

      {r.ejercicios.map((x) => {
        const ej = plan?.ejercicios.find((p) => p.nombre === x.nombre);
        const prox = ej ? pesoSugerido(series, ej, perfil) : null;
        return (
          <Tarjeta key={x.nombre} titulo={x.nombre} accion={x.record ? <span className="chip chip-on">🏆 Récord</span> : undefined}>
            {chipsSeries(x.series)}
            <div className="ent-comp">
              <div><b>Tonelaje</b>{kg(x.tonelaje)}{x.previo && <Delta actual={x.tonelaje} previo={x.previo.tonelaje} />}</div>
              <div><b>1RM estimado</b>{kg(x.mejor)}{x.previo && <Delta actual={x.mejor} previo={x.previo.mejor} />}</div>
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
      {(sesion.sensacion || sesion.notas) && <p className="nota" style={{ margin: 0 }}>{sesion.sensacion ? `Sensación ${sesion.sensacion}/10. ` : ''}{sesion.notas}</p>}
    </div>
  );
}
