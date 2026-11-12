// Puente de WhatsApp de LIFE.
//
// Mantiene el WhatsApp de la dueña conectado como un dispositivo vinculado (igual que WhatsApp Web) y lo
// comunica con LIFE a través de la función whatsapp-puente de Supabase:
//   · cuando la app pide "Conectar", genera el QR y lo sube para que ella lo escanee desde LIFE;
//   · guarda en LIFE sus chats de a dos y los mensajes de texto de los últimos 30 días;
//   · manda lo que LIFE deja en la cola de salida (desde la app o desde Claude, siempre con su OK).
//
// Variables de entorno (ver LEEME.md):
//   LIFE_FUNCION      https://<proyecto>.supabase.co/functions/v1/whatsapp-puente
//   WA_PUENTE_CLAVE   la clave larga del puente (en la base está solo su huella, tabla wa_puente)
//   WA_CIFRADO        64 letras hex (32 bytes): cifra la sesión de WhatsApp. Vive SOLO acá.
//   DATOS             carpeta para la copia local de la sesión (por defecto ./datos)
//
// Nada de lo que pasa por acá se escribe en el registro (logs): ni textos ni números.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import makeWASocket, {
  Browsers, BufferJSON, DisconnectReason, initAuthCreds, isLidUser, isPnUser, jidNormalizedUser,
  normalizeMessageContent, proto, fetchLatestBaileysVersion,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const FUNCION = process.env.LIFE_FUNCION ?? '';
const CLAVE = process.env.WA_PUENTE_CLAVE ?? '';
const CIFRADO = Buffer.from(process.env.WA_CIFRADO ?? '', 'hex');
const DATOS = process.env.DATOS ?? './datos';
const ARCHIVO = join(DATOS, 'sesion.enc');
const DIAS = 30;

if (!(FUNCION.startsWith('https://') || FUNCION.startsWith('http://localhost:')) || CLAVE.length < 32 || CIFRADO.length !== 32) {
  console.error('Faltan LIFE_FUNCION (https://…), WA_PUENTE_CLAVE (32+ letras) o WA_CIFRADO (64 letras hex). Ver LEEME.md.');
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), ...a);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const logger = pino({ level: 'silent' });

/* ---------- Hablar con LIFE ---------- */

async function life(accion, datos = {}, intentos = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(FUNCION, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, ...datos }),
        signal: AbortSignal.timeout(60_000),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo.error ?? `HTTP ${r.status}`);
      return cuerpo;
    } catch (e) {
      if (i >= intentos) throw e;
      await esperar(2000 * i);
    }
  }
}

/* ---------- Sesión de WhatsApp cifrada (copia local + copia en LIFE) ---------- */

