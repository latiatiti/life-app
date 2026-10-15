import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { recargarTodo, supabase } from './db';
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
}

/** Sin nube (modo local) la persona es dueña de todo. */
const PERFIL_LOCAL: Perfil = { user_id: 'local', usuario: null, nombre: '', rol: 'usuario', modulos: null, activo: true };

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
export const veModulo = (p: Perfil, id: string) => !p.modulos || p.modulos.includes(id) || id === 'ajustes';

async function cargarPerfil(s: Session) {
  if (!supabase) return;
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
  if (p && !p.activo) return <CuentaPausada />;
  return <>{children}</>;
}

function Login() {
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
        <p className="nota login-pie">¿No tenés cuenta o te olvidaste la contraseña? Pedísela a quien administra LIFE.</p>
        {!configDesdeEntorno() && (
          <button className="btn-link" onClick={() => { guardarConfigNube(null); window.location.reload(); }}>
            Volver al modo local
          </button>
        )}
      </div>
    </div>
  );
}

function CuentaPausada() {
  return (
    <div className="login">
      <div className="login-caja">
        <h1>LIFE</h1>
        <p>Tu cuenta está pausada. Pedile a quien administra LIFE que la active.</p>
        <button className="btn" onClick={() => supabase?.auth.signOut()}>Salir</button>
      </div>
    </div>
  );
}

function traducir(m: string) {
  if (/invalid login/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Falta confirmar el correo de esta cuenta.';
  if (/fetch/i.test(m)) return 'No hay conexión. Probá de nuevo en un rato.';
  return m;
}
