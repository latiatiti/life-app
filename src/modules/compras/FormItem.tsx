import { useState } from 'react';
import { eliminar, modificar } from '../../core/db';
import { dinero, hoy } from '../../core/format';
import { Campo, Icono } from '../../ui/ui';
import { useProductos } from '../stock/modelo';
import {
  adivinarBloque, BLOQUES, buscarPrecios, CADENAS, type Cadena, type Item, nuevoItem, type ResultadoPrecio, TC,
} from './modelo';

/** Buscador en Carrefour, Vea y Jumbo. Al elegir un resultado se enlaza el código de barras y se traen los precios de las tres. */
export function BuscarOnline({ inicial, onElegir }: { inicial: string; onElegir: (r: ResultadoPrecio, mismos: ResultadoPrecio[]) => void }) {
  const [q, setQ] = useState(inicial);
  const [res, setRes] = useState<ResultadoPrecio[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function buscar() {
    if (!q.trim()) return;
    setCargando(true); setError('');
    try { setRes(await buscarPrecios({ q: q.trim(), limite: 8 })); } catch (err) { setError((err as Error).message); }
    setCargando(false);
  }

  async function elegir(r: ResultadoPrecio) {
    setCargando(true);
    let mismos: ResultadoPrecio[] = (res ?? []).filter((x) => x.ean === r.ean);
    try { mismos = await buscarPrecios({ eans: [r.ean] }); } catch { /* quedan los que ya tenemos */ }
    setCargando(false);
    onElegir(r, mismos.length ? mismos : [r]);
  }

  return (
    <div className="pila" style={{ gap: 8 }}>
      {/* No es un <form>: va dentro del formulario del producto. */}
      <div className="fila-campos" style={{ alignItems: 'end' }}>
        <Campo etiqueta="Buscar en el súper">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. leche entera serenisima"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }} />
        </Campo>
        <button type="button" className="btn" disabled={cargando} onClick={buscar}>{cargando ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {error && <p className="nota texto-critico">{error}</p>}
      {res && res.length === 0 && <p className="nota">No encontré nada. Probá con menos palabras o con la marca.</p>}
      {res && res.length > 0 && (
        <ul className="lista com-resultados">
          {res.map((r, k) => (
            <li key={`${r.cadena}-${r.ean}-${k}`} className="lista-item">
              {r.imagen && <img src={r.imagen} alt="" width={40} height={40} loading="lazy" className="com-img" />}
              <div className="crece">
                <strong>{r.nombre}</strong>
                <small className="nota">{CADENAS[r.cadena]} · {r.marca}{r.precioLista > r.precio ? ` · oferta (antes ${dinero(r.precioLista)})` : ''}</small>
              </div>
              <span className="num">{dinero(r.precio)}</span>
              <button type="button" className="btn" onClick={() => elegir(r)} disabled={cargando}>Este</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormItem({ inicial, onListo }: { inicial?: Item; onListo: () => void }) {
  const { filas: productos } = useProductos();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [bloque, setBloque] = useState(inicial?.bloque ?? 'Almacén');
  const [unidad, setUnidad] = useState(inicial?.unidad ?? 'u');
  const [productoId, setProductoId] = useState(inicial?.producto_id ?? '');
  const [ean, setEan] = useState(inicial?.ean ?? '');
  const [marca, setMarca] = useState(inicial?.marca ?? '');
  const [precios, setPrecios] = useState(inicial?.precios ?? {});
  const [enLista, setEnLista] = useState(inicial?.en_lista ?? true);
  const [buscando, setBuscando] = useState(!inicial?.ean);

  function elegir(r: ResultadoPrecio, mismos: ResultadoPrecio[]) {
    setEan(r.ean); setMarca(r.marca);
    if (!nombre.trim()) setNombre(r.nombre);
    const nuevos: Item['precios'] = {};
    for (const m of mismos) nuevos[m.cadena as Cadena] = { p: m.precio, l: m.precioLista, n: m.nombre, f: hoy() };
    setPrecios(nuevos);
    setBuscando(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const datos = { nombre: nombre.trim(), bloque, unidad, producto_id: productoId || null, ean: ean || null, marca, precios, en_lista: enLista };
    if (inicial) await modificar<Item>(TC.items, inicial.id, datos);
    else await nuevoItem({ ...datos, cantidad: 1 });
    onListo();
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Producto">
        <input value={nombre} onChange={(e) => { setNombre(e.target.value); if (!inicial) setBloque(adivinarBloque(e.target.value)); }} placeholder="Ej. Leche" />
      </Campo>
      <div className="fila-campos">
        <Campo etiqueta="Bloque / pasillo">
          <select value={bloque} onChange={(e) => setBloque(e.target.value)}>{BLOQUES.map((b) => <option key={b}>{b}</option>)}</select>
        </Campo>
        <Campo etiqueta="Unidad"><input value={unidad} onChange={(e) => setUnidad(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="En casa (Stock)" ayuda="Si lo enlazás, al cerrar la compra se suma solo al stock">
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">Sin enlazar</option>
          {[...productos].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </Campo>
      <div className="tarjeta com-sub">
        <p className="nota">
          {ean ? <>Enlazado a <strong>{marca || 'producto'}</strong> · código {ean}</> : 'Sin precio online todavía: buscalo para comparar.'}
        </p>
        {Object.keys(precios).length > 0 && (
          <div className="com-chips">
            {(Object.keys(CADENAS) as Cadena[]).map((c) => precios[c] && (
              <span key={c} className="chip">{CADENAS[c]} {dinero(precios[c]!.p)}</span>
            ))}
          </div>
        )}
        {buscando ? <BuscarOnline inicial={marca ? `${nombre} ${marca}` : nombre} onElegir={elegir} /> : (
          <button type="button" className="btn-link" onClick={() => setBuscando(true)}>{ean ? 'Cambiar producto' : 'Buscar precio'}</button>
        )}
      </div>
      <label className="lista-item"><input type="checkbox" checked={enLista} onChange={(e) => setEnLista(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} /> En la lista de la próxima compra</label>
      <button className="btn btn-primario">Guardar</button>
      {inicial && (
        <button type="button" className="btn btn-peligro ancho" onClick={async () => {
          if (!window.confirm('¿Borrar este producto del catálogo?')) return;
          await eliminar(TC.items, inicial.id); onListo();
        }}>{Icono.borrar} Borrar</button>
      )}
    </form>
  );
}
