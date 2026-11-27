import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { leerStorage, escribirStorage } from '../core/config';
import { usePerfil, puedeEscribir, veModulo } from '../core/auth';
import { modificar } from '../core/db';
import { dinero, fechaCorta, hoy } from '../core/format';
import { useTodasLasSenales } from '../core/senales';
import type { ItemAgenda } from '../core/types';
import { TD, useDias, type DiaMarcado, type Prioridad } from '../modules/dia/modelo';
import { columnas, etapaDe, mover, useConfigTablero, useTarjetas, type Tarjeta } from '../modules/tablero/modelo';
import { festejar } from '../modules/tablero/Tablero';
import { abrirCortina } from '../modules/tablero/Cortina';
import { nombreChat, situacion, useChatsWa, useRefresco, useSesionWa } from '../modules/whatsapp/modelo';
import { Campo, Icono, Tarjeta as Caja } from '../ui/ui';

/* =====================================================================================
 * "Mi día" arriba del tablero del Inicio (2026-11-26, pedido de ella): lo que tiene que
 * hacer hoy para ir tachándolo, los mensajes que la esperan y sus accesos de siempre
 * (el sistema de la sodería). Pilar 5: lo diario adelante. Pilar 4: nada se copia, cada
 * renglón es el mismo dato de su sección (prioridades del Día, tarjetas del Tablero,
 * vencimientos de la agenda) y tildarlo acá es tildarlo allá.
 * ===================================================================================== */

/* ---------- Accesos (links a otros sistemas) ---------- */

export interface Acceso { nombre: string; url: string }
const CLAVE_ACCESOS = 'life.inicio.accesos';
/** El sistema de la sodería La Tía Titi. Solo se ofrece de entrada a la dueña (superadmin). */
export const SODERIA: Acceso = { nombre: 'Sodería Tía Titi', url: 'https://app.tiatiti.com' };

function leerAccesos(superadmin: boolean): Acceso[] {
  try {
    const crudo = leerStorage(CLAVE_ACCESOS);
    if (crudo) return (JSON.parse(crudo) as Acceso[]).filter((a) => a && a.nombre && /^https?:\/\//.test(a.url));
  } catch { /* si está roto, vuelve a lo de fábrica */ }
  return superadmin ? [SODERIA] : [];
}

const EVENTO_ACCESOS = 'life-accesos';
function guardarAccesos(lista: Acceso[]) {
  escribirStorage(CLAVE_ACCESOS, JSON.stringify(lista));
  window.dispatchEvent(new Event(EVENTO_ACCESOS));
}

function useAccesos(): Acceso[] {
  const perfil = usePerfil();
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener(EVENTO_ACCESOS, f);
    return () => window.removeEventListener(EVENTO_ACCESOS, f);
  }, []);
  return leerAccesos(perfil.rol === 'superadmin');
}

/** Ajustes → Accesos del Inicio: qué sistemas aparecen arriba en el Inicio (se guarda en este aparato). */
export function AjustesAccesos() {
  const perfil = usePerfil();
  const [lista, setLista] = useState<Acceso[]>(() => leerAccesos(perfil.rol === 'superadmin'));
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('https://');
  const [msg, setMsg] = useState('');
  const cambiar = (l: Acceso[]) => { setLista(l); guardarAccesos(l); };

  function sumar(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!nombre.trim() || !/^https?:\/\/[^\s.]+\.[^\s]+/.test(u)) { setMsg('Poné un nombre y un link que empiece con https://'); return; }
    cambiar([...lista, { nombre: nombre.trim(), url: u }]);
    setNombre(''); setUrl('https://'); setMsg('');
  }

  return (
    <Caja titulo="Accesos del Inicio">
      <p className="nota">Botones arriba de todo en el Inicio para abrir otros sistemas (por ejemplo la sodería). Se abren en otra pestaña. Se guardan en este aparato.</p>
      <ul className="accesos-ajustes">
        {lista.map((a, i) => (
          <li key={`${a.url}-${i}`}>
            <span className="crece"><strong>{a.nombre}</strong><small>{a.url}</small></span>
            <button type="button" className="btn-icono" disabled={i === 0} onClick={() => { const l = [...lista]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; cambiar(l); }} aria-label="Subir">▲</button>
            <button type="button" className="btn-icono" onClick={() => cambiar(lista.filter((_, j) => j !== i))} aria-label={`Sacar ${a.nombre}`}>{Icono.cerrar}</button>
          </li>
        ))}
        {!lista.length && <li className="nota">Ninguno por ahora.</li>}
      </ul>
      <form className="accesos-form" onSubmit={sumar}>
        <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Reparto de hoy" /></Campo>
        <Campo etiqueta="Link"><input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" /></Campo>
        <button type="submit" className="btn btn-primario">{Icono.mas} Sumar</button>
      </form>
      {perfil.rol === 'superadmin' && !lista.some((a) => a.url === SODERIA.url) && (
        <button type="button" className="btn" onClick={() => cambiar([SODERIA, ...lista])}>Volver a poner la sodería</button>
      )}
      {msg && <p className="aviso-msg" role="status">{msg}</p>}
    </Caja>
  );
}

