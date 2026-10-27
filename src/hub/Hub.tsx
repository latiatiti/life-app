import { useState } from 'react';
import { MODULOS } from '../core/registry';
import { dinero, desdeISO, fechaLarga, hoy, relativo, sumarDias } from '../core/format';
import { calcularProgreso } from '../core/juego';
import { usePerfil, veModulo } from '../core/auth';
import { useTodasLasSenales } from '../core/senales';
import type { ItemAgenda, NivelSenal, Senal, Vital } from '../core/types';
import { Semana } from '../ui/Semana';
import { Estado, Modal } from '../ui/ui';

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

/**
 * Tablero del Inicio (2026-10-25, a pedido de ella): "LIFE" arriba y una tarjeta por área, cada una como un
 * signo vital (estado, la cifra que importa, lo raro y su botón). Tocar la tarjeta lleva al área completa.
 * Compu 4 × 2, celu 2 × 4. Debajo queda la agenda de los próximos días.
 */
const AREAS: Array<{ id: string; nombre: string; modulos: string[]; ruta: string }> = [
  { id: 'dia', nombre: 'Día', modulos: ['dia'], ruta: '#/dia' },
  { id: 'plata', nombre: 'Plata', modulos: ['economia', 'pagos'], ruta: '#/economia' },
  { id: 'entreno', nombre: 'Entreno', modulos: ['entrenamiento'], ruta: '#/entrenamiento' },
  { id: 'comida', nombre: 'Comida', modulos: ['alimentacion'], ruta: '#/alimentacion' },
  { id: 'compras', nombre: 'Compras', modulos: ['compras'], ruta: '#/compras' },
  { id: 'casa', nombre: 'En casa', modulos: ['stock'], ruta: '#/stock' },
];

type EstadoVital = 'critico' | 'aviso' | 'ok' | 'xp';
const ETIQUETA: Record<EstadoVital, string> = { critico: 'Urgente', aviso: 'Atención', ok: 'Bien', xp: 'Tu partida' };

function estadoDe(senales: Senal[]): EstadoVital {
  if (senales.some((x) => x.nivel === 'critico')) return 'critico';
  if (senales.some((x) => x.nivel === 'aviso')) return 'aviso';
  return 'ok';
}

const IMPORTA: NivelSenal[] = ['critico', 'aviso'];

/** Una tarjeta del tablero. Toda la tarjeta lleva al área (o abre su ventana); el botón de abajo hace la acción. */
function TarjetaVital({ nombre, estado, etiqueta, vital, aviso, ruta, onAbrir, accion }: {
  nombre: string; estado: EstadoVital; etiqueta?: string; vital: Vital; aviso?: string;
  ruta?: string; onAbrir?: () => void; accion?: { texto: string; ruta?: string; onClick?: () => void };
}) {
  return (
    <article className={`vital es-${estado}`}>
      {ruta
        ? <a className="vital-entrar" href={ruta} aria-label={`Entrar a ${nombre}`} />
        : <button type="button" className="vital-entrar" aria-label={`Ver ${nombre}`} onClick={onAbrir} />}
      <header className="vital-cab">
        <h2 className="vital-nombre">{nombre}</h2>
        <span className="vital-estado"><i aria-hidden="true" /><span>{etiqueta ?? ETIQUETA[estado]}</span></span>
      </header>
      <strong className="vital-cifra">{vital.cifra}</strong>
      {vital.sub && <p className="vital-sub">{vital.sub}</p>}
      {vital.barra != null && (
        <div className="vital-barra" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(vital.barra * 100)}>
          <b style={{ width: `${Math.max(0, Math.min(1, vital.barra)) * 100}%` }} />
        </div>
      )}
      {aviso && <p className="vital-aviso">{aviso}</p>}
      {accion && (accion.ruta
        ? <a className="vital-accion" href={accion.ruta}>{accion.texto}</a>
        : <button type="button" className="vital-accion" onClick={accion.onClick}>{accion.texto}</button>)}
    </article>
  );
}

