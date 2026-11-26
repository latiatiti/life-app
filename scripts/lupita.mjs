// Lupita: la que mira cada pantalla con lupa, como la mira ella.
// Recorre todas las pantallas de LIFE en celu y compu, saca capturas y mide lo que se puede medir
// de sus quejas de siempre: ¿está vacía?, ¿hay que bajar mucho?, ¿los botones se tocan bien?,
// ¿hay avisos sin botón?, ¿se corta algo de costado? Lo que no se mide (si se entiende, si se siente
// LIFE) lo juzga Lupita mirando las capturas, con el libro de gustos de ella (docs/agentes/lupita.md).
//
// Uso (desde la carpeta de la app):
//   npm run build:single
//   node scripts/lupita.mjs                 → modo local vacío (como la ve alguien nuevo)
//   node scripts/lupita.mjs --con-datos     → antes carga "Mi configuración" + historial de prueba
//   node scripts/lupita.mjs --solo dia,economia   → solo esas secciones
//   node scripts/lupita.mjs --url https://deploy-preview-41--life-app-latiatiti.netlify.app
//        (una vista previa: ahí pide sesión, así que sirve solo para la Portada y pantallas sin datos)
// Sale en lupita-out/: informe.md (tabla por pantalla), medidas.json y capturas/.
// Usa el Playwright que ya viene en el entorno; no se suma como dependencia de la app.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const valor = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const conDatos = args.includes('--con-datos');
const solo = valor('--solo')?.split(',').map((s) => s.trim()).filter(Boolean);
const SALIDA = valor('--salida') ?? 'lupita-out';

const TAMANOS = [
  { id: 'celu', width: 390, height: 844, esCelu: true },
  { id: 'compu', width: 1440, height: 900, esCelu: false },
  { id: 'compu-1080', width: 1920, height: 1080, esCelu: false },
];

// ── Servidor chiquito para dist-single (fetch de historial-prueba.json necesita http) ──
async function servir(dir) {
  const tipos = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = createServer(async (req, res) => {
    const ruta = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const archivo = join(dir, ruta === '/' ? 'index.html' : ruta);
    try {
      const cuerpo = await readFile(archivo);
      res.writeHead(200, { 'content-type': tipos[extname(archivo)] ?? 'application/octet-stream' });
      res.end(cuerpo);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => srv.listen(0, r));
  return { srv, url: `http://localhost:${srv.address().port}` };
}

let base = valor('--url');
let servidor;
if (!base) {
  if (!existsSync('dist-single/index.html')) {
    console.error('Falta dist-single/index.html: corré primero `npm run build:single`.');
    process.exit(1);
  }
  // historial-prueba.json vive en public/; lo servimos al lado del index.
  const { srv, url } = await servir('dist-single');
  servidor = srv; base = url;
  if (!existsSync('dist-single/historial-prueba.json') && existsSync('public/historial-prueba.json')) {
    await writeFile('dist-single/historial-prueba.json', await readFile('public/historial-prueba.json'));
  }
}

// ── Lo que se mide adentro de la página ──
function medir(esCelu) {
  const W = innerWidth, H = innerHeight;
  const fondo = getComputedStyle(document.body).backgroundColor;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const tieneTexto = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const esContenido = (el) => {
    for (let e = el, i = 0; e && e !== document.body && i < 6; e = e.parentElement, i++) {
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|IMG|SVG|CANVAS|VIDEO|IFRAME|path|circle|rect|line|polyline)$/i.test(e.tagName)) return true;
      if (tieneTexto(e)) return true;
      const s = getComputedStyle(e);
      const bg = s.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== fondo && e.getBoundingClientRect().width < W * 0.98) return true;
      if (parseFloat(s.borderTopWidth) > 0 && e.getBoundingClientRect().width < W * 0.98) return true;
    }
    return false;
  };
  // 1) Ocupación de la primera pantalla: una grilla de 24 × 24 puntos, ¿cuántos caen sobre algo?
  let llenos = 0, total = 0;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const px = (x + 0.5) * W / 24, py = (y + 0.5) * H / 24;
    const el = document.elementFromPoint(px, py);
    total++;
    if (el && esContenido(el)) llenos++;
  }
  // 2) Scroll: cuántas pantallas de alto mide la vista.
  const alto = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  // 3) Toques: botones y links visibles en la primera pantalla, y los que miden menos de 44 px.
  const tocables = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')].filter(visible);
  const enPrimera = tocables.filter((el) => { const r = el.getBoundingClientRect(); return r.top < H && r.bottom > 0; });
  const chicos = esCelu
    ? enPrimera.filter((el) => { const r = el.getBoundingClientRect(); return (r.height < 44 || r.width < 44) && el.tagName !== 'INPUT'; })
        .map((el) => (el.innerText || el.getAttribute('aria-label') || el.title || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 30))
    : [];
  const principales = enPrimera.filter((el) => /btn-primario|btn-confirmar|btn-grande/.test(el.className)).length;
  // 4) Avisos sin botón (pilar 6).
  const avisos = [...document.querySelectorAll('.senal, .aviso, .tb-aviso, .wa-aviso, .vital-aviso, .aviso-msg, .texto-aviso')]
    .filter(visible)
    .filter((el) => !el.querySelector('button, a[href]') && !el.closest('button, a[href]') && el.innerText.trim().length > 0)
    .map((el) => el.innerText.trim().replace(/\s+/g, ' ').slice(0, 60));
  // 5) Textos largos: párrafos de más de 30 palabras (pilar 9, ella lee en la calle).
  const largos = [...document.querySelectorAll('p, .nota, li')].filter(visible)
    .map((el) => el.innerText.trim().split(/\s+/).length).filter((n) => n > 30).length;
  // 6) Pantallas vacías: mensajes de "no hay nada" y si traen botón para salir de ahí.
  const vacios = [...document.querySelectorAll('[class*="vacio"], [class*="vacia"]')].filter(visible)
    .map((el) => ({ texto: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 60), conBoton: !!el.querySelector('button, a[href]') }));
  // 7) ¿Se va de costado?
  const desborde = document.documentElement.scrollWidth > W + 2;
  // 8) % sin escala: porcentajes que no usan el Medidor/Pct de ui/nivel.tsx.
  const pctSueltos = [...document.querySelectorAll('body *')].filter((el) => tieneTexto(el) && /\d\s?%/.test(el.textContent) && !el.closest('[class*="nivel"], [class*="medidor"], [class*="pct"]') && visible(el)).length;
  return {
    ocupacion: Math.round((llenos / total) * 100),
    pantallasDeAlto: Math.round((alto / H) * 10) / 10,
    tocablesArriba: enPrimera.length,
    principalesArriba: principales,
    chicos,
    avisosSinBoton: avisos,
    textosLargos: largos,
    vacios,
    desborde,
    pctSueltos,
    titulo: (document.querySelector('h1, h2, .titulo')?.innerText ?? '').trim().slice(0, 40),
  };
}

