import { useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { conectarGoogle, LogoGoogle, usePerfil } from '../../core/auth';
import { supabase } from '../../core/db';
import { fechaCorta } from '../../core/format';
import { confirmar } from '../../ui/Deshacer';
import { Tarjeta } from '../../ui/ui';
import { Bienvenida } from './Bienvenida';

/**
 * Lo de cada cuenta (2026-11-06): con qué se entra (usuario y/o Google), con quién comparte
 * gastos (vínculos entre cuentas), su plan y repetir la encuesta de bienvenida.
 */

interface Vinculo { id: string; otro_id: string; nombre: string; usuario: string | null; estado: 'pendiente' | 'aceptado' | 'rechazado'; lo_pedi_yo: boolean }
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
          Si entrás con Google sin conectarlo antes, se crea otra cuenta vacía que queda esperando autorización.</p>
        {plan && (
          <p className="nota">Plan: <strong>{plan.plan}</strong> · {ESTADOS[plan.estado] ?? plan.estado}{plan.hasta ? ` hasta ${fechaCorta(plan.hasta)}` : ''}
            {!plan.al_dia && ' · tu cuenta está en solo lectura hasta que se renueve'}</p>
        )}
        <div className="acciones">
          <button className="btn" onClick={() => setEncuesta(true)}>Repetir la encuesta de bienvenida</button>
        </div>
        {msg && <p className="nota" role="status">{msg}</p>}
      </Tarjeta>

      <Tarjeta titulo="Con quién compartís gastos">
        <p className="nota" style={{ marginTop: 0 }}>Cada cuenta ve solo lo suyo. Lo único que se comparte entre dos cuentas vinculadas son los gastos, préstamos y pagos entre ustedes.</p>
        <ul className="lista-simple">
          {vinculos.filter((v) => v.estado !== 'rechazado').map((v) => (
            <li key={v.id}>
              <span><strong>{v.nombre}</strong> <small className="nota">· {v.estado === 'aceptado' ? 'vinculada' : v.lo_pedi_yo ? 'esperando que acepte' : 'te invitó'}</small></span>
              <span className="acciones">
                {v.estado === 'pendiente' && !v.lo_pedi_yo && (
                  <button className="btn btn-primario" onClick={() => hacer(() => supabase!.rpc('life_responder_vinculo', { vinculo: v.id, respuesta: 'aceptar' }), `Listo: ahora compartís gastos con ${v.nombre}.`)}>Aceptar</button>
                )}
                <button className="btn" onClick={async () => {
                  if (!await confirmar(v.estado === 'aceptado' ? `¿Dejar de compartir gastos con ${v.nombre}? Lo cargado queda, pero ya no se ven entre ustedes.` : '¿Cancelar la invitación?')) return;
                  void hacer(() => supabase!.rpc('life_responder_vinculo', { vinculo: v.id, respuesta: v.estado === 'pendiente' && !v.lo_pedi_yo ? 'rechazar' : 'cortar' }), 'Listo.');
                }}>{v.estado === 'aceptado' ? 'Dejar de compartir' : v.lo_pedi_yo ? 'Cancelar' : 'Rechazar'}</button>
              </span>
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
