import { useState } from 'react';
import { Tarjeta } from '../../ui/ui';
import { guardarRutina, useRutina, useSeries, useSesiones } from './modelo';
import { estaPospuesta, posponerMejora, sugerirMejoras, type Mejora } from './profe';

const VISIBLES = 3;

/** Las mejoras del profe que siguen en pie (sin las de "Ahora no"). También las usa la señal del Inicio. */
export function useMejoras(): { mejoras: Mejora[]; cargado: boolean } {
  const { filas: sesiones, cargado } = useSesiones();
  const { filas: series } = useSeries();
  const { dias, fila, perfil, semana, cargado: cargadaRutina } = useRutina();
  if (!cargado || !cargadaRutina) return { mejoras: [], cargado: false };
  const mejoras = sugerirMejoras(dias, sesiones, series, { desde: fila?.inicio, perfil, semana }).filter((m) => !estaPospuesta(m.id));
  return { mejoras, cargado: true };
}

/**
 * Tarjeta "El profe" arriba de la rutina: propuestas de a una, con Aplicar / Ahora no.
 * Aplicar guarda la rutina al toque (sale el DESHACER de siempre); con cambios sin guardar en el editor, espera.
 */
export function MejorasProfe({ bloqueado }: { bloqueado: boolean }) {
  const { fila, dias } = useRutina();
  const { mejoras, cargado } = useMejoras();
  const [, refrescar] = useState(0);
  const [todas, setTodas] = useState(false);
  const [msg, setMsg] = useState('');
  if (!cargado) return null;

  const cambios = mejoras.filter((m) => m.aplicar).length;
  const lista = todas ? mejoras : mejoras.slice(0, VISIBLES);

  async function aplicar(m: Mejora) {
    if (!m.aplicar) return;
    await guardarRutina(m.aplicar(dias), {}, fila);
    setMsg(`Listo: ${m.titulo.charAt(0).toLowerCase()}${m.titulo.slice(1)}.${m.dia ? ` Lo ves en el día ${m.dia}.` : ''}`);
  }

  return (
    <Tarjeta className="ent-profe" titulo={<>El profe{mejoras.length ? <span className="ent-profe-num">{mejoras.length}</span> : null}</>}>
      {!mejoras.length ? (
        <p className="nota" style={{ margin: 0 }}>Revisé tu rutina y está en rango. A medida que entrenes te voy avisando qué subir o cambiar.</p>
      ) : (
        <>
          <p className="nota" style={{ margin: '0 0 4px' }}>
            {cambios ? `${cambios === 1 ? '1 mejora' : `${cambios} mejoras`} para tu rutina` : 'Consejos para el próximo entreno'}
            {cambios && mejoras.length > cambios ? ` y ${mejoras.length - cambios === 1 ? '1 consejo' : `${mejoras.length - cambios} consejos`} para el próximo entreno` : ''}.
            {' '}Nada cambia sin tu OK.
          </p>
          <ul className="lista">
            {lista.map((m) => (
              <li key={m.id} className="lista-item ent-profe-item">
                <div className="crece" style={{ minWidth: 0 }}>
                  <strong>{m.titulo}</strong>
                  <small className="nota">{m.porque}</small>
                  <div className="acciones">
                    {m.aplicar && <button className="btn chico" disabled={bloqueado} onClick={() => aplicar(m)}>Aplicar</button>}
                    {m.ir && <a className="btn chico" href={m.ir.ruta}>{m.ir.texto}</a>}
                    <button className="btn-link" onClick={() => { posponerMejora(m.id); setMsg(''); refrescar((n) => n + 1); }}>Ahora no</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {mejoras.length > VISIBLES && (
            <button className="btn-link" onClick={() => setTodas(!todas)}>{todas ? 'Ver menos' : `Ver ${mejoras.length - VISIBLES} más`}</button>
          )}
          {bloqueado && cambios > 0 && <p className="nota" style={{ margin: '4px 0 0' }}>Tenés cambios sin guardar abajo: guardalos o descartalos para aplicar una mejora.</p>}
        </>
      )}
      {msg && <p className="nota" style={{ margin: '6px 0 0' }}>{msg}</p>}
    </Tarjeta>
  );
}
