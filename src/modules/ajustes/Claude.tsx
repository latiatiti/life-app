import { confirmar } from '../../ui/Deshacer';
import { useState } from 'react';
import { usePerfil, puedeEscribir } from '../../core/auth';
import { configNube } from '../../core/config';
import { crear, modificar, useTabla, type Fila } from '../../core/db';
import { fechaCorta } from '../../core/format';
import { Tarjeta } from '../../ui/ui';

interface Clave extends Fila {
  nombre: string;
  prefijo: string;
  permiso: 'leer' | 'escribir';
  ultimo_uso: string | null;
  revocada: boolean;
}

interface Registro extends Fila {
  accion: string;
  tabla: string;
  deshecho: boolean;
}

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function claveNueva() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'life_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ACCION: Record<string, string> = { crear: 'Cargó', modificar: 'Cambió', borrar: 'Borró', deshacer: 'Deshizo' };

/** Claves personales para que Claude lea y cargue datos en LIFE (función life-mcp). */
export function ConexionClaude() {
  const perfil = usePerfil();
  const claves = useTabla<Clave>('api_claves');
  const registro = useTabla<Registro>('api_registro');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [permiso, setPermiso] = useState<'leer' | 'escribir'>('escribir');
  const base = configNube()?.url;

  if (!base) return null;

  async function generar() {
    const clave = claveNueva();
    try {
      await crear<Clave & { hash: string }>('api_claves', {
        nombre: 'Claude', hash: await sha256(clave), prefijo: clave.slice(0, 9), permiso, ultimo_uso: null, revocada: false,
      });
      // Desde el sitio de Netlify (proxy /mcp en netlify.toml): en supabase.co Claude pide OAuth y no conecta.
      const sitio = window.location.hostname.endsWith('netlify.app') ? window.location.origin : 'https://life-app-latiatiti.netlify.app';
      setLink(`${sitio}/mcp?k=${clave}`);
      setMsg('');
    } catch (e) {
      setMsg(/api_claves/.test((e as Error).message)
        ? 'Falta activar la conexión en la base de datos (SQL de cuentas).'
        : `No se pudo crear: ${(e as Error).message}`);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setMsg('Link copiado.');
    } catch {
      setMsg('No se pudo copiar solo: mantené apretado el link y copialo.');
    }
  }

  const activas = claves.filas.filter((c) => !c.revocada);
  const ultimos = [...registro.filas].reverse().slice(0, 8);

  return (
    <Tarjeta titulo="Conexión con Claude">
      <p className="nota" style={{ marginTop: 0 }}>
        Con esto Claude puede leer tus datos y cargar lo que le contás (gastos, comidas, entrenos, tareas). Todo lo que cambia queda anotado abajo y se puede deshacer.
      </p>

      {link ? (
        <div className="pila">
          <p><strong>Tu link de conexión</strong> (se muestra una sola vez, guardalo como una contraseña):</p>
          <code className="link-clave">{link}</code>
          <div className="acciones">
            <button className="btn btn-primario" onClick={copiar}>Copiar link</button>
            <button className="btn" onClick={() => setLink('')}>Listo</button>
          </div>
          <ol className="nota pasos">
            <li>En claude.ai abrí <strong>Configuración → Conectores</strong>.</li>
            <li>Tocá <strong>Agregar conector personalizado</strong>, ponele de nombre LIFE y pegá el link.</li>
            <li>En cualquier chat, activá LIFE y contale lo que quieras cargar.</li>
          </ol>
        </div>
      ) : (
        puedeEscribir(perfil) && (
          <div className="acciones">
            <select value={permiso} onChange={(e) => setPermiso(e.target.value as 'leer' | 'escribir')} aria-label="Permiso">
              <option value="escribir">Puede leer y cargar</option>
              <option value="leer">Solo puede leer</option>
            </select>
            <button className="btn btn-primario" onClick={generar}>Crear link para Claude</button>
          </div>
        )
      )}
      {msg && <p className="nota" role="status">{msg}</p>}

      {activas.length > 0 && (
        <ul className="lista-simple">
          {activas.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.prefijo}…</strong> · {c.permiso === 'leer' ? 'solo lee' : 'lee y carga'}
                <small className="nota"> · {c.ultimo_uso ? `usado ${fechaCorta(c.ultimo_uso.slice(0, 10))}` : 'sin usar'}</small>
              </span>
              <button className="btn btn-peligro" onClick={async () => {
                if (await confirmar('¿Cortar este link? Claude deja de tener acceso con él.')) void modificar<Clave>('api_claves', c.id, { revocada: true });
              }}>Cortar</button>
            </li>
          ))}
        </ul>
      )}

      {ultimos.length > 0 && (
        <>
          <p className="nota"><strong>Lo último que hizo Claude</strong></p>
          <ul className="lista-simple">
            {ultimos.map((r) => (
              <li key={r.id}>
                <span>{ACCION[r.accion] ?? r.accion} en {r.tabla}{r.deshecho ? ' (deshecho)' : ''}</span>
                <small className="nota">{r.created_at ? fechaCorta(r.created_at.slice(0, 10)) : ''}</small>
              </li>
            ))}
          </ul>
          <p className="nota">Para deshacer algo, pedíselo a Claude en el chat (“deshacé lo último que cargaste”).</p>
        </>
      )}
    </Tarjeta>
  );
}
