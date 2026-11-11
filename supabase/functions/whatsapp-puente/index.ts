// Función "whatsapp-puente": la única puerta entre el puente de WhatsApp (whatsapp-puente/ en el repo,
// corriendo en un servidor chico) y la base de LIFE.
//
// El puente NO tiene la clave service_role. Manda su clave propia en "Authorization: Bearer <WA_PUENTE_CLAVE>"
// y todo lo que escribe queda a nombre de la dueña (WA_DUENO = su user_id). Se despliega SIN verificación de JWT.
//
// Secretos de la función: WA_PUENTE_CLAVE (larga y al azar, la misma que tiene el puente) y WA_DUENO.
//
// Entrada (POST JSON): { accion, ... }
//   estado              { estado, qr?, numero?, nombre?, error? }   → { pedido }  (latido + lo que pidió la app)
//   pedido_cumplido     {}                                          → borra el pedido de la app
//   credenciales_leer   {}                                          → { datos | null }  (cifradas por el puente)
//   credenciales_guardar{ datos }                                   → { ok }
//   credenciales_borrar {}                                          → { ok }  (al cerrar sesión)
//   chats               { chats: [{jid, nombre?, telefono?}] }      → { ok }
//   mensajes            { mensajes: [{jid, wa_id, de_mi, texto, tipo, fecha, nombre?}], nuevos? } → { ok }
//   salida              { espera? (s, hasta 25) }                   → { mensajes: [{id, jid, telefono, texto}] }
//   salida_resultado    { id, ok, wa_id?, jid?, error? }            → { ok }
//   limpiar             {}                                          → { borrados }  (mensajes de más de 30 días)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;
const responder = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

