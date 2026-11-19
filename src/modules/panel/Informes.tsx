import { useState } from 'react';
import { usePerfil } from '../../core/auth';
import { crear, eliminar, modificar } from '../../core/db';
import { hoy } from '../../core/format';
import {
  TABLA_INFORMES, abierto, useInformes, type EstadoInforme, type Informe,
} from '../../core/informes';
import { TD, type Tarea } from '../dia/modelo';
import { confirmar } from '../../ui/Deshacer';
import { TarjetaInforme } from '../../ui/Informar';
import { Modal, Pestanas, Vacio } from '../../ui/ui';
import { nombreCuenta, tomarFiltroCuenta, useCuentas } from './modelo';

type Filtro = 'abiertos' | 'errores' | 'cerrados' | 'todos';

/** Panel → Informes: la bandeja de lo que mandan todas las cuentas, más los errores que la app detectó sola. */
export function PantallaInformes() {
  const yo = usePerfil();
  const { filas, cargado, error } = useInformes();
  const { cuentas } = useCuentas();
  const [filtro, setFiltro] = useState<Filtro>('abiertos');
  const [cuenta, setCuenta] = useState<string | null>(() => tomarFiltroCuenta());
  const [respondiendo, setRespondiendo] = useState<Informe | null>(null);
  const [msg, setMsg] = useState('');

  const quien = (id?: string) => (id === yo.user_id ? 'Vos' : nombreCuenta(cuentas?.find((c) => c.user_id === id)));
  const deCuenta = cuenta ? filas.filter((i) => i.user_id === cuenta) : filas;
  const personas = deCuenta.filter((i) => i.origen === 'persona');
  const errores = deCuenta.filter((i) => i.origen === 'auto');
  const lista = filtro === 'abiertos' ? personas.filter(abierto)
    : filtro === 'cerrados' ? personas.filter((i) => !abierto(i))
    : filtro === 'errores' ? errores : deCuenta;
  // Lo que frena y lo nuevo, arriba.
  const peso = (i: Informe) => (i.estado === 'nuevo' ? 0 : 2) + (i.urgencia === 'frena' ? 0 : i.urgencia === 'molesta' ? 0.5 : 1);
  const ordenada = filtro === 'abiertos' ? [...lista].sort((a, b) => peso(a) - peso(b)) : lista;
  const nuevos = personas.filter((i) => i.estado === 'nuevo').length;

  async function estado(i: Informe, e: EstadoInforme) {
    await modificar<Informe>(TABLA_INFORMES, i.id, { estado: e });
  }

  async function alTablero(i: Informe) {
    const t = await crear<Tarea & { categoria: string; etapa: null }>(TD.tareas, {
      fecha: null, titulo: `${i.tipo === 'problema' ? 'Arreglar' : 'Ver'}: ${i.texto.split('\n')[0].slice(0, 70)}`,
      hecho: false, prioridad: i.urgencia === 'frena' ? 'alta' : i.urgencia === 'molesta' ? 'media' : 'baja',
      nota: `Informe de ${quien(i.user_id)} (${i.created_at?.slice(0, 10) ?? hoy()}): ${i.texto}${i.pantalla ? `\nPantalla: ${i.pantalla}` : ''}`,
      origen: 'app', categoria: 'Ideas de desarrollo', etapa: null,
    });
    await modificar<Informe>(TABLA_INFORMES, i.id, { tarea_id: t.id, estado: 'en_proceso' });
    setMsg('Quedó en tu Tablero, en Ideas de desarrollo.');
  }

  async function borrar(i: Informe) {
    if (await confirmar('¿Borrar este error automático? Si vuelve a pasar, llega de nuevo.', 'Borrar')) await eliminar(TABLA_INFORMES, i.id);
  }

  if (error && !filas.length) return (
    <Vacio titulo="Falta activar los informes en la nube">
      <p>Cuando se aplique <code>supabase/informes.sql</code>, acá llegan los problemas e ideas de todas las cuentas.</p>
    </Vacio>
  );

  return (
    <div className="pila">
      {msg && <p className="aviso-msg" role="status">{msg}</p>}
      <div className="informes-filtros">
        <Pestanas<Filtro> valor={filtro} onCambio={setFiltro} opciones={[
          { id: 'abiertos', nombre: `Para leer${nuevos ? ` (${nuevos} nuevos)` : ''}` },
          { id: 'errores', nombre: `Errores automáticos (${errores.length})` },
          { id: 'cerrados', nombre: 'Resueltos' },
          { id: 'todos', nombre: 'Todo' },
        ]} />
        <select value={cuenta ?? ''} onChange={(e) => setCuenta(e.target.value || null)} aria-label="De qué cuenta">
          <option value="">Todas las cuentas</option>
          {cuentas?.map((c) => <option key={c.user_id} value={c.user_id}>{c.user_id === yo.user_id ? 'Vos' : nombreCuenta(c)}</option>)}
        </select>
      </div>

      {cargado && !ordenada.length && (
        <Vacio titulo={filtro === 'abiertos' ? 'Nada para leer' : 'Nada por acá'}>
          <p>{filtro === 'abiertos' ? 'Cuando alguien toque "! Informar", aparece acá con su pantalla y su aparato.' : 'No hay informes con este filtro.'}</p>
        </Vacio>
      )}

      {ordenada.map((i) => (
        <TarjetaInforme key={i.id} i={i} quien={quien(i.user_id)}>
          <div className="acciones informe-acciones">
            {i.origen === 'persona' ? (
              <>
                {i.estado === 'nuevo' && <button className="btn" onClick={() => void estado(i, 'visto')}>Leído</button>}
                {abierto(i) && !i.tarea_id && <button className="btn" onClick={() => void alTablero(i)}>Pasar al Tablero</button>}
                {i.tarea_id && <a className="btn" href="#/tablero">Ver en el Tablero</a>}
                <button className="btn" onClick={() => setRespondiendo(i)}>{i.respuesta ? 'Cambiar respuesta' : 'Responder'}</button>
                {abierto(i) && <button className="btn btn-confirmar" onClick={() => void estado(i, 'resuelto')}>Resuelto</button>}
                {abierto(i) && <button className="btn" onClick={() => void estado(i, 'descartado')}>Descartar</button>}
                {!abierto(i) && <button className="btn" onClick={() => void estado(i, 'visto')}>Reabrir</button>}
              </>
            ) : (
              <>
                {i.version && <span className="nota">Versión {i.version}</span>}
                {abierto(i) && <button className="btn btn-confirmar" onClick={() => void estado(i, 'resuelto')}>Arreglado</button>}
                <button className="btn" onClick={() => void borrar(i)}>Borrar</button>
              </>
            )}
          </div>
        </TarjetaInforme>
      ))}

      <Modal titulo="Responder" abierto={!!respondiendo} onCerrar={() => setRespondiendo(null)}>
        {respondiendo && <FormRespuesta i={respondiendo} onListo={() => setRespondiendo(null)} />}
      </Modal>
    </div>
  );
}

function FormRespuesta({ i, onListo }: { i: Informe; onListo: () => void }) {
  const [texto, setTexto] = useState(i.respuesta ?? '');
  const [ocupado, setOcupado] = useState(false);
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      setOcupado(true);
      await modificar<Informe>(TABLA_INFORMES, i.id, { respuesta: texto.trim() || null, estado: i.estado === 'nuevo' ? 'visto' : i.estado });
      onListo();
    }}>
      <p className="nota">“{i.texto.slice(0, 200)}”</p>
      <label className="campo">
        <span>Tu respuesta (la ve en Ajustes → Mis informes)</span>
        <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus placeholder="Ej.: ¡Gracias! Ya está arreglado, actualizá la app." />
      </label>
      <button className="btn btn-primario" disabled={ocupado}>Guardar respuesta</button>
    </form>
  );
}
