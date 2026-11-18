import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { recargarTodo, supabase } from './db';
import { guardarConfigNube, configDesdeEntorno, GOOGLE_ACTIVO } from './config';

/* ---------- Perfil: quién está conectado y qué puede hacer ---------- */

export type Rol = 'superadmin' | 'usuario' | 'lector';

export interface Perfil {
  user_id: string;
  usuario: string | null;
  nombre: string;
  rol: Rol;
  /** null = todos los módulos. */
  modulos: string[] | null;
  activo: boolean;
  /** Pidió la cuenta desde la pantalla de entrada (en espera hasta que la aprueben). */
  pedido_at?: string | null;
  via?: string | null;
  email?: string;
  /** Respuestas de la configuración inicial (supabase/bienvenida.sql). undefined = la base todavía no tiene la columna. */
  bienvenida?: Bienvenida | null;
  /** Cuándo la hizo. null = cuenta nueva que todavía no la vio (se le muestra sola). */
  bienvenida_at?: string | null;
}

/** Lo mínimo de la configuración inicial que lee el resto de la app (el detalle está en ajustes/inicio.ts). */
export interface Bienvenida { areas?: string[]; comparte?: string; [k: string]: unknown }

/* Sin la columna en la nube (o en modo local) las respuestas quedan en este navegador. */
const CLAVE_LOCAL = (id: string) => `life.bienvenida.${id}`;
function bienvenidaLocal(id: string): Bienvenida | null {
  try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL(id)) ?? 'null'); } catch { return null; }
}

/** Guarda la configuración inicial en el perfil (o en el navegador si la base todavía no la conoce). */
export async function guardarBienvenida(respuestas: Bienvenida, nombre?: string) {
  const p = perfil ?? PERFIL_LOCAL;
  let enNube = false;
  if (supabase && p.user_id !== 'local') {
    const { error } = await supabase.rpc('life_guardar_bienvenida', { respuestas, nombre_nuevo: nombre ?? null });
    enNube = !error;
  }
  if (!enNube) { try { localStorage.setItem(CLAVE_LOCAL(p.user_id), JSON.stringify(respuestas)); } catch { /* sin almacenamiento */ } }
  fijarPerfil({ ...p, nombre: nombre || p.nombre, bienvenida: respuestas, bienvenida_at: new Date().toISOString() });
}

/** Con quién reparte compras (Compras: "Yo / <nombre> / Los dos"). Lo eligió en la configuración inicial. */
export const nombreCompartido = () => (perfil?.bienvenida?.comparte ?? '').trim() || 'La otra persona';

/** Cuenta nueva que todavía no hizo la configuración inicial: se le muestra sola al entrar. */
export const debeHacerBienvenida = (p: Perfil) => p.bienvenida_at === null && puedeEscribir(p);

/** Sin nube (modo local) la persona es dueña de todo. */
const PERFIL_LOCAL: Perfil = { user_id: 'local', usuario: null, nombre: '', rol: 'usuario', modulos: null, activo: true, bienvenida: bienvenidaLocal('local') };

let perfil: Perfil | null = supabase ? null : PERFIL_LOCAL;
const oyentes = new Set<() => void>();
function fijarPerfil(p: Perfil | null) {
  perfil = p;
  oyentes.forEach((fn) => fn());
}

export function usePerfil(): Perfil {
  return useSyncExternalStore((fn) => { oyentes.add(fn); return () => oyentes.delete(fn); }, () => perfil) ?? PERFIL_LOCAL;
}

export const puedeEscribir = (p: Perfil) => p.activo && p.rol !== 'lector';
/** El plan (modulos, lo pone quien administra) y las áreas que eligió la persona en la configuración inicial. */
export const veModulo = (p: Perfil, id: string) => id === 'ajustes'
  || ((!p.modulos || p.modulos.includes(id)) && (!p.bienvenida?.areas?.length || p.bienvenida.areas.includes(id)));

async function cargarPerfil(s: Session) {
  if (!supabase) return;
  const { data, error } = await supabase.from('perfiles').select('*').eq('user_id', s.user.id).maybeSingle();
  // Si la base todavía no tiene perfiles (SQL de cuentas sin aplicar), sigue andando como siempre.
  // Si la tabla existe pero esta cuenta no tiene perfil, no entra (no es una cuenta aprobada).
  const base: Perfil = { ...PERFIL_LOCAL, user_id: s.user.id, usuario: s.user.email?.split('@')[0] ?? null };
  const sinPerfil = !error && !data ? { activo: false } : {};
  const leido: Perfil = { ...base, ...sinPerfil, ...(error || !data ? {} : (data as Perfil)), email: s.user.email };
  // Sin la columna en la base: lo que haya quedado en este navegador.
  if (leido.bienvenida === undefined) leido.bienvenida = bienvenidaLocal(leido.user_id);
  fijarPerfil(leido);
}

/** El usuario corto entra con el dominio de la app: "mauro" → mauro@life.com. */
export const DOMINIO_USUARIOS = 'life.com';
const correoDe = (u: string) => (u.includes('@') ? u : `${u}@${DOMINIO_USUARIOS}`).trim().toLowerCase();

