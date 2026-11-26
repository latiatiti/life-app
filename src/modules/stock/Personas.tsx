import { useState } from 'react';
import { crear, eliminar, modificar, useTabla } from '../../core/db';
import { confirmar } from '../../ui/Deshacer';
import { Campo, Icono, Tarjeta } from '../../ui/ui';
import { armarPersonas, claveDe, type Persona, type PersonaCfg, TPER } from './modelo';

/** Suma una persona nueva (con clave única) y devuelve su clave. */
export async function sumarPersona(nombre: string, filas: PersonaCfg[], cuenta: string | null = null): Promise<string> {
  const limpio = nombre.trim();
  const ya = filas.find((p) => p.nombre.toLowerCase() === limpio.toLowerCase());
  if (ya) {
    if (ya.activa === false) await modificar<PersonaCfg>(TPER, ya.id, { activa: true });
    return ya.clave;
  }
  let clave = claveDe(limpio);
  if (clave === 'yo' || clave === 'compartido') clave = `${clave}-2`;
  for (let n = 2; filas.some((p) => p.clave === clave); n++) clave = `${claveDe(limpio)}-${n}`;
  const orden = Math.max(0, ...filas.map((p) => Number(p.orden) || 0)) + 1;
  await crear<PersonaCfg>(TPER, { nombre: limpio, clave, cuenta: cuenta?.trim() || null, orden, activa: true });
  return clave;
}

/** Botonera "¿Para quién?": Yo, cada persona y Los dos / Entre todos, con "+" para sumar a alguien ahí mismo. */
export function ElegirPersona({ valor, onCambio, etiqueta = 'Para quién', sinCompartido = false }: {
  valor: Persona; onCambio: (p: Persona) => void; etiqueta?: string; sinCompartido?: boolean;
}) {
  const { filas } = useTabla<PersonaCfg>(TPER);
  const ps = armarPersonas(filas);
  const [sumando, setSumando] = useState(false);
  const [nombre, setNombre] = useState('');
  const quienes = ps.quienes.filter((q) => !(sinCompartido && q === 'compartido'));

  async function listo() {
    if (!nombre.trim()) { setSumando(false); return; }
    const clave = await sumarPersona(nombre, filas);
    setNombre(''); setSumando(false); onCambio(clave);
  }

  return (
    <div className="pila" style={{ gap: 6 }}>
      <div className="segmentado" role="radiogroup" aria-label={etiqueta}>
        {quienes.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={valor === p} className={valor === p ? 'activo' : ''} onClick={() => onCambio(p)}>
            {ps.nombre(p)}
          </button>
        ))}
        <button type="button" aria-label="Sumar una persona" title="Sumar una persona" onClick={() => setSumando(!sumando)}>{Icono.mas}</button>
      </div>
      {sumando && (
        <div className="fila-campos" style={{ alignItems: 'end' }}>
          <label className="campo crece"><span>¿Con quién más comprás?</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej. Ulises)" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void listo(); } }} />
          </label>
          <button type="button" className="btn btn-primario" onClick={() => void listo()}>Sumar</button>
        </div>
      )}
    </div>
  );
}

/** Ajustes → Con quién compartís: lista editable de personas (nombre y usuario de LIFE opcional). */
export function TarjetaPersonas() {
  const { filas } = useTabla<PersonaCfg>(TPER);
  const lista = [...filas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const [nombre, setNombre] = useState('');
  const [cuenta, setCuenta] = useState('');

  async function sumar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    await sumarPersona(nombre, filas, cuenta);
    setNombre(''); setCuenta('');
  }

  return (
    <Tarjeta titulo="Con quién compartís compras">
      <p className="nota">Las personas que aparecen en "¿Para quién?" al escanear, al repartir un ticket y en el stock de casa. Lo de "Los dos" (o "Entre todos") se divide en partes iguales.</p>
      {lista.length > 0 && (
        <ul className="lista">
          {lista.map((p) => (
            <li key={p.id} className="lista-item">
              <span className="crece">
                <input aria-label="Nombre" defaultValue={p.nombre} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.nombre) void modificar<PersonaCfg>(TPER, p.id, { nombre: v }); }} />
                <small className="nota">
                  <input aria-label={`Usuario de LIFE de ${p.nombre}`} defaultValue={p.cuenta ?? ''} placeholder="Su usuario de LIFE (opcional)"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== p.cuenta) void modificar<PersonaCfg>(TPER, p.id, { cuenta: v }); }} />
                </small>
              </span>
              <label className="fila-derecha nota"><input type="checkbox" checked={p.activa !== false} onChange={(e) => void modificar<PersonaCfg>(TPER, p.id, { activa: e.target.checked })} /> Activa</label>
              <button className="btn-icono" aria-label={`Borrar a ${p.nombre}`} onClick={async () => {
                if (await confirmar(`¿Borrar a ${p.nombre}? Lo que ya cargaste a su nombre queda guardado; si querés que no aparezca más, también podés desactivarla.`)) await eliminar(TPER, p.id);
              }}>{Icono.borrar}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="form" onSubmit={sumar}>
        <div className="fila-campos" style={{ alignItems: 'end' }}>
          <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Ulises" /></Campo>
          <Campo etiqueta="Usuario de LIFE (opcional)"><input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Si tiene cuenta" /></Campo>
          <button className="btn btn-primario" disabled={!nombre.trim()}>Sumar</button>
        </div>
      </form>
    </Tarjeta>
  );
}
