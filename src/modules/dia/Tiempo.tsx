import { useState, type FormEvent } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { Icono, Tarjeta } from '../../ui/ui';
import { DIAS_CORTOS, TIPOS, type VistaDia } from './modelo';
import {
  CLASES, duracion, repartir, rutinasDelDia, TT, usadoPorClase, useRutinas, useUsos,
  type ClaseTiempo, type Reparto, type Rutina, type UsoTiempo,
} from './tiempo';

const PARTES: Array<{ k: keyof Omit<Reparto, 'opcional'>; nombre: string; color: string }> = [
  { k: 'sueno', nombre: 'Sueño', color: TIPOS.descanso.color },
  { k: 'fijo', nombre: 'Fijo', color: TIPOS.fabrica.color },
  { k: 'rutinas', nombre: 'Cosas diarias', color: TIPOS.casa.color },
  { k: 'libre', nombre: 'Libre', color: TIPOS.libre.color },
];

/** Barra de las 24 h repartidas, con la leyenda abajo. */
export function BarraTiempo({ r }: { r: Reparto }) {
  return (
    <>
      <div className="tiempo-barra" role="img" aria-label={PARTES.map((p) => `${p.nombre} ${duracion(r[p.k])}`).join(', ')}>
        {PARTES.map((p) => r[p.k] > 0 && <span key={p.k} style={{ flex: r[p.k], background: p.color }} />)}
      </div>
      <ul className="tiempo-leyenda">
        {PARTES.map((p) => (
          <li key={p.k}><i style={{ background: p.color }} />{p.nombre}<strong>{duracion(r[p.k])}</strong></li>
        ))}
      </ul>
    </>
  );
}