/* ---------- Puerta de entrada ---------- */

/** Si hay nube, pide iniciar sesión antes de mostrar la app. En modo local no hace nada. */
export function ConSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(supabase ? undefined : null);
  const p = useSyncExternalStore((fn) => { oyentes.add(fn); return () => oyentes.delete(fn); }, () => perfil);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (data.session) void cargarPerfil(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (!s) fijarPerfil(null);
      else if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
        void cargarPerfil(s);
        recargarTodo();
      }
    });
    // Al volver a la app (otra pestaña, celular), traer cambios hechos en otro dispositivo.
    const alVolver = () => document.visibilityState === 'visible' && recargarTodo();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      data.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  if (!supabase) return <>{children}</>;
  if (sesion === undefined || (sesion && !p)) return <div className="cargando">Cargando…</div>;
  if (!sesion) return <Login />;
  if (p && !p.activo) return <CuentaPausada enEspera={!!p.pedido_at} />;
  return <>{children}</>;
}

type Pantalla = 'portada' | 'entrar' | 'pedir';

function Login() {
  // Quien ya entró alguna vez en este aparato va directo a "Entrar"; el resto ve primero qué es LIFE.
  const [pantalla, setPantalla] = useState<Pantalla>(() => (localStorage.getItem('life.ultimo.usuario') ? 'entrar' : 'portada'));
  if (pantalla === 'pedir') return <PedirCuenta onVolver={() => setPantalla('entrar')} onPortada={() => setPantalla('portada')} />;
  if (pantalla === 'entrar') return <Entrar onPedir={() => setPantalla('pedir')} onPortada={() => setPantalla('portada')} />;
  return <Portada onEntrar={() => setPantalla('entrar')} onPedir={() => setPantalla('pedir')} />;
}

const AREAS_PORTADA: Array<{ icono: string; nombre: string; que: string }> = [
  { icono: '◷', nombre: 'Día', que: 'Tu horario, tareas y tiempo libre real.' },
  { icono: '$', nombre: 'Plata', que: 'Gastos, cobros, pagos y si te alcanza.' },
  { icono: '▲', nombre: 'Entreno', que: 'Rutina, series y cómo venís progresando.' },
  { icono: '◍', nombre: 'Comida', que: 'Qué comés, metas y qué podés cocinar.' },
  { icono: '▤', nombre: 'Casa y compras', que: 'Lo que hay, lo que falta y precios.' },
  { icono: '▦', nombre: 'Tablero', que: 'Pendientes e ideas, con recordatorios.' },
];

/** Lo primero que ve alguien que entra al link sin sesión: qué es LIFE, y entrar o pedir cuenta. */
function Portada({ onEntrar, onPedir }: { onEntrar: () => void; onPedir: () => void }) {
  return (
    <div className="portada">
      <div className="portada-caja">
        <header className="portada-cabeza">
          <div className="login-marca" aria-hidden="true">L</div>
          <div>
            <h1 className="portada-titulo">LIFE</h1>
            <p className="portada-lema">Tu vida en un solo tablero</p>
          </div>
        </header>
        <p className="portada-texto">
          LIFE junta las cosas de todos los días en un solo lugar y las cruza entre sí:
          si un pago se viene encima te avisa si te alcanza la plata, si entrenaste te sube la meta de comida,
          si falta algo en casa va solo a la lista de compras. Cada avance suma puntos, como en un juego.
        </p>
        <ul className="portada-areas">
          {AREAS_PORTADA.map((a) => (
            <li key={a.nombre}>
              <span className="portada-icono" aria-hidden="true">{a.icono}</span>
              <span><strong>{a.nombre}</strong><small>{a.que}</small></span>
            </li>
          ))}
        </ul>
        <ol className="portada-pasos">
          <li>Pedís tu cuenta con tu correo.</li>
          <li>Te la aprueban (te avisamos cuando esté).</li>
          <li>Entrás: cada persona ve solo lo suyo.</li>
        </ol>
        <div className="portada-botones">
          <button className="btn btn-primario login-entrar" onClick={onEntrar}>Iniciar sesión</button>
          <button className="btn login-entrar" onClick={onPedir}>Registrarme</button>
        </div>
        <p className="nota portada-pie">Funciona en la compu y en el celular. Se instala como una app desde el navegador.</p>
      </div>
    </div>
  );
}

async function entrarConGoogle(setMsg: (m: string) => void) {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } });
  if (error) setMsg(traducir(error.message));
}

