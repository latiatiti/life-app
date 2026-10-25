import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { alCerrarPaso, deshacer, type Paso } from '../core/db';
import { Modal } from './ui';

/** Cuánto tiempo queda a la vista el botón DESHACER. */
const DURA = 5000;

/**
 * Aviso de abajo después de guardar o borrar: "Guardado · DESHACER" durante 5 segundos (pilar 7).
 * Va una sola vez en App; escucha todas las escrituras de la capa de datos.
 */
export function AvisoDeshacer() {
  const [paso, setPaso] = useState<Paso | null>(null);
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => alCerrarPaso((p) => {
    setPaso(p);
    setMsg('');
    clearTimeout(t.current);
    t.current = setTimeout(() => setPaso(null), DURA);
  }), []);

  if (!paso) return null;
  const texto = msg || (paso.tipo === 'borrado' ? 'Borrado' : 'Guardado');
  return (
    <div className="deshacer" role="status" key={paso.id}>
      <span>{texto}</span>
      {!msg && paso.deshacible && paso.inversas.length > 0 && (
        <button type="button" onClick={async () => {
          clearTimeout(t.current);
          try {
            await deshacer(paso);
            setMsg('Listo, quedó como antes');
          } catch (e) {
            setMsg(`No se pudo deshacer: ${(e as Error).message}`);
          }
          t.current = setTimeout(() => setPaso(null), 2500);
        }}>DESHACER</button>
      )}
    </div>
  );
}

/* ---------- Confirmar lo que no tiene vuelta ----------
 * Reemplaza a window.confirm: misma ventana de la app (en el celu sube desde abajo), dice qué va a pasar
 * y el botón lleva el verbo. Uso: if (await confirmar('¿Borrar esta compra? No borra el gasto.')) … */

interface Pedido { pregunta: string; detalle?: string; boton: string; responder: (si: boolean) => void }
let pedido: Pedido | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function confirmar(texto: string, boton?: string): Promise<boolean> {
  // "¿Pregunta? Explicación" → título y detalle por separado (la explicación puede ir antes o después).
  const m = /¿[^?]*\?/.exec(texto);
  const pregunta = m ? m[0] : texto;
  const detalle = m ? `${texto.slice(0, m.index)} ${texto.slice(m.index + m[0].length)}`.trim().replace(/^\((.*)\)$/, '$1') : '';
  // El botón repite el verbo de la pregunta (¿Borrar…? → BORRAR).
  const verbo = boton ?? pregunta.replace(/^¿/, '').split(/\s+/)[0];
  return new Promise((resolver) => {
    pedido?.responder(false);
    pedido = { pregunta, detalle: detalle || undefined, boton: verbo.toUpperCase(), responder: (si) => { pedido = null; avisar(); resolver(si); } };
    avisar();
  });
}

export function VentanaConfirmar() {
  const p = useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => pedido);
  return (
    <Modal titulo="Confirmar" abierto={!!p} onCerrar={() => p?.responder(false)}>
      {p && (
        <div className="pila confirmar">
          <p className="confirmar-pregunta">{p.pregunta}</p>
          {p.detalle && <p className="nota">{p.detalle}</p>}
          <div className="acciones">
            <button className="btn" onClick={() => p.responder(false)}>No, volver</button>
            <button className={`btn ${/^(BORRAR|CANCELAR|CORTAR|VACIAR|ELIMINAR|QUITAR)$/.test(p.boton) ? 'btn-peligro' : 'btn-primario'}`} onClick={() => p.responder(true)}>{p.boton}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
