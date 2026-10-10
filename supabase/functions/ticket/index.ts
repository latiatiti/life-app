// Función "ticket": baja UNA vez la página del ticket digital a la que apunta el QR del súper.
// Esos links suelen servir una sola vez, así que la app no los abre: los pide acá y guarda lo que vuelve.
//
// Entrada (POST JSON): { url: string }
// Salida: { ok, status, url (final), tipo, html, texto }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX = 2_000_000;

const responder = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Solo sitios públicos por https (nada de direcciones internas). */
function permitida(u: URL) {
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  if (h.startsWith('[')) return false;
  return true;
}

/** Texto plano de la página, con un renglón por fila o celda, para buscar los productos. */
function aTexto(html: string) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(tr|p|div|li|h\d|table|br)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, '  ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let url: URL;
  try {
    url = new URL(String((await req.json()).url ?? '').trim());
  } catch {
    return responder({ ok: false, error: 'Falta el link del ticket' }, 400);
  }
  if (!permitida(url)) return responder({ ok: false, error: 'Ese link no es un sitio público con https' }, 400);
  try {
    let actual = url;
    let r: Response | null = null;
    for (let i = 0; i < 6; i++) { // redirecciones, revisando cada destino
      r = await fetch(actual, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/json,application/pdf;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-AR,es;q=0.9',
        },
      });
      const destino = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (!destino) break;
      actual = new URL(destino, actual);
      if (!permitida(actual)) return responder({ ok: false, error: 'El ticket redirige a un sitio no permitido' }, 400);
    }
    if (!r) throw new Error('sin respuesta');
    const tipo = r.headers.get('content-type') ?? '';
    const buf = new Uint8Array(await r.arrayBuffer()).slice(0, MAX);
    if (/pdf/i.test(tipo)) {
      // El PDF va en base64 para guardarlo; leerlo queda para la foto.
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return responder({ ok: r.ok, status: r.status, url: actual.href, tipo, pdf: btoa(bin), html: '', texto: '' });
    }
    const html = new TextDecoder().decode(buf);
    const texto = /json/i.test(tipo) ? html : aTexto(html);
    return responder({ ok: r.ok, status: r.status, url: actual.href, tipo, html, texto });
  } catch (e) {
    return responder({ ok: false, error: `No pude bajar el ticket: ${(e as Error).message}` }, 502);
  }
});