/** Tarjeta "Tu tiempo" del día: reparto de las 24 h y lo que anotaste que hiciste con el libre. */
export function TuTiempo({ vista }: { vista: VistaDia }) {
  const { filas: rutinas } = useRutinas();
  const { filas: usos } = useUsos();
  const [que, setQue] = useState('');
  const [min, setMin] = useState('');
  const [clase, setClase] = useState<ClaseTiempo>('productivo');
  const r = repartir(vista.bloques, rutinas, vista.diaSemana);
  const usado = usadoPorClase(usos, vista.fecha);
  const delDia = usos.filter((u) => u.fecha === vista.fecha);
  const anotadoLibre = usado.productivo + usado.ocio + usado.descanso;
  const sinRutinas = !rutinasDelDia(rutinas, vista.diaSemana).length;

  async function anotar(e: FormEvent) {
    e.preventDefault();
    const m = Math.round(Number(min));
    if (!que.trim() || !(m > 0)) return;
    await crear<UsoTiempo>(TT.tiempo, { fecha: vista.fecha, que: que.trim(), minutos: m, clase, nota: null, origen: 'app' });
    setQue(''); setMin('');
  }

  return (
    <Tarjeta titulo={<span className="etq-tit">TU TIEMPO · {duracion(r.libre)} LIBRES</span>}>
      <BarraTiempo r={r} />
      <p className="nota">
        {r.opcional > 0 && `Lo fijo incluye ${duracion(r.opcional)} que son "si se da". `}
        {r.sueno > 0 && `Si dormís 30 min menos te quedan ${duracion(r.libre + 30)} libres; 30 min más, ${duracion(Math.max(0, r.libre - 30))}.`}
      </p>
      {sinRutinas && <p className="nota">Todavía no cargaste las cosas de todos los días (bañarte, platos, ordenar). Sumalas en <a href="#/dia/semana">Semana tipo</a> para que el libre sea real.</p>}

      <h3 className="tiempo-sub">¿Qué hiciste con el libre?</h3>
      {delDia.length > 0 && (
        <>
          <p className="nota">
            {(Object.keys(CLASES) as ClaseTiempo[]).filter((c) => usado[c]).map((c) => `${CLASES[c].emoji} ${duracion(usado[c])} ${CLASES[c].nombre.toLowerCase()}`).join(' · ')}
            {r.libre > anotadoLibre && ` · sin anotar ${duracion(r.libre - anotadoLibre)}`}
          </p>
          <ul className="tareas">
            {delDia.map((u) => (
              <li key={u.id}>
                <span className="tilde fija">{CLASES[u.clase].emoji}</span>
                <span className="crece">{u.que}<small>{[duracion(u.minutos), CLASES[u.clase].nombre, u.origen === 'claude' && 'cargado por Claude'].filter(Boolean).join(' · ')}</small></span>
                <button className="btn-icono" onClick={() => eliminar(TT.tiempo, u.id)} aria-label="Borrar">{Icono.borrar}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="tarea-nueva tiempo-form" onSubmit={anotar}>
        <input value={que} onChange={(e) => setQue(e.target.value)} placeholder="Ej. leí, curso, ordené el placard…" aria-label="Qué hiciste" />
        <input type="number" inputMode="numeric" min={1} value={min} onChange={(e) => setMin(e.target.value)} placeholder="min" aria-label="Minutos" />
        <select value={clase} onChange={(e) => setClase(e.target.value as ClaseTiempo)} aria-label="Tipo">
          {(Object.keys(CLASES) as ClaseTiempo[]).map((c) => <option key={c} value={c}>{CLASES[c].nombre}</option>)}
        </select>
        <button className="btn btn-primario" aria-label="Anotar">{Icono.mas}</button>
      </form>
    </Tarjeta>
  );
}

const MOMENTOS = { cualquiera: 'Cuando sea', manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' } as const;
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

function textoDias(dias: number[] | null) {
  if (!dias?.length || dias.length === 7) return 'Todos los días';
  return ORDEN.filter((d) => dias.includes(d)).map((d) => DIAS_CORTOS[d].toLowerCase()).join(', ');
}

/** Cosas de todos los días: bañarse, lavar platos, ordenar… Le restan al tiempo libre. */
export function CosasDiarias() {
  const { filas: rutinas } = useRutinas();
  const [nombre, setNombre] = useState('');
  const [min, setMin] = useState('');
  const [veces, setVeces] = useState('');
  const [dias, setDias] = useState<number[]>([]);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const m = Math.round(Number(min));
    if (!nombre.trim() || !(m > 0)) return;
    await crear<Rutina>(TT.rutinas, {
      nombre: nombre.trim(), minutos: m, veces: Math.max(1, Math.round(Number(veces)) || 1),
      dias: dias.length && dias.length < 7 ? [...dias].sort() : null, momento: 'cualquiera', activo: true, nota: null,
    });
    setNombre(''); setMin(''); setVeces(''); setDias([]);
  }

  const total = rutinas.filter((x) => x.activo !== false && !x.dias?.length).reduce((s, x) => s + x.minutos * (x.veces || 1), 0);

  return (
    <Tarjeta titulo={<span className="etq-tit">COSAS DE TODOS LOS DÍAS{total ? ` · ${duracion(total)} DIARIAS` : ''}</span>}>
      <p className="nota">Lo que hacés seguido y te lleva tiempo (bañarte, lavar platos, ordenar). Se descuenta del tiempo libre.</p>
      {rutinas.length > 0 && (
        <ul className="tareas">
          {rutinas.map((x) => (
            <li key={x.id}>
              <button className={`tilde ${x.activo !== false ? 'si' : ''}`} onClick={() => modificar<Rutina>(TT.rutinas, x.id, { activo: x.activo === false })}
                aria-label={x.activo !== false ? 'Pausar' : 'Activar'}>{x.activo !== false ? '✓' : ''}</button>
              <span className={`crece ${x.activo === false ? 'tachado' : ''}`}>
                {x.nombre}
                <small>{[`${duracion(x.minutos)}${x.veces > 1 ? ` × ${x.veces}` : ''}`, textoDias(x.dias), x.momento !== 'cualquiera' && MOMENTOS[x.momento]].filter(Boolean).join(' · ')}</small>
              </span>
              <button className="btn-icono" onClick={() => eliminar(TT.rutinas, x.id)} aria-label="Borrar">{Icono.borrar}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="pila" style={{ gap: 8 }} onSubmit={agregar}>
        <div className="tarea-nueva">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. bañarme" aria-label="Qué" />
          <input type="number" inputMode="numeric" min={1} value={min} onChange={(e) => setMin(e.target.value)} placeholder="min" aria-label="Minutos cada vez" />
          <input type="number" inputMode="numeric" min={1} value={veces} onChange={(e) => setVeces(e.target.value)} placeholder="veces" aria-label="Veces por día" />
          <button className="btn btn-primario" aria-label="Agregar">{Icono.mas}</button>
        </div>
        <div className="dias-elegir" role="group" aria-label="Qué días (ninguno = todos)">
          {ORDEN.map((d) => (
            <button type="button" key={d} className={`chip ${dias.includes(d) ? 'chip-on' : ''}`} aria-pressed={dias.includes(d)}
              onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d])}>{DIAS_CORTOS[d]}</button>
          ))}
          <small className="nota">{dias.length ? '' : 'Sin marcar = todos los días'}</small>
        </div>
      </form>
    </Tarjeta>
  );
}
