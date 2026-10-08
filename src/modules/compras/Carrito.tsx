import { useState } from 'react';
import { dinero, parsearMonto, uid } from '../../core/format';
import { ir } from '../../core/router';
import { Campo, Icono, Modal, Tarjeta } from '../../ui/ui';
import { useCategorias, useCuentas } from '../economia/modelo';
import { useProductos } from '../stock/modelo';
import { Escaner } from './Escaner';
import {
  type Carrito, cerrarCarrito, guardarCarrito, identificar, leerCarrito, type LineaCarrito, PERSONAS, type Persona,
  totalesCarrito, useItems, useSupers,
} from './modelo';

const QUIENES = Object.keys(PERSONAS) as Persona[];

function ElegirPara({ valor, onCambio }: { valor: Persona; onCambio: (p: Persona) => void }) {
  return (
    <div className="segmentado" role="radiogroup" aria-label="Para quién">
      {QUIENES.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={valor === p} className={valor === p ? 'activo' : ''} onClick={() => onCambio(p)}>
          {PERSONAS[p]}
        </button>
      ))}
    </div>
  );
}

/** Ficha del producto recién escaneado (o escrito): nombre, para quién, cantidad y precio opcional. */
function FormLinea({ inicial, onListo, onBorrar }: { inicial: LineaCarrito; onListo: (l: LineaCarrito) => void; onBorrar?: () => void }) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [para, setPara] = useState<Persona>(inicial.para);
  const [cantidad, setCantidad] = useState(inicial.cantidad);
  const [precio, setPrecio] = useState(inicial.precio != null ? String(inicial.precio) : '');

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const p = parsearMonto(precio);
    onListo({ ...inicial, nombre: nombre.trim() || inicial.nombre, para, cantidad, precio: Number.isFinite(p) && p > 0 ? p : null });
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta={inicial.ean ? `Producto · código ${inicial.ean}` : 'Producto'}>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="¿Qué es?" autoFocus={!inicial.nombre} />
      </Campo>
      <ElegirPara valor={para} onCambio={setPara} />
      <div className="fila-campos" style={{ alignItems: 'end' }}>
        <Campo etiqueta="Cantidad">
          <div className="fila-derecha">
            <button type="button" className="btn-icono" aria-label="Menos" onClick={() => setCantidad(Math.max(1, cantidad - 1))}>{Icono.menos}</button>
            <span className="num" style={{ minWidth: 32, textAlign: 'center' }}>{cantidad}</span>
            <button type="button" className="btn-icono" aria-label="Más" onClick={() => setCantidad(cantidad + 1)}>{Icono.mas}</button>
          </div>
        </Campo>
        <Campo etiqueta="Precio c/u (opcional)" ayuda={inicial.ref ? `Online ~${dinero(inicial.ref)}` : undefined}>
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$" />
        </Campo>
      </div>
      <button className="btn btn-primario">{onBorrar ? 'Guardar' : 'Agregar al carro'}</button>
      {onBorrar && <button type="button" className="btn btn-peligro ancho" onClick={onBorrar}>{Icono.borrar} Sacar del carro</button>}
    </form>
  );
}

