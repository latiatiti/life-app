import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { recargarTodo, supabase } from './db';
import { guardarConfigNube, configDesdeEntorno } from './config';
import { Campo } from '../ui/ui';

/** Si hay Supabase, pide iniciar sesión antes de mostrar la app. En modo local no hace nada. */
export function ConSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSesion(s);
      if (s) recargarTodo();
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
  if (sesion === undefined) return <div className="cargando">Cargando…</div>;
  if (!sesion) return <Login />;
  return <>{children}</>;
}

function Login() {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setOcupado(true);
    setMsg('');
    const r = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: clave })
      : await supabase.auth.signUp({ email, password: clave });
    setOcupado(false);
    if (r.error) return setMsg(traducir(r.error.message));
    if (modo === 'crear' && !r.data.session) setMsg('Cuenta creada. Revisá tu correo para confirmarla y después entrá.');
  }

  return (
    <div className="login">
      <div className="login-caja">
        <h1>LIFE</h1>
        <p className="nota">{modo === 'entrar' ? 'Entrá a tu cuenta' : 'Creá tu cuenta'}</p>
        <form className="form" onSubmit={enviar}>
          <Campo etiqueta="Correo"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Campo>
          <Campo etiqueta="Contraseña" ayuda={modo === 'crear' ? 'Mínimo 6 caracteres.' : undefined}>
            <input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6} />
          </Campo>
          {msg && <p className="error">{msg}</p>}
          <button className="btn btn-primario" disabled={ocupado}>{ocupado ? '…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        </form>
        <button className="btn-link" onClick={() => { setModo(modo === 'entrar' ? 'crear' : 'entrar'); setMsg(''); }}>
          {modo === 'entrar' ? 'No tengo cuenta: crear una' : 'Ya tengo cuenta: entrar'}
        </button>
        {!configDesdeEntorno() && (
          <button className="btn-link" onClick={() => { guardarConfigNube(null); window.location.reload(); }}>
            Volver al modo local
          </button>
        )}
      </div>
    </div>
  );
}

function traducir(m: string) {
  if (/invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Falta confirmar el correo: revisá tu bandeja de entrada.';
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Probá entrar.';
  if (/fetch/i.test(m)) return 'No se pudo conectar con Supabase. Revisá la URL y tu conexión.';
  return m;
}
