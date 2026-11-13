import { confirmar } from '../../ui/Deshacer';
import { useState } from 'react';
import { usePerfil, puedeEscribir } from '../../core/auth';
import { configNube } from '../../core/config';
import { crear, modificar, sinDeshacer, useTabla, type Fila } from '../../core/db';
import { claveNueva, DIAS_AVISO, DIAS_ROTAR, diasParaVencer, sha256, venceDe, type Clave } from './claves';
import { fechaCorta } from '../../core/format';
import { Tarjeta } from '../../ui/ui';

interface Registro extends Fila {
  accion: string;
  tabla: string;
  deshecho: boolean;
}

function venceTexto(c: Clave) {
  const d = diasParaVencer(c);
  const v = venceDe(c);
  if (d <= 0) return '⚠ vencido: ya no anda';
  if (d <= DIAS_AVISO) return `⚠ vence en ${d} ${d === 1 ? 'día' : 'días'}`;
  return v ? `vence ${fechaCorta(v.toISOString().slice(0, 10))}` : '';
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
  const [nombre, setNombre] = useState('');
  const base = configNube()?.url;

  if (!base) return null;

  async function generar(como?: { nombre: string; permiso: Clave['permiso'] }) {
    const clave = claveNueva();
    try {
      await crear<Clave & { hash: string }>('api_claves', {
        nombre: como?.nombre ?? (nombre.trim() || 'Claude'), hash: await sha256(clave), prefijo: clave.slice(0, 9),
        permiso: como?.permiso ?? permiso, ultimo_uso: null, revocada: false,
      });
      setLink(`${base}/functions/v1/life-mcp?k=${clave}`);
      setNombre('');
      setMsg('');
    } catch (e) {
      const texto = (e as Error).message;
      if (/5 links activos/.test(texto)) { setMsg('Ya tenés 5 links activos. Cortá alguno que no uses y probá de nuevo.'); return; }
      setMsg(/api_claves/.test(texto)
        ? 'Falta activar la conexión en la base de datos (SQL de cuentas).'
        : `No se pudo crear: ${texto}`);
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
  const porVencer = activas.filter((c) => diasParaVencer(c) <= DIAS_AVISO);
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
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="¿Para qué es? (ej. Claude celu)" aria-label="Nombre del link" maxLength={40} />
            <select value={permiso} onChange={(e) => setPermiso(e.target.value as 'leer' | 'escribir')} aria-label="Permiso">
              <option value="escribir">Puede leer y cargar</option>
              <option value="leer">Solo puede leer</option>
            </select>
            <button className="btn btn-primario" onClick={() => void generar()}>Crear link para Claude</button>
          </div>
        )
      )}
      {msg && <p className="nota" role="status">{msg}</p>}

      {porVencer.length > 0 && !link && (
        <p className="nota" role="alert">
          ⚠ {porVencer.length === 1 ? 'Un link vence' : `${porVencer.length} links vencen`} pronto (cada uno dura {DIAS_ROTAR} días).
          Tocá <strong>Renovar</strong>: te doy uno nuevo para pegar en Claude y después cortás el viejo.
        </p>
      )}
      {activas.length > 0 && (
        <ul className="lista-simple">
          {activas.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.nombre || 'Claude'}</strong> <small className="nota">{c.prefijo}…</small> · {c.permiso === 'leer' ? 'solo lee' : 'lee y carga'}
                <small className="nota">
                  {c.created_at ? ` · creado ${fechaCorta(c.created_at.slice(0, 10))}` : ''}
                  {' · '}{c.ultimo_uso ? `usado ${fechaCorta(c.ultimo_uso.slice(0, 10))}` : 'sin usar'}
                  {' · '}{venceTexto(c)}
                </small>
              </span>
              <span className="acciones">
                {puedeEscribir(perfil) && diasParaVencer(c) <= DIAS_AVISO && (
                  <button className="btn btn-primario" onClick={() => void generar({ nombre: c.nombre || 'Claude', permiso: c.permiso })}>Renovar</button>
                )}
                <button className="btn btn-peligro" onClick={async () => {
                  if (!await confirmar('¿Cortar este link? Claude deja de entrar con él y no se puede volver a activar (después creás otro si hace falta).')) return;
                  await modificar<Clave>('api_claves', c.id, { revocada: true });
                  sinDeshacer();
                }}>Cortar</button>
              </span>
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
