import { useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { conectarGoogle, LogoGoogle, usePerfil } from '../../core/auth';
import { cargarCompartido, recargarTodo, supabase } from '../../core/db';
import { fechaCorta } from '../../core/format';
import { confirmar } from '../../ui/Deshacer';
import { Tarjeta } from '../../ui/ui';
import { Bienvenida } from './Bienvenida';

/**
 * Lo de cada cuenta (2026-11-06): con qué se entra (usuario y/o Google), con quién comparte
 * gastos (vínculos entre cuentas), su plan y repetir la encuesta de bienvenida.
 */

interface Vinculo {
  id: string; otro_id: string; nombre: string; usuario: string | null; estado: 'pendiente' | 'aceptado' | 'rechazado'; lo_pedi_yo: boolean;
  /** Lo que marqué yo, lo que marcó el otro y lo que se comparte de verdad (los dos lo marcaron). */
  mis_areas: string[]; sus_areas: string[]; comunes: string[];
}

/** Áreas que se pueden compartir (supabase/compartir.sql, tabla life_areas). */
const AREAS: Array<[string, string, string]> = [
  ['gastos', 'Gastos y deudas', 'Lo que se deben entre ustedes'],
  ['casa', 'Casa y compras', 'Una sola lista del súper, compras, precios y lo que hay en casa'],
  ['tareas', 'Tareas', 'Las tareas de los dos en una lista'],
  ['comida', 'Platos', 'Los platos y recetas de los dos'],
  ['entreno', 'Entreno', 'Ejercicios propios, y ver la rutina y el progreso del otro'],
];
interface Plan { plan: string; estado: string; hasta: string | null; al_dia: boolean }

const ESTADOS: Record<string, string> = { prueba: 'De prueba', activa: 'Activa', cortesia: 'Sin cargo', vencida: 'Vencida', cancelada: 'Cancelada' };

export function MiCuenta() {
  const perfil = usePerfil();
  const [ids, setIds] = useState<UserIdentity[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [invitar, setInvitar] = useState('');
  const [msg, setMsg] = useState('');
  const [encuesta, setEncuesta] = useState(false);

  async function cargar() {
    if (!supabase) return;
    const [i, v, p] = await Promise.all([
      supabase.auth.getUserIdentities(),
      supabase.rpc('life_mis_vinculos'),
      supabase.rpc('life_mi_plan'),
    ]);
    setIds(i.data?.identities ?? []);
    setVinculos((v.data as Vinculo[] | null) ?? []);
    setPlan(((p.data as Plan[] | null) ?? [])[0] ?? null);
  }
  useEffect(() => { void cargar(); }, []);

  if (!supabase) return null;
  const google = ids.find((x) => x.provider === 'google');
  const conClave = ids.some((x) => x.provider === 'email');

  async function hacer(f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setMsg('');
    const { error } = await f();
    setMsg(error ? error.message : ok);
    void cargar();
  }

  return (
    <>
      <Tarjeta titulo="Cómo entrás">
        <ul className="lista-simple">
          {conClave && <li><span>Usuario y contraseña <small className="nota">· {perfil.usuario ?? perfil.email}</small></span></li>}
          <li>
            <span><LogoGoogle /> Google {google ? <small className="nota">· {String(google.identity_data?.email ?? 'conectada')}</small> : <small className="nota">· sin conectar</small>}</span>
            {google
              ? ids.length > 1 && (
                <button className="btn" onClick={async () => {
                  if (!await confirmar('¿Desconectar Google? Vas a entrar solo con usuario y contraseña.')) return;
                  void hacer(() => supabase!.auth.unlinkIdentity(google), 'Google desconectado.');
                }}>Desconectar</button>
              )
              : <button className="btn btn-primario" onClick={() => conectarGoogle().catch((e) => setMsg((e as Error).message))}>Conectar Google</button>}
          </li>
        </ul>
        <p className="nota">Conectar Google a esta cuenta hace que “Entrar con Google” abra <strong>esta misma</strong> cuenta, con todos tus datos.
          Si entrás con Google sin conectarlo antes, se crea otra cuenta nueva y vacía.</p>
        {plan && (
          <p className="nota">Plan: <strong>{plan.plan}</strong> · {ESTADOS[plan.estado] ?? plan.estado}{plan.hasta ? ` hasta ${fechaCorta(plan.hasta)}` : ''}
            {!plan.al_dia && ' · tu cuenta está en solo lectura hasta que se renueve'}</p>
        )}
        <div className="acciones">
          <button className="btn" onClick={() => setEncuesta(true)}>Repetir la encuesta de bienvenida</button>
        </div>
        {msg && <p className="nota" role="status">{msg}</p>}
      </Tarjeta>

      <Tarjeta titulo="Con quién compartís">
        <p className="nota" style={{ marginTop: 0 }}>Cada cuenta ve solo lo suyo. Con una cuenta vinculada (ej. con quien vivís) elegís qué áreas comparten:
          un área se comparte solo cuando <strong>los dos</strong> la marcan. Lo que cargó el otro lo podés ver y cambiar, pero borrarlo solo puede quien lo cargó.</p>
        <ul className="lista-simple">
          {vinculos.filter((v) => v.estado !== 'rechazado').map((v) => (
            <li key={v.id}>
              <span><strong>{v.nombre}</strong> <small className="nota">· {v.estado === 'aceptado' ? 'vinculada' : v.lo_pedi_yo ? 'esperando que acepte' : 'te invitó'}</small></span>
              <span className="acciones">
                {v.estado === 'pendiente' && !v.lo_pedi_yo && (
                  <button className="btn btn-primario" onClick={() => hacer(() => supabase!.rpc('life_responder_vinculo', { vinculo: v.id, respuesta: 'aceptar' }), `Listo: ya están vinculados con ${v.nombre}. Elegí abajo qué comparten.`)}>Aceptar</button>
                )}
                <button className="btn" onClick={async () => {
                  if (!await confirmar(v.estado === 'aceptado' ? `¿Desvincularte de ${v.nombre}? Lo cargado queda, pero ya no se ven nada entre ustedes.` : '¿Cancelar la invitación?')) return;
                  void hacer(() => supabase!.rpc('life_responder_vinculo', { vinculo: v.id, respuesta: v.estado === 'pendiente' && !v.lo_pedi_yo ? 'rechazar' : 'cortar' }), 'Listo.');
                }}>{v.estado === 'aceptado' ? 'Desvincular' : v.lo_pedi_yo ? 'Cancelar' : 'Rechazar'}</button>
              </span>
              {v.estado === 'aceptado' && (
                <fieldset className="check-grupo areas-vinculo">
                  <legend>Qué compartís con {v.nombre}</legend>
                  {AREAS.map(([id, nombre, ayuda]) => {
                    const mia = v.mis_areas.includes(id);
                    const suya = v.sus_areas.includes(id);
                    return (
                      <label key={id} className="check">
                        <input type="checkbox" checked={mia} onChange={() => {
                          const nuevas = mia ? v.mis_areas.filter((x) => x !== id) : [...v.mis_areas, id];
                          void hacer(async () => {
                            const r = await supabase!.rpc('life_vinculo_areas', { vinculo: v.id, areas: nuevas });
                            await cargarCompartido();
                            recargarTodo();
                            return r;
                          }, mia ? `Dejaste de compartir ${nombre.toLowerCase()} con ${v.nombre}.`
                            : suya ? `Listo: ya comparten ${nombre.toLowerCase()}.` : `Marcado. Se comparte cuando ${v.nombre} también lo marque.`);
                        }} />
                        <span><strong>{nombre}</strong> <small className="nota">· {ayuda}{' · '}
                          {v.comunes.includes(id) ? 'compartido' : mia ? `falta que ${v.nombre} lo marque` : suya ? `${v.nombre} ya lo marcó` : 'no'}</small></span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </li>
          ))}
        </ul>
        <form className="fila-bienvenida" onSubmit={(e) => {
          e.preventDefault();
          if (!invitar.trim()) return;
          void hacer(() => supabase!.rpc('life_invitar', { usuario_otro: invitar.trim() }), `Invitación enviada a ${invitar.trim()}: la ve en su Ajustes.`);
          setInvitar('');
        }}>
          <input className="crece" value={invitar} onChange={(e) => setInvitar(e.target.value)} autoCapitalize="none" placeholder="Usuario de la otra persona" aria-label="Usuario a invitar" />
          <button className="btn">Invitar</button>
        </form>
      </Tarjeta>

      {encuesta && <Bienvenida onListo={() => setEncuesta(false)} />}
    </>
  );
}
