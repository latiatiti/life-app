// Función "mercadopago": trae de la cuenta de Mercado Pago de ella el saldo y los movimientos
// (lo que entra y lo que paga) para que LIFE los muestre "para revisar". Solo LEE.
//
// Seguridad (Gonzalito, docs/seguridad.md):
// - El access token de MP vive SOLO como secreto de esta función (MP_ACCESS_TOKEN). Nunca en el
//   repo, en la app ni en la respuesta. Ese token no se puede limitar a solo lectura en MP, por eso
//   esta función llama únicamente a las consultas fijas de abajo (nada de pasar URLs o métodos).
// - Hace falta sesión de LIFE (JWT verificado) y que la cuenta sea la dueña (MP_DUENO = su user_id).
// - Si se filtra o hay dudas: en MP → Tus integraciones → la app → Renovar credenciales, y cargar el
//   nuevo en el secreto. Sin el secreto la función contesta "sin conectar".
//
// Entrada (POST JSON): { dias?: number }  (1 a 60, por defecto 30)
// Salida: { saldo: number|null, movimientos: [{ externo, fecha, sentido, monto, descripcion }] }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const API = 'https://api.mercadopago.com';

const responder = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface PagoMP {
  id: number;
  status: string;
  date_approved: string | null;
  date_created: string;
  transaction_amount: number;
  description: string | null;
  operation_type: string;
  collector_id?: number;
  payer?: { id?: string | number };
  transaction_details?: { net_received_amount?: number };
}

const fechaAR = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' });

const DETALLE: Record<string, string> = {
  money_transfer: 'Transferencia',
  regular_payment: 'Pago',
  pos_payment: 'Pago con QR',
  recurring_payment: 'Débito automático',
  account_fund: 'Ingreso de dinero',
  account_money: 'Movimiento',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Usá POST.' }, 405);

  const tokenMP = Deno.env.get('MP_ACCESS_TOKEN');
  const dueno = Deno.env.get('MP_DUENO');
  if (!tokenMP || !dueno) return responder({ error: 'Mercado Pago sin conectar.' }, 503);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const { data: yo } = await admin.auth.getUser(jwt);
  if (!yo.user) return responder({ error: 'Iniciá sesión.' }, 401);
  if (yo.user.id !== dueno) return responder({ error: 'Esta cuenta no tiene Mercado Pago conectado.' }, 403);

  let dias = 30;
  try { dias = Math.min(60, Math.max(1, Math.round(Number((await req.json()).dias) || 30))); } catch { /* por defecto */ }

  const mp = async (ruta: string) => {
    const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${tokenMP}` } });
    if (!r.ok) throw new Error(`MP ${r.status}`);
    return r.json();
  };

  let usuario: { id: number };
  try {
    usuario = await mp('/users/me');
  } catch (e) {
    return responder({ error: `Mercado Pago no aceptó la clave (${(e as Error).message}). Renovala y volvé a cargarla.` }, 502);
  }

  // Saldo: MP no lo documenta para cuentas personales; si no lo da, la app usa el saldo de LIFE.
  let saldo: number | null = null;
  try {
    const b = await mp(`/users/${usuario.id}/mercadopago_account/balance`);
    const v = Number(b.available_balance ?? b.total_amount);
    if (Number.isFinite(v)) saldo = v;
  } catch { /* sin saldo */ }

  // Movimientos: lo que cobró (es la que recibe) y lo que pagó (es la que paga), aprobados.
  const desde = `NOW-${dias}DAYS`;
  const buscar = async (filtro: string) => {
    const salida: PagoMP[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const q = `/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=${desde}&end_date=NOW&limit=50&offset=${offset}&${filtro}`;
      const r = await mp(q);
      salida.push(...(r.results ?? []));
      if ((r.results ?? []).length < 50) break;
    }
    return salida;
  };
  const errores: string[] = [];
  const recibidos = await buscar(`collector.id=${usuario.id}`).catch((e) => { errores.push(`cobros: ${e.message}`); return []; });
  const pagados = await buscar(`payer.id=${usuario.id}`).catch((e) => { errores.push(`pagos: ${e.message}`); return []; });

  const vistos = new Set<string>();
  const movimientos = [] as Array<{ externo: string; fecha: string; sentido: 'entra' | 'sale'; monto: number; descripcion: string }>;
  for (const [lista, sentido] of [[recibidos, 'entra'], [pagados, 'sale']] as const) {
    for (const p of lista) {
      if (p.status !== 'approved') continue;
      const externo = `mp:${p.id}`;
      if (vistos.has(externo)) continue;
      vistos.add(externo);
      const monto = sentido === 'entra' ? Number(p.transaction_details?.net_received_amount || p.transaction_amount) : Number(p.transaction_amount);
      if (!(monto > 0)) continue;
      movimientos.push({
        externo,
        fecha: fechaAR(p.date_approved ?? p.date_created),
        sentido,
        monto: Math.round(monto * 100) / 100,
        descripcion: (p.description ?? '').trim() || DETALLE[p.operation_type] || 'Movimiento de Mercado Pago',
      });
    }
  }

  return responder({ saldo, movimientos, ...(errores.length ? { avisos: errores } : {}) });
});
