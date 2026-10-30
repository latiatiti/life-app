// Función "soderia": trae sola, una vez por día, lo que dice el software de la sodería Tía Titi
// sobre el repartidor (lo que le deben y los repartos de la semana) y lo guarda en LIFE.
//
// Habla con el conector MCP de la sodería por HTTP, con una clave de SOLO LECTURA de la sodería.
// Secretos (Edge Functions → Secrets):
//   SODERIA_MCP_URL     dirección del conector de la sodería
//   SODERIA_MCP_CLAVE   clave de solo lectura (va como "Authorization: Bearer ...")
//   SODERIA_PERSONA     nombre o personaId del repartidor en la sodería (ej. Mauro)
//   SODERIA_LIFE_USER   user_id de LIFE donde se guarda
//   SODERIA_DISPARO     texto secreto que manda el cron en "x-soderia-disparo"
// Se despliega sin verificación de JWT: la autoriza SODERIA_DISPARO.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { guardarSoderia } from '../_shared/soderia.ts';

type Json = Record<string, unknown>;
const env = (k: string) => Deno.env.get(k) ?? '';

let sesion = '';
let n = 0;

/** Una llamada JSON-RPC al conector (acepta respuesta JSON o en stream de eventos). */
async function rpc(method: string, params: Json = {}): Promise<Json> {
  const res = await fetch(env('SODERIA_MCP_URL'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${env('SODERIA_MCP_CLAVE')}`,
      ...(sesion ? { 'Mcp-Session-Id': sesion } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  });
  if (!res.ok) throw new Error(`La sodería respondió ${res.status} en ${method}`);
  sesion = res.headers.get('mcp-session-id') ?? sesion;
  const texto = await res.text();
  const cuerpo = res.headers.get('content-type')?.includes('text/event-stream')
    ? texto.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).pop() ?? '{}'
    : texto;
  const r = JSON.parse(cuerpo) as Json;
  if (r.error) throw new Error(`La sodería: ${(r.error as Json).message}`);
  return r.result as Json;
}

async function herramienta(name: string, args: Json = {}): Promise<Json> {
  const r = await rpc('tools/call', { name, arguments: args });
  const texto = ((r.content as Json[] | undefined) ?? []).map((c) => c.text).join('');
  if (r.isError) throw new Error(`La sodería (${name}): ${texto}`);
  return JSON.parse(texto) as Json;
}

Deno.serve(async (req) => {
  if (!env('SODERIA_DISPARO') || req.headers.get('x-soderia-disparo') !== env('SODERIA_DISPARO')) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), { status: 401 });
  }
  try {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'LIFE', version: '1.0.0' } });
    const quien = env('SODERIA_PERSONA').toLowerCase();
    const { personas } = await herramienta('personal') as { personas: Json[] };
    const persona = personas.find((p) => String(p.personaId) === quien || String(p.nombre).toLowerCase() === quien);
    if (!persona) throw new Error(`No encontré a "${env('SODERIA_PERSONA')}" en el personal de la sodería.`);
    const { tiradas } = await herramienta('horarios_de_pasada') as { tiradas: Json[] };

    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const r = await guardarSoderia(db, env('SODERIA_LIFE_USER'), { persona, tiradas }, 'auto');
    return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
});