function Cerrar({ carrito, onListo }: { carrito: Carrito; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: productos } = useProductos();
  const { filas: items } = useItems();
  const { filas: supers } = useSupers();
  const t = totalesCarrito(carrito.lineas);
  const [total, setTotal] = useState(t.total ? String(Math.round(t.total)) : '');
  const [pago, setPago] = useState<Persona>('yo');
  const activas = cuentas.filter((c) => !c.archivada);
  const [cuenta, setCuenta] = useState(activas[0]?.id ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cat = categorias.find((c) => c.tipo === 'gasto' && /s[uú]per/i.test(c.nombre)) ?? null;
  const s = supers.find((x) => x.id === carrito.super_id) ?? null;

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      await cerrarCarrito({
        carrito, super: s, items, productos, total: parsearMonto(total) || t.total, pago: pago === 'ulises' ? 'ulises' : 'yo',
        gasto: cuenta ? { cuenta_id: cuenta, categoria_id: cat?.id ?? null } : null,
      });
      onListo();
    } catch (err) { setError((err as Error).message); setGuardando(false); }
  }

  return (
    <form className="form" onSubmit={confirmar}>
      <p className="nota">{carrito.lineas.length} productos{t.sinPrecio ? ` · ${t.sinPrecio} sin precio` : ''}</p>
      <Campo etiqueta="Total del ticket" ayuda="Si no lo tenés, queda la suma de los precios que cargaste">
        <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={dinero(t.total)} />
      </Campo>
      <Campo etiqueta="¿Quién pagó?">
        <div className="segmentado">
          {(['yo', 'ulises'] as Persona[]).map((p) => (
            <button key={p} type="button" className={pago === p ? 'activo' : ''} onClick={() => setPago(p)}>{PERSONAS[p]}</button>
          ))}
        </div>
      </Campo>
      {pago === 'yo' && t.ulises > 0 && <p className="texto-bien">Ulises te debe {dinero(t.ulises)}</p>}
      {pago === 'ulises' && t.yo > 0 && <p className="texto-aviso">Le debés a Ulises {dinero(t.yo)}</p>}
      {pago === 'yo' && activas.length > 0 && (
        <Campo etiqueta="Pagado con" ayuda="Se anota el gasto en Economía">
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            <option value="">No anotar el gasto</option>
            {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}
      <p className="nota">Cada cosa se suma al stock de quien la lleva (Yo, Ulises o Los dos).</p>
      {error && <p className="texto-critico">{error}</p>}
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Cerrar compra'}</button>
    </form>
  );
}

export function PantallaEscanear() {
  const { filas: items } = useItems();
  const { filas: supers } = useSupers();
  const [c, setC] = useState<Carrito>(() => leerCarrito() ?? { super_id: null, inicio: Date.now(), lineas: [], ultimoPara: 'yo' });
  const [camara, setCamara] = useState(false);
  const [nueva, setNueva] = useState<LineaCarrito | null>(null);
  const [editando, setEditando] = useState<LineaCarrito | null>(null);
  const [buscando, setBuscando] = useState('');
  const [escrito, setEscrito] = useState('');
  const [cerrando, setCerrando] = useState(false);

  const cambiar = (n: Carrito) => { guardarCarrito(n); setC(n); };
  const t = totalesCarrito(c.lineas);

  async function alLeer(codigo: string) {
    const ya = c.lineas.find((l) => l.ean === codigo && l.para === c.ultimoPara);
    if (ya) { // Escanear dos veces lo mismo suma uno.
      cambiar({ ...c, lineas: c.lineas.map((l) => (l.id === ya.id ? { ...l, cantidad: l.cantidad + 1 } : l)) });
      setBuscando(`+1 ${ya.nombre}`);
      return;
    }
    setBuscando('Buscando el producto…');
    const base: LineaCarrito = { id: uid(), ean: codigo, nombre: '', marca: '', para: c.ultimoPara, cantidad: 1, precio: null, ref: null };
    setNueva(base);
    const info = await identificar(codigo, items);
    setNueva((n) => (n && n.id === base.id ? { ...n, nombre: info.nombre, marca: info.marca, ref: info.ref } : n));
    setBuscando(info.nombre ? '' : 'No lo encontré: escribí qué es.');
  }

  function agregar(l: LineaCarrito) {
    cambiar({ ...c, lineas: [l, ...c.lineas], ultimoPara: l.para });
    setNueva(null); setBuscando('');
  }

  function porTexto(e: React.FormEvent) {
    e.preventDefault();
    const txt = escrito.trim();
    if (!txt) return;
    setEscrito('');
    if (/^\d{8,14}$/.test(txt)) void alLeer(txt);
    else setNueva({ id: uid(), ean: null, nombre: txt, marca: '', para: c.ultimoPara, cantidad: 1, precio: null, ref: null });
  }

  return (
    <div className="pila">
      <div className="grilla-cifras compacta">
        <div className="cifra"><span className="cifra-etq">Total</span><strong className="cifra-val">{dinero(t.total)}</strong>
          <span className="cifra-nota">{c.lineas.length} cosas{t.sinPrecio ? ` · ${t.sinPrecio} sin precio` : ''}</span></div>
        <div className="cifra"><span className="cifra-etq">Yo / Ulises</span><strong className="cifra-val">{dinero(t.yo)}</strong>
          <span className="cifra-nota">Ulises {dinero(t.ulises)}{t.compartido ? ` · a medias ${dinero(t.compartido)}` : ''}</span></div>
      </div>

      <div className="fila-campos">
        <select value={c.super_id ?? ''} onChange={(e) => cambiar({ ...c, super_id: e.target.value || null })} aria-label="Súper">
          <option value="">Súper sin elegir</option>
          {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className={`btn ${camara ? '' : 'btn-primario'}`} onClick={() => setCamara(!camara)}>{camara ? 'Apagar cámara' : '📷 Escanear'}</button>
      </div>

      {camara && <Escaner onCodigo={alLeer} pausado={!!nueva} />}
      {buscando && <p className="nota">{buscando}</p>}

      {nueva ? (
        <Tarjeta titulo="Nuevo en el carro">
          <FormLinea key={`${nueva.id}-${nueva.nombre}`} inicial={nueva} onListo={agregar} />
          <button className="btn-link" onClick={() => { setNueva(null); setBuscando(''); }}>Descartar</button>
        </Tarjeta>
      ) : (
        <form className="fila-campos" style={{ alignItems: 'end' }} onSubmit={porTexto}>
          <label className="campo"><span>Sin código: escribí el producto (o el número)</span><input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Ej. Bananas" /></label>
          <button className="btn">{Icono.mas}</button>
        </form>
      )}

      {c.lineas.length > 0 && QUIENES.map((p) => {
        const del = c.lineas.filter((l) => l.para === p);
        if (!del.length) return null;
        const sub = del.reduce((s, l) => s + (l.precio ?? 0) * l.cantidad, 0);
        return (
          <Tarjeta key={p} titulo={`${PERSONAS[p]} (${del.length})`} accion={<span className="num">{dinero(sub)}</span>}>
            <ul className="lista">
              {del.map((l) => (
                <li key={l.id} className="lista-item">
                  <button className="boton-fila crece" onClick={() => setEditando(l)}>
                    <div className="crece"><strong>{l.nombre || l.ean}</strong>
                      <small className="nota">{l.cantidad} × {l.precio != null ? dinero(l.precio) : 'sin precio'}{l.marca ? ` · ${l.marca}` : ''}</small></div>
                  </button>
                  <span className="num">{l.precio != null ? dinero(l.precio * l.cantidad) : '—'}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        );
      })}

      <div className="barra-acciones">
        <button className="btn btn-peligro" disabled={!c.lineas.length} onClick={() => {
          if (window.confirm('¿Vaciar el carro? No se guarda nada.')) cambiar({ super_id: c.super_id, inicio: Date.now(), lineas: [], ultimoPara: c.ultimoPara });
        }}>Vaciar</button>
        <button className="btn btn-primario" disabled={!c.lineas.length} onClick={() => { setCamara(false); setCerrando(true); }}>Terminar compra</button>
      </div>

      <Modal titulo="Editar" abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormLinea inicial={editando}
          onListo={(l) => { cambiar({ ...c, lineas: c.lineas.map((x) => (x.id === l.id ? l : x)) }); setEditando(null); }}
          onBorrar={() => { cambiar({ ...c, lineas: c.lineas.filter((x) => x.id !== editando.id) }); setEditando(null); }} />}
      </Modal>
      <Modal titulo="Cerrar compra" abierto={cerrando} onCerrar={() => setCerrando(false)}>
        {cerrando && <Cerrar carrito={c} onListo={() => { setCerrando(false); setC({ super_id: null, inicio: Date.now(), lineas: [], ultimoPara: 'yo' }); ir('compras/historial'); }} />}
      </Modal>
    </div>
  );
}
