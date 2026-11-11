import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { crear, modificar, recargar, supabase, useTabla } from '../../core/db';
import { confirmar } from '../../ui/Deshacer';
import { Campo, Icono, Modal, Vacio } from '../../ui/ui';
import {
  T_CHATS, T_SALIDA, T_SESION, cuando, horaDe, nombreChat, situacion, textoMensaje, useChatsWa, useMensajes,
  useRefresco, useSesionWa, type ChatWa, type SalidaWa, type SesionWa, type Situacion,
} from './modelo';
import './whatsapp.css';

function useEsCompu() {
  const consulta = '(min-width: 761px)';
  const [si, setSi] = useState(() => window.matchMedia?.(consulta).matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return;
    const f = () => setSi(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return si;
}

/** Pide al puente que conecte o desconecte (sin "DESHACER": es un pedido, no un dato). */
async function pedir(sesion: SesionWa | undefined, pedido: 'conectar' | 'desconectar') {
  if (!supabase) return;
  if (sesion) await supabase.from(T_SESION).update({ pedido }).eq('id', sesion.id);
  else await supabase.from(T_SESION).insert({ estado: 'apagado', pedido });
  await recargar(T_SESION);
}

const TEXTO_SITUACION: Record<Situacion, string> = {
  'sin-nube': 'Solo con la nube',
  'sin-puente': 'Puente apagado',
  apagado: 'Sin conectar',
  qr: 'Esperando el QR',
  conectando: 'Conectando…',
  conectado: 'Conectado',
  desconectado: 'Desconectado',
};

/** Chip de estado, siempre con ícono y palabra. */
function ChipEstado({ s }: { s: Situacion }) {
  const nivel = s === 'conectado' ? 'ok' : s === 'conectando' || s === 'qr' ? 'info' : 'aviso';
  return <span className={`estado estado-${nivel}`}>{Icono[nivel]}{TEXTO_SITUACION[s]}</span>;
}

/* ================= Conexión ================= */

export function PantallaConexion() {
  const { sesion } = useSesionWa();
  useRefresco([T_SESION], 3000);
  const s = situacion(sesion);
  const [pidiendo, setPidiendo] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('wa-sin-lineas', s === 'qr');
    return () => document.body.classList.remove('wa-sin-lineas');
  }, [s]);

  async function conectar() {
    setPidiendo(true);
    await pedir(sesion, 'conectar');
    setPidiendo(false);
  }
  async function desconectar() {
    if (!(await confirmar('Se desvincula LIFE de tu WhatsApp (igual que cerrar WhatsApp Web). Los chats guardados quedan; para volver hay que escanear el QR otra vez.', 'Desconectar'))) return;
    await pedir(sesion, 'desconectar');
  }

  return (
    <div className="wa-conexion">
      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>Tu WhatsApp en LIFE</h2><ChipEstado s={s} /></header>

        {s === 'sin-nube' && <p>Esto funciona con la nube de LIFE: en modo local no hay quién mantenga tu WhatsApp conectado.</p>}

        {s === 'sin-puente' && (
          <>
            <p>El <b>puente</b> (el programa que mantiene tu WhatsApp conectado) no está prendido.</p>
            <p className="nota">{sesion?.visto ? `Dio señales por última vez ${cuando(sesion.visto)}.` : 'Todavía no se instaló.'} Se instala una sola vez en un servidor; los pasos están en <code>whatsapp-puente/LEEME.md</code>.</p>
          </>
        )}

        {(s === 'apagado' || s === 'desconectado') && (
          <>
            <p>Vinculá tu WhatsApp como si fuera WhatsApp Web: vas a escanear un QR con tu celular.</p>
            {sesion?.ultimo_error && <p className="nota">⚠ {sesion.ultimo_error}</p>}
            <button type="button" className="btn btn-primario grande-boton" disabled={pidiendo} onClick={conectar}>
              {pidiendo ? 'Pidiendo el QR…' : 'Conectar mi WhatsApp'}
            </button>
          </>
        )}

        {s === 'conectando' && <p className="wa-espera">Preparando… el QR aparece acá en unos segundos.</p>}

        {s === 'qr' && (
          <div className="wa-qr">
            <img src={sesion!.qr!} alt="Código QR para vincular WhatsApp" width={280} height={280} />
            <ol>
              <li>En el celular abrí <b>WhatsApp</b>.</li>
              <li>Tocá <b>⋮</b> (o <b>Configuración</b> en iPhone) → <b>Dispositivos vinculados</b>.</li>
              <li><b>Vincular un dispositivo</b> y apuntá la cámara a este código.</li>
            </ol>
            <p className="nota">El código cambia cada 20 segundos: si no lo toma, esperá el siguiente. Si estás en el celu, abrí LIFE en la compu para escanearlo.</p>
          </div>
        )}

        {s === 'conectado' && (
          <>
            <p>✅ Conectado{sesion?.numero ? <> como <b>+{sesion.numero}</b></> : null}{sesion?.nombre ? ` (${sesion.nombre})` : ''}.</p>
            <div className="fila-derecha">
              <a className="btn btn-primario" href="#/whatsapp">Ver chats</a>
              <button type="button" className="btn" onClick={desconectar}>Desconectar</button>
            </div>
          </>
        )}
      </section>

      <section className="tarjeta">
        <header className="tarjeta-cab"><h2>Qué hace LIFE con tu WhatsApp</h2></header>
        <ul className="wa-reglas">
          <li>Guarda los mensajes de <b>texto</b> de tus chats de a dos (sin grupos) de los <b>últimos 30 días</b>, solo en tu cuenta. Fotos y audios figuran como “📷 Foto” o “🎤 Audio”, sin bajarlos.</li>
          <li>Claude los lee solo cuando se lo pedís (“¿qué me dijo Ulises?”).</li>
          <li>Claude <b>no manda nada sin que le digas que sí</b> a quién va y el texto exacto. Lo que sale de Claude queda marcado 🤖.</li>
          <li>Tope de <b>40 mensajes por día</b> desde LIFE, de a uno y sin ráfagas, para que WhatsApp no marque tu número.</li>
          <li>Tu celular sigue igual: te siguen llegando las notificaciones. Lo podés desvincular cuando quieras desde acá o desde WhatsApp → Dispositivos vinculados.</li>
        </ul>
      </section>
    </div>
  );
}

