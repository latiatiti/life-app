import { useState } from 'react';
import { eliminar } from '../../core/db';
import { Campo, Icono, Modal, Tarjeta } from '../../ui/ui';
import {
  GRUPOS, infoEjercicio, nombreGrupo, queSentir, variantesDe, ZONAS, zonasDe,
  type EjercicioBase, type Equipo, type Grupo, type Zona,
} from './biblioteca';
import { MapaMuscular, textoZonas } from './MapaMuscular';
import { guardarEjercicio, TE, useBiblioteca, type EjercicioPropio } from './modelo';
import { SelectorEjercicio } from './Rutina';

const EQUIPOS: Equipo[] = ['barra', 'mancuernas', 'maquina', 'polea', 'peso corporal', 'otro'];

/** Grupo principal y secundarios a partir del mapa pintado. */
function gruposDesdeZonas(zonas: Partial<Record<Zona, number>>): { grupo: Grupo | null; secundarios: Grupo[] } {
  const orden = (Object.entries(zonas) as Array<[Zona, number]>).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!orden.length) return { grupo: null, secundarios: [] };
  const g = (z: Zona) => ZONAS.find((x) => x.id === z)!.grupo;
  const grupo = g(orden[0][0]);
  const secundarios = [...new Set(orden.slice(1).map(([z]) => g(z)))].filter((x) => x !== grupo);
  return { grupo, secundarios };
}

/** Lista de chips de variantes, con agregar/quitar y sugerencias automáticas (máximo 5). */
export function EditorVariantes({ nombre, valor, onCambio }: { nombre: string; valor: string[]; onCambio: (v: string[]) => void }) {
  const [elegir, setElegir] = useState(false);
  return (
    <div className="ent-variantes">
      <div className="ent-series">
        {valor.map((v) => (
          <span key={v}>{v} <button type="button" className="btn-link" aria-label={`Quitar ${v}`} onClick={() => onCambio(valor.filter((x) => x !== v))}>✕</button></span>
        ))}
        {!valor.length && <span className="nota" style={{ background: 'none' }}>Sin variantes elegidas</span>}
      </div>
      <div className="acciones" style={{ marginTop: 6 }}>
        <button type="button" className="btn chico" disabled={valor.length >= 5} onClick={() => setElegir(true)}>{Icono.mas} Variante</button>
        <button type="button" className="btn chico" disabled={!nombre.trim()} onClick={() => onCambio(variantesDe(nombre, valor))}>Sugerir hasta 5</button>
      </div>
      <Modal titulo="Elegir variante" abierto={elegir} onCerrar={() => setElegir(false)}>
        {elegir && <SelectorEjercicio grupoInicial={infoEjercicio(nombre)?.grupo} onElegir={(n) => { if (!valor.includes(n) && n !== nombre) onCambio([...valor, n].slice(0, 5)); setElegir(false); }} />}
      </Modal>
    </div>
  );
}

