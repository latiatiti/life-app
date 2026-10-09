import { useState } from 'react';
import { dinero, fechaCorta, parsearMonto, uid } from '../../core/format';
import { ir } from '../../core/router';
import { Campo, Icono, Modal, Tarjeta } from '../../ui/ui';
import { useCategorias, useCuentas } from '../economia/modelo';
import { faltantes, useProductos } from '../stock/modelo';
import { Escaner } from './Escaner';
import {
  type Carrito, cerrarCarrito, faltaAgarrar, guardarCarrito, identificar, type Item, itemDeLinea, leerCarrito, leerQrTicket,
  type LineaCarrito, numeroTicket, PERSONAS, type Persona, type PrecioReg, type TicketQR, totalesCarrito, ultimoTicket, useItems,
  usePrecios, useSupers,
} from './modelo';

const QUIENES = Object.keys(PERSONAS) as Persona[];
const vacio = (super_id: string | null = null, ultimoPara: Persona = 'yo'): Carrito => ({ super_id, inicio: Date.now(), lineas: [], ultimoPara });

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

/** Flecha de suba o baja contra el último ticket. */
function Cambio({ ahora, antes }: { ahora: number; antes: number }) {
  if (!antes || !ahora || Math.abs(ahora - antes) / antes <= 0.01) return null;
  const pct = Math.round((ahora / antes - 1) * 100);
  return <span className={pct > 0 ? 'com-sube' : 'com-baja'}>{pct > 0 ? `▲ ${pct} %` : `▼ ${-pct} %`}</span>;
}

/** Ventana del producto recién escaneado (o escrito): qué es, para quién, cuántos y precio opcional. */
function FormLinea({ inicial, buscando, enCarro, ultimo, onListo, onBorrar }: {
  inicial: LineaCarrito; buscando?: boolean; enCarro?: number; ultimo?: PrecioReg | null;
  onListo: (l: LineaCarrito) => void; onBorrar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [para, setPara] = useState<Persona>(inicial.para);
  const [cantidad, setCantidad] = useState(inicial.cantidad);
  const [precio, setPrecio] = useState(inicial.precio != null ? String(inicial.precio) : '');
  const p = parsearMonto(precio);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    onListo({ ...inicial, nombre: nombre.trim() || inicial.nombre, para, cantidad, precio: Number.isFinite(p) && p > 0 ? p : null });
  }

  return (
    <form className="form" onSubmit={guardar}>
      <div className="com-ficha">
        {inicial.imagen && <img className="com-img" src={inicial.imagen} alt="" />}
        <div className="crece">
          {buscando ? <strong>Buscando el producto…</strong> : (
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="No lo encontré: ¿qué es?" autoFocus={!inicial.nombre} aria-label="Producto" />
          )}
          <small className="nota">
            {[inicial.marca, inicial.ean ? `código ${inicial.ean}` : ''].filter(Boolean).join(' · ')}
          </small>
        </div>
      </div>
      {(ultimo || inicial.ref || enCarro) ? (
        <p className="nota">
          {ultimo && <>La última vez pagaste <strong>{dinero(Number(ultimo.precio))}</strong> ({fechaCorta(ultimo.fecha)}). </>}
          {inicial.ref ? <>Online ~{dinero(inicial.ref)}. </> : null}
          {enCarro ? <span className="texto-aviso">Ya tenés {enCarro} en el carro: se suman.</span> : null}
        </p>
      ) : null}
      <ElegirPara valor={para} onCambio={setPara} />
      <div className="fila-campos" style={{ alignItems: 'end' }}>
        <Campo etiqueta="Cantidad">
          <div className="fila-derecha">
            <button type="button" className="btn-icono" aria-label="Menos" onClick={() => setCantidad(Math.max(1, cantidad - 1))}>{Icono.menos}</button>
            <span className="num" style={{ minWidth: 32, textAlign: 'center', fontSize: '1.2rem' }}>{cantidad}</span>
            <button type="button" className="btn-icono" aria-label="Más" onClick={() => setCantidad(cantidad + 1)}>{Icono.mas}</button>
          </div>
        </Campo>
        <Campo etiqueta="Precio c/u (opcional)">
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$" />
        </Campo>
      </div>
      {ultimo && p > 0 && <p className="nota"><Cambio ahora={p} antes={Number(ultimo.precio)} /></p>}
      <button className="btn btn-primario" disabled={buscando}>{onBorrar ? 'Guardar' : `Agregar ${cantidad > 1 ? `${cantidad} ` : ''}al carro`}</button>
      {onBorrar && <button type="button" className="btn btn-peligro ancho" onClick={onBorrar}>{Icono.borrar} Sacar del carro</button>}
    </form>
  );
}

