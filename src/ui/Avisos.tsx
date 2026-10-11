import { useState } from 'react';
import { escribirStorage, leerStorage } from '../core/config';
import { hoy } from '../core/format';
import { useTodasLasSenales } from '../core/senales';
import type { Senal } from '../core/types';
import { Estado, Icono } from './ui';

/**
 * Avisos flotantes: las señales urgentes y las que traen un acceso directo aparecen arriba como
 * notificación, con un botón para resolverlas ya (ej. "Pagar"). Si la cerrás, no vuelve
 * hasta mañana o hasta que cambie lo que dice.
 */

const CLAVE = 'life.avisos.cerrados';
/** En el celular entran menos para no tapar la pantalla. */
const maximo = () => (window.matchMedia?.('(max-width: 760px)').matches ? 2 : 3);

type Cerrados = Record<string, string>; // clave del aviso → día en que se cerró
const claveDe = (s: Senal) => `${s.id}|${s.titulo}`;

function leerCerrados(): Cerrados {
  try {
    const c = JSON.parse(leerStorage(CLAVE) ?? '{}') as Cerrados;
    // Se olvidan los de días anteriores: el aviso vuelve a aparecer al otro día.
    return Object.fromEntries(Object.entries(c).filter(([, d]) => d === hoy()));
  } catch {
    return {};
  }
}

export function Avisos() {
  const senales = useTodasLasSenales();
  const [cerrados, setCerrados] = useState<Cerrados>(leerCerrados);

  const cerrar = (s: Senal, usar = false) => {
    // Al usar un acceso directo se cierran también los otros avisos que llevan al mismo lugar
    // (ej. "Alquiler vencido" e "Internet vence pronto" abren el mismo "ponerse al día").
    const iguales = usar && s.accion ? senales.filter((x) => x.accion?.ruta === s.accion!.ruta) : [s];
    const c = { ...leerCerrados(), ...Object.fromEntries([s, ...iguales].map((x) => [claveDe(x), hoy()])) };
    escribirStorage(CLAVE, JSON.stringify(c));
    setCerrados(c);
  };

  const pendientes = senales.filter((s) => (s.nivel === 'critico' || s.accion) && s.nivel !== 'ok' && !cerrados[claveDe(s)]);
  if (!pendientes.length) return null;
  const visibles = pendientes.slice(0, maximo());
  const resto = pendientes.length - visibles.length;

  return (
    <section className="avisos" aria-label="Avisos" aria-live="polite">
      {visibles.map((s) => (
        <article key={s.id} className={`aviso aviso-${s.nivel}`}>
          <a href={s.ruta ?? '#/'} className="aviso-texto" onClick={() => cerrar(s)}>
            <Estado nivel={s.nivel} />
            <strong>{s.titulo}</strong>
            {s.detalle && <small>{s.detalle}</small>}
          </a>
          <div className="aviso-acciones">
            {s.accion && (
              <a href={s.accion.ruta} className="btn btn-confirmar chico" onClick={() => cerrar(s, true)}>{s.accion.texto}</a>
            )}
            <button className="btn-icono" onClick={() => cerrar(s)} aria-label={`Cerrar aviso: ${s.titulo}`}>{Icono.cerrar}</button>
          </div>
        </article>
      ))}
      {resto > 0 && <a href="#/" className="aviso-mas">{resto === 1 ? 'Hay 1 aviso más' : `Hay ${resto} avisos más`} en Inicio</a>}
    </section>
  );
}
