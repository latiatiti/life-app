import { useState } from 'react';
import { usePerfil, type Rol } from '../../core/auth';
import { supabase } from '../../core/db';
import { fechaCorta } from '../../core/format';
import { ir } from '../../core/router';
import { MODULOS } from '../../core/registry';
import { Campo, Cifra, Estado, Modal, Tarjeta } from '../../ui/ui';
import { confirmar } from '../../ui/Deshacer';
import {
  PERMISOS, diasDesde, estadoCuenta, fijarFiltroCuenta, haceCuanto, llamarCuentas, nombreCuenta, recargarCuentas, useCuentas,
  type Cuenta, type UsoCuenta,
} from './modelo';

const ROLES: Array<{ id: Rol; nombre: string; ayuda: string }> = [
  { id: 'superadmin', nombre: 'Superadmin', ayuda: 'Usa todo y administra las cuentas.' },
  { id: 'usuario', nombre: 'Usuario', ayuda: 'Usa la app con sus propios datos.' },
  { id: 'lector', nombre: 'Solo lectura', ayuda: 'Ve sus datos, no puede cambiarlos.' },
];
const nombreRol = (r: Rol) => ROLES.find((x) => x.id === r)?.nombre ?? r;

/**
 * Módulos que se pueden prender o apagar por cuenta (Ajustes siempre está; el Panel es solo de la superadmin).
 * Es función porque el registro importa este archivo: al cargarlo, MODULOS todavía no existe.
 */
const elegibles = () => MODULOS.filter((m) => m.id !== 'ajustes' && m.id !== 'panel');

/** Cómo viene una cuenta: lo más grave primero, siempre con palabra (pilar 9). */
function salud(c: Cuenta, u: UsoCuenta | undefined): { nivel: 'critico' | 'aviso' | 'info' | 'ok'; texto: string } {
  const est = estadoCuenta(c);
  if (est === 'espera') return { nivel: 'aviso', texto: 'Espera tu OK' };
  if (est === 'pausada') return { nivel: 'info', texto: 'Pausada' };
  if (u && u.errores_7d > 0) return { nivel: 'critico', texto: `${u.errores_7d} error${u.errores_7d > 1 ? 'es' : ''} esta semana` };
  if (u && u.informes_abiertos > 0) return { nivel: 'aviso', texto: `${u.informes_abiertos} informe${u.informes_abiertos > 1 ? 's' : ''} abierto${u.informes_abiertos > 1 ? 's' : ''}` };
  const d = diasDesde(u?.ultima_carga ?? c.ultimo_ingreso);
  if (d === null || d > 14) return { nivel: 'info', texto: d === null ? 'Nunca cargó nada' : `Sin uso hace ${d} días` };
  return { nivel: 'ok', texto: 'Todo bien' };
}

