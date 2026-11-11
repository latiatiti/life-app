import { useEffect, useState } from 'react';
import { recargar, supabase, useTabla, type Fila } from '../../core/db';

/**
 * WhatsApp web de LIFE (2026-11-11). Su propio WhatsApp, vinculado por QR a un "puente" que corre en un
 * servidor (carpeta whatsapp-puente/ del repo). La app no habla con WhatsApp: lee y escribe estas tablas,
 * y el puente hace el resto (SQL: supabase/whatsapp-web.sql). Fuera de TABLAS: no va al respaldo.
 */
export const T_SESION = 'wa_sesion';
export const T_CHATS = 'wa_chats';
export const T_SALIDA = 'wa_salida';

export type EstadoWa = 'apagado' | 'esperando_qr' | 'conectando' | 'conectado' | 'desconectado' | 'error';

export interface SesionWa extends Fila {
  estado: EstadoWa; qr?: string | null; numero?: string | null; nombre?: string | null;
  pedido?: 'conectar' | 'desconectar' | null; visto?: string | null; ultimo_error?: string | null;
}
export interface ChatWa extends Fila {
  jid: string; nombre?: string | null; telefono?: string | null;
  ultimo_texto?: string | null; ultimo_at?: string | null; sin_leer: number;
}
export interface MensajeWa {
  id: string; jid: string; wa_id: string; de_mi: boolean; texto?: string | null; tipo: string; fecha: string;
}
export interface SalidaWa extends Fila {
  jid?: string | null; telefono?: string | null; nombre?: string | null; texto: string;
  origen: 'app' | 'claude'; estado: 'pendiente' | 'enviando' | 'enviado' | 'error' | 'cancelado';
  no_antes?: string; enviado_at?: string | null; error?: string | null;
}

/** Si el puente no avisó en 2 minutos, está apagado (el servidor se cayó o no está prendido). */
export function puenteVivo(s?: SesionWa) {
  return !!s?.visto && Date.now() - Date.parse(s.visto) < 120_000;
}

export type Situacion = 'sin-nube' | 'sin-puente' | 'apagado' | 'qr' | 'conectando' | 'conectado' | 'desconectado';
export function situacion(s?: SesionWa): Situacion {
  if (!supabase) return 'sin-nube';
  if (!s || !puenteVivo(s)) return 'sin-puente';
  if (s.estado === 'conectado') return 'conectado';
  if (s.estado === 'esperando_qr' && s.qr) return 'qr';
  if (s.estado === 'conectando' || s.estado === 'esperando_qr' || s.pedido === 'conectar') return 'conectando';
  if (s.estado === 'desconectado' || s.estado === 'error') return 'desconectado';
  return 'apagado';
}

/** Vuelve a leer las tablas cada tantos segundos mientras la pantalla está abierta. */
export function useRefresco(tablas: string[], cadaMs: number) {
  useEffect(() => {
    if (!supabase) return;
    const t = setInterval(() => { if (!document.hidden) for (const x of tablas) void recargar(x); }, cadaMs);
    return () => clearInterval(t);
  }, [tablas.join(','), cadaMs]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useSesionWa() {
  const { filas, cargado } = useTabla<SesionWa>(T_SESION);
  return { sesion: filas[0], cargado };
}

export function useChatsWa() {
  const { filas, cargado } = useTabla<ChatWa>(T_CHATS);
  const chats = [...filas].sort((a, b) => String(b.ultimo_at ?? '').localeCompare(String(a.ultimo_at ?? '')));
  return { chats, cargado };
}

/** Mensajes de un chat (los últimos 200). No usa useTabla: la tabla tiene los de todos los chats. */
export function useMensajes(jid: string | null, cadaMs = 4000) {
  const [mensajes, setMensajes] = useState<MensajeWa[]>([]);
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    setMensajes([]); setCargado(false);
    if (!jid || !supabase) return;
    let vivo = true;
    const leer = async () => {
      const { data } = await supabase!.from('wa_mensajes').select('id, jid, wa_id, de_mi, texto, tipo, fecha')
        .eq('jid', jid).order('fecha', { ascending: false }).limit(200);
      if (vivo && data) { setMensajes((data as MensajeWa[]).reverse()); setCargado(true); }
    };
    void leer();
    const t = setInterval(() => { if (!document.hidden) void leer(); }, cadaMs);
    return () => { vivo = false; clearInterval(t); };
  }, [jid, cadaMs]);
  return { mensajes, cargado };
}

export const nombreChat = (c?: Pick<ChatWa, 'nombre' | 'telefono' | 'jid'> | null) =>
  c?.nombre || (c?.telefono ? `+${c.telefono}` : c?.jid.split('@')[0] ?? '');

const ICONO_TIPO: Record<string, string> = { imagen: '📷 Foto', audio: '🎤 Audio', video: '🎬 Video', documento: '📄 Documento', sticker: 'Sticker', otro: '' };
export const textoMensaje = (m: Pick<MensajeWa, 'texto' | 'tipo'>) =>
  m.tipo === 'texto' ? (m.texto ?? '') : [ICONO_TIPO[m.tipo], m.texto].filter(Boolean).join(' · ');

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const DIA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
/** "14:05" si es de hoy, "ayer", o "3 nov". */
export function cuando(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return HORA.format(d);
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'ayer';
  return DIA.format(d);
}
export const horaDe = (iso: string) => HORA.format(new Date(iso));
