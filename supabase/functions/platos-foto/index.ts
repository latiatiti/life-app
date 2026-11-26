// Función "platos-foto": genera la foto de los platos que todavía no la tienen, UNA sola vez,
// la guarda en el almacenamiento (bucket "platos") y deja el link en ali_platos.imagen.
// Si el generador falla o se quedó sin uso gratis, el plato queda pendiente (imagen_error dice por qué)
// y se reintenta en la próxima llamada.
//
// La llama la app (con la sesión del usuario: verificación de JWT activada) cuando hay platos sin foto.
// Solo toca los platos de quien llama.
//
// Generadores, en orden (el primero que tenga sus secretos cargados y ande):
//   1. Cloudflare Workers AI (FLUX, gratis por día): secretos CF_ACCOUNT_ID y CF_API_TOKEN.
//   2. Google Gemini (imagen): secreto GEMINI_API_KEY.
//   3. Pollinations (FLUX, gratis): con POLLINATIONS_KEY si hay; sin clave, de a una cada ~45 s.
//
// Entrada (POST JSON): { id?: string }  → id = rehacer la foto de ese plato.
// Salida: { hechas: [{id, imagen, via}], pendientes: number, error?: string }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const BUCKET = 'platos';
const LADO = 1024;

interface Foto { bytes: Uint8Array; tipo: string; via: string }

function base64(b64: string) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

async function cloudflare(prompt: string): Promise<Foto | null> {
  const cuenta = Deno.env.get('CF_ACCOUNT_ID');
  const token = Deno.env.get('CF_API_TOKEN');
  if (!cuenta || !token) return null;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps: 8 }),
  });
  if (!r.ok) throw new Error(`Cloudflare ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const img = d?.result?.image;
  if (!img) throw new Error('Cloudflare no devolvió imagen.');
  return { bytes: base64(img), tipo: 'image/jpeg', via: 'cloudflare-flux' };
}

async function gemini(prompt: string): Promise<Foto | null> {
  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) return null;
  const modelo = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-2.5-flash-image';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': clave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Photorealistic food photograph, square. ${prompt}` }] }] }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const parte = (d?.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData?.data);
  if (!parte) throw new Error('Gemini no devolvió imagen.');
  return { bytes: base64(parte.inlineData.data), tipo: parte.inlineData.mimeType ?? 'image/png', via: 'gemini' };
}

async function pollinations(prompt: string, semilla: number): Promise<Foto | null> {
  const clave = Deno.env.get('POLLINATIONS_KEY');
  const q = `width=${LADO}&height=${LADO}&seed=${semilla}&nologo=true&model=flux&enhance=false`;
  const url = clave
    ? `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${q}`
    : `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;
  const r = await fetch(url, { headers: clave ? { Authorization: `Bearer ${clave}` } : {} });
  if (!r.ok) throw new Error(`Pollinations ${r.status}${r.status === 402 || r.status === 429 ? ' (sin uso gratis por ahora)' : ''}`);
  const tipo = r.headers.get('content-type') ?? '';
  if (!tipo.startsWith('image/')) throw new Error(`Pollinations no devolvió imagen (${tipo}).`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  // El cartel de "límite" es una imagen chica: no la guardamos como foto.
  if (bytes.length < 15000) throw new Error('Pollinations devolvió el cartel de límite (sin uso gratis por ahora).');
  return { bytes, tipo, via: clave ? 'pollinations-key' : 'pollinations' };
}

function semillaDe(t: string) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h % 100000;
}

async function generar(prompt: string, nombre: string): Promise<Foto> {
  const errores: string[] = [];
  for (const g of [() => cloudflare(prompt), () => gemini(prompt), () => pollinations(prompt, semillaDe(nombre + Date.now()))]) {
    try {
      const f = await g();
      if (f) return f;
    } catch (e) {
      errores.push((e as Error).message);
    }
  }
  throw new Error(errores.join(' · ') || 'Ningún generador disponible.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Usá POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const { data: yo } = await admin.auth.getUser(token);
  if (!yo.user) return responder({ error: 'Iniciá sesión.' }, 401);
  const uid = yo.user.id;

  let p: { id?: string } = {};
  try { p = await req.json(); } catch { /* sin cuerpo */ }

  // De a uno por llamada: así no se pasa del uso gratis y la app va pidiendo el siguiente.
  let q = admin.from('ali_platos').select('id, nombre, prompt, imagen').eq('user_id', uid).neq('prompt', '');
  q = p.id ? q.eq('id', p.id) : q.eq('imagen', '');
  const { data: platos, error } = await q.order('created_at').limit(1);
  if (error) return responder({ error: error.message }, 500);

  const hechas: Array<{ id: string; imagen: string; via: string }> = [];
  let fallo: string | undefined;
  for (const pl of platos ?? []) {
    try {
      const f = await generar(pl.prompt, pl.nombre);
      const ext = f.tipo.includes('png') ? 'png' : f.tipo.includes('webp') ? 'webp' : 'jpg';
      const ruta = `${uid}/${pl.id}-${Date.now()}.${ext}`;
      const { error: eSubir } = await admin.storage.from(BUCKET).upload(ruta, f.bytes, { contentType: f.tipo, upsert: true });
      if (eSubir) throw new Error(`No se pudo guardar: ${eSubir.message}`);
      const link = admin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
      await admin.from('ali_platos').update({ imagen: link, imagen_error: '' }).eq('id', pl.id).eq('user_id', uid);
      hechas.push({ id: pl.id, imagen: link, via: f.via });
    } catch (e) {
      fallo = (e as Error).message;
      await admin.from('ali_platos').update({ imagen_error: fallo.slice(0, 300) }).eq('id', pl.id).eq('user_id', uid);
    }
  }

  const { count } = await admin.from('ali_platos').select('id', { count: 'exact', head: true })
    .eq('user_id', uid).neq('prompt', '').eq('imagen', '');
  return responder({ hechas, pendientes: count ?? 0, ...(fallo ? { error: fallo } : {}) });
});
