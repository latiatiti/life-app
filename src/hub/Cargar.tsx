import { useState, type ReactNode } from 'react';
import { ir } from '../core/router';
import { FormComida } from '../modules/alimentacion/Pantallas';
import { FormMovimiento } from '../modules/economia/FormMovimiento';
import { Icono, Modal } from '../ui/ui';

/**
 * Botón "+" de la barra: un solo lugar para cargar cualquier cosa rápido (pilar 4: un formulario por acción).
 * Lo que tiene formulario corto se carga acá mismo con el formulario de siempre; lo demás lleva a su pantalla.
 */
interface Opcion { id: string; texto: string; ayuda: string; modulo: string; ruta?: string; form?: 'gasto' | 'comida' }

const OPCIONES: Opcion[] = [
  { id: 'gasto', texto: 'Gasto', ayuda: 'Anotar algo que pagaste', modulo: 'economia', form: 'gasto' },
  { id: 'cobre', texto: 'Cobré', ayuda: 'Reparto, fábrica u otro ingreso', modulo: 'economia', ruta: 'economia/ingresos' },
  { id: 'pague', texto: 'Pagué', ayuda: 'Un vencimiento de Pagos', modulo: 'pagos', ruta: 'pagos/al-dia' },
  { id: 'tarea', texto: 'Tarea', ayuda: 'Algo para hacer hoy o otro día', modulo: 'dia', ruta: 'dia' },
  { id: 'comi', texto: 'Comí', ayuda: 'Un plato o algo suelto', modulo: 'alimentacion', form: 'comida' },
  { id: 'lista', texto: 'Agregar a la lista', ayuda: 'Para la próxima compra', modulo: 'compras', ruta: 'compras' },
  { id: 'entreno', texto: 'Empezar entreno', ayuda: 'La rutina que toca hoy', modulo: 'entrenamiento', ruta: 'entrenamiento' },
];

export function BotonCargar({ ve }: { ve: (modulo: string) => boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Opcion['form'] | null>(null);
  const cerrar = () => { setAbierto(false); setForm(null); };
  const titulos: Record<NonNullable<Opcion['form']>, string> = { gasto: 'Nuevo gasto', comida: 'Qué comiste' };

  let cuerpo: ReactNode;
  if (form === 'gasto') cuerpo = <FormMovimiento onListo={cerrar} />;
  else if (form === 'comida') cuerpo = <FormComida onListo={cerrar} />;
  else cuerpo = (
    <div className="cargar-opciones">
      {OPCIONES.filter((o) => ve(o.modulo)).map((o) => (
        <button key={o.id} type="button" onClick={() => { if (o.form) setForm(o.form); else { cerrar(); ir(o.ruta!); } }}>
          <strong>{o.texto}</strong>
          <small>{o.ayuda}</small>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button type="button" className="nav-cargar" aria-label="Cargar algo" onClick={() => setAbierto(true)}>
        {Icono.mas}
        <span>Cargar</span>
      </button>
      <Modal titulo={form ? titulos[form] : '¿Qué cargás?'} abierto={abierto} onCerrar={cerrar}>
        {cuerpo}
      </Modal>
    </>
  );
}
