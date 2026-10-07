// Función "precios": busca productos y precios online en supermercados con presencia en Mendoza.
// Carrefour, Vea y Jumbo usan la misma plataforma (VTEX) con un catálogo público en JSON.
// El navegador no puede pedirlos directo (CORS), por eso pasa por acá.
//
// Entrada (POST JSON): { q?: string, eans?: string[], cadenas?: string[], limite?: number }
// Salida: { resultados: Array<{ cadena, nombre, marca, ean, precio, precioLista, unidad, imagen, link }> }

const CADENAS: Record<string, string> = {
  carrefour: 'https://www.carrefour.com.ar',
  vea: 'https://www.vea.com.ar',
  jumbo: 'https://www.jumbo.com.ar',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Resultado {
  cadena: string;
  nombre: string;
  marca: string;
  ean: string;
  precio: number;
  precioLista: number;
  unidad: string;
  imagen: string;
  link: string;
}

// deno-lint-ignore no-explicit-any
function normalizar(cadena: string, p: any): Resultado | null {
  const item = p?.items?.[0];
  const oferta = item?.sellers?.[0]?.commertialOffer;
  const precio = Number(oferta?.Price);
  if (!item || !precio || oferta?.AvailableQuantity === 0) return null;
  let lista = Number(oferta?.ListPrice) || precio;
  // Vea/Jumbo a veces devuelven el precio de lista en centavos.
  if (lista > precio * 20) lista = lista / 100;
  return {
    cadena,
    nombre: String(p.productName ?? ''),
    marca: String(p.brand ?? ''),
    ean: String(item.ean ?? ''),
    precio,
    precioLista: Math.max(lista, precio),
    unidad: `${item.unitMultiplier ?? 1} ${item.measurementUnit ?? 'un'}`,
    imagen: String(item.images?.[0]?.imageUrl ?? ''),
    link: p.link ? String(p.link) : '',
  };
}

async function buscar(cadena: string, params: string): Promise<Resultado[]> {
  const url = `${CADENAS[cadena]}/api/catalog_system/pub/products/search?${params}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 LIFE-app' } });
    if (!r.ok) return [];
    const datos = await r.json();
    return (Array.isArray(datos) ? datos : []).map((p) => normalizar(cadena, p)).filter(Boolean) as Resultado[];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let cuerpo: { q?: string; eans?: string[]; cadenas?: string[]; limite?: number } = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* sin cuerpo */
  }
  const cadenas = (cuerpo.cadenas ?? Object.keys(CADENAS)).filter((c) => c in CADENAS);
  const limite = Math.min(Math.max(Number(cuerpo.limite) || 8, 1), 20);
  const eans = (cuerpo.eans ?? []).map(String).filter((e) => /^\d{8,14}$/.test(e)).slice(0, 30);
  const q = String(cuerpo.q ?? '').trim().slice(0, 80);

  const tareas: Promise<Resultado[]>[] = [];
  for (const c of cadenas) {
    if (q) tareas.push(buscar(c, `ft=${encodeURIComponent(q)}&_from=0&_to=${limite - 1}`));
    // Varios fq en VTEX se combinan con Y, así que va un pedido por código.
    for (const e of eans) tareas.push(buscar(c, `fq=alternateIds_Ean:${e}&_from=0&_to=0`));
  }
  const resultados = (await Promise.all(tareas)).flat();
  return new Response(JSON.stringify({ resultados, fecha: new Date().toISOString() }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
