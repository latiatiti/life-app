import { useEffect, useState } from 'react';
import { puedeEscribir, usePerfil } from '../../core/auth';
import { almacen, supabase, useTabla } from '../../core/db';
import { fechaCorta } from '../../core/format';
import type { Senal } from '../../core/types';
import { confirmar } from '../../ui/Deshacer';
import { Tarjeta } from '../../ui/ui';
import { claveNueva, DIAS_AVISO, diasParaVencer, sha256, type Clave } from './claves';

/** Cada cuánto conviene cambiar la clave del puente de WhatsApp. */
const DIAS_PUENTE = 180;

/** Cuentas de afuera que cuidan LIFE: si alguien entra a una de estas, entra a todo. */
const CUENTAS = [
  { nombre: 'Google (tu Gmail)', por: 'Es la llave de LIFE si entrás con Google y de la recuperación de casi todo.', link: 'https://myaccount.google.com/signinoptions/twosv' },
  { nombre: 'GitHub', por: 'Ahí está el código de LIFE y con GitHub entrás a Supabase.', link: 'https://github.com/settings/security' },
  { nombre: 'Supabase', por: 'Es la base con todos tus datos.', link: 'https://supabase.com/dashboard/account/security' },
  { nombre: 'Netlify', por: 'Publica la app: quien entra puede cambiarla.', link: 'https://app.netlify.com/user/settings#security' },
  { nombre: 'Claude', por: 'Tiene el link de LIFE en los conectores.', link: 'https://claude.ai/settings' },
];

