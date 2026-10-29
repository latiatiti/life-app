import { useState, type FormEvent } from 'react';
import { crear, eliminar, modificar, useTabla, type Fila } from '../../core/db';
import { desdeISO, diasEntre, hoy, relativo, sumarDias } from '../../core/format';
import { Icono, Tarjeta } from '../../ui/ui';
import { useCompras, type Compra } from './modelo';

/** Cada cuánto se va a comprar a cada lugar (aproximado). Tabla com_frecuencias. */

export type Lugar = 'super' | 'verduleria' | 'carniceria' | 'otro';
export const LUGARES: Record<Lugar, string> = { super: 'Súper', verduleria: 'Verdulería', carniceria: 'Carnicería', otro: 'Otro' };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export interface Frecuencia extends Fila {
  nombre: string;
  lugar: Lugar;
  cada_dias: number;
  /** Día de la semana en que suele ir (0 = domingo). Opcional. */
  dia_habitual: number | null;
  /** Última vez que fue (anotada a mano). Para el súper también cuenta la última compra cerrada. */
  ultima: string | null;
  activo: boolean;
  nota?: string | null;
}

export const TF = 'com_frecuencias';
export const useFrecuencias = () => useTabla<Frecuencia>(TF);

/** Próxima día en que cae ese día de la semana, desde la fecha (incluida). */
function proximoDia(desde: string, dow: number) {
  return sumarDias(desde, (dow - desdeISO(desde).getDay() + 7) % 7);
}

/** Última ida: la anotada o, para el súper, la última compra cerrada (la más nueva de las dos). */
export function ultimaIda(f: Frecuencia, compras: Compra[]): string | null {
  const ult = f.lugar === 'super' ? compras.reduce<string | null>((m, c) => (!m || c.fecha > m ? c.fecha : m), null) : null;
  return [f.ultima, ult].filter(Boolean).sort().pop() ?? null;
}

/** Fecha aproximada de la próxima ida. Si tiene día habitual, la corre a ese día (hasta 3 días antes o después). */
export function proximaIda(f: Frecuencia, compras: Compra[]): string | null {
  const ult = ultimaIda(f, compras);
  if (!ult) return f.dia_habitual == null ? null : proximoDia(hoy(), f.dia_habitual);
  const base = sumarDias(ult, f.cada_dias);
  return f.dia_habitual == null ? base : proximoDia(sumarDias(base, -3), f.dia_habitual);
}

export interface Toca { f: Frecuencia; proxima: string; hace: number | null }

/** Lugares a los que ya toca ir (la próxima ida es hoy o ya pasó). */
export function tocaIr(frecs: Frecuencia[], compras: Compra[]): Toca[] {
  const h = hoy();
  return frecs.filter((f) => f.activo !== false).flatMap((f) => {
    const proxima = proximaIda(f, compras);
    const ult = ultimaIda(f, compras);
    return proxima && proxima <= h ? [{ f, proxima, hace: ult ? diasEntre(ult, h) : null }] : [];
  });
}

export function TarjetaFrecuencias() {
  const { filas: frecs } = useFrecuencias();
  const { filas: compras } = useCompras();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [lugar, setLugar] = useState<Lugar>('super');
  const [cada, setCada] = useState('');
  const [dia, setDia] = useState('');

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(cada));
    if (!(n > 0)) return;
    await crear<Frecuencia>(TF, {
      nombre: nombre.trim() || LUGARES[lugar], lugar, cada_dias: n, dia_habitual: dia === '' ? null : Number(dia), ultima: null, activo: true, nota: null,
    });
    setNombre(''); setCada(''); setDia(''); setAbierto(false);
  }

  if (!frecs.length && !abierto) {
    return (
      <Tarjeta titulo="Cada cuánto vas a comprar">
        <p className="nota">Contame cada cuánto vas al súper, la verdulería o la carnicería (aproximado) y te aviso cuando te toca.</p>
        <button className="btn" onClick={() => setAbierto(true)}>{Icono.mas} Agregar</button>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Cada cuánto vas a comprar" accion={!abierto && <button className="btn chico" onClick={() => setAbierto(true)}>{Icono.mas}</button>}>
      <ul className="tareas">
        {frecs.map((f) => {
          const prox = proximaIda(f, compras);
          const ult = ultimaIda(f, compras);
          const toca = prox && prox <= hoy();
          return (
            <li key={f.id}>
              <span className="crece">
                {f.nombre}
                <small>{[`cada ~${f.cada_dias} días`, f.dia_habitual != null && `suele ir el ${DIAS[f.dia_habitual]}`, ult && `última ${relativo(ult)}`].filter(Boolean).join(' · ')}</small>
              </span>
              {prox && <span className={`chip ${toca ? 'chip-on' : ''}`}>{toca ? 'Te toca' : relativo(prox)}</span>}
              <button className="btn chico" onClick={() => modificar<Frecuencia>(TF, f.id, { ultima: hoy() })}>Fui hoy</button>
              <button className="btn-icono" onClick={() => eliminar(TF, f.id)} aria-label="Borrar">{Icono.borrar}</button>
            </li>
          );
        })}
      </ul>
      {abierto && (
        <form className="pila" style={{ gap: 8 }} onSubmit={agregar}>
          <div className="fila-campos">
            <select value={lugar} onChange={(e) => setLugar(e.target.value as Lugar)} aria-label="Lugar">
              {(Object.keys(LUGARES) as Lugar[]).map((l) => <option key={l} value={l}>{LUGARES[l]}</option>)}
            </select>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (opcional)" aria-label="Nombre" />
            <input type="number" inputMode="numeric" min={1} value={cada} onChange={(e) => setCada(e.target.value)} placeholder="Cada ¿cuántos? días" aria-label="Cada cuántos días" />
            <select value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Día habitual">
              <option value="">Cualquier día</option>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DIAS[d]}</option>)}
            </select>
          </div>
          <div className="barra-acciones">
            <button className="btn btn-primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </Tarjeta>
  );
}
