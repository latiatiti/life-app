import { MODULOS } from '../core/registry';
import { dinero, fechaCorta, fechaLarga, hoy, relativo, sumarDias } from '../core/format';
import { calcularProgreso } from '../core/juego';
import type { ItemAgenda, NivelSenal, Senal } from '../core/types';
import { Estado, Tarjeta } from '../ui/ui';

const ORDEN: Record<NivelSenal, number> = { critico: 0, aviso: 1, info: 2, ok: 3 };

/** Junta las señales de todos los módulos. La lista de módulos es fija, así el orden de hooks no cambia. */
function useSenales(): Senal[] {
  const todas: Senal[] = [];
  for (const m of MODULOS) if (m.useSenales) todas.push(...m.useSenales());
  return todas.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}

function useAgenda(): ItemAgenda[] {
  const todos: ItemAgenda[] = [];
  for (const m of MODULOS) if (m.useAgenda) todos.push(...m.useAgenda());
  return todos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function useActividad(): string[] {
  const todas: string[] = [];
  for (const m of MODULOS) if (m.useActividad) todas.push(...m.useActividad());
  return todas;
}

/** Tarjeta de "jugador": nivel, experiencia y racha de días seguidos registrando cosas. */
function Jugador() {
  const p = calcularProgreso(useActividad());
  return (
    <section className="tarjeta jugador" aria-label="Tu progreso">
      <div className="jugador-nivel"><div className="centro"><small>NIVEL</small>{p.nivel}</div></div>
      <div className="crece">
        <strong>{p.xp} XP</strong>
        <div className="barra-xp" role="meter" aria-valuemin={0} aria-valuemax={p.paraSubir} aria-valuenow={p.enNivel}>
          <div style={{ width: `${(p.enNivel / p.paraSubir) * 100}%` }} />
        </div>
        <small className="nota">Faltan {p.paraSubir - p.enNivel} XP para el nivel {p.nivel + 1}. Cada cosa que registrás suma.</small>
      </div>
      <div className="racha">{p.racha > 0 ? `🔥 ${p.racha}` : '—'}<small>{p.racha === 1 ? 'día seguido' : 'días seguidos'}</small></div>
    </section>
  );
}

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function Hub() {
  const senales = useSenales();
  const limite = sumarDias(hoy(), 14);
  const agenda = useAgenda().filter((i) => i.fecha <= limite);
  const nombreModulo = new Map(MODULOS.map((m) => [m.id, m.nombre]));

  // Agrupar agenda por día
  const dias = new Map<string, ItemAgenda[]>();
  for (const i of agenda) dias.set(i.fecha, [...(dias.get(i.fecha) ?? []), i]);

  return (
    <div className="pila">
      <header className="hub-cab">
        <h1>{saludo()}</h1>
        <p className="nota">{fechaLarga(hoy())}</p>
      </header>

      <Jugador />

      <Tarjeta titulo="Señales">
        {senales.length === 0 ? (
          <p className="nota">Todo en orden. A medida que cargues datos, acá aparecen alertas y sugerencias.</p>
        ) : (
          <ul className="senales">
            {senales.map((s) => (
              <li key={s.id}>
                <a href={s.ruta ?? '#/'} className={`senal senal-${s.nivel}`}>
                  <Estado nivel={s.nivel} />
                  <div>
                    <strong>{s.titulo}</strong>
                    {s.detalle && <small>{s.detalle}</small>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <div className="grilla-hub">
        <Tarjeta titulo="Agenda · próximos 14 días" className="agenda">
          {agenda.length === 0 ? (
            <p className="nota">Nada agendado. Los vencimientos de Pagos (y más adelante tareas y eventos) aparecen acá.</p>
          ) : (
            <ol className="agenda-lista">
              {[...dias.entries()].map(([dia, items]) => (
                <li key={dia}>
                  <div className={`agenda-dia ${dia < hoy() ? 'texto-critico' : ''}`}>
                    <strong>{fechaCorta(dia)}</strong>
                    <small>{relativo(dia)}</small>
                  </div>
                  <ul>
                    {items.map((i) => (
                      <li key={i.id}>
                        <a href={i.ruta ?? '#/'}>
                          <span className="chip">{nombreModulo.get(i.modulo)}</span>
                          <span className="crece">{i.titulo}</span>
                          {i.monto != null && <span className="num">{dinero(i.monto, i.moneda)}</span>}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        {MODULOS.filter((m) => m.enHub !== false && m.Resumen).map((m) => {
          const R = m.Resumen!;
          return (
            <Tarjeta key={m.id} titulo={<a href={`#/${m.id}`} className="tit-link">{m.icono}{m.nombre}</a>}>
              <R />
            </Tarjeta>
          );
        })}
      </div>
    </div>
  );
}