// ── Banderas: traducción de las medidas a "lo que ella diría" ──
function banderas(m, t) {
  const b = [];
  if (m.ocupacion < 35) b.push(`🟥 Vacía (${m.ocupacion} % de la pantalla con algo)`);
  else if (m.ocupacion < 50) b.push(`🟧 Medio vacía (${m.ocupacion} %)`);
  if (m.pantallasDeAlto > 2.5) b.push(`🟥 Scroll largo (${m.pantallasDeAlto} pantallas)`);
  else if (m.pantallasDeAlto > 1.4) b.push(`🟧 Hay que bajar (${m.pantallasDeAlto} pantallas)`);
  if (m.principalesArriba === 0) b.push('🟧 Sin botón principal a la vista');
  if (m.principalesArriba > 2) b.push(`🟧 ${m.principalesArriba} botones principales compitiendo`);
  if (m.tocablesArriba > (t.esCelu ? 18 : 30)) b.push(`🟧 Muchos botones juntos (${m.tocablesArriba})`);
  if (m.chicos.length) b.push(`🟧 ${m.chicos.length} toques chicos (< 44 px)`);
  if (m.avisosSinBoton.length) b.push(`🟥 ${m.avisosSinBoton.length} aviso(s) sin botón`);
  if (m.vacios.some((v) => !v.conBoton)) b.push('🟧 "No hay nada" sin botón para empezar');
  if (m.textosLargos) b.push(`🟨 ${m.textosLargos} texto(s) largo(s)`);
  if (m.desborde) b.push('🟥 Se corta de costado');
  if (m.pctSueltos) b.push(`🟨 ${m.pctSueltos} % sin la escala de colores`);
  if (m.errores?.length) b.push(`🟥 ${m.errores.length} error(es) en consola`);
  return b;
}