function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', CIFRADO, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
}
function descifrar(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', CIFRADO, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

let sesion = null; // { creds, keys: { [tipo]: { [id]: valor } } }
let guardarTimer = null;

async function cargarSesion() {
  let b64 = await readFile(ARCHIVO, 'utf8').catch(() => null);
  if (!b64) b64 = (await life('credenciales_leer')).datos;
  if (!b64) return null;
  try {
    return JSON.parse(descifrar(b64), BufferJSON.reviver);
  } catch {
    log('La sesión guardada no se pudo abrir (¿cambió WA_CIFRADO?). Hay que volver a escanear el QR.');
    return null;
  }
}

function guardarLuego() {
  clearTimeout(guardarTimer);
  guardarTimer = setTimeout(() => void guardarYa(), 4000);
}
async function guardarYa() {
  if (!sesion) return;
  const b64 = cifrar(JSON.stringify(sesion, BufferJSON.replacer));
  await mkdir(DATOS, { recursive: true });
  await writeFile(ARCHIVO, b64, { mode: 0o600 });
  await life('credenciales_guardar', { datos: b64 }).catch((e) => log('No se pudo subir la sesión:', e.message));
}
async function borrarSesion() {
  sesion = null;
  clearTimeout(guardarTimer);
  await rm(ARCHIVO, { force: true });
  await life('credenciales_borrar').catch(() => {});
}

function estadoAuth() {
  return {
    creds: sesion.creds,
    keys: {
      get: async (tipo, ids) => {
        const salida = {};
        for (const id of ids) {
          let v = sesion.keys[tipo]?.[id];
          if (v && tipo === 'app-state-sync-key') v = proto.Message.AppStateSyncKeyData.fromObject(v);
          salida[id] = v;
        }
        return salida;
      },
      set: async (datos) => {
        for (const tipo in datos) {
          sesion.keys[tipo] ??= {};
          for (const id in datos[tipo]) {
            if (datos[tipo][id]) sesion.keys[tipo][id] = datos[tipo][id];
            else delete sesion.keys[tipo][id];
          }
        }
        guardarLuego();
      },
    },
  };
}

/* ---------- Leer mensajes ---------- */

const nombres = new Map(); // jid → nombre agendado o de perfil

/** Pasa los chats @lid al número de teléfono cuando se puede (así Claude encuentra a "Ulises" por su número). */
async function jidDeChat(sock, key) {
  const j = jidNormalizedUser(key.remoteJid);
  if (isPnUser(j)) return j;
  if (isLidUser(j)) {
    if (key.remoteJidAlt && isPnUser(key.remoteJidAlt)) return jidNormalizedUser(key.remoteJidAlt);
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID(j).catch(() => null);
    return pn ? jidNormalizedUser(pn) : j;
  }
  return null; // grupos, estados, canales: no se guardan
}

function leerContenido(m) {
  const c = normalizeMessageContent(m.message);
  if (!c || c.protocolMessage || c.reactionMessage || c.senderKeyDistributionMessage && Object.keys(c).length === 1) return null;
  if (c.conversation) return { tipo: 'texto', texto: c.conversation };
  if (c.extendedTextMessage) return { tipo: 'texto', texto: c.extendedTextMessage.text ?? '' };
  if (c.imageMessage) return { tipo: 'imagen', texto: c.imageMessage.caption || null };
  if (c.videoMessage) return { tipo: 'video', texto: c.videoMessage.caption || null };
  if (c.audioMessage) return { tipo: 'audio', texto: null };
  if (c.documentMessage || c.documentWithCaptionMessage) return { tipo: 'documento', texto: c.documentMessage?.fileName ?? c.documentMessage?.caption ?? null };
  if (c.stickerMessage) return { tipo: 'sticker', texto: null };
  if (c.locationMessage) return { tipo: 'otro', texto: '📍 Ubicación' };
  if (c.contactMessage) return { tipo: 'otro', texto: `👤 ${c.contactMessage.displayName ?? 'Contacto'}` };
  return null;
}

async function armarMensajes(sock, lista) {
  const desde = Date.now() - DIAS * 86400_000;
  const salida = [];
  for (const m of lista) {
    if (!m?.key?.id || !m.message) continue;
    const fecha = Number(m.messageTimestamp ?? 0) * 1000;
    if (!fecha || fecha < desde) continue;
    const jid = await jidDeChat(sock, m.key);
    if (!jid) continue;
    const cont = leerContenido(m);
    if (!cont) continue;
    if (!m.key.fromMe && m.pushName && !nombres.has(jid)) nombres.set(jid, m.pushName);
    salida.push({
      jid, wa_id: m.key.id, de_mi: !!m.key.fromMe, texto: cont.texto, tipo: cont.tipo,
      fecha: new Date(fecha).toISOString(), nombre: m.key.fromMe ? undefined : (nombres.get(jid) ?? m.pushName ?? undefined),
    });
  }
  return salida;
}

/* ---------- Mandar ---------- */

/** Número argentino a formato de WhatsApp: 261 555 1234 → 5492615551234. */
function numeroWa(tel) {
  let d = String(tel ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `549${d}`;
  else if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = `549${d.slice(2)}`;
  return d;
}

async function mandarCola(sock) {
  while (conectado && sock === actual) {
    let r;
    try {
      r = await life('salida', { espera: 25 }, 1);
    } catch {
      await esperar(10_000);
      continue;
    }
    for (const m of r.mensajes ?? []) {
      try {
        let jid = m.jid;
        if (!jid) {
          const [hay] = await sock.onWhatsApp(numeroWa(m.telefono));
          if (!hay?.exists) throw new Error('Ese número no tiene WhatsApp.');
          jid = jidNormalizedUser(hay.jid);
        }
        const enviado = await sock.sendMessage(jid, { text: m.texto });
        await life('salida_resultado', { id: m.id, ok: true, wa_id: enviado?.key?.id, jid: isPnUser(jid) || isLidUser(jid) ? jid : undefined });
        log('Mensaje mandado.');
      } catch (e) {
        await life('salida_resultado', { id: m.id, ok: false, error: e.message }).catch(() => {});
        log('No se pudo mandar un mensaje:', e.message);
      }
      await esperar(2500 + Math.random() * 3000); // sin ráfagas
    }
  }
}

/* ---------- Conexión ---------- */

let actual = null;
let conectado = false;
let pidioQr = false;   // solo se muestra QR si la app lo pidió
let reintentos = 0;

async function estado(e) {
  try {
    const r = await life('estado', e);
    return r.pedido;
  } catch (err) {
    log('No pude avisarle a LIFE:', err.message);
    return null;
  }
}

async function conectar() {
  if (actual) return;
  if (!sesion) sesion = (await cargarSesion()) ?? { creds: initAuthCreds(), keys: {} };
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version, auth: estadoAuth(), logger, browser: Browsers.ubuntu('LIFE'),
    markOnlineOnConnect: false,          // que el celular le siga avisando
    syncFullHistory: false,
    getMessage: async () => undefined,
  });
  actual = sock;
  await estado({ estado: 'conectando' });

  sock.ev.on('creds.update', () => guardarLuego());

  sock.ev.on('connection.update', async (u) => {
    if (sock !== actual) return;
    if (u.qr) {
      if (!pidioQr) { log('Hace falta escanear el QR: esperando que lo pidan desde LIFE.'); cerrar(sock); return; }
      const qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 });
      await estado({ estado: 'esperando_qr', qr });
      log('QR nuevo listo en LIFE.');
    }
    if (u.connection === 'open') {
      conectado = true; reintentos = 0; pidioQr = false;
      await guardarYa();
      const numero = (sock.user?.id ?? '').split(':')[0].split('@')[0];
      await estado({ estado: 'conectado', numero, nombre: sock.user?.name ?? null });
      await life('pedido_cumplido').catch(() => {});
      log('Conectado.');
      void mandarCola(sock);
    }
    if (u.connection === 'close') {
      conectado = false;
      actual = null;
      const codigo = u.lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        log('Cerraron la sesión desde el celular.');
        await borrarSesion();
        await estado({ estado: 'desconectado', error: 'Se cerró la sesión desde el celular. Para volver, tocá Conectar y escaneá el QR.' });
        return;
      }
      if (!sesion?.creds?.registered && !pidioQr) { await estado({ estado: 'apagado' }); return; }
      if (codigo === DisconnectReason.timedOut && pidioQr && !sesion?.creds?.registered) {
        pidioQr = false;
        await estado({ estado: 'desconectado', error: 'El QR venció sin escanear. Tocá Conectar para pedir otro.' });
        await life('pedido_cumplido').catch(() => {});
        return;
      }
      reintentos++;
      const ms = codigo === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** Math.min(reintentos, 5));
      log(`Se cortó (código ${codigo ?? '?'}). Reintento en ${ms / 1000} s.`);
      if (codigo !== DisconnectReason.restartRequired) await estado({ estado: 'conectando', error: `Se cortó la conexión (código ${codigo ?? '?'}), reintentando.` });
      setTimeout(() => void conectar().catch((e) => log('Error al reconectar:', e.message)), ms);
    }
  });

  sock.ev.on('contacts.upsert', (cs) => { for (const c of cs) guardarNombre(c); });
  sock.ev.on('contacts.update', (cs) => { for (const c of cs) guardarNombre(c); });

  sock.ev.on('messaging-history.set', async ({ contacts, messages }) => {
    for (const c of contacts ?? []) guardarNombre(c);
    const ms = await armarMensajes(sock, messages ?? []);
    if (ms.length) await life('mensajes', { mensajes: ms, nuevos: false }).catch((e) => log('Historial:', e.message));
    await subirNombres();
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const ms = await armarMensajes(sock, messages);
    if (ms.length) await life('mensajes', { mensajes: ms, nuevos: type === 'notify' }).catch((e) => log('Mensajes:', e.message));
  });
}

