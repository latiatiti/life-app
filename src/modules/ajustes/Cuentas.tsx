import { useEffect, useState } from 'react';
import { usePerfil, type Perfil, type Rol } from '../../core/auth';
import { supabase } from '../../core/db';
import { fechaCorta } from '../../core/format';
import { MODULOS } from '../../core/registry';
import { confirmar } from '../../ui/Deshacer';
import { Campo, Modal, Tarjeta } from '../../ui/ui';

interface Suscripcion { plan_id: string; estado: string; hasta: string | null; nota: string }
interface Cuenta extends Perfil {
  email: string;
  ultimo_ingreso: string | null;
  creada: string;
  proveedores?: string[];
  suscripcion: Suscripcion | null;
}

/** Planes (life_planes). Sin cobro real: sirven para ordenar quién usa qué el día que haya suscripciones. */
const PLANES: Array<[string, string]> = [['familia', 'Familia (sin cargo)'], ['basico', 'Básico'], ['completo', 'Completo']];
const ESTADOS_SUSC: Array<[string, string]> = [['cortesia', 'Sin cargo'], ['prueba', 'De prueba'], ['activa', 'Activa'], ['vencida', 'Vencida (solo lectura)'], ['cancelada', 'Cancelada (solo lectura)']];

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

  const esperando = (cuentas ?? []).filter((c) => !c.activo && c.pedido_at);
  const resto = (cuentas ?? []).filter((c) => !esperando.includes(c));

  async function autorizar(c: Cuenta) {
    if (!supabase) return;
    const { error } = await supabase.from('perfiles').update({ activo: true }).eq('user_id', c.user_id);
    if (!error) await supabase.from('life_suscripciones').upsert({ user_id: c.user_id, plan_id: 'familia', estado: 'cortesia' });
    setMsg(error ? error.message : `Listo: ${c.nombre || c.email} ya puede entrar.`);
    void cargar();
  }
  async function rechazar(c: Cuenta) {
    if (!await confirmar(`¿Rechazar y borrar la cuenta de ${c.nombre || c.email}? No tiene datos; si vuelve a pedir, te llega otro aviso.`)) return;
    try { await llamar({ accion: 'rechazar', user_id: c.user_id }); setMsg('Cuenta rechazada.'); } catch (e) { setMsg((e as Error).message); }
    void cargar();
  }

  return (
    <Tarjeta titulo="Cuentas y roles" accion={<button className="btn btn-primario" onClick={() => setEditando('nueva')}>Nueva cuenta</button>}>
      {msg && <p className="nota" role="status">{msg}</p>}
      {!cuentas && !msg && <p className="nota">Cargando…</p>}
      {esperando.length > 0 && (
        <div className="cuenta-espera">
          <p><strong>Esperando tu autorización ({esperando.length})</strong> <small className="nota">· máximo 5 a la vez: con 5 esperando, LIFE no acepta más.</small></p>
          <ul className="lista-simple">
            {esperando.map((c) => (
              <li key={c.user_id}>
                <span><strong>{c.nombre || c.email}</strong>
                  <small className="nota"> · {c.email} · {c.via === 'google' ? 'con Google' : 'con correo'} · {fechaCorta(String(c.pedido_at).slice(0, 10))}</small></span>
                <span className="acciones">
                  <button className="btn btn-primario" onClick={() => autorizar(c)}>Autorizar</button>
                  <button className="btn btn-peligro" onClick={() => rechazar(c)}>Rechazar</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="lista-simple">
        {resto.map((c) => (
          <li key={c.user_id}>
            <span>
              <strong>{c.nombre || c.usuario || c.email}</strong>
              {c.user_id === yo.user_id && ' (vos)'}
              <small className="nota"> · {nombreRol(c.rol)}{!c.activo && ' · pausada'}{c.modulos ? ` · ${c.modulos.length} módulos` : ''}
                {c.suscripcion ? ` · ${PLANES.find(([id]) => id === c.suscripcion!.plan_id)?.[1] ?? c.suscripcion.plan_id}` : ''}
                {c.proveedores?.includes('google') ? ' · Google' : ''}
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
  const [plan, setPlan] = useState(cuenta?.suscripcion?.plan_id ?? 'familia');
  const [estado, setEstado] = useState(cuenta?.suscripcion?.estado ?? 'cortesia');
  const [hasta, setHasta] = useState(cuenta?.suscripcion?.hasta ?? '');
  const [vincular, setVincular] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const mods = todos ? null : modulos;
      if (!cuenta) {
        await llamar({ accion: 'crear', usuario, clave, nombre, rol, modulos: mods, plan, vincular });
        onListo(`Listo: ${usuario} ya puede entrar.`);
        return;
      }
      if (!supabase) return;
      const { error: e1 } = await supabase.from('perfiles')
        .update({ nombre, rol, activo, modulos: mods, usuario: usuario || null }).eq('user_id', cuenta.user_id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from('life_suscripciones')
        .upsert({ user_id: cuenta.user_id, plan_id: plan, estado, hasta: hasta || null, updated_at: new Date().toISOString() });
      if (e2) throw new Error(e2.message);
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
      <fieldset className="check-grupo">
        <legend>Suscripción</legend>
        <Campo etiqueta="Plan" ayuda="Por ahora no se cobra nada: queda listo para cuando haya suscripciones.">
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>{PLANES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </Campo>
        {cuenta && !esYo && (
          <>
            <Campo etiqueta="Estado" ayuda="Vencida o cancelada = ve sus datos pero no puede cambiarlos (tampoco por Claude).">
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>{ESTADOS_SUSC.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
            </Campo>
            <Campo etiqueta="Hasta (opcional)"><input type="date" value={hasta ?? ''} onChange={(e) => setHasta(e.target.value)} /></Campo>
          </>
        )}
      </fieldset>
      {!cuenta && (
        <label className="check"><input type="checkbox" checked={vincular} onChange={(e) => setVincular(e.target.checked)} /> Comparte gastos conmigo (ej. con quien vivís)</label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Guardando…' : cuenta ? 'Guardar' : 'Crear cuenta'}</button>
    </form>
  );
}