/** Ajustes → Seguridad: sesiones abiertas, clave del puente de WhatsApp y cuidado de las cuentas. */
export function PanelSeguridad() {
  const perfil = usePerfil();
  const [msg, setMsg] = useState('');
  const [clavePuente, setClavePuente] = useState('');
  const [puenteDesde, setPuenteDesde] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('life_wa_puente_fecha').then(({ data, error }) => setPuenteDesde(error ? undefined : (data as string | null)));
  }, []);

  if (almacen.tipo !== 'nube' || !supabase) return null;
  const sb = supabase;

  async function cerrarOtras() {
    if (!await confirmar('¿Cerrar la sesión en todos los otros celulares y compus? Este queda abierto; en los demás vas a tener que entrar de nuevo.')) return;
    const { error } = await sb.auth.signOut({ scope: 'others' });
    setMsg(error ? `No se pudo: ${error.message}` : 'Listo: se cerró la sesión en todos los otros dispositivos.');
  }

  async function cambiarPuente() {
    if (!await confirmar('¿Cambiar la clave del puente de WhatsApp? La vieja deja de andar en el acto: hasta que pegues la nueva en la compu del puente, WhatsApp no se actualiza en LIFE.')) return;
    const clave = claveNueva('', 32);
    const { error } = await sb.rpc('life_wa_puente_nueva', { huella: await sha256(clave) });
    if (error) { setMsg(`No se pudo cambiar: ${error.message}`); return; }
    setClavePuente(clave);
    setPuenteDesde(new Date().toISOString());
    setMsg('');
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setMsg('Copiada.'); }
    catch { setMsg('No se pudo copiar sola: seleccionala y copiala.'); }
  }

  const diasPuente = puenteDesde ? Math.floor((Date.now() - new Date(puenteDesde).getTime()) / 86_400_000) : 0;

  return (
    <Tarjeta titulo="Seguridad">
      <p className="nota" style={{ marginTop: 0 }}>
        LIFE junta mucha información tuya. Acá cerrás sesiones que quedaron abiertas, cambiás claves y revisás que tus cuentas tengan verificación en dos pasos.
      </p>
      {msg && <p className="nota" role="status">{msg}</p>}

      <p><strong>Sesiones abiertas</strong></p>
      <p className="nota">Si perdiste el celu, usaste una compu prestada o no sabés dónde quedó abierto LIFE.</p>
      <div className="acciones">
        <button className="btn" onClick={cerrarOtras}>Cerrar sesión en los otros dispositivos</button>
      </div>

      {puenteDesde !== undefined && (
        <>
          <p><strong>Clave del puente de WhatsApp</strong></p>
          {clavePuente ? (
            <div className="pila">
              <p className="nota">Tu clave nueva (se muestra una sola vez, no la mandes por chat):</p>
              <code className="link-clave">{clavePuente}</code>
              <div className="acciones">
                <button className="btn btn-primario" onClick={() => void copiar(clavePuente)}>Copiar clave</button>
                <button className="btn" onClick={() => setClavePuente('')}>Listo</button>
              </div>
              <ol className="nota pasos">
                <li>En la compu del puente abrí la carpeta <strong>LIFE\whatsapp</strong>.</li>
                <li>Doble clic en <strong>Cambiar clave del puente</strong> y pegá la clave.</li>
                <li>En WhatsApp → Conexión fijate que diga conectado. No hace falta volver a escanear el QR.</li>
              </ol>
            </div>
          ) : (
            <>
              <p className="nota">
                {puenteDesde ? `Creada ${fechaCorta(puenteDesde.slice(0, 10))}.` : 'Todavía no hay puente.'}
                {diasPuente >= DIAS_PUENTE ? ' ⚠ Tiene más de 6 meses: conviene cambiarla.' : ' Cambiala si se filtró o cada 6 meses.'}
              </p>
              {puedeEscribir(perfil) && puenteDesde && (
                <div className="acciones"><button className="btn" onClick={cambiarPuente}>Cambiar clave del puente</button></div>
              )}
            </>
          )}
        </>
      )}

      <p><strong>Tus cuentas</strong></p>
      <p className="nota">Activá la verificación en dos pasos (con una app como Google Authenticator o una llave, mejor que SMS) en cada una. Contraseñas distintas, guardadas en un gestor (Google o Bitwarden), nunca en notas ni en chats.</p>
      <ul className="lista-simple">
        {CUENTAS.map((c) => (
          <li key={c.nombre}>
            <span><strong>{c.nombre}</strong> <small className="nota">· {c.por}</small></span>
            <a className="btn" href={c.link} target="_blank" rel="noopener noreferrer">Revisar</a>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

/** Señales de seguridad para el Inicio: links de Claude por vencer o vencidos. */
export function useSenalesSeguridad(): Senal[] {
  const claves = useTabla<Clave>('api_claves');
  if (almacen.tipo !== 'nube') return [];
  const activas = claves.filas.filter((c) => !c.revocada);
  const vencidas = activas.filter((c) => diasParaVencer(c) <= 0);
  const pronto = activas.filter((c) => { const d = diasParaVencer(c); return d > 0 && d <= DIAS_AVISO; });
  const s: Senal[] = [];
  if (vencidas.length) s.push({
    id: 'seg-claves-vencidas', modulo: 'ajustes', nivel: 'aviso',
    titulo: vencidas.length === 1 ? 'Venció un link de Claude' : `Vencieron ${vencidas.length} links de Claude`,
    detalle: 'Claude ya no puede entrar con ese link. Creá uno nuevo y cortá el viejo.',
    ruta: '#/ajustes', accion: { texto: 'Renovar', ruta: '#/ajustes' },
  });
  if (pronto.length) {
    const d = Math.min(...pronto.map((c) => diasParaVencer(c)));
    s.push({
      id: 'seg-claves-pronto', modulo: 'ajustes', nivel: 'info',
      titulo: `Un link de Claude vence en ${d} ${d === 1 ? 'día' : 'días'}`,
      detalle: 'Renovalo y pegá el nuevo en Claude → Conectores.',
      ruta: '#/ajustes', accion: { texto: 'Renovar', ruta: '#/ajustes' },
    });
  }
  return s;
}
