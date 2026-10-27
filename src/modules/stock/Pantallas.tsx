import { confirmar } from '../../ui/Deshacer';
import { useState } from 'react';
import { eliminar, modificar } from '../../core/db';
import { fechaCorta, relativo } from '../../core/format';
import { Campo, Estado, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import {
  ajustar, LUGARES, nuevoProducto, PERSONAS, personaDe, porVencer, TS, UNIDADES, useProductos,
  type Persona,
  type Lugar, type Producto, type Unidad,
} from './modelo';

function FormProducto({ inicial, onListo }: { inicial?: Producto; onListo: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [lugar, setLugar] = useState<Lugar>(inicial?.lugar ?? 'alacena');
  const [cantidad, setCantidad] = useState(String(inicial?.cantidad ?? ''));
  const [unidad, setUnidad] = useState<Unidad>(inicial?.unidad ?? 'u');
  const [minimo, setMinimo] = useState(String(inicial?.minimo ?? ''));
  const [compra, setCompra] = useState(String(inicial?.compra ?? ''));
  const [vence, setVence] = useState(inicial?.vence ?? '');
  const [basico, setBasico] = useState(inicial?.basico ?? false);
  const [persona, setPersona] = useState<Persona>(inicial ? personaDe(inicial) : 'yo');
  const n = (t: string) => Number(t.replace(',', '.')) || 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const datos = { nombre: nombre.trim(), lugar, cantidad: n(cantidad), unidad, minimo: n(minimo), compra: n(compra), vence: vence || null, basico, persona };
    if (inicial) await modificar<Producto>(TS.productos, inicial.id, datos);
    else await nuevoProducto(datos);
    onListo();
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Producto"><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Huevos" /></Campo>
      <div className="fila-campos">
        <Campo etiqueta="Dónde está">
          <select value={lugar} onChange={(e) => setLugar(e.target.value as Lugar)}>
            {Object.entries(LUGARES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Unidad">
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select>
        </Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Cantidad que hay"><input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></Campo>
        <Campo etiqueta="Mínimo" ayuda="Debajo de esto va a la lista"><input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} /></Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Compra habitual" ayuda="Cuánto comprás de una vez"><input inputMode="decimal" value={compra} onChange={(e) => setCompra(e.target.value)} /></Campo>
        <Campo etiqueta="Vence"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="De quién">
        <select value={persona} onChange={(e) => setPersona(e.target.value as Persona)}>
          {Object.entries(PERSONAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Campo>
      <label className="lista-item"><input type="checkbox" checked={basico} onChange={(e) => setBasico(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} /> Básico: tiene que estar siempre en casa</label>
      <button className="btn btn-primario">Guardar</button>
      {inicial && (
        <button type="button" className="btn btn-peligro ancho" onClick={async () => {
          if (!await confirmar('¿Borrar este producto?')) return;
          await eliminar(TS.productos, inicial.id); onListo();
        }}>{Icono.borrar} Borrar</button>
      )}
    </form>
  );
}

const paso = (p: Producto) => (p.unidad === 'g' || p.unidad === 'ml' ? 100 : p.unidad === 'kg' || p.unidad === 'l' ? 0.5 : 1);

function FilaProducto({ p, onEditar }: { p: Producto; onEditar: () => void }) {
  const falta = Number(p.cantidad) < Number(p.minimo) || (p.basico && Number(p.cantidad) <= 0);
  return (
    <li className="lista-item">
      <button className="boton-fila crece" onClick={onEditar}>
        <div className="crece">
          <strong>{p.nombre}{p.basico ? ' ★' : ''}{personaDe(p) !== 'yo' ? ` · ${PERSONAS[personaDe(p)]}` : ''}</strong>
          <small className="nota">{p.vence ? `Vence ${fechaCorta(p.vence)} (${relativo(p.vence)})` : `Mínimo ${p.minimo} ${p.unidad}`}</small>
        </div>
      </button>
      {falta && <Estado nivel="aviso" texto="Falta" />}
      <div className="fila-derecha">
        <button className="btn-icono" aria-label="Menos" onClick={() => ajustar(p, -paso(p))}>{Icono.menos}</button>
        <span className="num" style={{ minWidth: 56, textAlign: 'center' }}>{Number(p.cantidad)} {p.unidad}</span>
        <button className="btn-icono" aria-label="Más" onClick={() => ajustar(p, paso(p))}>{Icono.mas}</button>
      </div>
    </li>
  );
}

export function PantallaStock() {
  const { filas: productos, cargado } = useProductos();
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null);
  const [quien, setQuien] = useState<Persona | 'todos'>('todos');
  const hayUlises = productos.some((p) => personaDe(p) !== 'yo');
  const visibles = quien === 'todos' ? productos : productos.filter((p) => personaDe(p) === quien);
  const vencen = porVencer(productos);
  const grupos = Object.entries(LUGARES).map(([k, v]) => ({ k, v, lista: visibles.filter((p) => p.lugar === k).sort((a, b) => a.nombre.localeCompare(b.nombre)) }));
  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">Todo lo que hay en casa, por lugar. Usá + y − cuando agregás o sacás algo.</p>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Producto</button>
      </div>
      {hayUlises && (
        <div className="segmentado" role="tablist" aria-label="De quién">
          {(['todos', ...Object.keys(PERSONAS)] as Array<Persona | 'todos'>).map((k) => (
            <button key={k} className={quien === k ? 'activo' : ''} onClick={() => setQuien(k)}>{k === 'todos' ? 'Todo' : PERSONAS[k]}</button>
          ))}
        </div>
      )}
      {/* Antes estaba en la pestaña "Lista de compras" de Stock: la lista ahora es una sola, en Casa → Lista. */}
      {vencen.length > 0 && (
        <Tarjeta titulo="Usalo pronto">
          <ul className="lista">
            {vencen.map((p) => (
              <li key={p.id} className="lista-item">
                <div className="crece"><strong>{p.nombre}</strong><small className="nota">Vence {fechaCorta(p.vence!)} ({relativo(p.vence!)})</small></div>
                <span className="num">{Number(p.cantidad)} {p.unidad}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
      {cargado && productos.length === 0 && (
        <Vacio titulo="Tu casa está vacía (en la app)">
          <p>Cargá tus básicos desde Ajustes → Cargar mi configuración, o agregá productos a mano.</p>
        </Vacio>
      )}
      {grupos.filter((g) => g.lista.length).map((g) => (
        <Tarjeta key={g.k} titulo={`${g.v} (${g.lista.length})`}>
          <ul className="lista">{g.lista.map((p) => <FilaProducto key={p.id} p={p} onEditar={() => setEditando(p)} />)}</ul>
        </Tarjeta>
      ))}
      <Modal titulo={editando === 'nuevo' ? 'Nuevo producto' : 'Editar producto'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormProducto inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
    </div>
  );
}