/* ================= Chats ================= */

export function PantallaChats() {
  const compu = useEsCompu();
  const { sesion } = useSesionWa();
  const { chats, cargado } = useChatsWa();
  const { filas: salida } = useTabla<SalidaWa>(T_SALIDA);
  useRefresco([T_SESION, T_CHATS, T_SALIDA], 5000);
  const s = situacion(sesion);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? chats.filter((c) => nombreChat(c).toLowerCase().includes(q) || (c.telefono ?? '').includes(q.replace(/\D/g, '') || '¬')) : chats;
  }, [chats, buscar]);
  const chat = chats.find((c) => c.jid === abierto) ?? null;
  // En la compu arranca con el chat más nuevo abierto.
  useEffect(() => { if (compu && !abierto && chats[0]) setAbierto(chats[0].jid); }, [compu, abierto, chats]);

  if (s === 'sin-nube') return <Vacio titulo="WhatsApp funciona con la nube de LIFE" />;

  const aviso = s !== 'conectado' && (
    <div className="wa-aviso" role="status">
      <span>● {s === 'sin-puente' ? 'El puente de WhatsApp está apagado: no entran ni salen mensajes.' : 'Tu WhatsApp no está conectado a LIFE.'}</span>
      <a className="btn" href="#/whatsapp/conexion">{s === 'sin-puente' ? 'Ver qué pasa' : 'Conectar'}</a>
    </div>
  );

  const panelLista = (
    <div className="wa-lista">
      <div className="wa-lista-cab">
        <input type="search" placeholder="Buscar chat o número" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar chat" />
        <button type="button" className="btn" onClick={() => setNuevo(true)} aria-label="Mensaje a un número nuevo">{Icono.mas}</button>
      </div>
      {!cargado ? <p className="nota">Cargando…</p> : !lista.length ? (
        <p className="nota wa-vacia">{chats.length ? 'Ningún chat coincide.' : s === 'conectado' ? 'Trayendo tus chats… (la primera vez tarda unos minutos)' : 'Cuando conectes tu WhatsApp, acá aparecen tus chats.'}</p>
      ) : lista.map((c) => (
        <button key={c.id} type="button" className={`wa-chat${c.jid === abierto ? ' activo' : ''}`} onClick={() => setAbierto(c.jid)}>
          <span className="wa-avatar" aria-hidden="true">{nombreChat(c).replace(/[^\p{L}\d]/gu, '').slice(0, 1).toUpperCase() || '#'}</span>
          <span className="wa-chat-txt">
            <b>{nombreChat(c)}</b>
            <small>{c.ultimo_texto ?? ''}</small>
          </span>
          <span className="wa-chat-der">
            <small>{cuando(c.ultimo_at)}</small>
            {c.sin_leer > 0 && <span className="wa-sinleer">{c.sin_leer}</span>}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="wa">
      {aviso}
      {compu ? (
        <div className="wa-dos">
          {panelLista}
          {chat ? <Conversacion chat={chat} salida={salida} conectado={s === 'conectado'} /> : <div className="wa-conv wa-conv-vacia"><p className="nota">Elegí un chat.</p></div>}
        </div>
      ) : chat ? (
        <Conversacion chat={chat} salida={salida} conectado={s === 'conectado'} onVolver={() => setAbierto(null)} />
      ) : panelLista}
      <Modal titulo="Mensaje a un número" abierto={nuevo} onCerrar={() => setNuevo(false)}>
        <NuevoNumero onListo={() => setNuevo(false)} />
      </Modal>
    </div>
  );
}

function Conversacion({ chat, salida, conectado, onVolver }: { chat: ChatWa; salida: SalidaWa[]; conectado: boolean; onVolver?: () => void }) {
  const { mensajes, cargado } = useMensajes(chat.jid);
  const [texto, setTexto] = useState('');
  const abajo = useRef<HTMLDivElement>(null);
  const propios = salida.filter((m) => (m.jid === chat.jid || (!!chat.telefono && m.telefono === chat.telefono)) && m.estado !== 'enviado' && m.estado !== 'cancelado');

  // Al abrirlo queda leído (sin "DESHACER": no es un dato que ella cargó).
  useEffect(() => {
    if (chat.sin_leer > 0 && supabase) void supabase.from(T_CHATS).update({ sin_leer: 0 }).eq('id', chat.id).then(() => recargar(T_CHATS));
  }, [chat.id, chat.sin_leer]);
  useEffect(() => { abajo.current?.scrollIntoView({ block: 'end' }); }, [mensajes.length, propios.length, chat.jid]);

  async function mandar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    // Sale a los 10 s: mientras tanto el aviso "Guardado · DESHACER" lo puede frenar.
    await crear<SalidaWa>(T_SALIDA, { jid: chat.jid, nombre: nombreChat(chat), texto: t, origen: 'app', estado: 'pendiente' });
  }

  return (
    <div className="wa-conv">
      <header className="wa-conv-cab">
        {onVolver && <button type="button" className="btn-icono" onClick={onVolver} aria-label="Volver a los chats">‹</button>}
        <div><b>{nombreChat(chat)}</b>{chat.telefono && chat.nombre && <small>+{chat.telefono}</small>}</div>
      </header>
      <div className="wa-mensajes">
        {!cargado ? <p className="nota">Cargando…</p> : !mensajes.length && !propios.length && <p className="nota">Sin mensajes en los últimos 30 días.</p>}
        {mensajes.map((m, i) => {
          const dia = new Date(m.fecha).toDateString();
          const nuevoDia = i === 0 || new Date(mensajes[i - 1].fecha).toDateString() !== dia;
          return (
            <div key={m.id} className="wa-fila">
              {nuevoDia && <div className="wa-dia">{cuando(m.fecha).includes(':') ? 'hoy' : cuando(m.fecha)}</div>}
              <div className={`wa-burbuja ${m.de_mi ? 'mia' : 'suya'}`}>
                <span>{textoMensaje(m)}</span>
                <small>{horaDe(m.fecha)}</small>
              </div>
            </div>
          );
        })}
        {propios.map((m) => <Saliente key={m.id} m={m} />)}
        <div ref={abajo} />
      </div>
      <form className="wa-escribir" onSubmit={mandar}>
        <textarea rows={1} value={texto} maxLength={2000} placeholder={conectado ? 'Escribí un mensaje' : 'Se manda cuando se conecte'}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 761px)').matches) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <button type="submit" className="btn btn-confirmar" disabled={!texto.trim()}>Mandar</button>
      </form>
    </div>
  );
}