/** Cierre: QR del ticket (total y fecha), precio de cada cosa mirando el ticket, quién pagó. */
function Cerrar({ carrito, onCambio, onListo }: { carrito: Carrito; onCambio: (c: Carrito) => void; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: productos } = useProductos();
  const { filas: items } = useItems();
  const { filas: supers } = useSupers();
  const { filas: precios } = usePrecios();
  const t = totalesCarrito(carrito.lineas);
  const [ticket, setTicket] = useState<TicketQR | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoQr, setAvisoQr] = useState('');
  const [total, setTotal] = useState(t.total ? String(Math.round(t.total)) : '');
  const [pago, setPago] = useState<Persona>('yo');
  const activas = cuentas.filter((c) => !c.archivada);
  const [cuenta, setCuenta] = useState(activas[0]?.id ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cat = categorias.find((c) => c.tipo === 'gasto' && /s[uú]per/i.test(c.nombre)) ?? null;
  const s = supers.find((x) => x.id === carrito.super_id) ?? null;
  const totalTicket = parsearMonto(total) || 0;
  const falta = totalTicket - t.total;

  function alLeerQr(texto: string) {
    const q = leerQrTicket(texto);
    if (!q) { setAvisoQr('Ese QR no es el de un ticket fiscal. Probá de nuevo o escribí el total.'); return; }
    setTicket(q); setTotal(String(q.importe)); setLeyendo(false); setAvisoQr('');
  }

  function ponerPrecio(id: string, v: string) {
    const p = parsearMonto(v);
    onCambio({ ...carrito, lineas: carrito.lineas.map((l) => (l.id === id ? { ...l, precio: Number.isFinite(p) && p > 0 ? p : null } : l)) });
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      await cerrarCarrito({
        carrito, super: s, items, productos, total: totalTicket || t.total, pago: pago === 'ulises' ? 'ulises' : 'yo',
        gasto: cuenta ? { cuenta_id: cuenta, categoria_id: cat?.id ?? null } : null, ticket,
      });
      onListo();
    } catch (err) { setError((err as Error).message); setGuardando(false); }
  }

  return (
    <form className="form" onSubmit={confirmar}>
      <Tarjeta titulo="1. El ticket">
        {leyendo ? (
          <>
            <Escaner qr onCodigo={alLeerQr} pausado={false} />
            {avisoQr && <p className="nota texto-critico">{avisoQr}</p>}
            <button type="button" className="btn-link" onClick={() => setLeyendo(false)}>Cancelar</button>
          </>
        ) : ticket ? (
          <p className="nota">Ticket {numeroTicket(ticket)} · {fechaCorta(ticket.fecha)} · total <strong>{dinero(ticket.importe)}</strong></p>
        ) : (
          <button type="button" className="btn ancho" onClick={() => setLeyendo(true)}>📷 Escanear el QR del ticket</button>
        )}
        <Campo etiqueta="Total del ticket" ayuda="El QR trae el total y la fecha; el detalle de cada producto no viene en el QR.">
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={dinero(t.total)} />
        </Campo>
      </Tarjeta>

      <Tarjeta titulo="2. Precio de cada cosa" accion={<span className="num">{dinero(t.total)}</span>}>
        <p className="nota">Mirando el ticket, poné el precio por unidad. Las flechas te muestran si subió o bajó desde la última vez.</p>
        {carrito.lineas.map((l) => {
          const it = itemDeLinea(l, items);
          const ult = it ? ultimoTicket(precios, it.id) : null;
          return (
            <div key={l.id} className="com-asignar">
              <div>
                <strong>{l.cantidad > 1 ? `${l.cantidad} × ` : ''}{l.nombre || l.ean}</strong>
                <small className="nota" style={{ display: 'block' }}>
                  {PERSONAS[l.para]}{ult ? ` · antes ${dinero(Number(ult.precio))} ` : ''}
                  {ult && l.precio != null && <Cambio ahora={l.precio} antes={Number(ult.precio)} />}
                </small>
              </div>
              <input inputMode="decimal" aria-label={`Precio de ${l.nombre}`} defaultValue={l.precio ?? ''} placeholder="$"
                onBlur={(e) => ponerPrecio(l.id, e.target.value)} />
            </div>
          );
        })}
        {totalTicket > 0 && Math.abs(falta) >= 1 && (
          <p className={falta > 0 ? 'texto-aviso' : 'texto-critico'}>
            {falta > 0 ? `Faltan ${dinero(falta)} para llegar al ticket` : `Te pasaste ${dinero(-falta)} del ticket`}{t.sinPrecio ? ` (${t.sinPrecio} sin precio)` : ''}.
          </p>
        )}
        {totalTicket > 0 && Math.abs(falta) < 1 && <p className="texto-bien">Cierra justo con el ticket.</p>}
      </Tarjeta>

      <Tarjeta titulo="3. ¿Quién pagó?">
        <div className="segmentado">
          {(['yo', 'ulises'] as Persona[]).map((p) => (
            <button key={p} type="button" className={pago === p ? 'activo' : ''} onClick={() => setPago(p)}>{PERSONAS[p]}</button>
          ))}
        </div>
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
      </Tarjeta>
      <p className="nota">Cada cosa se suma al stock de quien la lleva y su precio queda guardado para comparar la próxima vez.</p>
      {error && <p className="texto-critico">{error}</p>}
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Cerrar compra'}</button>
    </form>
  );
}