function guardarNombre(c) {
  const nombre = c.name || c.notify || c.verifiedName;
  if (!nombre) return;
  for (const j of [c.id, c.phoneNumber, c.lid]) if (j && (isPnUser(j) || isLidUser(j))) nombres.set(jidNormalizedUser(j), nombre);
}

/** Pone nombre a los chats que ya existen en LIFE (no crea un chat por cada contacto agendado). */
let nombresSubidos = 0;
async function subirNombres() {
  if (nombres.size === nombresSubidos) return;
  nombresSubidos = nombres.size;
  const chats = [...nombres].map(([jid, nombre]) => ({ jid, nombre, telefono: isPnUser(jid) ? jid.split('@')[0] : undefined }));
  await life('chats', { chats, solo_existentes: true }).catch((e) => log('Nombres:', e.message));
}

function cerrar(sock) {
  try { sock.end(undefined); } catch { /* ya estaba cerrado */ }
}

/* ---------- Latido: cada 30 s avisa que está vivo y mira qué pidió la app ---------- */

async function latido() {
  const e = conectado ? 'conectado' : actual ? 'conectando' : (sesion?.creds?.registered ? 'desconectado' : 'apagado');
  const pedido = await estado(conectado ? { estado: e } : { estado: e === 'conectando' && pidioQr ? 'esperando_qr' : e, qr: undefined });
  if (pedido === 'conectar' && !conectado && !actual) {
    pidioQr = true;
    log('Piden conectar desde LIFE.');
    await conectar().catch((err) => log('Error al conectar:', err.message));
  } else if (pedido === 'conectar' && !conectado && actual && !pidioQr) {
    pidioQr = true;
  } else if (pedido === 'conectar' && conectado) {
    await life('pedido_cumplido').catch(() => {});
  } else if (pedido === 'desconectar') {
    log('Piden desconectar desde LIFE.');
    const s = actual;
    conectado = false; actual = null;
    if (s) { try { await s.logout(); } catch { cerrar(s); } }
    await borrarSesion();
    await estado({ estado: 'apagado' });
    await life('pedido_cumplido').catch(() => {});
  }
  if (conectado) await subirNombres();
}

async function limpiarViejos() {
  await life('limpiar').catch(() => {});
}

async function arrancar() {
  log('Puente de WhatsApp de LIFE arrancando.');
  sesion = await cargarSesion();
  if (sesion?.creds?.registered) await conectar().catch((e) => log('Error al conectar:', e.message));
  else { sesion = null; await estado({ estado: 'apagado' }); }
  setInterval(() => void latido().catch((e) => log('Latido:', e.message)), 30_000);
  setInterval(() => void limpiarViejos(), 6 * 3600_000);
  void latido();
}

process.on('SIGTERM', async () => { await guardarYa().catch(() => {}); process.exit(0); });
process.on('SIGINT', async () => { await guardarYa().catch(() => {}); process.exit(0); });

void arrancar();