async function cargarDatos(pagina) {
  await pagina.goto(`${base}/#/ajustes`);
  await pagina.waitForTimeout(800);
  for (const texto of ['Cargar mi configuración', 'Cargar historial de prueba']) {
    const boton = pagina.getByRole('button', { name: texto });
    if (!(await boton.count())) continue;
    await boton.first().click();
    await pagina.waitForTimeout(400);
    // Si pide confirmar (confirmar() de ui/Deshacer.tsx), se acepta con el botón principal del diálogo.
    const si = pagina.locator('dialog[open] .btn-primario, dialog[open] .btn-peligro');
    if (await si.count()) await si.last().click();
    await pagina.waitForTimeout(2500);
  }
}

const navegador = await chromium.launch();
await mkdir(join(SALIDA, 'capturas'), { recursive: true });

// Rutas: las que ofrece el menú LIFE (así entra todo lo que exista, sin lista a mano).
const ctx0 = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p0 = await ctx0.newPage();
if (conDatos) await cargarDatos(p0);
await p0.goto(`${base}/#/`);
await p0.waitForTimeout(1200);
let rutas = await p0.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')))]);
if (!rutas.includes('#/')) rutas.unshift('#/');
if (solo) rutas = rutas.filter((r) => r === '#/' || solo.some((s) => r.startsWith(`#/${s}`)));
const estado = await ctx0.storageState();
await ctx0.close();

const resultados = [];
for (const t of TAMANOS) {
  const ctx = await navegador.newContext({ viewport: { width: t.width, height: t.height }, storageState: estado, isMobile: t.esCelu, hasTouch: t.esCelu });
  const pagina = await ctx.newPage();
  let errores = [];
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 120)); });
  pagina.on('pageerror', (e) => errores.push(String(e).slice(0, 120)));
  for (const ruta of rutas) {
    errores = [];
    await pagina.goto(`${base}/${ruta}`);
    await pagina.waitForTimeout(900);
    const m = await pagina.evaluate(medir, t.esCelu);
    m.errores = errores;
    const nombre = `${(ruta.replace(/^#\/?/, '') || 'inicio').replace(/\//g, '-')}-${t.id}.png`;
    await pagina.screenshot({ path: join(SALIDA, 'capturas', nombre) });
    resultados.push({ ruta, tamano: t.id, captura: `capturas/${nombre}`, ...m, banderas: banderas(m, t) });
    process.stdout.write('.');
  }
  await ctx.close();
}
await navegador.close();
servidor?.close();

// ── Informe ──
const filas = rutas.map((ruta) => {
  const de = (id) => resultados.find((r) => r.ruta === ruta && r.tamano === id);
  const c = de('celu'), p = de('compu'), g = de('compu-1080');
  const puntos = [c, p, g].reduce((s, r) => s + r.banderas.filter((x) => x.startsWith('🟥')).length * 3 + r.banderas.filter((x) => x.startsWith('🟧')).length, 0);
  return { ruta, puntos, c, p, g };
}).sort((a, b) => b.puntos - a.puntos);

const lineas = [
  `# Lupita · primera pasada${conDatos ? ' (con datos de prueba)' : ' (sin datos)'}`,
  '',
  `Fecha: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${rutas.length} pantallas × ${TAMANOS.length} tamaños.`,
  'Ordenado de la que más ruido hace a la que menos (🟥 = 3 puntos, 🟧 = 1). Las medidas son pistas: la decisión es de ella.',
  '',
  '| Pantalla | Puntos | Celu (390 × 844) | Compu (1440 × 900) | Compu grande (1920 × 1080) |',
  '|---|---|---|---|---|',
  ...filas.map(({ ruta, puntos, c, p, g }) => `| \`${ruta}\` | ${puntos} | ${c.banderas.join('<br>') || '✓'} | ${p.banderas.join('<br>') || '✓'} | ${g.banderas.join('<br>') || '✓'} |`),
  '',
  '## Detalle de toques chicos y avisos sin botón (celu)',
  '',
  ...filas.flatMap(({ ruta, c }) => (c.chicos.length || c.avisosSinBoton.length)
    ? [`- \`${ruta}\`: ${c.chicos.length ? `chicos: ${[...new Set(c.chicos)].slice(0, 8).join(' · ')}` : ''}${c.avisosSinBoton.length ? ` · avisos sin botón: ${c.avisosSinBoton.slice(0, 3).join(' · ')}` : ''}`]
    : []),
];
await writeFile(join(SALIDA, 'informe.md'), lineas.join('\n') + '\n');
await writeFile(join(SALIDA, 'medidas.json'), JSON.stringify(resultados, null, 1));
console.log(`\nListo: ${join(SALIDA, 'informe.md')} (${resultados.length} capturas)`);
