import { useEffect, useState } from 'react';
import { usePerfil, type Perfil, type Rol } from '../../core/auth';
import { supabase } from '../../core/db';
import { fechaCorta } from '../../core/format';
import { MODULOS } from '../../core/registry';
import { Campo, Modal, Tarjeta } from '../../ui/ui';

interface Cuenta extends Perfil {
  email: string;
  ultimo_ingreso: string | null;
}

const ROLES: Array<{ id: Rol; nombre: string; ayuda: string }> = [
  { id: 'superadmin', nombre: 'Superadmin', ayuda: 'Usa todo y administra las cuentas.' },
  { id: 'usuario', nombre: 'Usuario', ayuda: 'Usa la app con sus propios datos.' },
  { id: 'lector', nombre: 'Solo lectura', ayuda: 'Ve sus datos, no puede cambiarlos.' },
];
const nombreRol = (r: Rol) => ROLES.find((x) => x.id === r)?.nombre ?? r;

async function llamar(cuerpo: Record<string, unknown>) {
  if (!supabase) throw new Error('Sin conexión.');
  const { data, error } = await supabase.functions.invoke('cuentas', { body: cuerpo });
  if (error) {
    const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalle?.error ?? error.message);
  }
  return data;
}

/** Panel del superadmin: ver cuentas, crear, cambiar rol, módulos, pausar y contraseña. */
export function PanelCuentas() {
  const yo = usePerfil();
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [msg, setMsg] = useState('');
  const [editando, setEditando] = useState<Cuenta | 'nueva' | null>(null);

  async function cargar() {
    try {
      setCuentas((await llamar({ accion: 'listar' })).cuentas);
    } catch (e) {
      setMsg(`No pude traer las cuentas: ${(e as Error).message}`);
    }
  }
  useEffect(() => { if (yo.rol === 'superadmin') void cargar(); }, [yo.rol]);

  if (yo.rol !== 'superadmin') return null;

  return (
    <Tarjeta titulo="Cuentas y roles" accion={<button className="btn btn-primario" onClick={() => setEditando('nueva')}>Nueva cuenta</button>}>
      {msg && <p className="nota" role="status">{msg}</p>}
      {!cuentas && !msg && <p className="nota">Cargando…</p>}
      <ul className="lista-simple">
        {cuentas?.map((c) => (
          <li key={c.user_id}>
            <span>
              <strong>{c.nombre || c.usuario || c.email}</strong>
              {c.user_id === yo.user_id && ' (vos)'}
              <small className="nota"> · {nombreRol(c.rol)}{!c.activo && ' · pausada'}{c.modulos ? ` · ${c.modulos.length} módulos` : ''}
                {c.ultimo_ingreso ? ` · entró ${fechaCorta(c.ultimo_ingreso.slice(0, 10))}` : ''}</small>
            </span>
            <button className="btn" onClick={() => setEditando(c)}>Editar</button>
          </li>
        ))}
      </ul>
      <Modal titulo={editando === 'nueva' ? 'Nueva cuenta' : 'Editar cuenta'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && (
          <FormCuenta cuenta={editando === 'nueva' ? null : editando} esYo={editando !== 'nueva' && editando.user_id === yo.user_id}
            onListo={(m) => { setEditando(null); setMsg(m); void cargar(); }} />
        )}
      </Modal>
    </Tarjeta>
  );
}

function FormCuenta({ cuenta, esYo, onListo }: { cuenta: Cuenta | null; esYo: boolean; onListo: (msg: string) => void }) {
  const [usuario, setUsuario] = useState(cuenta?.usuario ?? '');
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '');
  const [rol, setRol] = useState<Rol>(cuenta?.rol ?? 'usuario');
  const [activo, setActivo] = useState(cuenta?.activo ?? true);
  const [todos, setTodos] = useState(!cuenta?.modulos);
  const [modulos, setModulos] = useState<string[]>(cuenta?.modulos ?? MODULOS.map((m) => m.id));
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const mods = todos ? null : modulos;
      if (!cuenta) {
        await llamar({ accion: 'crear', usuario, clave, nombre, rol, modulos: mods });
        onListo(`Listo: ${usuario} ya puede entrar.`);
        return;
      }
      if (!supabase) return;
      const { error: e1 } = await supabase.from('perfiles')
        .update({ nombre, rol, activo, modulos: mods, usuario: usuario || null }).eq('user_id', cuenta.user_id);
      if (e1) throw new Error(e1.message);
      if (clave) await llamar({ accion: 'clave', user_id: cuenta.user_id, clave });
      onListo('Cambios guardados.');
    } catch (err) {
      setError((err as Error).message);
    }
    setOcupado(false);
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Usuario" ayuda={cuenta ? `Entra con ${cuenta.email}` : 'Una palabra sin espacios (o un correo).'}>
        <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" required={!cuenta} disabled={!!cuenta} />
      </Campo>
      <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
      <Campo etiqueta={cuenta ? 'Contraseña nueva (opcional)' : 'Contraseña'} ayuda="Mínimo 8 caracteres.">
        <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} required={!cuenta} minLength={8} />
      </Campo>
      <Campo etiqueta="Rol" ayuda={ROLES.find((r) => r.id === rol)?.ayuda}>
        <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={esYo}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </Campo>
      {cuenta && !esYo && (
        <label className="check"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Cuenta activa</label>
      )}
      <fieldset className="check-grupo">
        <legend>Qué módulos ve</legend>
        <label className="check"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Todos</label>
        {!todos && MODULOS.filter((m) => m.id !== 'ajustes').map((m) => (
          <label key={m.id} className="check">
            <input type="checkbox" checked={modulos.includes(m.id)}
              onChange={(e) => setModulos(e.target.checked ? [...modulos, m.id] : modulos.filter((x) => x !== m.id))} /> {m.nombre}
          </label>
        ))}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Guardando…' : cuenta ? 'Guardar' : 'Crear cuenta'}</button>
    </form>
  );
}
