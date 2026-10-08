import { useState } from 'react';
import { fechaCorta, hoy, sumarDias } from '../../core/format';
import { Campo, Tarjeta } from '../../ui/ui';
import { informeEntrenador, leerRutinaJson, progresoPorFecha, rangoSeries, seriesPorGrupo } from './analisis';
import { CICLO_BASE, describirSemana, lunesDe, proponerCiclo, type Ciclo, type Nivel, type Perfil } from './ciclo';
import { empezarCiclo, guardarEjercicio, guardarRutina, useBiblioteca, useRutina, useSeries, useSesiones, type DiaPlan } from './modelo';
import { BarraCiclo } from './Pantallas';
import { fijarPropios, type EjercicioBase } from './biblioteca';
import { leerEjerciciosJson } from './Ejercicios';
import { MapaMuscular, textoZonas } from './MapaMuscular';
import { esJson, leerTabla, PRESETS, rutinaATabla, type RutinaLeida } from './tabla';

async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

function VistaRutina({ r, accion }: { r: RutinaLeida; accion?: React.ReactNode }) {
  return (
    <div className="pila" style={{ gap: 8, marginTop: 8 }}>
      <strong>{r.nombre}</strong>
      {r.ciclo.objetivo && <p className="nota">Objetivo: {r.ciclo.objetivo}</p>}
      {r.notas && <p className="nota" style={{ whiteSpace: 'pre-wrap' }}>{r.notas}</p>}
      <p className="nota">Ciclo: {r.ciclo.semanas.map((s, i) => `S${i + 1} ${s.nombre} (${describirSemana(s)})`).join(' → ')}</p>
      <ul className="lista">
        {r.dias.map((d) => (
          <li key={d.id} className="lista-item"><div className="crece"><strong>{d.id} · {d.nombre}</strong>
            <small className="nota">{d.ejercicios.map((x) => `${x.nombre} ${x.series}×${x.repsMin}-${x.repsMax}`).join(' · ')}</small></div></li>
        ))}
      </ul>
      {accion}
    </div>
  );
}

function FormPerfil({ perfil, onGuardar }: { perfil: Perfil | null; onGuardar: (p: Perfil) => Promise<void> }) {
  const [peso, setPeso] = useState(perfil?.peso_kg ? String(perfil.peso_kg) : '');
  const [nivel, setNivel] = useState<Nivel>(perfil?.nivel ?? 'nuevo');
  const [sexo, setSexo] = useState<'f' | 'm' | null>(perfil?.sexo ?? null);
  const [ok, setOk] = useState('');
  const n = Number(peso.replace(',', '.'));
  return (
    <div className="form">
      <Campo etiqueta="Tu peso corporal (kg)"><input inputMode="decimal" value={peso} onChange={(x) => { setPeso(x.target.value); setOk(''); }} placeholder="70" /></Campo>
      <p className="subtitulo" style={{ margin: 0 }}>Experiencia con pesas</p>
      <div className="segmentado grande-toque">
        {([['nuevo', 'Recién empiezo'], ['intermedio', '6 meses a 2 años'], ['avanzado', 'Más de 2 años']] as Array<[Nivel, string]>).map(([id, t]) => (
          <button key={id} type="button" className={nivel === id ? 'activo' : ''} onClick={() => setNivel(id)}>{t}</button>
        ))}
      </div>
      <p className="subtitulo" style={{ margin: 0 }}>Para la estimación de fuerza</p>
      <div className="segmentado grande-toque">
        {([['f', 'Mujer'], ['m', 'Varón'], [null, 'Prefiero no decir']] as Array<['f' | 'm' | null, string]>).map(([id, t]) => (
          <button key={String(id)} type="button" className={sexo === id ? 'activo' : ''} onClick={() => setSexo(id)}>{t}</button>
        ))}
      </div>
      <button className="btn btn-primario" disabled={!(n > 25 && n < 300)} onClick={async () => { await onGuardar({ peso_kg: n, nivel, sexo }); setOk('Guardado. Los ejercicios que nunca hiciste ya tienen peso previsto.'); }}>Guardar perfil</button>
      {ok && <p className="nota">{ok}</p>}
    </div>
  );
}