function Entrar({ onPedir, onPortada }: { onPedir: () => void; onPortada: () => void }) {
  const [usuario, setUsuario] = useState(() => localStorage.getItem('life.ultimo.usuario') ?? '');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setOcupado(true);
    setMsg('');
    const r = await supabase.auth.signInWithPassword({ email: correoDe(usuario), password: clave });
    setOcupado(false);
    if (r.error) return setMsg(traducir(r.error.message));
    try { localStorage.setItem('life.ultimo.usuario', usuario.trim()); } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="login">
      <div className="login-caja">
        <div className="login-marca" aria-hidden="true">L</div>
        <h1>LIFE</h1>
        <p className="nota">Entrá con tu usuario</p>
        <form className="login-form" onSubmit={enviar}>
          <label className="login-campo">
            <span>Usuario</span>
            <input autoComplete="username" autoCapitalize="none" spellCheck={false} inputMode="email"
              value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="tu usuario o correo" required />
          </label>
          <label className="login-campo">
            <span>Contraseña</span>
            <div className="login-clave">
              <input type={ver ? 'text' : 'password'} autoComplete="current-password"
                value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6} />
              <button type="button" className="login-ver" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {ver ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </label>
          {msg && <p className="error" role="alert">{msg}</p>}
          <button className="btn btn-primario login-entrar" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        </form>
        {GOOGLE_ACTIVO && (
          <button type="button" className="btn login-entrar" onClick={() => void entrarConGoogle(setMsg)}>Entrar con Google</button>
        )}
        <p className="nota login-pie">¿No tenés cuenta? <button type="button" className="btn-link" onClick={onPedir}>Registrate</button>.
          ¿Te olvidaste la contraseña? Pedísela a quien administra LIFE.</p>
        <button type="button" className="btn-link" onClick={onPortada}>¿Qué es LIFE?</button>
        {!configDesdeEntorno() && (
          <button className="btn-link" onClick={() => { guardarConfigNube(null); window.location.reload(); }}>
            Volver al modo local
          </button>
        )}
      </div>
    </div>
  );
}

/** Pedir una cuenta nueva: queda en espera y a la superadmin le llega un mail para aprobarla. */
function PedirCuenta({ onVolver, onPortada }: { onVolver: () => void; onPortada: () => void }) {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState('');
  const [listo, setListo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setOcupado(true);
    setMsg('');
    const r = await supabase.auth.signUp({
      email: correo.trim().toLowerCase(), password: clave,
      options: { data: { nombre: nombre.trim() }, emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setOcupado(false);
    if (r.error) return setMsg(traducir(r.error.message));
    // Con sesión, ConSesion muestra solo el cartel de "en espera". Sin sesión, falta confirmar el correo.
    if (!r.data.session) setListo('Te mandamos un mail para confirmar tu correo. Después, cuando aprueben tu cuenta, ya podés entrar.');
  }

  return (
    <div className="login">
      <div className="login-caja">
        <div className="login-marca" aria-hidden="true">L</div>
        <h1>LIFE</h1>
        {listo ? (
          <>
            <p role="status">{listo}</p>
            <button className="btn" onClick={onVolver}>Volver</button>
          </>
        ) : (
          <>
            <p className="nota">Registrate. Tu cuenta queda en espera hasta que la aprueben y te avisamos.</p>
            <form className="login-form" onSubmit={enviar}>
              <label className="login-campo">
                <span>Tu nombre</span>
                <input autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} />
              </label>
              <label className="login-campo">
                <span>Correo</span>
                <input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                  value={correo} onChange={(e) => setCorreo(e.target.value)} required />
              </label>
              <label className="login-campo">
                <span>Contraseña</span>
                <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} required minLength={8} />
              </label>
              {msg && <p className="error" role="alert">{msg}</p>}
              <button className="btn btn-primario login-entrar" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Registrarme'}</button>
            </form>
            {GOOGLE_ACTIVO && (
              <button type="button" className="btn login-entrar" onClick={() => void entrarConGoogle(setMsg)}>Registrarme con Google</button>
            )}
            <button type="button" className="btn-link" onClick={onVolver}>Ya tengo cuenta</button>
            <button type="button" className="btn-link" onClick={onPortada}>¿Qué es LIFE?</button>
          </>
        )}
      </div>
    </div>
  );
}

function CuentaPausada({ enEspera }: { enEspera: boolean }) {
  return (
    <div className="login">
      <div className="login-caja">
        <h1>LIFE</h1>
        {enEspera
          ? <p>Tu cuenta está esperando aprobación. Te avisamos cuando esté lista: probá entrar de nuevo más tarde.</p>
          : <p>Tu cuenta está pausada. Pedile a quien administra LIFE que la active.</p>}
        <button className="btn" onClick={() => supabase?.auth.signOut()}>Salir</button>
      </div>
    </div>
  );
}

function traducir(m: string) {
  if (/invalid login/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/already registered/i.test(m)) return 'Ese correo ya pidió una cuenta. Probá entrar.';
  if (/signups not allowed|signup.*disabled/i.test(m)) return 'Por ahora no se pueden pedir cuentas nuevas.';
  if (/provider is not enabled/i.test(m)) return 'Entrar con Google todavía no está activado.';
  if (/password should be/i.test(m)) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (/email not confirmed/i.test(m)) return 'Falta confirmar el correo de esta cuenta.';
  if (/fetch/i.test(m)) return 'No hay conexión. Probá de nuevo en un rato.';
  return m;
}
