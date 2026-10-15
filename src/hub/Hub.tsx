import { useState } from 'react';
import { MODULOS } from '../core/registry';
import { dinero, desdeISO, fechaLarga, hoy, relativo, sumarDias } from '../core/format';
import { calcularProgreso } from '../core/juego';
import { useTodasLasSenales } from '../core/senales';
import type { ItemAgenda } from '../core/types';
import { Semana } from '../ui/Semana';
import { Estado, Tarjeta } from '../ui/ui';

const DIAS_AGENDA = 14;

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

/** Fila de "jugador": nivel, experiencia y racha de días seguidos registrando cosas. */
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
        <small className="nota">Faltan {p.paraSubir - p.enNivel} XP para el nivel {p.nivel + 1}</small>
      </div>
      <div className="racha">{p.racha > 0 ? p.racha : '—'}<small>{p.racha === 1 ? 'día seguido' : 'días seguidos'}</small></div>
    </section>
  );
}

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** Tarjeta del día elegido: cabecera de color con la fecha y lo que hay ese día. */
function Dia({ dia, items, atrasados, nombreModulo }: {
  dia: string; items: ItemAgenda[]; atrasados: ItemAgenda[]; nombreModulo: Map<string, string>;
}) {
  const f = desdeISO(dia);
  const nombreDia = f.toLocaleDateString('es-AR', { weekday: 'long' });
  const mes = f.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  const rel = relativo(dia);
  const todos = [...atrasados, ...items];
  return (
    <section className="tarjeta dia" aria-label={`Agenda del ${fechaLarga(dia)}`}>
      <header className="dia-cab">
        <div className="dia-fecha"><strong>{f.getDate()}</strong><small>{mes}</small></div>
        <div className="dia-titulo">
          {rel === 'hoy' || rel === 'mañana' ? `${rel} · ${nombreDia}` : nombreDia}
          <span>{todos.length ? `${todos.length} ${todos.length === 1 ? 'cosa' : 'cosas'}` : 'libre'}</span>
        </div>
      </header>
      <div className="dia-cuerpo">
        {todos.length === 0 ? (
          <p className="nota dia-vacio">Nada agendado. Los vencimientos, cobros y compras aparecen acá.</p>
        ) : (
          todos.map((i) => (
            <a key={i.id} href={i.ruta ?? '#/'} className="dia-item">
              {i.fecha < hoy() ? <Estado nivel="critico" texto="Atrasado" /> : <span className="chip">{nombreModulo.get(i.modulo)}</span>}
              <span className="crece">{i.titulo}</span>
              {i.monto != null && <strong className="num">{dinero(i.monto, i.moneda)}</strong>}
            </a>
          ))
        )}
      </div>
    </section>
  );
}

export function Hub() {
  const senales = useTodasLasSenales();
  const h = hoy();
  const limite = sumarDias(h, DIAS_AGENDA - 1);
  const agenda = useAgenda().filter((i) => i.fecha <= limite);
  const nombreModulo = new Map(MODULOS.map((m) => [m.id, m.nombre]));
  const [elegido, setElegido] = useState(h);

  const conAlgo = new Set(agenda.map((i) => i.fecha));
  const delDia = agenda.filter((i) => i.fecha === elegido);
  const atrasados = elegido === h ? agenda.filter((i) => i.fecha < h && !i.hecho) : [];

  return (
    <div className="pila">
      <header className="hub-cab">
        <div>
          <h1>{saludo()}</h1>
          <p className="nota">{fechaLarga(h)}</p>
        </div>
        {senales.length > 0 && <span className="chip-fecha">{senales.length} {senales.length === 1 ? 'señal' : 'señales'}</span>}
      </header>

      <Semana desde={h} cantidad={DIAS_AGENDA} elegido={elegido} onElegir={setElegido} conAlgo={conAlgo} />
      <Dia dia={elegido} items={delDia} atrasados={atrasados} nombreModulo={nombreModulo} />

      <Jugador />

      <Tarjeta titulo={<>Señales {senales.length > 0 && <span className="contador">{senales.length}</span>}</>}>
        {senales.length === 0 ? (
          <p className="nota">Todo en orden. A medida que cargues datos, acá aparecen alertas y sugerencias.</p>
        ) : (
          <ul className="senales">
            {senales.map((s) => (
              <li key={s.id}>
                <a href={s.ruta ?? '#/'} className="senal">
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

      <div className="carrusel" aria-label="Resumen de cada módulo">
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
