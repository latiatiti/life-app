// Función "cuentas": lo que solo puede hacer el superadmin con las cuentas de LIFE.
// Necesita la sesión del que llama (verificación de JWT activada) y que sea superadmin.
//
// Entrada (POST JSON):
//   { accion: 'listar' }
//   { accion: 'crear', usuario, clave, nombre?, rol?, modulos?, plan?, vincular? }   usuario = "nombre" o un correo
//   { accion: 'clave', user_id, clave }                            cambia la contraseña
//   { accion: 'rechazar', user_id }                                borra una cuenta que pidió entrar y no se autorizó
// Roles, módulos y pausar se cambian directo en la tabla perfiles (las reglas lo permiten
// solo al superadmin).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DOMINIO = 'life.com'; // "mauro" entra como mauro@life.com (así se creó la primera cuenta)
const ROLES = ['superadmin', 'usuario', 'lector'];

const responder = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const correoDe = (usuario: string) => (usuario.includes('@') ? usuario : `${usuario}@${DOMINIO}`).trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Usá POST.' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const { data: yo } = await admin.auth.getUser(token);
  if (!yo.user) return responder({ error: 'Iniciá sesión.' }, 401);
  const { data: perfil } = await admin.from('perfiles').select('rol, activo').eq('user_id', yo.user.id).maybeSingle();
  if (perfil?.rol !== 'superadmin' || !perfil.activo) return responder({ error: 'Solo el superadmin puede hacer esto.' }, 403);

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return responder({ error: 'JSON inválido.' }, 400);
  }

  if (p.accion === 'listar') {
    const { data: u, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) return responder({ error: error.message }, 500);
    const { data: perfiles } = await admin.from('perfiles').select('user_id, usuario, nombre, rol, modulos, activo, pedido_at, via, bienvenida_at');
    const { data: susc } = await admin.from('life_suscripciones').select('user_id, plan_id, estado, hasta, nota');
    const porId = new Map((perfiles ?? []).map((x) => [x.user_id, x]));
    const suscDe = new Map((susc ?? []).map((x) => [x.user_id, x]));
    return responder({
      cuentas: u.users.map((x) => ({
        user_id: x.id,
        email: x.email,
        ultimo_ingreso: x.last_sign_in_at,
        creada: x.created_at,
        proveedores: (x.identities ?? []).map((i) => i.provider),
        suscripcion: suscDe.get(x.id) ?? null,
        ...(porId.get(x.id) ?? { rol: 'usuario', activo: true, modulos: null, nombre: '', usuario: null }),
      })),
    });
  }

  if (p.accion === 'crear') {
    const usuario = String(p.usuario ?? '').trim();
    const clave = String(p.clave ?? '');
    const rol = ROLES.includes(String(p.rol)) ? String(p.rol) : 'usuario';
    if (!/^[\w.@+-]{3,}$/.test(usuario)) return responder({ error: 'El usuario tiene que tener al menos 3 letras, sin espacios.' }, 400);
    if (clave.length < 8) return responder({ error: 'La contraseña tiene que tener al menos 8 caracteres.' }, 400);
    // life_admin = 'si' (app_metadata, que solo el servidor puede poner): la base la crea activa y sin mail de aviso.
    const { data, error } = await admin.auth.admin.createUser({
      email: correoDe(usuario), password: clave, email_confirm: true, app_metadata: { life_admin: 'si' },
    });
    if (error) return responder({ error: /already/i.test(error.message) ? 'Ese usuario ya existe.' : error.message }, 400);
    const { error: e2 } = await admin.from('perfiles').upsert({
      user_id: data.user.id,
      usuario: usuario.includes('@') ? usuario.split('@')[0] : usuario,
      nombre: String(p.nombre ?? ''),
      rol,
      modulos: Array.isArray(p.modulos) && p.modulos.length ? p.modulos : null,
      activo: true,
    });
    if (e2) return responder({ error: e2.message }, 500);
    // Plan: por defecto "Familia, cortesía" (cuenta de la casa).
    const plan = typeof p.plan === 'string' && p.plan ? p.plan : 'familia';
    await admin.from('life_suscripciones').upsert({ user_id: data.user.id, plan_id: plan, estado: plan === 'familia' ? 'cortesia' : 'activa' });
    // Comparten gastos con el superadmin (ej. Ulises): vínculo ya aceptado.
    if (p.vincular === true) await admin.from('life_vinculos').insert({ user_id: yo.user.id, otro_id: data.user.id, estado: 'aceptado' });
    return responder({ ok: true, user_id: data.user.id, email: data.user.email });
  }

  if (p.accion === 'clave') {
    const clave = String(p.clave ?? '');
    if (clave.length < 8) return responder({ error: 'La contraseña tiene que tener al menos 8 caracteres.' }, 400);
    const { error } = await admin.auth.admin.updateUserById(String(p.user_id), { password: clave });
    if (error) return responder({ error: error.message }, 400);
    return responder({ ok: true });
  }

  if (p.accion === 'rechazar') {
    const id = String(p.user_id ?? '');
    const { data: otro } = await admin.from('perfiles').select('activo, rol').eq('user_id', id).maybeSingle();
    if (!otro || otro.activo || otro.rol === 'superadmin' || id === yo.user.id) {
      return responder({ error: 'Solo se pueden rechazar cuentas que están esperando autorización.' }, 400);
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return responder({ error: error.message }, 400);
    return responder({ ok: true });
  }

  return responder({ error: 'Acción desconocida.' }, 400);
});