function ListaSenales({ senales }: { senales: Senal[] }) {
  if (!senales.length) return <p className="nota">Todo en orden. A medida que cargues datos, acá aparecen alertas y sugerencias.</p>;
  return (
    <ul className="senales">
      {senales.map((s) => (
        <li key={s.id}>
          <a href={s.accion?.ruta ?? s.ruta ?? '#/'} className="senal">
            <Estado nivel={s.nivel} />
            <div className="crece">
              <strong>{s.titulo}</strong>
              {s.detalle && <small>{s.detalle}</small>}
            </div>
            {s.accion && <span className="btn chico">{s.accion.texto}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** abrirMenu: tocar el LIFE grande abre el menú con todo (en el Inicio no hay otro LIFE arriba). */
export function Hub({ abrirMenu }: { abrirMenu?: () => void }) {
  const perfil = usePerfil();
  const senales = useTodasLasSenales();
  // Un hook por módulo, siempre en el mismo orden (la lista de módulos es fija).
  const vitales = new Map<string, Vital>();
  for (const m of MODULOS) if (m.useVital) vitales.set(m.id, m.useVital());
  const p = calcularProgreso(useActividad());
  const h = hoy();
  const limite = sumarDias(h, DIAS_AGENDA - 1);
  const agenda = useAgenda().filter((i) => i.fecha <= limite);
  const nombreModulo = new Map(MODULOS.map((m) => [m.id, m.nombre]));
  const [elegido, setElegido] = useState(h);
  const [ventana, setVentana] = useState<'resolver' | 'partida' | null>(null);

  const conAlgo = new Set(agenda.map((i) => i.fecha));
  const delDia = agenda.filter((i) => i.fecha === elegido);
  const atrasados = elegido === h ? agenda.filter((i) => i.fecha < h && !i.hecho) : [];

  const urgentes = senales.filter((x) => x.nivel === 'critico').length;
  const mirar = senales.filter((x) => x.nivel === 'aviso').length;
  const conBoton = senales.find((x) => IMPORTA.includes(x.nivel) && x.accion);

  return (
    <div className="pila">
      <header className="tablero-cab">
        <span className="tablero-fecha">{saludo()} · {fechaLarga(h)}</span>
        <h1 className="tablero-logo">
          <button type="button" onClick={abrirMenu} aria-haspopup="dialog" title="Abrir el menú">LIF<span>E</span><i aria-hidden="true">▾</i></button>
        </h1>
      </header>

      <div className="tablero">
        {AREAS.filter((a) => a.modulos.some((id) => veModulo(perfil, id))).map((a) => {
          const v = vitales.get(a.modulos[0]);
          if (!v) return null;
          const propias = senales.filter((x) => a.modulos.includes(x.modulo));
          const top = propias.find((x) => IMPORTA.includes(x.nivel));
          const accion = top?.accion ?? v.accion;
          return (
            <TarjetaVital key={a.id} nombre={a.nombre} estado={estadoDe(propias)} vital={v} aviso={top?.titulo}
              ruta={a.ruta} accion={accion ? { texto: accion.texto, ruta: accion.ruta } : undefined} />
          );
        })}
        <TarjetaVital nombre="Mi partida" estado="xp" etiqueta={`Nivel ${p.nivel}`}
          vital={{ cifra: `${p.xp} XP`, sub: p.racha > 0 ? `Racha: ${p.racha} ${p.racha === 1 ? 'día' : 'días seguidos'}` : 'Cargá algo hoy para empezar la racha', barra: p.enNivel / p.paraSubir }}
          aviso={`Faltan ${p.paraSubir - p.enNivel} XP para el nivel ${p.nivel + 1}`}
          onAbrir={() => setVentana('partida')} accion={{ texto: 'Ver mi partida', onClick: () => setVentana('partida') }} />
        <TarjetaVital nombre="Para resolver" estado={estadoDe(senales)}
          etiqueta={urgentes ? `${urgentes} urgente${urgentes > 1 ? 's' : ''}` : undefined}
          vital={{ cifra: senales.length === 1 ? '1 aviso' : `${senales.length} avisos`, sub: senales.length ? `${urgentes} urgente${urgentes === 1 ? '' : 's'} · ${mirar} para mirar · ${senales.length - urgentes - mirar} info` : 'Todo en orden' }}
          aviso={senales.find((x) => IMPORTA.includes(x.nivel))?.titulo}
          onAbrir={() => setVentana('resolver')}
          accion={conBoton?.accion ? { texto: conBoton.accion.texto, ruta: conBoton.accion.ruta } : { texto: 'Ver todo', onClick: () => setVentana('resolver') }} />
      </div>

      <h2 className="tablero-sub">Próximos días</h2>
      <Semana desde={h} cantidad={DIAS_AGENDA} elegido={elegido} onElegir={setElegido} conAlgo={conAlgo} />
      <Dia dia={elegido} items={delDia} atrasados={atrasados} nombreModulo={nombreModulo} />

      <Modal titulo="Para resolver" abierto={ventana === 'resolver'} onCerrar={() => setVentana(null)}>
        <ListaSenales senales={senales} />
      </Modal>
      <Modal titulo="Mi partida" abierto={ventana === 'partida'} onCerrar={() => setVentana(null)}>
        <div className="pila">
          <Jugador />
          <p className="nota">Cada cosa que cargás suma 10 XP (un entreno, 50; una compra cerrada, 30). La racha cuenta los días seguidos en que cargaste algo.</p>
        </div>
      </Modal>
    </div>
  );
}
