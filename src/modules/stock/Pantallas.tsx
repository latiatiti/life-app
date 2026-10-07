import { useState } from 'react';
import { eliminar, modificar } from '../../core/db';
import { fechaCorta, relativo } from '../../core/format';
import { Campo, Estado, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import {
  aComprar, ajustar, faltantes, LUGARES, nuevoProducto, porVencer, TS, UNIDADES, useProductos,
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
  const n = (t: string) => Number(t.replace(',', '.')) || 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const datos = { nombre: nombre.trim(), lugar, cantidad: n(cantidad), unidad, minimo: n(minimo), compra: n(compra), vence: vence || null, basico };
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
      <label className="lista-item"><input type="checkbox" checked={basico} onChange={(e) => setBasico(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} /> Básico: tiene que estar siempre en casa</label>
      <button className="btn btn-primario">Guardar</button>
      {inicial && (
        <button type="button" className="btn btn-peligro ancho" onClick={async () => {
          if (!window.confirm('¿Borrar este producto?')) return;
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
          <strong>{p.nombre}{p.basico ? ' ★' : ''}</strong>
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
  const grupos = Object.entries(LUGARES).map(([k, v]) => ({ k, v, lista: productos.filter((p) => p.lugar === k).sort((a, b) => a.nombre.localeCompare(b.nombre)) }));
  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">Todo lo que hay en casa, por lugar. Usá + y − cuando agregás o sacás algo.</p>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Producto</button>
      </div>
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

export function PantallaLista() {
  const { filas: productos } = useProductos();
  const lista = faltantes(productos);
  const vencen = porVencer(productos);
  const [tildados, setTildados] = useState<Set<string>>(new Set());

  async function guardarCompra() {
    for (const p of lista.filter((x) => tildados.has(x.id))) await ajustar(p, aComprar(p));
    setTildados(new Set());
  }

  return (
    <div className="pila">
      {lista.length === 0 ? (
        <Vacio titulo="No falta nada"><p>Cuando algo baje del mínimo, aparece acá solo.</p></Vacio>
      ) : (
        <Tarjeta titulo={`Para comprar (${lista.length})`}>
          <ul className="lista">
            {lista.map((p) => (
              <li key={p.id} className="lista-item">
                <label className="crece lista-item" style={{ padding: 0 }}>
                  <input type="checkbox" style={{ width: 'auto', minHeight: 0 }} checked={tildados.has(p.id)}
                    onChange={(e) => { const s = new Set(tildados); if (e.target.checked) s.add(p.id); else s.delete(p.id); setTildados(s); }} />
                  <span className="crece"><strong>{p.nombre}</strong><small className="nota">Hay {Number(p.cantidad)} {p.unidad} · {LUGARES[p.lugar]}</small></span>
                </label>
                <span className="num">{aComprar(p)} {p.unidad}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-primario ancho" style={{ marginTop: 12 }} disabled={!tildados.size} onClick={guardarCompra}>
            Lo compré: sumar al stock ({tildados.size})
          </button>
          <p className="nota" style={{ marginTop: 8 }}>Para ir al súper usá <a href="#/compras">Compras</a>: suma lo que falta a la lista, compara precios y en el modo compra anota el gasto y el stock de una vez.</p>
        </Tarjeta>
      )}
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
    </div>
  );
}
