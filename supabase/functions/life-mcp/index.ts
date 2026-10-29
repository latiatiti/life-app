// Función "life-mcp": conecta LIFE con Claude como un conector (servidor MCP por HTTP).
//
// Claude la usa para leer y cargar datos de la app con lo que la usuaria le cuenta.
// Autenticación: clave personal creada en Ajustes → Conexión con Claude. Va en el link
// (?k=...) o como "Authorization: Bearer ...". Acá solo se guarda su huella sha-256.
//
// Se despliega SIN verificación de JWT de Supabase (Claude no tiene sesión de la app):
// la clave personal es la que autoriza, y cada consulta se limita al dueño de esa clave.
//
// Todo cambio queda en api_registro con el antes y el después, y se puede deshacer.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, x-life-clave',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const PRIVADAS = new Set(['perfiles', 'api_claves', 'api_registro']);
const MAX_FILAS = 500;

/** Para qué sirve cada tabla (las nuevas aparecen igual, sin descripción). */
const DESCRIPCION: Record<string, string> = {
  eco_cuentas: 'Cuentas de plata (efectivo, Mercado Pago, banco, Cocos).',
  eco_categorias: 'Categorías de ingresos y gastos, con presupuesto opcional.',
  eco_movimientos: 'Gastos, ingresos y transferencias. Monto siempre positivo; tipo dice el sentido.',
  eco_ingresos: 'Ingresos esperados que se repiten (sueldos, cobros) y su próximo cobro.',
  pag_pagos: 'Pagos recurrentes (alquiler, internet, gimnasio) y su próximo vencimiento.',
  ent_sesiones: 'Entrenamientos hechos (fecha, duración, sensación).',
  ent_series: 'Series de cada entrenamiento (ejercicio, peso, reps, RPE).',
  ent_rutinas: 'Rutinas y ciclos de entrenamiento (solo una activa).',
  ent_ejercicios: 'Ejercicios propios con zonas musculares y variantes.',
  stk_productos: 'Lo que hay en casa (cantidad, mínimo, lugar, vencimiento, de quién).',
  ali_platos: 'Platos que sabe hacer, con ingredientes y macros.',
  ali_comidas: 'Comidas registradas por día.',
  ali_extras: 'Agua y suplementos por día.',
  ali_metas: 'Metas de alimentación (una fila).',
  com_supers: 'Supermercados y el orden de sus pasillos.',
  com_items: 'Catálogo propio de cosas que compra, con último precio por cadena.',
  com_precios: 'Historial de precios (online, ticket, manual).',
  com_compras: 'Compras cerradas: estimado, total del ticket, reparto.',
  com_tickets: 'Tickets guardados (QR, texto leído, productos).',
  dia_plantilla: 'Semana tipo: un bloque por fila (dia_semana 0=domingo, inicio/fin HH:MM, 24:00 = fin del día, tipo, opcional, come_alla). Vacía = usa la de fábrica de la app.',
  dia_dias: 'Una fila por fecha marcada: estado normal/libre/feriado/especial, prioridades [{texto,hecho}], nota, bloques = horario propio (null = semana tipo).',
  dia_tareas: 'Tareas con fecha (YYYY-MM-DD), hora (HH:MM) opcional, prioridad alta/media/baja; origen "claude" si las carga Claude.',
  dia_rutinas: 'Cosas de todos los días que ocupan tiempo (bañarse, lavar platos, ordenar): minutos cada vez, veces por día, dias (lista 0=domingo…6=sábado; null = todos), momento manana/tarde/noche/cualquiera. Se descuentan del tiempo libre.',
  dia_tiempo: 'En qué usó un rato (sobre todo del tiempo libre): fecha, que, minutos, clase productivo/rutina/ocio/descanso. Mejor usar anotar_tiempo.',
  com_frecuencias: 'Cada cuánto va a comprar a cada lugar (aproximado): nombre, lugar super/verduleria/carniceria/otro, cada_dias, dia_habitual (0=domingo, opcional), ultima (última vez que fue, YYYY-MM-DD).',
};
if (DESCRIPCION.eco_ingresos) DESCRIPCION.eco_ingresos += ' frecuencia semanal/quincenal/mensual; proximo_cobro = fecha del próximo cobro; cuenta_id = dónde cobra (efectivo, Mercado Pago… sacalo de eco_cuentas); puede_adeudarse = suele pagar atrasado; adeudado = lo que le deben.';

