// Función "aviso-cuenta": cuando alguien crea una cuenta nueva en LIFE le manda un mail al superadmin.
// Con Google la cuenta ya queda activa (el mail es para enterarse y pausarla si no la conoce);
// por correo queda esperando y el mail es para autorizarla, en los dos casos desde Ajustes → Cuentas.
//
// La llama la base (trigger life_perfil_nuevo, vía pg_net) con { user_id }. Se despliega SIN
// verificación de JWT, pero no se puede usar para mandar cualquier cosa: solo avisa de una cuenta
// que de verdad es nueva (creada sola hace menos de 15 minutos) y que todavía no fue avisada.
//
// Secretos (Supabase → Edge Functions → Secrets), nunca en el repo:
//   RESEND_API_KEY  clave de resend.com (plan gratis: 3.000 mails por mes)
//   AVISO_MAIL      a quién avisar (el mail del superadmin)
//   AVISO_DE        opcional, remitente verificado en Resend. Sin dominio propio: "LIFE <onboarding@resend.dev>"
//                   (Resend solo deja mandar a la dirección con la que se creó la cuenta de Resend).
//   APP_URL         opcional, link de la app publicada para el botón del mail.

import { createClient } from 'npm:@supabase/supabase-js@2';

const responder = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder({ error: 'Usá POST.' }, 405);
  let userId = '';
  try {
    userId = String((await req.json()).user_id ?? '');
  } catch {
    return responder({ error: 'JSON inválido.' }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return responder({ error: 'Falta user_id.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: p } = await admin.from('perfiles').select('activo, pedido_at, aviso_at, nombre, via').eq('user_id', userId).maybeSingle();
  const reciente = p?.pedido_at && Date.now() - new Date(p.pedido_at).getTime() < 15 * 60_000;
  if (!p || p.aviso_at || !reciente) return responder({ ok: true, avisado: false });

  // Se marca ANTES de mandar: dos llamadas seguidas no mandan dos mails.
  const { data: marcado } = await admin.from('perfiles').update({ aviso_at: new Date().toISOString() })
    .eq('user_id', userId).is('aviso_at', null).select('user_id');
  if (!marcado?.length) return responder({ ok: true, avisado: false });

  const clave = Deno.env.get('RESEND_API_KEY');
  const para = Deno.env.get('AVISO_MAIL');
  if (!clave || !para) return responder({ ok: false, error: 'Faltan los secretos RESEND_API_KEY o AVISO_MAIL.' }, 500);

  const { data: u } = await admin.auth.admin.getUserById(userId);
  const correo = u.user?.email ?? '(sin correo)';
  const nombre = p.nombre || String(u.user?.user_metadata?.full_name ?? '') || correo;
  const via = p.via === 'google' ? 'Google' : 'correo y contraseña';
  const app = Deno.env.get('APP_URL') ?? '';
  const cuando = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Mendoza', dateStyle: 'short', timeStyle: 'short' }).format(new Date());

  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px">
    <h2 style="margin:0 0 8px">${p.activo ? 'Se creó una cuenta nueva en LIFE' : 'Alguien quiere entrar a LIFE'}</h2>
    <p><strong>${escapar(nombre)}</strong><br>${escapar(correo)}<br>Entró con ${via} · ${cuando}</p>
    ${p.activo
      ? `<p>La cuenta ya está activa y empieza vacía: solo ve sus propios datos.</p>
         <p>Si no sabés quién es: abrí LIFE → Ajustes → Cuentas y roles → Editar → sacale "Cuenta activa".</p>`
      : `<p>La cuenta quedó <strong>en espera</strong>: no ve nada hasta que la autorices.</p>
         <p>Para autorizarla: abrí LIFE → Ajustes → Cuentas y roles → <em>Autorizar</em>.<br>
         Si no sabés quién es, no hagas nada (queda pausada) o tocá <em>Rechazar</em>.</p>`}
    ${app ? `<p><a href="${escapar(app)}#/ajustes" style="background:#3ee6a4;color:#000;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir LIFE</a></p>` : ''}
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('AVISO_DE') ?? 'LIFE <onboarding@resend.dev>',
      to: [para],
      subject: p.activo ? `LIFE: ${nombre} se creó una cuenta` : `LIFE: ${nombre} pidió una cuenta`,
      html,
    }),
  });
  if (!r.ok) {
    // Se libera la marca para poder reintentar (por ejemplo, después de cargar bien los secretos).
    await admin.from('perfiles').update({ aviso_at: null }).eq('user_id', userId);
    return responder({ ok: false, error: `Resend: ${r.status}` }, 502);
  }
  return responder({ ok: true, avisado: true });
});