/** Panel → Cuentas: cómo viene cada cuenta, quién espera tu OK, roles, módulos y permisos. */
export function PantallaCuentas() {
  const yo = usePerfil();
  const { cuentas, uso, error, usoError } = useCuentas();
  const [msg, setMsg] = useState('');
  const [editando, setEditando] = useState<Cuenta | 'nueva' | null>(null);
  const [verPermisos, setVerPermisos] = useState(false);

  const pendientes = cuentas?.filter((c) => estadoCuenta(c) === 'espera') ?? [];
  const resto = cuentas?.filter((c) => !pendientes.includes(c)) ?? [];
  const activas = cuentas?.filter((c) => c.activo).length ?? 0;
  const conProblemas = cuentas?.filter((c) => { const s = salud(c, uso.get(c.user_id)).nivel; return s === 'critico' || s === 'aviso'; }).length ?? 0;
  const errores = [...uso.values()].reduce((s, u) => s + u.errores_7d, 0);

  async function aprobar(c: Cuenta) {
    if (!supabase) return;
    const { error: e } = await supabase.from('perfiles').update({ activo: true }).eq('user_id', c.user_id);
    setMsg(e ? `No pude aprobarla: ${e.message}` : `Listo: ${nombreCuenta(c)} ya puede entrar. Tocá Editar para elegir qué módulos ve.`);
    void recargarCuentas();
  }

  async function rechazar(c: Cuenta) {
    if (!(await confirmar(`¿Rechazar el pedido de ${nombreCuenta(c)}? Se borra y no puede entrar.`, 'Rechazar'))) return;
    try {
      await llamarCuentas({ accion: 'rechazar', user_id: c.user_id });
      setMsg('Pedido rechazado.');
    } catch (e) {
      setMsg(`No pude rechazarlo: ${(e as Error).message}`);
    }
    void recargarCuentas();
  }

  function verInformes(c: Cuenta) {
    fijarFiltroCuenta(c.user_id);
    ir('panel/informes');
  }

  return (
    <div className="pila">
      {msg && <p className="aviso-msg" role="status">{msg}</p>}
      {error && <p className="aviso-msg" role="alert">No pude traer las cuentas: {error}</p>}

      <div className="grilla-cifras">
        <Cifra etiqueta="Cuentas activas" valor={cuentas ? activas : '…'} nota={cuentas ? `de ${cuentas.length}` : undefined} />
        <Cifra etiqueta="Esperan tu OK" valor={pendientes.length} tono={pendientes.length ? 'mal' : undefined} />
        <Cifra etiqueta="Con algo para mirar" valor={conProblemas} tono={conProblemas ? 'mal' : 'bien'} />
        <Cifra etiqueta="Errores en 7 días" valor={errores} tono={errores ? 'mal' : 'bien'} nota={usoError ? 'Falta activar en la nube' : undefined} />
      </div>

      {pendientes.length > 0 && (
        <Tarjeta titulo={`Esperando tu OK (${pendientes.length})`} className="panel-espera">
          <ul className="lista-simple">
            {pendientes.map((c) => (
              <li key={c.user_id}>
                <span>
                  <strong>{nombreCuenta(c)}</strong>
                  <small className="nota"> · {c.email} · con {c.via === 'google' ? 'Google' : 'correo'} · pidió {fechaCorta(String(c.pedido_at).slice(0, 10))}</small>
                </span>
                <span className="cuenta-botones">
                  <button className="btn btn-confirmar" onClick={() => void aprobar(c)}>Aprobar</button>
                  <button className="btn" onClick={() => void rechazar(c)}>Rechazar</button>
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo="Cuentas">
        <div className="acciones">
          <button className="btn btn-primario" onClick={() => setEditando('nueva')}>Nueva cuenta</button>
          <button className="btn" onClick={() => setVerPermisos(true)}>Qué puede cada rol</button>
        </div>
        {!cuentas && !error && <p className="nota">Cargando…</p>}
        <div className="cuentas-lista">
          {resto.map((c) => {
            const u = uso.get(c.user_id);
            const s = salud(c, u);
            return (
              <article key={c.user_id} className={`cuenta-fila cuenta-${s.nivel}`}>
                <div className="cuenta-quien">
                  <strong>{nombreCuenta(c)}{c.user_id === yo.user_id && ' (vos)'}</strong>
                  <small className="nota">{c.email}</small>
                </div>
                <div className="cuenta-chips">
                  <Estado nivel={s.nivel} texto={s.texto} />
                  <span className="chip">{nombreRol(c.rol)}</span>
                  <span className="chip">{c.modulos ? `${c.modulos.length} módulos` : 'Todos los módulos'}</span>
                  {u && u.claves_claude > 0 && <span className="chip chip-on">Claude conectado</span>}
                </div>
                <div className="cuenta-datos nota">
                  <span>Entró {haceCuanto(c.ultimo_ingreso)}</span>
                  {u && <span>Cargó algo {haceCuanto(u.ultima_carga)}</span>}
                  {u && <span>{u.filas.toLocaleString('es-AR')} datos</span>}
                </div>
                <div className="cuenta-botones">
                  {u && (u.informes_abiertos > 0 || u.errores_7d > 0) && <button className="btn" onClick={() => verInformes(c)}>Ver informes</button>}
                  <button className="btn" onClick={() => setEditando(c)}>Editar</button>
                </div>
              </article>
            );
          })}
        </div>
      </Tarjeta>

      <Modal titulo={editando === 'nueva' ? 'Nueva cuenta' : 'Editar cuenta'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && (
          <FormCuenta cuenta={editando === 'nueva' ? null : editando} esYo={editando !== 'nueva' && editando.user_id === yo.user_id}
            onListo={(m) => { setEditando(null); setMsg(m); void recargarCuentas(); }} />
        )}
      </Modal>

      <Modal titulo="Qué puede cada rol" abierto={verPermisos} onCerrar={() => setVerPermisos(false)}>
        <table className="tabla-permisos">
          <thead><tr><th></th><th>Superadmin</th><th>Usuario</th><th>Solo lectura</th></tr></thead>
          <tbody>
            {PERMISOS.map((p) => (
              <tr key={p.que}><th scope="row">{p.que}</th>
                {[p.superadmin, p.usuario, p.lector].map((v, i) => <td key={i} className={v ? 'si' : 'no'}>{v ? '✓ Sí' : '— No'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="nota">Además, a cada cuenta le elegís qué módulos ve (Editar → Qué módulos ve). Pausar una cuenta la deja entrar pero no ver ni cargar nada.</p>
      </Modal>
    </div>
  );
}

function FormCuenta({ cuenta, esYo, onListo }: { cuenta: Cuenta | null; esYo: boolean; onListo: (msg: string) => void }) {
  const [usuario, setUsuario] = useState(cuenta?.usuario ?? '');
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '');
  const [rol, setRol] = useState<Rol>(cuenta?.rol ?? 'usuario');
  const [activo, setActivo] = useState(cuenta?.activo ?? true);
  const [todos, setTodos] = useState(!cuenta?.modulos);
  const [modulos, setModulos] = useState<string[]>(cuenta?.modulos ?? elegibles().map((m) => m.id));
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!todos && !modulos.length) { setError('Elegí al menos un módulo (o "Todos").'); return; }
    if (cuenta && !esYo && cuenta.activo && !activo
      && !(await confirmar(`¿Pausar la cuenta de ${nombreCuenta(cuenta)}? Va a poder entrar pero no ve ni carga nada hasta que la actives.`, 'Pausar'))) return;
    setOcupado(true);
    setError('');
    try {
      const mods = todos ? null : modulos;
      if (!cuenta) {
        await llamarCuentas({ accion: 'crear', usuario, clave, nombre, rol, modulos: mods });
        onListo(`Listo: ${usuario} ya puede entrar.`);
        return;
      }
      if (!supabase) return;
      const { error: e1 } = await supabase.from('perfiles')
        .update({ nombre, rol, activo, modulos: mods, usuario: usuario || null }).eq('user_id', cuenta.user_id);
      if (e1) throw new Error(e1.message);
      if (clave) await llamarCuentas({ accion: 'clave', user_id: cuenta.user_id, clave });
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
        {!todos && elegibles().map((m) => (
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