type Json = Record<string, unknown>;
interface Quien { userId: string; claveId: string; permiso: 'leer' | 'escribir' }

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(cuerpo === null ? null : JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hoyMendoza() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Mendoza' }).format(new Date());
}

/* ---------- Herramientas ---------- */

const HERRAMIENTAS = [
  {
    name: 'que_hay',
    description: 'Empezá por acá. Devuelve la fecha de hoy (Mendoza), las tablas de LIFE con sus columnas y cuántas filas tiene cada una. Usalo antes de leer o cargar para saber los nombres exactos de las columnas.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'leer',
    description: 'Lee filas de una tabla de LIFE. Filtros por igualdad, rango de fechas sobre una columna de fecha y orden. Devuelve hasta 500 filas.',
    inputSchema: {
      type: 'object',
      properties: {
        tabla: { type: 'string', description: 'Nombre exacto de la tabla (ver que_hay).' },
        filtros: { type: 'object', description: 'Columna → valor exacto. Ej. {"tipo":"gasto"}.', additionalProperties: true },
        columna_fecha: { type: 'string', description: 'Columna para el rango (ej. "fecha"). Por defecto created_at.' },
        desde: { type: 'string', description: 'Fecha inicial incluida (YYYY-MM-DD).' },
        hasta: { type: 'string', description: 'Fecha final incluida (YYYY-MM-DD).' },
        buscar: { type: 'object', description: 'Columna de texto → parte del texto, sin importar mayúsculas. Ej. {"nombre":"leche"}.', additionalProperties: { type: 'string' } },
        orden: { type: 'string', description: 'Columna para ordenar. Con "-" adelante es de mayor a menor. Por defecto -created_at.' },
        limite: { type: 'number', description: 'Máximo de filas (1 a 500, por defecto 100).' },
      },
      required: ['tabla'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'crear',
    description: 'Carga una o varias filas nuevas en una tabla de LIFE. No mandes id ni user_id: se completan solos. Revisá antes los nombres de columnas con que_hay.',
    inputSchema: {
      type: 'object',
      properties: {
        tabla: { type: 'string' },
        filas: { type: 'array', items: { type: 'object', additionalProperties: true }, minItems: 1, maxItems: 100 },
      },
      required: ['tabla', 'filas'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'modificar',
    description: 'Cambia columnas de una fila existente (por id). Solo se tocan las columnas que mandes.',
    inputSchema: {
      type: 'object',
      properties: {
        tabla: { type: 'string' },
        id: { type: 'string' },
        cambios: { type: 'object', additionalProperties: true },
      },
      required: ['tabla', 'id', 'cambios'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'borrar',
    description: 'Borra una fila por id. Queda guardada en el registro y se puede recuperar con deshacer. Pedí confirmación a la usuaria antes de borrar.',
    inputSchema: {
      type: 'object',
      properties: { tabla: { type: 'string' }, id: { type: 'string' } },
      required: ['tabla', 'id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: 'historial',
    description: 'Últimos cambios que hizo Claude en LIFE (crear, modificar, borrar), con su id de registro para deshacer.',
    inputSchema: {
      type: 'object',
      properties: { limite: { type: 'number', description: '1 a 100, por defecto 20.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'deshacer',
    description: 'Deshace un cambio del historial: borra lo creado, vuelve atrás lo modificado o recupera lo borrado.',
    inputSchema: {
      type: 'object',
      properties: { registro_id: { type: 'string' } },
      required: ['registro_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'ver_semana',
    description: 'Muestra cómo es cada día (desde una fecha, 7 días por defecto): de dónde sale el horario (semana tipo o día cambiado), sus bloques y el reparto del tiempo: sueño, fijo, cosas de todos los días (dia_rutinas) y libre; más lo que anotó que hizo (dia_tiempo). Usalo antes de cambiar la semana o un día.',
    inputSchema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD. Por defecto hoy.' },
        dias: { type: 'number', description: '1 a 14, por defecto 7.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'cargar_semana_tipo',
    description: 'Reemplaza la semana tipo (lo fijo que se repite) de uno o varios días de la semana con la lista de bloques que mandes. Cada bloque: {inicio "HH:MM", fin "HH:MM" (24:00 = fin del día), titulo, tipo descanso/casa/fabrica/reparto/gym/comida/traslado/libre/otro, nota?, opcional? (si se da), come_alla? (come en ese lugar)}. "casa" y "libre" cuentan como tiempo disponible; "descanso" es dormir. Si la semana tipo está vacía, cargá los 7 días. Se deshace entero con deshacer.',
    inputSchema: {
      type: 'object',
      properties: {
        dias: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 7, description: 'Días de la semana a reemplazar (0 = domingo … 6 = sábado). Todos reciben los mismos bloques.' },
        bloques: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 40 },
      },
      required: ['dias', 'bloques'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'cambiar_dia',
    description: 'Cambia una fecha puntual sin tocar la semana tipo (un día atípico: no va a la fábrica, feriado, día libre, día especial). Mandá solo lo que cambia: estado normal/libre/feriado/especial, nombre, nota, prioridades [{texto,hecho}] y bloques = horario propio de ese día (mismo formato que cargar_semana_tipo) o null para volver a la semana tipo.',
    inputSchema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD.' },
        estado: { type: 'string', enum: ['normal', 'libre', 'feriado', 'especial'] },
        nombre: { type: 'string' },
        nota: { type: 'string' },
        prioridades: { type: 'array', items: { type: 'object', additionalProperties: true } },
        bloques: { type: ['array', 'null'], items: { type: 'object', additionalProperties: true } },
      },
      required: ['fecha'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'anotar_tiempo',
    description: 'Anota en qué usó un rato (para medir la productividad del tiempo libre). clase: productivo (estudiar, trámites, proyectos), rutina (cosas de la casa), ocio, descanso.',
    inputSchema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD. Por defecto hoy.' },
        que: { type: 'string' },
        minutos: { type: 'number' },
        clase: { type: 'string', enum: ['productivo', 'rutina', 'ocio', 'descanso'] },
        nota: { type: 'string' },
      },
      required: ['que', 'minutos'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

class ErrorUso extends Error {}

/* ---------- Día: semana tipo, días cambiados y tiempo libre ---------- */
// La cuenta del tiempo libre es la misma que src/modules/dia/tiempo.ts (repartir): si cambia allá, cambiarla acá.

const TIPOS_BLOQUE = new Set(['descanso', 'casa', 'fabrica', 'reparto', 'gym', 'comida', 'traslado', 'libre', 'otro']);
const DISPONIBLE = new Set(['casa', 'libre']);
const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
type Bloque = { inicio: string; fin: string; titulo: string; tipo: string; nota?: string | null; opcional?: boolean; come_alla?: boolean };

const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
const sumar = (fecha: string, n: number) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const horas = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`) : `${r} min`; };
const DIAS_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function validarFecha(f: unknown): string {
  const s = String(f ?? '');
  if (!FECHA.test(s)) throw new ErrorUso(`Fecha inválida "${s}": usá YYYY-MM-DD.`);
  return s;
}

function validarBloques(lista: unknown): Bloque[] {
  if (!Array.isArray(lista)) throw new ErrorUso('bloques tiene que ser una lista.');
  const bs = lista.map((x, i) => {
    const b = x as Json;
    const inicio = String(b.inicio ?? ''), fin = String(b.fin ?? ''), tipo = String(b.tipo ?? 'otro'), titulo = String(b.titulo ?? '').trim();
    if (!HORA.test(inicio)) throw new ErrorUso(`Bloque ${i + 1}: inicio "${inicio}" tiene que ser HH:MM.`);
    if (fin !== '24:00' && !HORA.test(fin)) throw new ErrorUso(`Bloque ${i + 1}: fin "${fin}" tiene que ser HH:MM o 24:00.`);
    if (aMin(fin) <= aMin(inicio)) throw new ErrorUso(`Bloque ${i + 1} (${titulo}): termina antes de empezar. Si cruza la medianoche, partilo en dos (hasta 24:00 y desde 00:00 del otro día).`);
    if (!TIPOS_BLOQUE.has(tipo)) throw new ErrorUso(`Bloque ${i + 1}: tipo "${tipo}" no existe. Tipos: ${[...TIPOS_BLOQUE].join(', ')}.`);
    if (!titulo) throw new ErrorUso(`Bloque ${i + 1}: falta el titulo.`);
    return { inicio, fin, titulo, tipo, nota: b.nota ? String(b.nota) : null, opcional: !!b.opcional, come_alla: !!b.come_alla };
  }).sort((a, b) => aMin(a.inicio) - aMin(b.inicio));
  for (let i = 1; i < bs.length; i++) {
    if (aMin(bs[i].inicio) < aMin(bs[i - 1].fin)) throw new ErrorUso(`"${bs[i - 1].titulo}" y "${bs[i].titulo}" se pisan. Ajustá las horas.`);
  }
  return bs;
}

function repartir(bloques: Bloque[], rutinas: Json[], dow: number) {
  let sueno = 0, fijo = 0, opcional = 0, disponible = 0, cubierto = 0;
  for (const x of bloques) {
    const m = Math.max(0, aMin(x.fin) - aMin(x.inicio));
    cubierto += m;
    if (x.tipo === 'descanso') sueno += m;
    else if (DISPONIBLE.has(x.tipo)) disponible += m;
    else { fijo += m; if (x.opcional) opcional += m; }
  }
  disponible += Math.max(0, 24 * 60 - cubierto);
  const delDia = rutinas.filter((r) => r.activo !== false && (!(r.dias as number[] | null)?.length || (r.dias as number[]).includes(dow)));
  const rut = delDia.reduce((s, r) => s + Number(r.minutos) * (Number(r.veces) || 1), 0);
  return { sueno, fijo, opcional, rutinas: rut, libre: Math.max(0, disponible - rut), cosas_diarias: delDia.map((r) => r.nombre) };
}

async function filas(db: SupabaseClient, tabla: string, userId: string, armar?: (c: any) => any): Promise<Json[]> {
  let c = db.from(tabla).select('*').eq('user_id', userId);
  if (armar) c = armar(c);
  const { data, error } = await c.limit(MAX_FILAS);
  if (error) throw new ErrorUso(`${tabla}: ${error.message}`);
  return (data ?? []) as Json[];
}

async function verSemana(db: SupabaseClient, q: Quien, args: Json) {
  const desde = args.desde ? validarFecha(args.desde) : hoyMendoza();
  const n = Math.min(Math.max(Number(args.dias) || 7, 1), 14);
  const hasta = sumar(desde, n - 1);
  const [plantilla, marcados, rutinas, usos] = await Promise.all([
    filas(db, 'dia_plantilla', q.userId),
    filas(db, 'dia_dias', q.userId, (c) => c.gte('fecha', desde).lte('fecha', hasta)),
    filas(db, 'dia_rutinas', q.userId).catch(() => []),
    filas(db, 'dia_tiempo', q.userId, (c) => c.gte('fecha', desde).lte('fecha', hasta)).catch(() => []),
  ]);
  const salida = [];
  for (let i = 0; i < n; i++) {
    const fecha = sumar(desde, i);
    const dow = diaSemana(fecha);
    const m = marcados.find((d) => d.fecha === fecha);
    const propio = (m?.bloques as Bloque[] | null) ?? null;
    let bloques: Bloque[] = propio ?? (plantilla.filter((b) => b.dia_semana === dow) as unknown as Bloque[]);
    if (!propio && m?.estado === 'libre') bloques = [{ inicio: '00:00', fin: '09:00', titulo: 'Dormir', tipo: 'descanso' }, { inicio: '09:00', fin: '24:00', titulo: 'Día libre', tipo: 'libre' }];
    bloques = [...bloques].sort((a, b) => aMin(a.inicio) - aMin(b.inicio));
    const r = repartir(bloques, rutinas, dow);
    const anotado: Record<string, number> = {};
    for (const u of usos.filter((u) => u.fecha === fecha)) anotado[String(u.clase)] = (anotado[String(u.clase)] ?? 0) + Number(u.minutos);
    salida.push({
      fecha, dia: DIAS_NOMBRE[dow], estado: m?.estado ?? 'normal', nombre: m?.nombre ?? undefined, nota: m?.nota ?? undefined,
      horario: propio ? 'propio de ese día' : m?.estado === 'libre' ? 'día libre' : 'semana tipo',
      bloques: bloques.map((b) => `${b.inicio}-${b.fin} ${b.titulo} [${b.tipo}${b.opcional ? ', si se da' : ''}]`),
      tiempo: { sueno: horas(r.sueno), fijo: horas(r.fijo), si_se_da: r.opcional ? horas(r.opcional) : undefined, cosas_diarias: horas(r.rutinas), libre: horas(r.libre) },
      minutos: { sueno: r.sueno, fijo: r.fijo, cosas_diarias: r.rutinas, libre: r.libre },
      anotado: Object.keys(anotado).length ? Object.fromEntries(Object.entries(anotado).map(([k, v]) => [k, horas(v)])) : undefined,
    });
  }
  return {
    hoy: hoyMendoza(),
    semana_tipo_vacia: !plantilla.length || undefined,
    aviso: plantilla.length ? undefined : 'La semana tipo está vacía en la nube (la app muestra una de ejemplo). Pedile que te la dicte y cargala con cargar_semana_tipo, los 7 días.',
    cosas_de_todos_los_dias: rutinas.map((r) => ({ id: r.id, nombre: r.nombre, minutos: r.minutos, veces: r.veces, dias: r.dias ?? 'todos', activo: r.activo })),
    dias: salida,
  };
}

async function cargarSemanaTipo(db: SupabaseClient, q: Quien, args: Json) {
  const dias = [...new Set(((args.dias as unknown[]) ?? []).map(Number))];
  if (!dias.length || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ErrorUso('dias: lista de números de 0 (domingo) a 6 (sábado).');
  const bloques = validarBloques(args.bloques);
  const todas = await filas(db, 'dia_plantilla', q.userId);
  const antes = todas.filter((b) => dias.includes(Number(b.dia_semana)));
  if (antes.length) {
    const { error } = await db.from('dia_plantilla').delete().in('id', antes.map((b) => b.id as string)).eq('user_id', q.userId);
    if (error) throw new ErrorUso(error.message);
  }
  const nuevas = dias.flatMap((d) => bloques.map((b) => ({ ...b, dia_semana: d, user_id: q.userId })));
  let despues: Json[] = [];
  if (nuevas.length) {
    const { data, error } = await db.from('dia_plantilla').insert(nuevas).select();
    if (error) {
      if (antes.length) await db.from('dia_plantilla').insert(antes);
      throw new ErrorUso(error.message);
    }
    despues = data as Json[];
  }
  const registro = await anotar(db, q, 'reemplazar', 'dia_plantilla', null, antes, despues);
  const faltan = [0, 1, 2, 3, 4, 5, 6].filter((d) => !dias.includes(d) && !todas.some((b) => b.dia_semana === d));
  return {
    ok: true, registro_id: registro, dias: dias.map((d) => DIAS_NOMBRE[d]), bloques: bloques.length,
    aviso: faltan.length ? `Todavía no hay semana tipo para: ${faltan.map((d) => DIAS_NOMBRE[d]).join(', ')}. En la app esos días se ven vacíos hasta que los cargues.` : undefined,
  };
}

async function cambiarDia(db: SupabaseClient, q: Quien, args: Json) {
  const fecha = validarFecha(args.fecha);
  const cambios: Json = {};
  if (args.estado !== undefined) {
    if (!['normal', 'libre', 'feriado', 'especial'].includes(String(args.estado))) throw new ErrorUso('estado: normal, libre, feriado o especial.');
    cambios.estado = args.estado;
  }
  if (args.nombre !== undefined) cambios.nombre = args.nombre || null;
  if (args.nota !== undefined) cambios.nota = args.nota || null;
  if (args.prioridades !== undefined) {
    if (!Array.isArray(args.prioridades)) throw new ErrorUso('prioridades tiene que ser una lista [{texto, hecho}].');
    cambios.prioridades = (args.prioridades as Json[]).map((p) => ({ texto: String(p.texto ?? ''), hecho: !!p.hecho })).filter((p) => p.texto);
  }
  if (args.bloques !== undefined) cambios.bloques = args.bloques === null ? null : validarBloques(args.bloques);
  if (!Object.keys(cambios).length) throw new ErrorUso('No mandaste nada para cambiar.');
  const { data: antes } = await db.from('dia_dias').select('*').eq('user_id', q.userId).eq('fecha', fecha).maybeSingle();
  if (antes) {
    const { data, error } = await db.from('dia_dias').update(cambios).eq('id', antes.id).eq('user_id', q.userId).select().single();
    if (error) throw new ErrorUso(error.message);
    const registro = await anotar(db, q, 'modificar', 'dia_dias', antes.id, antes, data);
    return { ok: true, fecha, dia: DIAS_NOMBRE[diaSemana(fecha)], registro_id: registro, cambiado: Object.keys(cambios) };
  }
  const { data, error } = await db.from('dia_dias').insert({ fecha, estado: 'normal', prioridades: [], bloques: null, ...cambios, user_id: q.userId }).select().single();
  if (error) throw new ErrorUso(error.message);
  const registro = await anotar(db, q, 'crear', 'dia_dias', (data as Json).id as string, null, data);
  return { ok: true, fecha, dia: DIAS_NOMBRE[diaSemana(fecha)], registro_id: registro, cambiado: Object.keys(cambios) };
}

async function anotarTiempo(db: SupabaseClient, q: Quien, args: Json) {
  const fecha = args.fecha ? validarFecha(args.fecha) : hoyMendoza();
  const minutos = Math.round(Number(args.minutos));
  if (!(minutos >= 1 && minutos <= 1440)) throw new ErrorUso('minutos: entre 1 y 1440.');
  const clase = String(args.clase ?? 'productivo');
  if (!['productivo', 'rutina', 'ocio', 'descanso'].includes(clase)) throw new ErrorUso('clase: productivo, rutina, ocio o descanso.');
  const que = String(args.que ?? '').trim();
  if (!que) throw new ErrorUso('Falta qué hizo.');
  const { data, error } = await db.from('dia_tiempo').insert({ fecha, que, minutos, clase, nota: args.nota ? String(args.nota) : null, origen: 'claude', user_id: q.userId }).select().single();
  if (error) throw new ErrorUso(error.message);
  const registro = await anotar(db, q, 'crear', 'dia_tiempo', (data as Json).id as string, null, data);
  return { ok: true, registro_id: registro, fecha, que, minutos, clase };
}

async function tablasPermitidas(db: SupabaseClient) {
  const { data, error } = await db.rpc('life_columnas');
  if (error) throw new Error(`No se pudieron leer las tablas: ${error.message}`);
  const mapa = new Map<string, { columna: string; tipo: string; nulable: boolean; defecto: string | null }[]>();
  for (const c of data as { tabla: string; columna: string; tipo: string; nulable: boolean; defecto: string | null }[]) {
    if (PRIVADAS.has(c.tabla)) continue;
    if (!mapa.has(c.tabla)) mapa.set(c.tabla, []);
    mapa.get(c.tabla)!.push({ columna: c.columna, tipo: c.tipo, nulable: c.nulable, defecto: c.defecto });
  }
  return mapa;
}

function limpiar(fila: Json) {
  const f = { ...fila };
  delete f.user_id;
  delete f.created_at;
  return f;
}

async function anotar(db: SupabaseClient, q: Quien, accion: string, tabla: string, filaId: string | null, antes: unknown, despues: unknown) {
  const { data } = await db.from('api_registro').insert({
    user_id: q.userId, clave_id: q.claveId, accion, tabla, fila_id: filaId, antes, despues,
  }).select('id').single();
  return (data as { id: string } | null)?.id;
}

async function ejecutar(db: SupabaseClient, q: Quien, nombre: string, args: Json): Promise<unknown> {
  const escribe = ['crear', 'modificar', 'borrar', 'deshacer', 'cargar_semana_tipo', 'cambiar_dia', 'anotar_tiempo'].includes(nombre);
  if (escribe && q.permiso !== 'escribir') throw new ErrorUso('Esta clave es solo de lectura.');

  if (nombre === 'historial') {
    const limite = Math.min(Math.max(Number(args.limite) || 20, 1), 100);
    const { data, error } = await db.from('api_registro').select('id, accion, tabla, fila_id, despues, deshecho, created_at')
      .eq('user_id', q.userId).order('created_at', { ascending: false }).limit(limite);
    if (error) throw new Error(error.message);
    return data;
  }

  if (nombre === 'ver_semana') return verSemana(db, q, args);
  if (nombre === 'cargar_semana_tipo') return cargarSemanaTipo(db, q, args);
  if (nombre === 'cambiar_dia') return cambiarDia(db, q, args);
  if (nombre === 'anotar_tiempo') return anotarTiempo(db, q, args);

  const tablas = await tablasPermitidas(db);

  if (nombre === 'que_hay') {
    const salida: Json[] = [];
    for (const [tabla, cols] of tablas) {
      const { count } = await db.from(tabla).select('id', { count: 'exact', head: true }).eq('user_id', q.userId);
      salida.push({
        tabla,
        para_que: DESCRIPCION[tabla] ?? '',
        filas: count ?? 0,
        columnas: cols.filter((c) => c.columna !== 'user_id').map((c) => `${c.columna} (${c.tipo}${c.nulable ? '' : ', obligatoria'}${c.defecto ? ', tiene valor por defecto' : ''})`),
      });
    }
    return { hoy: hoyMendoza(), zona_horaria: 'America/Argentina/Mendoza', moneda: 'ARS', permiso: q.permiso, tablas: salida };
  }

  if (nombre === 'deshacer') {
    const { data: r, error } = await db.from('api_registro').select('*').eq('id', String(args.registro_id)).eq('user_id', q.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new ErrorUso('No encontré ese cambio en el historial.');
    if (r.deshecho) throw new ErrorUso('Ese cambio ya estaba deshecho.');
    if (!tablas.has(r.tabla)) throw new ErrorUso(`La tabla ${r.tabla} ya no existe.`);
    if (r.accion === 'crear') {
      const { error: e } = await db.from(r.tabla).delete().eq('id', r.fila_id).eq('user_id', q.userId);
      if (e) throw new Error(e.message);
    } else if (r.accion === 'modificar') {
      const { error: e } = await db.from(r.tabla).update(limpiar(r.antes)).eq('id', r.fila_id).eq('user_id', q.userId);
      if (e) throw new Error(e.message);
    } else if (r.accion === 'borrar') {
      const { error: e } = await db.from(r.tabla).insert({ ...r.antes, user_id: q.userId });
      if (e) throw new Error(e.message);
    } else if (r.accion === 'reemplazar') {
      // Varias filas de una vez (ej. semana tipo): se borran las nuevas y vuelven las de antes.
      const nuevas = ((r.despues as Json[]) ?? []).map((f) => f.id as string);
      if (nuevas.length) {
        const { error: e } = await db.from(r.tabla).delete().in('id', nuevas).eq('user_id', q.userId);
        if (e) throw new Error(e.message);
      }
      const viejas = ((r.antes as Json[]) ?? []).map((f) => ({ ...f, user_id: q.userId }));
      if (viejas.length) {
        const { error: e } = await db.from(r.tabla).insert(viejas);
        if (e) throw new Error(e.message);
      }
    } else {
      throw new ErrorUso('Ese cambio no se puede deshacer.');
    }
    await db.from('api_registro').update({ deshecho: true }).eq('id', r.id);
    await anotar(db, q, 'deshacer', r.tabla, r.fila_id, null, { registro: r.id });
    return { ok: true, deshecho: r.accion, tabla: r.tabla, id: r.fila_id };
  }

  const tabla = String(args.tabla ?? '');
  const cols = tablas.get(tabla);
  if (!cols) throw new ErrorUso(`No existe la tabla "${tabla}". Tablas: ${[...tablas.keys()].join(', ')}.`);
  const existe = (c: string) => cols.some((x) => x.columna === c);

  if (nombre === 'leer') {
    let consulta = db.from(tabla).select('*').eq('user_id', q.userId);
    for (const [c, v] of Object.entries((args.filtros as Json) ?? {})) {
      if (!existe(c)) throw new ErrorUso(`La tabla ${tabla} no tiene la columna "${c}".`);
      consulta = v === null ? consulta.is(c, null) : consulta.eq(c, v as string);
    }
    for (const [c, v] of Object.entries((args.buscar as Json) ?? {})) {
      if (!existe(c)) throw new ErrorUso(`La tabla ${tabla} no tiene la columna "${c}".`);
      consulta = consulta.ilike(c, `%${String(v).replace(/[%_]/g, '')}%`);
    }
    const colFecha = String(args.columna_fecha ?? 'created_at');
    if ((args.desde || args.hasta) && !existe(colFecha)) throw new ErrorUso(`La tabla ${tabla} no tiene la columna "${colFecha}".`);
    if (args.desde) consulta = consulta.gte(colFecha, String(args.desde));
    if (args.hasta) consulta = consulta.lte(colFecha, colFecha === 'created_at' ? `${args.hasta}T23:59:59.999` : String(args.hasta));
    const orden = String(args.orden ?? '-created_at');
    const colOrden = orden.replace(/^-/, '');
    if (!existe(colOrden)) throw new ErrorUso(`La tabla ${tabla} no tiene la columna "${colOrden}".`);
    consulta = consulta.order(colOrden, { ascending: !orden.startsWith('-') });
    const limite = Math.min(Math.max(Number(args.limite) || 100, 1), MAX_FILAS);
    const { data, error } = await consulta.limit(limite);
    if (error) throw new ErrorUso(error.message);
    return { tabla, filas: (data ?? []).map((f) => { const { user_id: _, ...resto } = f as Json; return resto; }) };
  }

  if (nombre === 'crear') {
    const filas = (args.filas as Json[] | undefined) ?? [];
    if (!filas.length) throw new ErrorUso('Mandá al menos una fila.');
    const nuevas = filas.map((f) => ({ ...limpiar(f), user_id: q.userId }));
    const { data, error } = await db.from(tabla).insert(nuevas).select();
    if (error) throw new ErrorUso(error.message);
    for (const f of data as Json[]) await anotar(db, q, 'crear', tabla, f.id as string, null, f);
    return { ok: true, tabla, creadas: (data as Json[]).map((f) => { const { user_id: _, ...resto } = f; return resto; }) };
  }

  const id = String(args.id ?? '');
  const { data: antes, error: e1 } = await db.from(tabla).select('*').eq('id', id).eq('user_id', q.userId).maybeSingle();
  if (e1) throw new ErrorUso(e1.message);
  if (!antes) throw new ErrorUso(`No hay una fila con id ${id} en ${tabla}.`);

  if (nombre === 'modificar') {
    const cambios = limpiar((args.cambios as Json) ?? {});
    delete cambios.id;
    if (!Object.keys(cambios).length) throw new ErrorUso('No mandaste cambios.');
    const { data, error } = await db.from(tabla).update(cambios).eq('id', id).eq('user_id', q.userId).select().single();
    if (error) throw new ErrorUso(error.message);
    const registro = await anotar(db, q, 'modificar', tabla, id, antes, data);
    return { ok: true, tabla, registro_id: registro, fila: data };
  }

  if (nombre === 'borrar') {
    const { error } = await db.from(tabla).delete().eq('id', id).eq('user_id', q.userId);
    if (error) throw new ErrorUso(error.message);
    const registro = await anotar(db, q, 'borrar', tabla, id, antes, null);
    return { ok: true, tabla, borrada: id, registro_id: registro };
  }

  throw new ErrorUso(`No conozco la herramienta "${nombre}".`);
}

/* ---------- Protocolo MCP (HTTP sin sesión, respuestas JSON) ---------- */

async function quien(db: SupabaseClient, req: Request): Promise<Quien | null> {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization') ?? '';
  const clave = url.searchParams.get('k') ?? req.headers.get('x-life-clave') ?? (auth.startsWith('Bearer life_') ? auth.slice(7) : '');
  if (!clave.startsWith('life_')) return null;
  const { data } = await db.from('api_claves').select('id, user_id, permiso, revocada').eq('hash', await sha256(clave)).maybeSingle();
  if (!data || data.revocada) return null;
  const { data: perfil } = await db.from('perfiles').select('activo, rol').eq('user_id', data.user_id).maybeSingle();
  if (perfil && !perfil.activo) return null;
  await db.from('api_claves').update({ ultimo_uso: new Date().toISOString() }).eq('id', data.id);
  const permiso = perfil?.rol === 'lector' ? 'leer' : data.permiso;
  return { userId: data.user_id, claveId: data.id, permiso };
}

async function atender(db: SupabaseClient, q: Quien, m: Json): Promise<Json | null> {
  const id = m.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const mal = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  const metodo = String(m.method ?? '');
  const params = (m.params as Json) ?? {};

  if (id === null || id === undefined) return null; // notificaciones: no llevan respuesta

  switch (metodo) {
    case 'initialize':
      return ok({
        protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'LIFE', version: '1.1.0' },
        instructions: 'LIFE es la app personal de la usuaria (economía, pagos, entreno, stock, comida, compras, día). ' +
          'Hablale en español rioplatense. Llamá primero a que_hay para ver tablas y columnas. ' +
          'Para su semana y su tiempo: ver_semana muestra cada día con sueño, fijo, cosas de todos los días y tiempo libre; ' +
          'cargar_semana_tipo guarda lo fijo que se repite; cambiar_dia cambia una fecha puntual sin tocar la semana; ' +
          'las cosas de todos los días (bañarse, platos…) van en dia_rutinas con crear; anotar_tiempo registra en qué usó un rato; ' +
          'cada cuánto va a comprar va en com_frecuencias. ' +
          'Antes de cargar algo que ella te contó, confirmá los datos clave (monto, fecha, cuenta) si no están claros. ' +
          'Fechas en YYYY-MM-DD, montos en pesos argentinos sin separadores. Todo cambio queda en historial y se puede deshacer.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: HERRAMIENTAS });
    case 'tools/call': {
      const nombre = String(params.name ?? '');
      try {
        const r = await ejecutar(db, q, nombre, (params.arguments as Json) ?? {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(r) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
    }
    default:
      return mal(-32601, `Método no soportado: ${metodo}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Usá POST (protocolo MCP).' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const q = await quien(db, req);
  if (!q) return respuesta({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Clave de LIFE inválida o revocada.' } }, 401);

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }, 400);
  }

  if (Array.isArray(cuerpo)) {
    const rs = (await Promise.all(cuerpo.map((m) => atender(db, q, m as Json)))).filter(Boolean);
    return rs.length ? respuesta(rs) : new Response(null, { status: 202, headers: CORS });
  }
  const r = await atender(db, q, cuerpo as Json);
  return r ? respuesta(r) : new Response(null, { status: 202, headers: CORS });
});