/** Preparador: perfil, ciclo de 4 semanas, propuesta del próximo, presets e intercambio con Claude. */
export function PantallaPreparador() {
  const { filas: sesiones } = useSesiones();
  const { filas: series } = useSeries();
  const { dias, fila, ciclo, perfil, estado, todas } = useRutina();
  const [msg, setMsg] = useState('');
  const [pegado, setPegado] = useState('');
  const [vista, setVista] = useState<RutinaLeida | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { propios } = useBiblioteca();
  const [ejsPegados, setEjsPegados] = useState<Array<Omit<EjercicioBase, 'propio'>>>([]);

  const nombre = fila?.nombre ?? 'Rutina base';
  const tablaActual = rutinaATabla(dias, nombre, fila?.notas ?? '', ciclo);
  const informe = informeEntrenador(sesiones, series, dias, fila?.notas ?? '', hoy(), { ciclo, inicio: fila?.inicio ?? null, perfil });
  const mostrarPropuesta = !!(fila?.inicio && estado && (estado.terminado || estado.indice >= estado.total - 2));
  const propuesta = mostrarPropuesta && fila?.inicio
    ? proponerCiclo(dias, sesiones, series, fila.inicio, { progreso: progresoPorFecha, porGrupo: seriesPorGrupo, rango: rangoSeries })
    : null;
  const inicioProximo = fila?.inicio && estado ? (estado.terminado ? lunesDe(hoy()) : sumarDias(fila.inicio, estado.total * 7)) : lunesDe(hoy());

  async function guardarPerfil(p: Perfil) {
    const c: Ciclo = { ...(ciclo ?? { semanas: CICLO_BASE }), perfil: p };
    await guardarRutina(dias, { ciclo: c, ...(fila ? {} : { nombre: 'Rutina base', inicio: lunesDe(hoy()) }) }, fila);
  }

  async function activar(r: { nombre: string; notas: string; dias: DiaPlan[]; ciclo: Ciclo }, inicio: string) {
    await empezarCiclo(r.dias, { nombre: r.nombre, notas: r.notas, ciclo: { ...r.ciclo, perfil: r.ciclo.perfil ?? perfil }, inicio }, fila);
    setVista(null); setPegado(''); setPreset(null);
    setMsg(`Ciclo nuevo activado desde el ${fechaCorta(inicio)}. Ya lo ves en Hoy.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="pila">
      {msg && <p className="ent-sube" style={{ margin: 0 }}>{msg}</p>}

      <Tarjeta titulo="Tu ciclo de 4 semanas">
        <BarraCiclo />
        {ciclo && (
          <ul className="lista" style={{ marginTop: 8 }}>
            {ciclo.semanas.map((s, i) => (
              <li key={i} className="lista-item"><div className="crece"><strong>S{i + 1} · {s.nombre}</strong><small className="nota">{describirSemana(s)}{s.nota ? ` — ${s.nota}` : ''}</small></div>
                {fila?.inicio && <span className="num nota">{fechaCorta(sumarDias(fila.inicio, i * 7))}</span>}</li>
            ))}
          </ul>
        )}
        {ciclo?.objetivo && <p className="nota">Objetivo: {ciclo.objetivo}</p>}
        <p className="nota" style={{ marginTop: 8 }}>Cada ciclo sube el esfuerzo tres semanas y la cuarta descarga. Al terminar, la app te propone los cambios para el siguiente según cómo te fue.</p>
        {fila && <button className="btn chico" style={{ marginTop: 8 }} onClick={async () => {
          if (!window.confirm('¿Reiniciar el ciclo desde este lunes? El historial no se toca.')) return;
          await guardarRutina(dias, { inicio: lunesDe(hoy()), ciclo: ciclo ?? { semanas: CICLO_BASE } }, fila);
        }}>Reiniciar ciclo desde este lunes</button>}
      </Tarjeta>

      {propuesta && (
        <Tarjeta titulo={estado?.terminado ? 'Propuesta para el próximo ciclo' : 'Adelanto del próximo ciclo'}>
          <p className="nota" style={{ marginTop: 0 }}>{propuesta.objetivo}</p>
          <ul className="ent-cambios">
            {propuesta.cambios.map((c, i) => <li key={i} className={`ent-cambio-${c.tipo}`}>{c.texto}</li>)}
          </ul>
          <button className="btn btn-primario ancho btn-grande" onClick={() => activar({
            nombre: fila?.nombre ?? 'Mi rutina', notas: fila?.notas ?? '', dias: propuesta.dias,
            ciclo: { semanas: ciclo?.semanas ?? CICLO_BASE, objetivo: propuesta.objetivo, perfil },
          }, inicioProximo)}>Empezar ciclo {(ciclo?.numero ?? 0) + 1} el {fechaCorta(inicioProximo)}</button>
          <p className="nota" style={{ marginTop: 8 }}>¿Querés otra opinión? Copiá el informe de abajo y pedíselo a Claude.</p>
        </Tarjeta>
      )}

      <Tarjeta titulo="Tu perfil">
        <p className="nota" style={{ marginTop: 0 }}>Con tu peso y experiencia la app estima un peso inicial para cada ejercicio que nunca hiciste. La semana de adaptación sirve para ajustarlo.</p>
        <FormPerfil key={JSON.stringify(perfil)} perfil={perfil} onGuardar={guardarPerfil} />
      </Tarjeta>

      <Tarjeta titulo="Rutinas listas (presets)">
        <ul className="lista">
          {PRESETS.map((p) => (
            <li key={p.id}>
              <button type="button" className="lista-item btn-icono ent-hist-item" onClick={() => setPreset(preset === p.id ? null : p.id)}>
                <strong>{p.nombre}</strong><small className="nota">{p.para}</small>
              </button>
              {preset === p.id && <VistaRutina r={leerTabla(p.tabla)} accion={
                <div className="acciones">
                  <button className="btn btn-primario crece" onClick={() => activar(leerTabla(p.tabla), lunesDe(hoy()))}>Usar desde este lunes</button>
                  <button className="btn" onClick={async () => setMsg((await copiar(p.tabla)) ? 'Preset copiado: podés editarlo y pegarlo abajo.' : 'No pude copiar.')}>Copiar tabla</button>
                </div>} />}
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Con Claude como entrenador">
        <p className="nota" style={{ marginTop: 0 }}>1. Copiá el informe (últimas 4 semanas, ciclo, perfil y progreso) y pegalo en el chat. 2. Claude te devuelve la rutina en formato tabla. 3. Pegala acá abajo, revisala y activala.</p>
        <div className="acciones">
          <button className="btn btn-primario crece" onClick={async () => setMsg((await copiar(informe)) ? 'Informe copiado. Pegalo en el chat con Claude.' : 'No pude copiar solo: abrí "Ver informe" y copialo.')}>Copiar informe</button>
          <button className="btn" onClick={async () => setMsg((await copiar(tablaActual)) ? 'Rutina copiada en formato tabla.' : 'No pude copiar.')}>Copiar mi rutina</button>
        </div>
        <details><summary className="nota">Ver informe</summary><pre className="ent-pre">{informe}</pre></details>
        <p className="subtitulo">Pegar rutina (tabla o JSON)</p>
        <textarea rows={7} value={pegado} onChange={(x) => { setPegado(x.target.value); setVista(null); setError(''); }}
          placeholder={'RUTINA: Mi rutina\nCICLO: Adaptación rpe-1 | Carga | Sobrecarga s+1 | Descarga s50% rpe6 c85\nA: Pecho y bíceps\nPress de banca con barra | 4x6-10 | 150 | 8'} />
        <div className="acciones" style={{ marginTop: 8 }}>
          <button className="btn" disabled={!pegado.trim()} onClick={() => {
            const { ejercicios, resto } = separarEjercicios(pegado);
            setEjsPegados(ejercicios);
            // Para que la rutina reconozca los ejercicios nuevos aunque todavía no estén guardados.
            if (ejercicios.length) fijarPropios([...propios, ...ejercicios]);
            try {
              if (!resto.trim() && ejercicios.length) { setVista(null); setError(''); return; }
              if (esJson(resto)) { const j = leerRutinaJson(resto); setVista({ ...j, ciclo: { semanas: CICLO_BASE } }); } else setVista(leerTabla(resto));
              setError('');
            } catch (x) { setVista(null); setError(ejercicios.length ? '' : (x as Error).message); }
          }}>Revisar</button>
        </div>
        {error && <p className="ent-baja">{error}</p>}
        {ejsPegados.length > 0 && (
          <div className="pila" style={{ gap: 6, marginTop: 8 }}>
            <p className="subtitulo" style={{ margin: 0 }}>{ejsPegados.length === 1 ? '1 ejercicio nuevo' : `${ejsPegados.length} ejercicios nuevos`}</p>
            {ejsPegados.map((x) => (
              <div key={x.nombre} className="ent-guia">
                <MapaMuscular valores={x.zonas ?? {}} chico leyenda={false} />
                <div><strong>{x.nombre}</strong><p className="nota">{textoZonas(x.zonas ?? {})}</p>{x.variantes?.length ? <p className="nota">Variantes: {x.variantes.join(', ')}</p> : null}</div>
              </div>
            ))}
            <button className="btn btn-primario" onClick={async () => {
              for (const x of ejsPegados) await guardarEjercicio(x, propios);
              setMsg(`Guardé ${ejsPegados.length} ejercicio(s) en Mis ejercicios.`); setEjsPegados([]);
            }}>Guardar en Mis ejercicios</button>
          </div>
        )}
        {vista && <VistaRutina r={vista} accion={
          <div className="acciones">
            <button className="btn btn-primario crece" onClick={() => activar(vista, lunesDe(hoy()))}>Empezar ciclo nuevo este lunes</button>
            {fila && <button className="btn" onClick={async () => {
              await guardarRutina(vista.dias, { nombre: vista.nombre, notas: vista.notas, ciclo: { ...vista.ciclo, perfil, numero: ciclo?.numero } }, fila);
              setVista(null); setPegado(''); setMsg('Rutina reemplazada dentro del ciclo actual.');
            }}>Reemplazar sin reiniciar el ciclo</button>}
          </div>} />}
        <details style={{ marginTop: 8 }}>
          <summary className="nota">Cómo se escribe la tabla</summary>
          <pre className="ent-pre">{`RUTINA: nombre
OBJETIVO: para qué es (opcional)
CICLO: semana | semana | semana | semana
  s+1 / s-1 = una serie más o menos
  s50% = la mitad de las series
  rpe-1 / rpe+1 = más o menos esfuerzo
  rpe6 = esfuerzo fijo · c85 = 85 % del peso
A: Nombre del día
ejercicio | series x reps | descanso s | RPE | salto kg | nota
  (solo las 2 primeras columnas son obligatorias;
   el nombre puede ir abreviado: "inclinado mancuernas")`}</pre>
        </details>
      </Tarjeta>

      {todas.length > 1 && (
        <Tarjeta titulo="Ciclos anteriores">
          <ul className="lista">
            {todas.filter((r) => !r.activa).map((r) => (
              <li key={r.id} className="lista-item"><div className="crece">
                <strong>{r.ciclo?.numero ? `Ciclo ${r.ciclo.numero} · ` : ''}{r.nombre}</strong>
                <small className="nota">{r.inicio ? `Desde el ${fechaCorta(r.inicio)}` : ''}{r.ciclo?.objetivo ? ` · ${r.ciclo.objetivo}` : ''}</small>
              </div></li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}

/** Saca los bloques ```json {"ejercicios": …}``` del texto pegado; el resto es la rutina. */
function separarEjercicios(texto: string): { ejercicios: Array<Omit<EjercicioBase, 'propio'>>; resto: string } {
  const ejercicios: Array<Omit<EjercicioBase, 'propio'>> = [];
  let resto = texto;
  for (const m of texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    if (!/"ejercicios"\s*:/.test(m[1])) continue;
    const xs = leerEjerciciosJson(m[1]);
    if (xs.length) { ejercicios.push(...xs); resto = resto.replace(m[0], ''); }
  }
  if (!ejercicios.length && /^\s*\{\s*"ejercicios"/.test(texto)) {
    const xs = leerEjerciciosJson(texto);
    if (xs.length) return { ejercicios: xs, resto: '' };
  }
  return { ejercicios, resto };
}
