import { useState } from 'react';
import { fechaLarga } from '../../core/format';
import { VERSION } from '../../core/version';
import { Cifra, Medidor, Tarjeta } from '../../ui/ui';
import { NOVEDADES, type Area } from './novedades';
import { useBase } from './modelo';

const REPO = 'https://github.com/latiatiti/life-app/pull/';

/** Panel → LIFE: la versión que corre, cómo viene la base y la línea de tiempo de cada actualización. */
export function PantallaLife() {
  const { base, error } = useBase();
  const [area, setArea] = useState<Area | ''>('');
  const areas = [...new Set(NOVEDADES.map((n) => n.area))];
  const lista = area ? NOVEDADES.filter((n) => n.area === area) : NOVEDADES;
  const uso = base ? base.base_mb / base.tope_mb : 0;
  const deMes = NOVEDADES.filter((n) => n.fecha >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).length;

  return (
    <div className="pila">
      <div className="grilla-cifras">
        <Cifra etiqueta="Versión que estás usando" valor={VERSION.split(' · ')[0]} nota={VERSION.split(' · ')[1] ?? ''} />
        <Cifra etiqueta="Actualizaciones" valor={NOVEDADES.length} nota={`${deMes} en los últimos 30 días`} />
        <Cifra etiqueta="Espacio de la base" valor={base ? `${base.base_mb} MB` : '…'} nota={base ? `de ${base.tope_mb} MB gratis` : error ? 'Falta activar en la nube' : undefined}
          tono={base ? (uso >= 0.8 ? 'mal' : 'bien') : undefined} />
        <Cifra etiqueta="Cuentas" valor={base ? base.activas : '…'} nota={base ? `activas de ${base.cuentas}` : undefined} />
      </div>

      {base && (
        <Tarjeta titulo="Cómo viene la base">
          <Medidor uso={uso} />
          <p className="nota">Usás el {Math.round(uso * 100)} % del plan gratis. Lo que más ocupa:</p>
          <ul className="lista-simple base-tablas">
            {base.tablas.map((t) => (
              <li key={t.nombre}><span><code>{t.nombre}</code> <small className="nota">· {Math.max(t.filas, 0).toLocaleString('es-AR')} filas</small></span><strong>{t.mb} MB</strong></li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo="Línea de tiempo" accion={
        <select className="lt-area" value={area} onChange={(e) => setArea(e.target.value as Area | '')} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      }>
        <ol className="linea-tiempo">
          {lista.map((n, i) => (
            <li key={`${n.fecha}-${n.titulo}`} className={i === 0 && !area ? 'ultima' : ''}>
              <span className="lt-punto" aria-hidden="true" />
              <div className="lt-cab">
                <time dateTime={n.fecha}>{fechaLarga(n.fecha)}</time>
                <span className="chip">{n.area}</span>
                {n.nube && <span className="chip chip-on" title="También cambió la nube">Nube</span>}
                {n.pr && <a className="nota" href={`${REPO}${n.pr}`} target="_blank" rel="noreferrer">#{n.pr}</a>}
              </div>
              <strong className="lt-titulo">{n.titulo}</strong>
              <ul className="lt-que">{n.que.map((q) => <li key={q}>{q}</li>)}</ul>
            </li>
          ))}
        </ol>
      </Tarjeta>
    </div>
  );
}