/** Compara sin cortar antes (para no dar pistas por el tiempo de respuesta). */
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const ESTADOS = ['apagado', 'esperando_qr', 'conectando', 'conectado', 'desconectado', 'error'];
const TIPOS = ['texto', 'imagen', 'audio', 'video', 'documento', 'sticker', 'otro'];
const corto = (v: unknown, max: number) => (v === null || v === undefined ? null : String(v).slice(0, max));
const esJid = (j: unknown) => typeof j === 'string' && /^[\d]+@(s\.whatsapp\.net|lid)$/.test(j);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function atender(db: SupabaseClient, dueno: string, b: Json): Promise<unknown> {
  const accion = String(b.accion ?? '');

  if (accion === 'estado') {
    const estado = ESTADOS.includes(String(b.estado)) ? String(b.estado) : 'error';
    const fila: Json = { user_id: dueno, estado, visto: new Date().toISOString() };
    // El QR se borra en cuanto deja de hacer falta; el latido sin QR no pisa el que está a la vista.
    if (estado !== 'esperando_qr') fila.qr = null;
    else if (b.qr) fila.qr = corto(b.qr, 20000);
    if (estado === 'conectado') fila.ultimo_error = null;
    else if (b.error !== undefined) fila.ultimo_error = corto(b.error, 500);
    if (b.numero !== undefined) fila.numero = corto(b.numero, 30);
    if (b.nombre !== undefined) fila.nombre = corto(b.nombre, 100);
    const { data, error } = await db.from('wa_sesion').upsert(fila, { onConflict: 'user_id' }).select('pedido').single();
    if (error) throw new Error(error.message);
    return { pedido: (data as Json).pedido ?? null };
  }

  if (accion === 'pedido_cumplido') {
    await db.from('wa_sesion').update({ pedido: null }).eq('user_id', dueno);
    return { ok: true };
  }

  if (accion === 'credenciales_leer') {
    const { data } = await db.from('wa_credenciales').select('datos').eq('user_id', dueno).maybeSingle();
    return { datos: (data as Json | null)?.datos ?? null };
  }
  if (accion === 'credenciales_guardar') {
    const datos = String(b.datos ?? '');
    if (!datos || datos.length > 8_000_000) throw new Error('Credenciales vacías o demasiado grandes.');
    const { error } = await db.from('wa_credenciales').upsert({ user_id: dueno, datos, actualizado: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  }
  if (accion === 'credenciales_borrar') {
    await db.from('wa_credenciales').delete().eq('user_id', dueno);
    return { ok: true };
  }

  if (accion === 'chats') {
    let chats = ((b.chats as Json[]) ?? []).filter((c) => esJid(c.jid)).slice(0, 5000);
    if (b.solo_existentes) {
      // Solo ponerle nombre a los chats que ya están (no uno por cada contacto agendado).
      const { data } = await db.from('wa_chats').select('jid, nombre').eq('user_id', dueno);
      const hay = new Map((data ?? []).map((c) => [c.jid as string, c.nombre as string | null]));
      chats = chats.filter((c) => hay.has(String(c.jid)) && c.nombre && hay.get(String(c.jid)) !== c.nombre);
    }
    for (let i = 0; i < chats.length; i += 200) {
      const filas = chats.slice(i, i + 200).map((c) => {
        const f: Json = { user_id: dueno, jid: c.jid };
        if (c.nombre) f.nombre = corto(c.nombre, 100);
        if (c.telefono) f.telefono = corto(c.telefono, 30);
        return f;
      });
      const { error } = await db.from('wa_chats').upsert(filas, { onConflict: 'user_id,jid', ignoreDuplicates: false });
      if (error) throw new Error(error.message);
    }
    return { ok: true, chats: chats.length };
  }

  if (accion === 'mensajes') {
    const limite = Date.now() - 30 * 86400_000;
    const ms = ((b.mensajes as Json[]) ?? [])
      .filter((m) => esJid(m.jid) && m.wa_id && Date.parse(String(m.fecha)) > limite)
      .slice(0, 5000);
    const nuevos = !!b.nuevos; // true = llegaron en vivo (suman a "sin leer"); false = historial al conectar
    for (let i = 0; i < ms.length; i += 300) {
      const filas = ms.slice(i, i + 300).map((m) => ({
        user_id: dueno, jid: m.jid, wa_id: corto(m.wa_id, 100), de_mi: !!m.de_mi, texto: corto(m.texto, 4000),
        tipo: TIPOS.includes(String(m.tipo)) ? m.tipo : 'otro', fecha: new Date(String(m.fecha)).toISOString(),
      }));
      const { error } = await db.from('wa_mensajes').upsert(filas, { onConflict: 'user_id,wa_id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    // Cada chat queda con su último mensaje (y los nuevos que no son míos suman a "sin leer").
    const porChat = new Map<string, Json[]>();
    for (const m of ms) porChat.set(String(m.jid), [...(porChat.get(String(m.jid)) ?? []), m]);
    for (const [jid, lista] of porChat) {
      lista.sort((a, z) => Date.parse(String(a.fecha)) - Date.parse(String(z.fecha)));
      const ult = lista[lista.length - 1];
      const { data: chat } = await db.from('wa_chats').select('id, ultimo_at, sin_leer, nombre').eq('user_id', dueno).eq('jid', jid).maybeSingle();
      const c = chat as Json | null;
      const masNuevo = !c?.ultimo_at || Date.parse(String(ult.fecha)) >= Date.parse(String(c.ultimo_at));
      const cambios: Json = {};
      if (masNuevo) { cambios.ultimo_texto = corto(ult.texto ?? `[${ult.tipo}]`, 200); cambios.ultimo_at = new Date(String(ult.fecha)).toISOString(); }
      if (nuevos) {
        const recibidos = lista.filter((m) => !m.de_mi).length;
        cambios.sin_leer = lista.some((m) => m.de_mi) ? 0 : Number(c?.sin_leer ?? 0) + recibidos;
      }
      const nombre = lista.find((m) => !m.de_mi && m.nombre)?.nombre;
      if (!c) await db.from('wa_chats').insert({ user_id: dueno, jid, nombre: corto(nombre, 100), telefono: jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : null, ...cambios });
      else if (Object.keys(cambios).length || (!c.nombre && nombre)) await db.from('wa_chats').update({ ...cambios, ...(!c.nombre && nombre ? { nombre: corto(nombre, 100) } : {}) }).eq('id', c.id);
    }
    return { ok: true, mensajes: ms.length };
  }

  if (accion === 'salida') {
    // Espera larga: el puente pregunta y la función contesta apenas haya algo (o a los ~25 s con nada).
    const hasta = Date.now() + Math.min(Math.max(Number(b.espera) || 0, 0), 25) * 1000;
    do {
      const { data, error } = await db.from('wa_salida').select('id, jid, telefono, texto')
        .eq('user_id', dueno).eq('estado', 'pendiente').lte('no_antes', new Date().toISOString())
        .order('created_at').limit(5);
      if (error) throw new Error(error.message);
      if (data?.length) {
        const ids = data.map((m) => m.id);
        await db.from('wa_salida').update({ estado: 'enviando' }).in('id', ids).eq('estado', 'pendiente');
        return { mensajes: data };
      }
      if (Date.now() < hasta) await esperar(2500);
    } while (Date.now() < hasta);
    return { mensajes: [] };
  }

  if (accion === 'salida_resultado') {
    const cambios: Json = b.ok
      ? { estado: 'enviado', enviado_at: new Date().toISOString(), wa_id: corto(b.wa_id, 100), error: null }
      : { estado: 'error', error: corto(b.error, 300) ?? 'No se pudo mandar.' };
    if (b.ok && esJid(b.jid)) cambios.jid = b.jid;
    const { error } = await db.from('wa_salida').update(cambios).eq('id', String(b.id)).eq('user_id', dueno);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (accion === 'limpiar') {
    const antes = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count } = await db.from('wa_mensajes').delete({ count: 'exact' }).eq('user_id', dueno).lt('fecha', antes);
    await db.from('wa_salida').delete().eq('user_id', dueno).lt('created_at', antes);
    return { borrados: count ?? 0 };
  }

  throw new Error(`No conozco la acción "${accion}".`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder({ error: 'Usá POST.' }, 405);
  const clave = Deno.env.get('WA_PUENTE_CLAVE') ?? '';
  const dueno = Deno.env.get('WA_DUENO') ?? '';
  if (clave.length < 32 || !dueno) return responder({ error: 'Falta configurar WA_PUENTE_CLAVE (32+ letras) y WA_DUENO.' }, 500);
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !iguales(auth.slice(7), clave)) return responder({ error: 'Clave del puente inválida.' }, 401);

  let cuerpo: Json;
  try { cuerpo = await req.json(); } catch { return responder({ error: 'JSON inválido.' }, 400); }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    return responder(await atender(db, dueno, cuerpo));
  } catch (e) {
    return responder({ error: (e as Error).message }, 400);
  }
});
