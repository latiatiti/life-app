import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { fijarDueno, recargarTodo, supabase } from './db';
import { guardarConfigNube, configDesdeEntorno } from './config';

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
  email?: string;
  /** Respuestas de la encuesta de bienvenida (null = todavía no la hizo). */
  bienvenida?: Respuestas | null;
  bienvenida_at?: string | null;
  /** Cuenta nueva que pidió entrar (Google o correo) y espera que la autoricen. */
  pedido_at?: string | null;
  via?: string | null;
}

/** Lo que guarda la encuesta de bienvenida (ver modules/ajustes/Bienvenida.tsx). */
export type Respuestas = Record<string, unknown> & { modulos?: string[] };

/** Sin nube (modo local) la persona es dueña de todo. */
const PERFIL_LOCAL: Perfil = { user_id: 'local', usuario: null, nombre: '', rol: 'usuario', modulos: null, activo: true, bienvenida_at: 'local' };

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
/** Lo que ve: lo que le permite el superadmin (modulos) y, dentro de eso, lo que eligió en la bienvenida. */
export const veModulo = (p: Perfil, id: string) =>
  id === 'ajustes' || ((!p.modulos || p.modulos.includes(id)) && (!p.bienvenida?.modulos?.length || p.bienvenida.modulos.includes(id)));

/** Vuelve a leer el perfil (después de la encuesta o de cambiar el nombre). */
export async function recargarPerfil() {
  const s = await supabase?.auth.getSession();
  if (s?.data.session) await cargarPerfil(s.data.session);
}

async function cargarPerfil(s: Session) {
  if (!supabase) return;
  fijarDueno(s.user.id);
  const { data, error } = await supabase.from('perfiles').select('*').eq('user_id', s.user.id).maybeSingle();
  // Si la base todavía no tiene perfiles (SQL de cuentas sin aplicar), sigue andando como siempre.
  const base: Perfil = { ...PERFIL_LOCAL, user_id: s.user.id, usuario: s.user.email?.split('@')[0] ?? null };
  fijarPerfil({ ...base, ...(error || !data ? {} : (data as Perfil)), email: s.user.email });
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
  if (p && !p.activo) return <CuentaPausada esperando={!!p.pedido_at} />;
  return <>{children}</>;
}

function Login() {
  const [usuario, setUsuario] = useState(() => localStorage.getItem('life.ultimo.usuario') ?? '');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState(() => {
    // Si Google o la base rechazaron la entrada, el motivo vuelve en el link.
    const q = new URLSearchParams(window.location.search);
    const e = q.get('error_description') ?? q.get('error');
    return e ? traducir(e) : '';
  });
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
        <div className="login-o"><span>o</span></div>
        <button type="button" className="btn login-google" onClick={() => entrarConGoogle().catch((e) => setMsg(traducir((e as Error).message)))}>
          <LogoGoogle /> Entrar con Google
        </button>
        <p className="nota login-pie">¿Ya tenés usuario? Entrá con él y conectá Google en Ajustes: así las dos formas abren la misma cuenta.
          Si es tu primera vez, tu cuenta queda esperando que quien administra LIFE la autorice.</p>
        {!configDesdeEntorno() && (
          <button className="btn-link" onClick={() => { guardarConfigNube(null); window.location.reload(); }}>
            Volver al modo local
          </button>
        )}
      </div>
    </div>
  );
}

function CuentaPausada({ esperando }: { esperando: boolean }) {
  return (
    <div className="login">
      <div className="login-caja">
        <h1>LIFE</h1>
        {esperando
          ? <p>Listo, pediste entrar. Tu cuenta está <strong>esperando autorización</strong>: apenas la aprueben, volvé a abrir LIFE.</p>
          : <p>Tu cuenta está pausada. Pedile a quien administra LIFE que la active.</p>}
        <button className="btn" onClick={() => window.location.reload()}>Ya me autorizaron</button>
        <button className="btn" onClick={() => supabase?.auth.signOut()}>Salir</button>
      </div>
    </div>
  );
}

/** Vuelve a la misma página (sin el #) después de Google. */
const volverA = () => `${window.location.origin}${window.location.pathname}`;

export async function entrarConGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: volverA() } });
  if (error) throw error;
}

/** Conecta Google a la cuenta con la que ya entraste (usuario y contraseña). */
export async function conectarGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${volverA()}#/ajustes` } });
  if (error) throw error;
}

export function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function traducir(m: string) {
  if (/no acepta cuentas|Database error saving new user/i.test(m)) return 'LIFE no acepta cuentas nuevas por ahora.';
  if (/manual linking|linking is disabled/i.test(m)) return 'Falta activar la vinculación de cuentas en Supabase (lo hace quien administra LIFE).';
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'Entrar con Google todavía no está activado.';
  if (/invalid login/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Falta confirmar el correo de esta cuenta.';
  if (/fetch/i.test(m)) return 'No hay conexión. Probá de nuevo en un rato.';
  return m;
}
