// Función "precios": busca productos y precios online en supermercados con presencia en Mendoza.
// Carrefour, Vea y Jumbo usan la misma plataforma (VTEX) con un catálogo público en JSON.
// Coto (un hiper en Mendoza, Av. Perú y Pellegrini) usa Oracle Endeca: su web devuelve JSON con
// `format=json`. Es el precio de Coto Digital (uno para todo el país); el del local puede variar.
// El navegador no puede pedirlos directo (CORS), por eso pasa por acá.
//
// Entrada (POST JSON): { q?: string, eans?: string[], cadenas?: string[] (carrefour, vea, jumbo, coto), limite?: number }
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

const COTO = 'https://www.cotodigital.com.ar/sitios/cdigi';

// deno-lint-ignore no-explicit-any
function registrosCoto(nodo: any, sal: any[] = []): any[] {
  if (Array.isArray(nodo)) { for (const x of nodo) registrosCoto(x, sal); return sal; }
  if (!nodo || typeof nodo !== 'object') return sal;
  if (Array.isArray(nodo.records) && nodo.records[0]?.attributes) {
    for (const r of nodo.records) sal.push(r?.records?.[0] ?? r);
    return sal;
  }
  for (const v of Object.values(nodo)) registrosCoto(v, sal);
  return sal;
}

// deno-lint-ignore no-explicit-any
function normalizarCoto(r: any): Resultado | null {
  const a = r?.attributes ?? {};
  const uno = (k: string) => String(a[k]?.[0] ?? '');
  // Ojo: en Coto `dtoPrice.precio` y `referencePrice` son el precio por kilo/litro; el del paquete es `activePrice`.
  let precio = Number(uno('sku.activePrice'));
  let lista = precio;
  try {
    // Descuento directo ("20%Dto"). Los de "2x1" o "2do al 70 %" no se toman: dependen de llevar más de uno.
    // deno-lint-ignore no-explicit-any
    for (const d of JSON.parse(uno('product.dtoDescuentos')) as any[]) {
      const p = Number(d?.precioDesc);
      if (/^\s*\d+\s*%\s*dto/i.test(String(d?.textoDescuento ?? '')) && p > 0 && p < precio) precio = p;
    }
  } catch { /* sin descuentos */ }
  let contenido = '';
  try {
    const d = JSON.parse(uno('sku.dtoPrice'));
    if (Number(d.precioLista)) lista = Math.max(lista, Number(d.precioLista));
  } catch { /* sin detalle */ }
  try {
    // deno-lint-ignore no-explicit-any
    contenido = String((JSON.parse(uno('product.dtoCaracteristicas')) as any[]).find((c) => c?.nombre === 'CONTENIDO')?.descripcion ?? '').toLowerCase();
  } catch { /* sin características */ }
  const nombre = uno('sku.displayName') || uno('product.displayName');
  if (!nombre || !precio) return null;
  const estado = String(r?.detailsAction?.recordState ?? '').replace(/\?format=json$/, '');
  return {
    cadena: 'coto',
    nombre,
    marca: uno('product.brand') || uno('product.MARCA'),
    ean: uno('product.eanPrincipal'),
    precio,
    precioLista: Math.max(lista, precio),
    unidad: contenido || '1 un',
    imagen: uno('product.mediumImage.url') || uno('product.largeImage.url'),
    link: estado ? `${COTO}/productos${estado}` : '',
  };
}

async function buscarCoto(params: string): Promise<Resultado[]> {
  try {
    const r = await fetch(`${COTO}/categoria?${params}&format=json`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 LIFE-app' } });
    if (!r.ok) return [];
    return registrosCoto(await r.json()).map(normalizarCoto).filter(Boolean) as Resultado[];
  } catch {
    return [];
  }
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
  // Sin `cadenas` responde las tres de siempre (así la app vieja no recibe Coto sin saber mostrarlo).
  const todas = [...Object.keys(CADENAS), 'coto'];
  const cadenas = (cuerpo.cadenas ?? Object.keys(CADENAS)).filter((c) => todas.includes(c));
  const limite = Math.min(Math.max(Number(cuerpo.limite) || 8, 1), 20);
  const eans = (cuerpo.eans ?? []).map(String).filter((e) => /^\d{8,14}$/.test(e)).slice(0, 30);
  const q = String(cuerpo.q ?? '').trim().slice(0, 80);

  const tareas: Promise<Resultado[]>[] = [];
  for (const c of cadenas) {
    if (c === 'coto') {
      if (q) tareas.push(buscarCoto(`Ntt=${encodeURIComponent(q)}&Nrpp=${limite}`));
      for (const e of eans) tareas.push(buscarCoto(`Ntt=${e}&Ntk=product.eanPrincipal&Nrpp=1`));
      continue;
    }
    if (q) tareas.push(buscar(c, `ft=${encodeURIComponent(q)}&_from=0&_to=${limite - 1}`));
    // Varios fq en VTEX se combinan con Y, así que va un pedido por código.
    for (const e of eans) tareas.push(buscar(c, `fq=alternateIds_Ean:${e}&_from=0&_to=0`));
  }
  const resultados = (await Promise.all(tareas)).flat();
  return new Response(JSON.stringify({ resultados, fecha: new Date().toISOString() }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
