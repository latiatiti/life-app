import { useEffect, useState } from 'react';
import { Campo, Icono, Modal, Tarjeta } from '../../ui/ui';
import { BIBLIOTECA, GRUPOS, infoEjercicio, nombreGrupo, type Grupo } from './biblioteca';
import { e, guardarRutina, RUTINA_BASE, useRutina, type DiaPlan, type EjercicioPlan } from './modelo';

/** Buscador de la biblioteca, filtrable por grupo; también deja escribir un ejercicio propio. */
export function SelectorEjercicio({ grupoInicial, onElegir }: { grupoInicial?: Grupo; onElegir: (nombre: string) => void }) {
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState<Grupo | ''>(grupoInicial ?? '');
  const t = q.trim().toLowerCase();
  const lista = BIBLIOTECA.filter((x) => (!grupo || x.grupo === grupo || x.secundarios.includes(grupo)) && (!t || x.nombre.toLowerCase().includes(t)))
    .sort((a, b) => Number(b.grupo === grupo) - Number(a.grupo === grupo));
  return (
    <div className="form">
      <div className="fila-campos">
        <Campo etiqueta="Buscar"><input autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="press, remo, curl…" /></Campo>
        <Campo etiqueta="Grupo">
          <select value={grupo} onChange={(ev) => setGrupo(ev.target.value as Grupo | '')}>
            <option value="">Todos</option>
            {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <ul className="lista ent-buscador-lista">
        {lista.map((x) => (
          <li key={x.nombre}>
            <button type="button" className="lista-item btn-icono" style={{ textAlign: 'left', color: 'var(--ink)' }} onClick={() => onElegir(x.nombre)}>
              <div className="crece">
                <strong>{x.nombre}</strong>
                <small className="nota">{nombreGrupo(x.grupo)}{x.secundarios.length ? ` + ${x.secundarios.map(nombreGrupo).join(', ')}` : ''} · {x.equipo}{x.compuesto ? ' · compuesto' : ''}</small>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {t && !lista.some((x) => x.nombre.toLowerCase() === t) && (
        <button type="button" className="btn" onClick={() => onElegir(q.trim())}>{Icono.mas} Usar “{q.trim()}” (ejercicio propio)</button>
      )}
    </div>
  );
}

/** Valores por defecto razonables según el tipo de ejercicio. */
function nuevoEjercicio(nombre: string): EjercicioPlan {
  const info = infoEjercicio(nombre);
  return info?.compuesto ? e(nombre, 3, 6, 10, 150, 8) : e(nombre, 3, 10, 15, 75, 9);
}

function EditorEjercicio({ ej, onCambio, onSubir, onBajar, onQuitar, onCambiarPor }: {
  ej: EjercicioPlan; onCambio: (x: EjercicioPlan) => void; onSubir?: () => void; onBajar?: () => void; onQuitar: () => void; onCambiarPor: () => void;
}) {
  const n = (k: keyof EjercicioPlan) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(ev.target.value.replace(',', '.'));
    onCambio({ ...ej, [k]: isFinite(v) ? v : 0 });
  };
  const info = infoEjercicio(ej.nombre);
  return (
    <div className="ent-editor-ej">
      <div className="barra-acciones">
        <div className="crece" style={{ minWidth: 0 }}>
          <strong>{ej.nombre}</strong>
          <small className="nota">{info ? nombreGrupo(info.grupo) : 'Ejercicio propio (no suma a ningún grupo)'}</small>
        </div>
        <div style={{ display: 'flex' }}>
          <button className="btn-icono" aria-label="Subir" disabled={!onSubir} onClick={onSubir}>↑</button>
          <button className="btn-icono" aria-label="Bajar" disabled={!onBajar} onClick={onBajar}>↓</button>
          <button className="btn-icono" aria-label="Cambiar ejercicio" onClick={onCambiarPor}>{Icono.editar}</button>
          <button className="btn-icono" aria-label="Quitar" onClick={onQuitar}>{Icono.borrar}</button>
        </div>
      </div>
      <div className="ent-mini-campos">
        <label>Series<input inputMode="numeric" value={ej.series} onChange={n('series')} /></label>
        <label>Reps mín<input inputMode="numeric" value={ej.repsMin} onChange={n('repsMin')} /></label>
        <label>Reps máx<input inputMode="numeric" value={ej.repsMax} onChange={n('repsMax')} /></label>
        <label>RPE<input inputMode="decimal" value={ej.rpe} onChange={n('rpe')} /></label>
        <label>Descanso (s)<input inputMode="numeric" value={ej.descanso} onChange={n('descanso')} /></label>
        <label>Salto (kg)<input inputMode="decimal" value={ej.salto} onChange={n('salto')} /></label>
      </div>
      <input value={ej.nota ?? ''} onChange={(ev) => onCambio({ ...ej, nota: ev.target.value })} placeholder="Nota de técnica (opcional)" />
    </div>
  );
}

export function PantallaRutina() {
  const { dias, fila, cargado } = useRutina();
  const [borrador, setBorrador] = useState<DiaPlan[]>(dias);
  const [sucio, setSucio] = useState(false);
  const [diaSel, setDiaSel] = useState(0);
  const [selector, setSelector] = useState<{ modo: 'agregar' } | { modo: 'cambiar'; i: number } | null>(null);
  const [aviso, setAviso] = useState('');

  // Cuando llega la rutina guardada (o la cambia otro dispositivo) y no hay cambios sin guardar, la mostramos.
  useEffect(() => { if (!sucio) setBorrador(dias); }, [dias, sucio]);

  if (!cargado) return null;
  const dia = borrador[Math.min(diaSel, borrador.length - 1)];

  function cambiarDia(cambio: Partial<DiaPlan>) {
    setBorrador((b) => b.map((d, i) => (i === diaSel ? { ...d, ...cambio } : d)));
    setSucio(true); setAviso('');
  }
  function cambiarEjs(fn: (xs: EjercicioPlan[]) => EjercicioPlan[]) { cambiarDia({ ejercicios: fn(dia.ejercicios) }); }
  const mover = (i: number, d: number) => cambiarEjs((xs) => { const c = [...xs]; [c[i], c[i + d]] = [c[i + d], c[i]]; return c; });

  async function guardar() {
    const limpia = borrador.filter((d) => d.ejercicios.length).map((d) => ({ ...d, id: d.id.trim() || '?', nombre: d.nombre.trim() || `Día ${d.id}` }));
    if (!limpia.length) { setAviso('La rutina necesita al menos un día con ejercicios.'); return; }
    await guardarRutina(limpia, {}, fila);
    setSucio(false); setAviso('Rutina guardada. El modo entrenando ya usa esta versión.');
  }

  return (
    <div className="pila">
      <p className="nota" style={{ margin: 0 }}>
        {fila ? `Rutina activa: ${fila.nombre}.` : 'Estás usando la rutina base.'} Editá días y ejercicios; los cambios valen desde el próximo entreno y no tocan el historial.
      </p>
      {fila?.notas && <Tarjeta titulo="Notas de la rutina"><p className="nota" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{fila.notas}</p></Tarjeta>}
      <div className="segmentado" style={{ flexWrap: 'wrap' }}>
        {borrador.map((d, i) => <button key={i} className={i === diaSel ? 'activo' : ''} onClick={() => setDiaSel(i)}>{d.id} · {d.nombre}</button>)}
        <button onClick={() => {
          setBorrador((b) => [...b, { id: String.fromCharCode(65 + b.length), nombre: 'Nuevo día', ejercicios: [] }]);
          setDiaSel(borrador.length); setSucio(true);
        }}>+ Día</button>
      </div>
      {dia && (
        <Tarjeta>
          <div className="fila-campos" style={{ gridTemplateColumns: '80px 1fr' }}>
            <Campo etiqueta="Letra"><input value={dia.id} maxLength={4} onChange={(ev) => cambiarDia({ id: ev.target.value })} /></Campo>
            <Campo etiqueta="Nombre del día"><input value={dia.nombre} onChange={(ev) => cambiarDia({ nombre: ev.target.value })} /></Campo>
          </div>
          {dia.ejercicios.map((x, i) => (
            <EditorEjercicio key={`${x.nombre}-${i}`} ej={x}
              onCambio={(n) => cambiarEjs((xs) => xs.map((y, j) => (j === i ? n : y)))}
              onSubir={i > 0 ? () => mover(i, -1) : undefined}
              onBajar={i < dia.ejercicios.length - 1 ? () => mover(i, 1) : undefined}
              onQuitar={() => cambiarEjs((xs) => xs.filter((_, j) => j !== i))}
              onCambiarPor={() => setSelector({ modo: 'cambiar', i })} />
          ))}
          <div className="acciones" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setSelector({ modo: 'agregar' })}>{Icono.mas} Agregar ejercicio</button>
            {borrador.length > 1 && <button className="btn btn-peligro" onClick={() => {
              if (!window.confirm(`¿Quitar el día ${dia.id}?`)) return;
              setBorrador((b) => b.filter((_, i) => i !== diaSel)); setDiaSel(0); setSucio(true);
            }}>Quitar día</button>}
          </div>
        </Tarjeta>
      )}
      {aviso && <p className="nota" style={{ margin: 0 }}>{aviso}</p>}
      <div className="acciones">
        <button className="btn btn-primario crece" disabled={!sucio} onClick={guardar}>Guardar rutina</button>
        {sucio && <button className="btn" onClick={() => { setBorrador(dias); setSucio(false); }}>Descartar cambios</button>}
        <button className="btn" onClick={() => { if (window.confirm('¿Volver a la rutina base de 3 días?')) { setBorrador(RUTINA_BASE); setSucio(true); setDiaSel(0); } }}>Rutina base</button>
      </div>
      <Modal titulo={selector?.modo === 'cambiar' ? 'Cambiar ejercicio' : 'Agregar ejercicio'} abierto={!!selector} onCerrar={() => setSelector(null)}>
        {selector && (
          <SelectorEjercicio
            grupoInicial={selector.modo === 'cambiar' ? infoEjercicio(dia.ejercicios[selector.i]?.nombre ?? '')?.grupo : undefined}
            onElegir={(nombre) => {
              if (selector.modo === 'agregar') cambiarEjs((xs) => [...xs, nuevoEjercicio(nombre)]);
              else cambiarEjs((xs) => xs.map((y, j) => (j === selector.i ? { ...y, nombre, salto: infoEjercicio(nombre)?.salto ?? y.salto } : y)));
              setSelector(null);
            }} />
        )}
      </Modal>
    </div>
  );
}