/** Cargar o editar un ejercicio: nombre, músculos tocando la figura, qué sentir y variantes. */
export function FormEjercicio({ inicial, onListo }: { inicial?: EjercicioBase | null; onListo: (nombre: string) => void }) {
  const { propios } = useBiblioteca();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [zonas, setZonas] = useState<Partial<Record<Zona, number>>>(inicial ? zonasDe(inicial.nombre) : {});
  const [grupoManual, setGrupoManual] = useState<Grupo | ''>('');
  const [equipo, setEquipo] = useState<Equipo>(inicial?.equipo ?? 'mancuernas');
  const [compuesto, setCompuesto] = useState(inicial?.compuesto ?? false);
  const [salto, setSalto] = useState(String(inicial?.salto ?? 2.5));
  const [sentir, setSentir] = useState(inicial ? queSentir(inicial.nombre) : '');
  const [variantes, setVariantes] = useState<string[]>(inicial?.variantes ?? []);
  const [error, setError] = useState('');
  const auto = gruposDesdeZonas(zonas);
  const grupo = grupoManual || auto.grupo;

  const tocar = (z: Zona) => setZonas((x) => {
    const v = x[z] ?? 0;
    const n = v === 0 ? 1 : v >= 0.8 ? 0.5 : 0;
    const c = { ...x };
    if (n) c[z] = n; else delete c[z];
    return c;
  });

  async function guardar() {
    if (!nombre.trim()) { setError('Poné un nombre.'); return; }
    if (!grupo) { setError('Tocá en la figura al menos un músculo.'); return; }
    try {
      await guardarEjercicio({
        nombre, grupo, secundarios: auto.secundarios.filter((g) => g !== grupo), equipo, compuesto,
        salto: Number(salto.replace(',', '.')) || 0, zonas, sentir: sentir.trim(), variantes,
      }, propios);
    } catch (x) {
      setError(`No se pudo guardar (${(x as Error).message}). Si dice que falta la tabla, hay que correr supabase/entreno-ejercicios.sql.`);
      return;
    }
    onListo(nombre.trim());
  }

  return (
    <div className="form">
      <Campo etiqueta="Nombre"><input value={nombre} onChange={(x) => setNombre(x.target.value)} placeholder="Ej.: Press Arnold" /></Campo>
      <p className="nota" style={{ margin: 0 }}>Tocá los músculos: 1 vez = principal (rojo), 2 = ayuda (amarillo), 3 = borrar.</p>
      <MapaMuscular valores={zonas} onZona={tocar} />
      <p className="nota" style={{ margin: 0 }}>{textoZonas(zonas) || 'Todavía no marcaste músculos.'}</p>
      <div className="fila-campos">
        <Campo etiqueta="Grupo (para contar series)">
          <select value={grupoManual} onChange={(x) => setGrupoManual(x.target.value as Grupo | '')}>
            <option value="">{auto.grupo ? `Automático: ${nombreGrupo(auto.grupo)}` : 'Automático'}</option>
            {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Equipo">
          <select value={equipo} onChange={(x) => setEquipo(x.target.value as Equipo)}>
            {EQUIPOS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Salto de peso (kg)"><input inputMode="decimal" value={salto} onChange={(x) => setSalto(x.target.value)} /></Campo>
        <label className="ent-check-cal" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={compuesto} onChange={(x) => setCompuesto(x.target.checked)} /> Multiarticular (pesado)
        </label>
      </div>
      <Campo etiqueta="Qué tenés que sentir"><textarea rows={2} value={sentir} onChange={(x) => setSentir(x.target.value)} placeholder="Ej.: sentí el costado del hombro, no el trapecio" /></Campo>
      <p className="subtitulo" style={{ margin: 0 }}>Variantes (hasta 5, para rotar)</p>
      <EditorVariantes nombre={nombre} valor={variantes} onCambio={setVariantes} />
      {error && <p className="ent-baja" style={{ margin: 0 }}>{error}</p>}
      <button type="button" className="btn btn-primario" onClick={guardar}>Guardar ejercicio</button>
    </div>
  );
}

/** Lista de los ejercicios propios, con alta, edición y baja. */
export function MisEjercicios() {
  const { propios } = useBiblioteca();
  const [editando, setEditando] = useState<EjercicioPropio | 'nuevo' | null>(null);
  return (
    <Tarjeta titulo="Mis ejercicios" accion={<button className="btn chico" onClick={() => setEditando('nuevo')}>{Icono.mas} Nuevo</button>}>
      {!propios.length && <p className="nota" style={{ margin: 0 }}>Cargá los ejercicios que no están en la biblioteca, o pegá los que te pase Claude en el Preparador.</p>}
      <ul className="lista">
        {propios.map((x) => (
          <li key={x.id} className="lista-item">
            <div className="crece">
              <strong>{x.nombre}</strong>
              <small className="nota">{nombreGrupo(x.grupo)}{x.variantes?.length ? ` · ${x.variantes.length} variantes` : ''}</small>
            </div>
            <button className="btn-icono" aria-label="Editar" onClick={() => setEditando(x)}>{Icono.editar}</button>
            <button className="btn-icono" aria-label="Borrar" onClick={async () => { if (window.confirm(`¿Borrar ${x.nombre}?`)) await eliminar(TE.ejercicios, x.id); }}>{Icono.borrar}</button>
          </li>
        ))}
      </ul>
      <Modal titulo={editando === 'nuevo' ? 'Nuevo ejercicio' : 'Editar ejercicio'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormEjercicio inicial={editando === 'nuevo' ? null : editando} onListo={() => setEditando(null)} />}
      </Modal>
    </Tarjeta>
  );
}

/* ---------- Importar ejercicios pegados (formato que devuelve Claude) ---------- */

/** Lee `{"ejercicios":[{nombre, zonas:{pecho:1,…}, grupo?, equipo?, compuesto?, salto?, sentir?, variantes?}]}`. */
export function leerEjerciciosJson(texto: string): Array<Omit<EjercicioBase, 'propio'>> {
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? texto;
  const ini = bloque.search(/[[{]/);
  if (ini < 0) return [];
  let datos: unknown;
  try { datos = JSON.parse(bloque.slice(ini)); } catch { return []; }
  const lista = Array.isArray(datos) ? datos : (datos as { ejercicios?: unknown[] }).ejercicios;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    const o = x as Record<string, unknown>;
    if (!o || typeof o.nombre !== 'string' || typeof o.zonas !== 'object' || !o.zonas) return [];
    const zonas: Partial<Record<Zona, number>> = {};
    for (const [k, v] of Object.entries(o.zonas as Record<string, unknown>)) {
      if (ZONAS.some((z) => z.id === k) && typeof v === 'number' && v > 0) zonas[k as Zona] = Math.min(1, v);
    }
    const auto = gruposDesdeZonas(zonas);
    const grupo = (GRUPOS.some((g) => g.id === o.grupo) ? o.grupo : auto.grupo) as Grupo | null;
    if (!grupo) return [];
    return [{
      nombre: o.nombre.trim(), grupo, secundarios: auto.secundarios.filter((g) => g !== grupo),
      equipo: (EQUIPOS.includes(o.equipo as Equipo) ? o.equipo : 'otro') as Equipo,
      compuesto: !!o.compuesto, salto: typeof o.salto === 'number' ? o.salto : 2.5, zonas,
      sentir: typeof o.sentir === 'string' ? o.sentir : '',
      variantes: Array.isArray(o.variantes) ? o.variantes.filter((v): v is string => typeof v === 'string').slice(0, 5) : [],
    }];
  });
}