/* ---------- Para hacer hoy ---------- */

type Renglon =
  | { tipo: 'prioridad'; id: string; texto: string; hecho: boolean; i: number; dia: DiaMarcado }
  | { tipo: 'tarjeta'; id: string; texto: string; hecho: boolean; t: Tarjeta; detalle: string; atrasada: boolean }
  | { tipo: 'agenda'; id: string; texto: string; hecho: false; item: ItemAgenda; detalle: string; atrasada: boolean };

const MAX_VISTOS = 7;
const PESO = { alta: 0, media: 1, baja: 2 } as const;

function ParaHoy({ agenda, escribe, nombreModulo }: { agenda: ItemAgenda[]; escribe: boolean; nombreModulo: Map<string, string> }) {
  const perfil = usePerfil();
  const h = hoy();
  const { filas: dias } = useDias();
  const { filas: tarjetas } = useTarjetas();
  const { etapas } = useConfigTablero();
  const ult = etapas[etapas.length - 1].id;
  const [verTodo, setVerTodo] = useState(false);

  const renglones = useMemo(() => {
    const out: Renglon[] = [];
    const dia = dias.find((d) => d.fecha === h);
    (dia?.prioridades ?? []).forEach((p: Prioridad, i) => {
      if (p.texto?.trim()) out.push({ tipo: 'prioridad', id: `p${i}`, texto: p.texto, hecho: !!p.hecho, i, dia: dia! });
    });
    // Tarjetas del Tablero/Día que tocan hoy: con fecha hoy o atrasadas, en marcha, o de prioridad alta.
    // Las que se terminaron hoy quedan tachadas para ver el avance.
    const tocan = tarjetas.filter((t) => {
      if (t.hecho) return (t.fecha === h || t.movida === h) && (t.fecha ? t.fecha <= h : true);
      if (t.fecha) return t.fecha <= h;
      return t.prioridad === 'alta' || etapaDe(t, etapas) !== etapas[0].id;
    }).sort((a, b) => Number(a.hecho) - Number(b.hecho)
      || Number(!a.fecha || a.fecha >= h) - Number(!b.fecha || b.fecha >= h)
      || PESO[a.prioridad] - PESO[b.prioridad]
      || (a.hora ?? '99').localeCompare(b.hora ?? '99'));
    for (const t of tocan) {
      const atrasada = !t.hecho && !!t.fecha && t.fecha < h;
      const det = [
        atrasada ? `Atrasada · ${fechaCorta(t.fecha!)}` : t.hora ? t.hora : null,
        t.prioridad === 'alta' ? '▲ alta' : null,
        !t.fecha && etapaDe(t, etapas) !== etapas[0].id && !t.hecho ? etapas.find((e) => e.id === etapaDe(t, etapas))?.nombre : null,
        t.categoria,
      ].filter(Boolean).join(' · ');
      out.push({ tipo: 'tarjeta', id: t.id, texto: t.titulo, hecho: t.hecho, t, detalle: det, atrasada });
    }
    // Lo de otras secciones con fecha hoy o vencido (pagos, cobros, compras…): se resuelve en su pantalla.
    for (const i of agenda) {
      if (i.modulo === 'dia' || i.hecho || i.fecha > h) continue;
      if (!veModulo(perfil, i.modulo)) continue;
      const atrasada = i.fecha < h;
      const det = [nombreModulo.get(i.modulo), atrasada ? `Vencido · ${fechaCorta(i.fecha)}` : null, i.monto != null ? dinero(i.monto, i.moneda) : null].filter(Boolean).join(' · ');
      out.push({ tipo: 'agenda', id: i.id, texto: i.titulo, hecho: false, item: i, detalle: det, atrasada });
    }
    return out;
  }, [dias, tarjetas, etapas, agenda, h, perfil, nombreModulo]);

  const total = renglones.length;
  const hechos = renglones.filter((r) => r.hecho).length;
  const pendientes = renglones.filter((r) => !r.hecho);
  const vistos = verTodo ? renglones : [...pendientes.slice(0, MAX_VISTOS), ...renglones.filter((r) => r.hecho).slice(0, Math.max(0, MAX_VISTOS - pendientes.length))];
  const ocultos = renglones.length - vistos.length;
  const pct = total ? hechos / total : 0;

  async function tildar(r: Renglon, e: MouseEvent) {
    if (!escribe) return;
    if (r.tipo === 'prioridad') {
      const nuevas = (r.dia.prioridades ?? []).map((p, j) => (j === r.i ? { ...p, hecho: !p.hecho } : p));
      await modificar<DiaMarcado>(TD.dias, r.dia.id, { prioridades: nuevas });
      if (!r.hecho) festejar(e.clientX, e.clientY);
    } else if (r.tipo === 'tarjeta') {
      const cols = columnas(tarjetas, etapas);
      const destino = r.hecho ? etapas[0].id : ult;
      await mover(r.t, destino, etapas, cols.get(destino) ?? [], null);
      if (!r.hecho) festejar(e.clientX, e.clientY);
    }
  }

  return (
    <section className="tarjeta midia-hoy" aria-label="Para hacer hoy">
      <header className="midia-cab">
        <h2>Para hacer hoy</h2>
        <span className={`midia-cuenta ${total && hechos === total ? 'listo' : ''}`}>
          {total ? (hechos === total ? '★ Todo hecho' : `${hechos} de ${total}`) : ''}
        </span>
      </header>
      {total > 0 && (
        <div className="midia-barra" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos} aria-label="Hechas hoy">
          <b style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      {total === 0 ? (
        <p className="nota midia-vacio">
          Nada pendiente para hoy. Anotá algo con <strong>Pendientes</strong> o poné prioridades en el Día.
        </p>
      ) : (
        <ul className="midia-lista">
          {vistos.map((r) => (
            <li key={`${r.tipo}-${r.id}`} className={`midia-item ${r.hecho ? 'hecho' : ''} ${'atrasada' in r && r.atrasada ? 'atrasada' : ''}`}>
              {r.tipo === 'agenda' ? (
                <a href={r.item.ruta ?? '#/'} className="tilde ir" aria-label={`Ir a ${r.texto}`}>›</a>
              ) : (
                <button type="button" className={`tilde ${r.hecho ? 'si' : ''}`} disabled={!escribe}
                  onClick={(e) => void tildar(r, e)} aria-label={r.hecho ? `Desmarcar ${r.texto}` : `Marcar hecha: ${r.texto}`}>
                  {r.hecho ? '✓' : ''}
                </button>
              )}
              <a className="midia-txt" href={r.tipo === 'agenda' ? r.item.ruta ?? '#/' : r.tipo === 'prioridad' ? '#/dia' : '#/tablero'}>
                <span className={r.hecho ? 'tachado' : ''}>
                  {r.tipo === 'prioridad' && <small className="etq">PRIORIDAD</small>}
                  {r.texto}
                </span>
                {'detalle' in r && r.detalle && <small>{r.detalle}</small>}
              </a>
              {r.tipo === 'agenda' && <a className="btn chico" href={r.item.ruta ?? '#/'}>Ir</a>}
            </li>
          ))}
        </ul>
      )}
      <footer className="midia-pie">
        {ocultos > 0 && <button type="button" className="btn chico" onClick={() => setVerTodo(true)}>Ver {ocultos} más</button>}
        {verTodo && renglones.length > MAX_VISTOS && <button type="button" className="btn chico" onClick={() => setVerTodo(false)}>Ver menos</button>}
        {veModulo(perfil, 'tablero') && <button type="button" className="btn chico" onClick={() => abrirCortina()}>▾ Pendientes</button>}
        <a className="btn chico" href="#/dia">Mi día completo</a>
      </footer>
    </section>
  );
}

/* ---------- Mensajes + accesos ---------- */

function MensajesWhatsapp() {
  useRefresco(['wa_chats', 'wa_sesion'], 60_000);
  const { sesion } = useSesionWa();
  const { chats } = useChatsWa();
  if (!sesion) return <a className="midia-msj-cab" href="#/whatsapp/conexion"><span>WhatsApp</span><b>Sin conectar</b></a>;
  const s = situacion(sesion);
  const sinLeer = chats.filter((c) => c.sin_leer > 0);
  const caido = s === 'sin-puente' || s === 'desconectado';
  return (
    <div className="midia-msj">
      <a className={`midia-msj-cab ${caido ? 'caido' : sinLeer.length ? 'hay' : ''}`} href={caido ? '#/whatsapp/conexion' : '#/whatsapp'}>
        <span>WhatsApp</span>
        <b>{caido ? (s === 'sin-puente' ? 'Puente apagado' : 'Desconectado') : sinLeer.length ? `${sinLeer.length} sin leer` : 'Al día ✓'}</b>
      </a>
      {!caido && sinLeer.slice(0, 4).map((c) => (
        <a key={c.id} className="midia-chat" href="#/whatsapp">
          <strong>{nombreChat(c)}</strong>
          <span>{c.ultimo_texto ?? ''}</span>
          <i>{c.sin_leer}</i>
        </a>
      ))}
    </div>
  );
}

function Lado() {
  const perfil = usePerfil();
  const accesos = useAccesos();
  const senales = useTodasLasSenales();
  const informes = senales.filter((x) => x.modulo === 'panel');
  const { filas } = useTarjetas();
  const pend = filas.filter((t) => !t.hecho).length;
  return (
    <section className="tarjeta midia-lado" aria-label="Mensajes y accesos">
      <header className="midia-cab"><h2>Accesos</h2><a className="midia-config" href="#/ajustes" title="Elegir accesos">⚙</a></header>
      <div className="midia-accesos">
        {accesos.map((a) => (
          <a key={a.url} className="acceso externo" href={a.url} target="_blank" rel="noopener noreferrer">
            <span>{a.nombre}</span><i aria-hidden="true">↗</i>
          </a>
        ))}
        {veModulo(perfil, 'tablero') && (
          <button type="button" className="acceso" onClick={() => abrirCortina()}><span>Pendientes</span><b>{pend}</b></button>
        )}
        {veModulo(perfil, 'whatsapp') && <a className="acceso" href="#/whatsapp"><span>WhatsApp</span></a>}
      </div>
      <header className="midia-cab"><h2>Mensajes</h2></header>
      {veModulo(perfil, 'whatsapp') && <MensajesWhatsapp />}
      {informes.map((s) => (
        <a key={s.id} className="midia-msj-cab hay" href={s.accion?.ruta ?? s.ruta ?? '#/'}>
          <span>Informes</span><b>{s.titulo}</b>
        </a>
      ))}
      {!veModulo(perfil, 'whatsapp') && !informes.length && <p className="nota">Sin mensajes nuevos.</p>}

    </section>
  );
}

/** Franja de arriba del Inicio: para hacer hoy (grande) + mensajes y accesos (al costado en la compu, abajo en el celu). */
export function MiDia({ agenda, nombreModulo }: { agenda: ItemAgenda[]; nombreModulo: Map<string, string> }) {
  const perfil = usePerfil();
  const escribe = puedeEscribir(perfil);
  return (
    <div className="midia">
      <ParaHoy agenda={agenda} escribe={escribe} nombreModulo={nombreModulo} />
      <Lado />
    </div>
  );
}