export function PantallaEscanear() {
  const { filas: items } = useItems();
  const { filas: supers } = useSupers();
  const { filas: precios } = usePrecios();
  const { filas: productos } = useProductos();
  const [c, setC] = useState<Carrito>(() => leerCarrito() ?? vacio());
  const [camara, setCamara] = useState(false);
  const [nueva, setNueva] = useState<LineaCarrito | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [editando, setEditando] = useState<LineaCarrito | null>(null);
  const [escrito, setEscrito] = useState('');
  const [verFalta, setVerFalta] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const cambiar = (n: Carrito) => { guardarCarrito(n); setC(n); };
  const t = totalesCarrito(c.lineas);
  const unidades = c.lineas.reduce((s, l) => s + l.cantidad, 0);
  const falta = faltaAgarrar(items, faltantes(productos), c.lineas);
  const ultimoDe = (l: Pick<LineaCarrito, 'ean' | 'nombre'>) => {
    const it = itemDeLinea(l, items);
    return it ? ultimoTicket(precios, it.id, c.super_id ? { super_id: c.super_id } : undefined) ?? ultimoTicket(precios, it.id) : null;
  };
  const enCarro = (l: LineaCarrito) => c.lineas.filter((x) => x.para === l.para && ((l.ean && x.ean === l.ean) || (!l.ean && x.nombre.toLowerCase() === l.nombre.toLowerCase()))).reduce((s, x) => s + x.cantidad, 0);

  async function alLeer(codigo: string) {
    if (nueva) return;
    const base: LineaCarrito = { id: uid(), ean: codigo, nombre: '', marca: '', para: c.ultimoPara, cantidad: 1, precio: null, ref: null };
    setNueva(base); setBuscando(true);
    const info = await identificar(codigo, items);
    setNueva((n) => (n && n.id === base.id ? { ...n, nombre: info.nombre, marca: info.marca, ref: info.ref, imagen: info.imagen || undefined } : n));
    setBuscando(false);
  }

  function nuevaPorNombre(nombre: string, ean: string | null = null) {
    setNueva({ id: uid(), ean, nombre, marca: '', para: c.ultimoPara, cantidad: 1, precio: null, ref: null });
  }

  /** Agrega al carro; si ya estaba lo mismo para la misma persona, suma la cantidad. */
  function agregar(l: LineaCarrito) {
    const ya = c.lineas.find((x) => x.para === l.para && ((l.ean && x.ean === l.ean) || (!l.ean && x.nombre.toLowerCase() === l.nombre.toLowerCase())));
    const lineas = ya
      ? c.lineas.map((x) => (x.id === ya.id ? { ...x, cantidad: x.cantidad + l.cantidad, precio: l.precio ?? x.precio } : x))
      : [l, ...c.lineas];
    cambiar({ ...c, lineas, ultimoPara: l.para });
    setNueva(null);
  }

  function porTexto(e: React.FormEvent) {
    e.preventDefault();
    const txt = escrito.trim();
    if (!txt) return;
    setEscrito('');
    if (/^\d{8,14}$/.test(txt)) void alLeer(txt);
    else nuevaPorNombre(txt);
  }

  return (
    <div className="pila">
      <div className="com-tablero">
        <div className="cifra"><span className="cifra-etq">Gastado</span><strong className="cifra-val">{dinero(t.total)}</strong>
          {t.sinPrecio > 0 && <span className="cifra-nota">{t.sinPrecio} sin precio</span>}</div>
        <div className="cifra"><span className="cifra-etq">En el carro</span><strong className="cifra-val">{unidades}</strong>
          <span className="cifra-nota">{c.lineas.length} productos</span></div>
        <button type="button" className="cifra" onClick={() => setVerFalta(!verFalta)} aria-expanded={verFalta}>
          <span className="cifra-etq">Te falta</span><strong className={`cifra-val ${falta.some((f) => f.basico) ? 'texto-aviso' : ''}`}>{falta.length}</strong>
          <span className="cifra-nota">{verFalta ? 'ocultar' : 'ver'}</span>
        </button>
      </div>

      {verFalta && (
        <Tarjeta titulo={falta.length ? `Te falta agarrar (${falta.length})` : 'No te falta nada de la lista'}>
          {falta.length > 0 ? (
            <ul className="lista">
              {falta.map((f) => (
                <li key={f.nombre} className="lista-item">
                  <span className="crece"><strong>{f.nombre}</strong>{f.basico && <span className="com-falta-basico"> · básico</span>}</span>
                  <button className="btn-icono" aria-label={`Agregar ${f.nombre}`} onClick={() => nuevaPorNombre(f.nombre, f.ean)}>{Icono.mas}</button>
                </li>
              ))}
            </ul>
          ) : <p className="nota">Sale de tu lista de compras y de lo que falta en casa (lo tuyo y lo de los dos).</p>}
        </Tarjeta>
      )}

      <div className="fila-campos">
        <select value={c.super_id ?? ''} onChange={(e) => cambiar({ ...c, super_id: e.target.value || null })} aria-label="Súper">
          <option value="">Súper sin elegir</option>
          {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className={`btn ${camara ? '' : 'btn-primario'}`} onClick={() => setCamara(!camara)}>{camara ? 'Apagar cámara' : '📷 Escanear'}</button>
      </div>

      {camara && <Escaner onCodigo={alLeer} pausado={!!nueva} aviso="Confirmá el producto" />}

      <form className="fila-campos" style={{ alignItems: 'end' }} onSubmit={porTexto}>
        <label className="campo"><span>Sin código: escribí el producto (o el número)</span><input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Ej. Bananas" /></label>
        <button className="btn" aria-label="Agregar">{Icono.mas}</button>
      </form>

      {c.lineas.length > 0 && QUIENES.map((p) => {
        const del = c.lineas.filter((l) => l.para === p);
        if (!del.length) return null;
        const sub = del.reduce((s, l) => s + (l.precio ?? 0) * l.cantidad, 0);
        return (
          <Tarjeta key={p} titulo={`${PERSONAS[p]} (${del.length})`} accion={<span className="num">{dinero(sub)}</span>}>
            <ul className="lista">
              {del.map((l) => {
                const ult = ultimoDe(l);
                return (
                  <li key={l.id} className="lista-item">
                    <button className="boton-fila crece" onClick={() => setEditando(l)}>
                      <div className="crece"><strong>{l.nombre || l.ean}</strong>
                        <small className="nota">{l.cantidad} × {l.precio != null ? dinero(l.precio) : 'sin precio'}{l.marca ? ` · ${l.marca}` : ''} {ult && l.precio != null && <Cambio ahora={l.precio} antes={Number(ult.precio)} />}</small></div>
                    </button>
                    <span className="num">{l.precio != null ? dinero(l.precio * l.cantidad) : '—'}</span>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        );
      })}
      {c.lineas.length > 0 && (t.ulises > 0 || t.compartido > 0) && (
        <p className="nota">Tuyo {dinero(t.yo)} · Ulises {dinero(t.ulises)}{t.compartido ? ` (lo de los dos va a medias: ${dinero(t.compartido)})` : ''}</p>
      )}

      <div className="barra-acciones">
        <button className="btn btn-peligro" disabled={!c.lineas.length} onClick={() => {
          if (window.confirm('¿Vaciar el carro? No se guarda nada.')) cambiar(vacio(c.super_id, c.ultimoPara));
        }}>Vaciar</button>
        <button className="btn btn-primario" disabled={!c.lineas.length} onClick={() => { setCamara(false); setCerrando(true); }}>Terminar compra</button>
      </div>

      <Modal titulo={nueva?.ean ? 'Escaneado' : 'Agregar'} abierto={!!nueva} onCerrar={() => { setNueva(null); setBuscando(false); }}>
        {nueva && <FormLinea key={`${nueva.id}-${buscando}`} inicial={nueva} buscando={buscando} enCarro={enCarro(nueva)} ultimo={ultimoDe(nueva)} onListo={agregar} />}
      </Modal>
      <Modal titulo="Editar" abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormLinea inicial={editando} ultimo={ultimoDe(editando)}
          onListo={(l) => { cambiar({ ...c, lineas: c.lineas.map((x) => (x.id === l.id ? l : x)) }); setEditando(null); }}
          onBorrar={() => { cambiar({ ...c, lineas: c.lineas.filter((x) => x.id !== editando.id) }); setEditando(null); }} />}
      </Modal>
      <Modal titulo="Terminar compra" abierto={cerrando} onCerrar={() => setCerrando(false)}>
        {cerrando && <Cerrar carrito={c} onCambio={cambiar} onListo={() => { setCerrando(false); setC(vacio()); ir('compras/historial'); }} />}
      </Modal>
    </div>
  );
}

export type { Item };
