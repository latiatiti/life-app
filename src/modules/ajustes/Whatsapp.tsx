import { useEffect, useState, type FormEvent } from 'react';
import { almacen, crear, modificar, supabase } from '../../core/db';
import { uid } from '../../core/format';
import { Campo, Tarjeta } from '../../ui/ui';
import { TABLA_WHATSAPP, useWhatsapp, type ConfigWhatsapp } from '../tablero/modelo';

/**
 * Recordatorios a su propio WhatsApp (2026-11-08) con CallMeBot (gratis, solo a tu propio número).
 * La nube (pg_cron cada 5 min, supabase/avisos-whatsapp.sql) manda los recordatorios de las tarjetas del Tablero.
 * La clave vive solo en su fila (RLS) y no va en el respaldo.
 */
const NUMERO_BOT = '+34 644 95 73 56';
const FRASE = 'I allow callmebot to send me messages';

export function ConexionWhatsapp() {
  const { fila, conectado } = useWhatsapp();
  const [tel, setTel] = useState(fila?.telefono ?? '');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState('');
  const [probando, setProbando] = useState(false);
  const nube = almacen.tipo === 'nube';
  useEffect(() => { if (fila?.telefono) setTel((t) => t || fila.telefono); }, [fila?.telefono]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const telefono = tel.replace(/[^\d+]/g, '');
    if (telefono.replace(/\D/g, '').length < 10) { setMsg('Poné tu número completo con +54 9 (ej: +5492611234567).'); return; }
    const apikey = clave.trim() || fila?.apikey || '';
    if (!apikey) { setMsg('Falta la clave que te mandó CallMeBot por WhatsApp.'); return; }
    const datos = { telefono: telefono.startsWith('+') ? telefono : `+${telefono}`, apikey, activo: true, ultimo_error: null };
    if (fila) await modificar<ConfigWhatsapp>(TABLA_WHATSAPP, fila.id, datos);
    else await crear<ConfigWhatsapp>(TABLA_WHATSAPP, { ...datos, id: uid() });
    setClave('');
    setMsg('Guardado. Tocá "Mandarme una prueba" para ver si llega.');
  }

  async function probar() {
    if (!supabase) return;
    setProbando(true); setMsg('');
    const { error } = await supabase.rpc('life_whatsapp_probar');
    setProbando(false);
    setMsg(error ? `No se pudo mandar: ${error.message}` : 'Mandado. Te tiene que llegar en menos de un minuto; si no llega, revisá el número y la clave.');
  }

  async function pausar() {
    if (fila) await modificar<ConfigWhatsapp>(TABLA_WHATSAPP, fila.id, { activo: !fila.activo });
  }

  return (
    <Tarjeta titulo="Recordatorios por WhatsApp">
      {conectado
        ? <p>✅ Conectado a <strong>{fila!.telefono}</strong>. Las tarjetas del Tablero con “Recordarme” te avisan a ese número.</p>
        : fila && !fila.activo
          ? <p>⏸ En pausa: no te llegan recordatorios.</p>
          : <p>Para que LIFE te mande los recordatorios del Tablero a tu WhatsApp. Es gratis y solo manda a tu propio número.</p>}
      {fila?.ultimo_error && <p className="nota">Último problema: {fila.ultimo_error}</p>}
      {!nube && <p className="nota">Funciona con la nube: en modo local no hay quién mande los mensajes.</p>}
      {!conectado && (
        <ol className="nota">
          <li>En tu celular, agendá el número <strong>{NUMERO_BOT}</strong> (es CallMeBot).</li>
          <li>Mandale por WhatsApp este texto: <strong>{FRASE}</strong></li>
          <li>Te contesta con tu clave (“apikey”, unos números). Pegala acá abajo con tu número.</li>
        </ol>
      )}
      <form className="form" onSubmit={guardar}>
        <Campo etiqueta="Tu número de WhatsApp"><input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+5492611234567" inputMode="tel" /></Campo>
        <Campo etiqueta="Clave de CallMeBot" ayuda={fila?.apikey ? 'Ya está guardada. Escribí otra solo si la cambiaste.' : 'La que te llegó por WhatsApp. No la pegues en el chat.'}>
          <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder={fila?.apikey ? '••••••' : '123456'} inputMode="numeric" autoComplete="off" />
        </Campo>
        <div className="acciones">
          <button className="btn btn-primario">Guardar</button>
          {conectado && nube && <button type="button" className="btn" disabled={probando} onClick={probar}>{probando ? 'Mandando…' : 'Mandarme una prueba'}</button>}
          {fila && <button type="button" className="btn" onClick={pausar}>{fila.activo ? 'Pausar' : 'Reanudar'}</button>}
        </div>
      </form>
      {msg && <p className="aviso-msg" role="status">{msg}</p>}
      <p className="nota">Los mensajes te llegan desde el número de CallMeBot. Para avisarle a otra persona, la tarjeta te arma el WhatsApp listo y lo mandás vos.</p>
    </Tarjeta>
  );
}