/** Un mensaje que todavía no salió (o que falló), con su botón. */
function Saliente({ m }: { m: SalidaWa }) {
  const etiqueta = m.estado === 'error' ? `⚠ No salió: ${m.error ?? 'error'}` : m.estado === 'enviando' ? 'Saliendo…' : '◷ En cola';
  return (
    <div className="wa-fila">
      <div className={`wa-burbuja mia pendiente${m.estado === 'error' ? ' fallo' : ''}`}>
        <span>{m.texto}</span>
        <small>{m.origen === 'claude' ? '🤖 ' : ''}{etiqueta}</small>
        {(m.estado === 'pendiente' || m.estado === 'error') && (
          <span className="wa-acciones">
            {m.estado === 'error' && <button type="button" className="btn" onClick={() => supabase?.from(T_SALIDA).insert({ jid: m.jid, telefono: m.telefono, nombre: m.nombre, texto: m.texto }).then(() => recargar(T_SALIDA))}>Reintentar</button>}
            {m.estado === 'pendiente' && <button type="button" className="btn" onClick={() => modificar<SalidaWa>(T_SALIDA, m.id, { estado: 'cancelado' })}>No mandar</button>}
          </span>
        )}
      </div>
    </div>
  );
}

function NuevoNumero({ onListo }: { onListo: () => void }) {
  const [tel, setTel] = useState('');
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');
  async function mandar(e: FormEvent) {
    e.preventDefault();
    const d = tel.replace(/\D/g, '');
    if (d.length < 10) { setMsg('Poné el número con característica, ej. 261 555 1234.'); return; }
    if (!texto.trim()) { setMsg('Falta el mensaje.'); return; }
    await crear<SalidaWa>(T_SALIDA, { telefono: d, nombre: tel.trim(), texto: texto.trim(), origen: 'app', estado: 'pendiente' });
    onListo();
  }
  return (
    <form onSubmit={mandar} className="form">
      <Campo etiqueta="Número" ayuda="Con característica. Si es de afuera, con el código del país."><input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="261 555 1234" /></Campo>
      <Campo etiqueta="Mensaje"><textarea rows={3} value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)} /></Campo>
      {msg && <p className="nota">{msg}</p>}
      <button type="submit" className="btn btn-confirmar grande-boton">Mandar</button>
    </form>
  );
}
