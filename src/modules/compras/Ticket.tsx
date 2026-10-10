import { useEffect, useState } from 'react';
import { eliminar } from '../../core/db';
import { dinero, fechaCorta, parsearMonto, uid } from '../../core/format';
import { Campo, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { useCategorias, useCuentas } from '../economia/modelo';
import { useProductos } from '../stock/modelo';
import { Escaner } from './Escaner';
import { cerrarCarrito, type LineaCarrito, numeroTicket, PERSONAS, type Persona, useItems, useSupers } from './modelo';
import {
  bajarTicket, cambiarTicket, clasificarQr, imagenDe, type ItemTicket, leerFotos, leerProductos, leerTotal, nuevoTicket,
  repartoTicket, type Ticket, useTickets,
} from './ticket';

const QUIENES = Object.keys(PERSONAS) as Persona[];

/** Cargar fotos del ticket (una o varias si es largo) y leerlas. */
function BotonFoto({ texto, onTexto }: { texto: string; onTexto: (t: string) => void }) {
  const [estado, setEstado] = useState('');
  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const fotos = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!fotos.length) return;
    try { onTexto(await leerFotos(fotos, setEstado)); setEstado(''); } catch (err) { setEstado(`No pude leer la foto: ${(err as Error).message}`); }
  }
  return (
    <>
      <label className="btn ancho" style={{ textAlign: 'center' }}>
        {texto}
        <input type="file" accept="image/*" multiple hidden onChange={elegir} />
      </label>
      {estado && <p className="nota">{estado}</p>}
    </>
  );
}

/** Un producto por vez: foto, nombre, cantidad y precio, y de quién es. */
function UnoAUno({ t, onCambio, onListo }: { t: Ticket; onCambio: (items: ItemTicket[]) => void; onListo: () => void }) {
  const items = t.items;
  const primero = items.findIndex((i) => !i.para);
  const [i, setI] = useState(primero < 0 ? 0 : primero);
  const it = items[i];

  useEffect(() => { // Busca la foto del producto una sola vez y la guarda.
    if (!it || it.imagen !== undefined) return;
    let vivo = true;
    void imagenDe(it).then((img) => { if (vivo) onCambio(items.map((x) => (x.id === it.id ? { ...x, imagen: img } : x))); });
    return () => { vivo = false; };
  }, [it?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!it) return <Vacio titulo="No hay productos"><p className="nota">Agregá una foto del ticket o cargalos a mano.</p></Vacio>;
  const cambiar = (d: Partial<ItemTicket>) => onCambio(items.map((x) => (x.id === it.id ? { ...x, ...d } : x)));

  function asignar(p: Persona) {
    const nuevos = items.map((x) => (x.id === it.id ? { ...x, para: p } : x));
    onCambio(nuevos);
    const sig = nuevos.findIndex((x, k) => k > i && !x.para);
    const cualquiera = nuevos.findIndex((x) => !x.para);
    if (sig >= 0) setI(sig);
    else if (cualquiera >= 0) setI(cualquiera);
    else onListo();
  }

  const hechos = items.filter((x) => x.para).length;
  return (
    <div className="pila">
      <div className="barra-xp" aria-label={`${hechos} de ${items.length}`}><div style={{ width: `${(hechos / items.length) * 100}%` }} /></div>
      <p className="nota">Producto {i + 1} de {items.length} · repartidos {hechos}</p>
      <div className="tarjeta com-uno">
        {it.imagen ? <img className="com-img" src={it.imagen} alt="" width={140} height={140} /> : <div className="com-sin-img">🛒</div>}
        <input className="com-uno-nombre" value={it.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} aria-label="Nombre" />
        <div className="fila-campos" style={{ alignItems: 'end' }}>
          {it.peso ? (
            <Campo etiqueta="Peso"><span className="num">{String(it.peso).replace('.', ',')} kg</span></Campo>
          ) : (
            <Campo etiqueta="Cantidad">
              <div className="fila-derecha">
                <button type="button" className="btn-icono" aria-label="Menos" onClick={() => cambiar({ cantidad: Math.max(1, it.cantidad - 1), total: it.precio * Math.max(1, it.cantidad - 1) })}>{Icono.menos}</button>
                <span className="num" style={{ minWidth: 28, textAlign: 'center' }}>{it.cantidad}</span>
                <button type="button" className="btn-icono" aria-label="Más" onClick={() => cambiar({ cantidad: it.cantidad + 1, total: it.precio * (it.cantidad + 1) })}>{Icono.mas}</button>
              </div>
            </Campo>
          )}
          <Campo etiqueta={it.peso ? 'Total' : 'Precio c/u'}>
            <input inputMode="decimal" key={`${it.id}-p`} defaultValue={it.precio}
              onBlur={(e) => { const p = parsearMonto(e.target.value); if (p > 0) cambiar({ precio: p, total: it.peso ? p : p * it.cantidad }); }} />
          </Campo>
        </div>
        <p className="cifra-val num">{dinero(it.total)}</p>
        {it.para && <p className="nota">Ahora: {PERSONAS[it.para]}</p>}
      </div>
      <p className="nota" style={{ textAlign: 'center' }}>¿De quién es?</p>
      <div className="com-quien">
        {QUIENES.map((p) => <button key={p} className={`btn ${it.para === p ? 'btn-primario' : ''}`} onClick={() => asignar(p)}>{PERSONAS[p]}</button>)}
      </div>
      <div className="barra-acciones">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Anterior</button>
        <button className="btn-link" onClick={() => { onCambio(items.filter((x) => x.id !== it.id)); setI(Math.max(0, Math.min(i, items.length - 2))); }}>No es un producto</button>
        <button className="btn" disabled={i >= items.length - 1} onClick={() => setI(i + 1)}>Siguiente →</button>
      </div>
      {hechos === items.length && <button className="btn btn-primario" onClick={onListo}>Ver la cuenta</button>}
    </div>
  );
}

/** La cuenta: cuánto es de cada uno, quién pagó, y guardar como compra (stock + gasto + precios). */
function Cuenta({ t, onCerrado }: { t: Ticket; onCerrado: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: productos } = useProductos();
  const { filas: items } = useItems();
  const { filas: supers } = useSupers();
  const r = repartoTicket(t.items);
  const [superId, setSuperId] = useState(t.super_id ?? '');
  const [pago, setPago] = useState<Persona>('yo');
  const activas = cuentas.filter((c) => !c.archivada);
  const [cuenta, setCuenta] = useState(activas[0]?.id ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const totalTicket = Number(t.total ?? t.fiscal?.importe ?? 0) || r.total;
  const debe = pago === 'yo' ? r.ulises : r.yo;

  async function cerrar() {
    setGuardando(true); setError('');
    try {
      const lineas: LineaCarrito[] = t.items.map((x) => ({
        id: x.id, ean: x.ean, nombre: x.peso ? `${x.nombre}` : x.nombre, marca: '', para: x.para ?? 'yo',
        cantidad: x.peso ? 1 : x.cantidad, precio: x.peso ? x.total : x.precio, ref: null,
      }));
      const s = supers.find((x) => x.id === superId) ?? null;
      const cat = categorias.find((c) => c.tipo === 'gasto' && /s[uú]per/i.test(c.nombre)) ?? null;
      const compra = await cerrarCarrito({
        carrito: { super_id: s?.id ?? null, inicio: Date.now(), lineas, ultimoPara: 'yo' }, super: s, items, productos,
        total: totalTicket, pago: pago === 'ulises' ? 'ulises' : 'yo', gasto: cuenta ? { cuenta_id: cuenta, categoria_id: cat?.id ?? null } : null,
        ticket: t.fiscal, vaciarCarro: false, fecha: t.fecha,
      });
      await cambiarTicket(t.id, { estado: 'cerrado', compra_id: compra.id, super_id: s?.id ?? null });
      onCerrado();
    } catch (e) { setError((e as Error).message); setGuardando(false); }
  }

  return (
    <div className="pila">
      <div className="grilla-cifras compacta">
        <div className="cifra"><span className="cifra-etq">Tuyo</span><strong className="cifra-val">{dinero(r.yo)}</strong></div>
        <div className="cifra"><span className="cifra-etq">Ulises</span><strong className="cifra-val">{dinero(r.ulises)}</strong></div>
      </div>
      <p className="nota">
        Lo de los dos ({dinero(r.compartido)}) va a medias. Suma de productos {dinero(r.total)}
        {Math.abs(totalTicket - r.total) >= 1 ? ` · el ticket dice ${dinero(totalTicket)} (diferencia ${dinero(totalTicket - r.total)})` : ' · coincide con el ticket'}.
      </p>
      {r.sinAsignar > 0 && <p className="texto-aviso">Quedan productos sin repartir por {dinero(r.sinAsignar)}: se cuentan como tuyos.</p>}
      {QUIENES.map((p) => {
        const del = t.items.filter((x) => (x.para ?? 'yo') === p);
        return del.length ? (
          <Tarjeta key={p} titulo={`${PERSONAS[p]} (${del.length})`} accion={<span className="num">{dinero(del.reduce((s, x) => s + x.total, 0))}</span>}>
            <ul className="lista">{del.map((x) => <li key={x.id} className="lista-item"><span className="crece">{x.peso ? `${String(x.peso).replace('.', ',')} kg ` : x.cantidad > 1 ? `${x.cantidad} × ` : ''}{x.nombre}</span><span className="num">{dinero(x.total)}</span></li>)}</ul>
          </Tarjeta>
        ) : null;
      })}
      <Campo etiqueta="Súper">
        <select value={superId} onChange={(e) => setSuperId(e.target.value)}>
          <option value="">Sin elegir</option>
          {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="¿Quién pagó?">
        <div className="segmentado">
          {(['yo', 'ulises'] as Persona[]).map((p) => <button key={p} type="button" className={pago === p ? 'activo' : ''} onClick={() => setPago(p)}>{PERSONAS[p]}</button>)}
        </div>
      </Campo>
      {debe > 0 && <p className={pago === 'yo' ? 'texto-bien' : 'texto-aviso'}>{pago === 'yo' ? `Ulises te debe ${dinero(debe)}` : `Le debés a Ulises ${dinero(debe)}`}</p>}
      {pago === 'yo' && activas.length > 0 && (
        <Campo etiqueta="Pagado con" ayuda="Se anota el gasto en Economía">
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            <option value="">No anotar el gasto</option>
            {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}
      <p className="nota">Al guardar, cada cosa va al stock de quien la lleva y los precios quedan para comparar la próxima vez.</p>
      {error && <p className="texto-critico">{error}</p>}
      <button className="btn btn-primario" disabled={guardando || t.estado === 'cerrado'} onClick={cerrar}>
        {t.estado === 'cerrado' ? 'Ya guardada' : guardando ? 'Guardando…' : 'Guardar la compra'}
      </button>
    </div>
  );
}

/** Un ticket guardado: de dónde salió, sus productos y los pasos para repartir. */
function VerTicket({ t, onVolver }: { t: Ticket; onVolver: () => void }) {
  const [paso, setPaso] = useState<'datos' | 'uno' | 'cuenta'>(t.items.length && t.estado === 'revisar' ? 'uno' : t.estado === 'cerrado' ? 'cuenta' : 'datos');
  const [copia, setCopia] = useState(false);
  const [pegar, setPegar] = useState('');
  const guardarItems = (items: ItemTicket[]) => cambiarTicket(t.id, { items });

  function sumarTexto(texto: string) {
    const nuevos = leerProductos(texto);
    void cambiarTicket(t.id, { items: [...t.items, ...nuevos], texto: [t.texto, texto].filter(Boolean).join('\n---\n'), total: t.total ?? leerTotal(texto) });
    if (nuevos.length) setPaso('uno');
    return nuevos.length;
  }

  return (
    <div className="pila">
      <div className="barra-acciones">
        <button className="btn-link" onClick={onVolver}>← Tickets</button>
        <div className="segmentado" style={{ minWidth: 240 }}>
          <button className={paso === 'datos' ? 'activo' : ''} onClick={() => setPaso('datos')}>Ticket</button>
          <button className={paso === 'uno' ? 'activo' : ''} onClick={() => setPaso('uno')} disabled={!t.items.length}>Repartir</button>
          <button className={paso === 'cuenta' ? 'activo' : ''} onClick={() => setPaso('cuenta')} disabled={!t.items.length}>Cuenta</button>
        </div>
      </div>

      {paso === 'datos' && (
        <>
          <Tarjeta titulo={`Ticket del ${fechaCorta(t.fecha)}`} accion={t.total ? <span className="num">{dinero(Number(t.total))}</span> : undefined}>
            {t.fiscal && <p className="nota">QR fiscal: ticket {numeroTicket(t.fiscal)}, total {dinero(t.fiscal.importe)}. Ese QR no trae los productos.</p>}
            {t.url && <p className="nota">Ticket digital guardado ({new URL(t.url).hostname}).{t.html ? '' : ' La página no devolvió contenido.'}</p>}
            {t.html && <button className="btn-link" onClick={() => setCopia(true)}>Ver la copia guardada del ticket</button>}
            <p>{t.items.length ? `${t.items.length} productos leídos.` : 'Todavía no hay productos.'}</p>
            <BotonFoto texto={t.items.length ? '📸 Sumar otra foto (si el ticket es largo)' : '📸 Sacar o elegir foto del ticket'} onTexto={(x) => { if (!sumarTexto(x)) alert('No encontré productos en la foto. Probá con más luz, el ticket estirado y de cerca.'); }} />
            <details>
              <summary className="nota">O pegá el texto del ticket</summary>
              <textarea rows={6} value={pegar} onChange={(e) => setPegar(e.target.value)} placeholder="2 x 1.250,00&#10;LECHE 1L 2.500,00" />
              <button className="btn" onClick={() => { sumarTexto(pegar); setPegar(''); }} disabled={!pegar.trim()}>Leer</button>
            </details>
            <button className="btn-link" onClick={() => { void guardarItems([...t.items, { id: uid(), nombre: 'Producto', ean: null, cantidad: 1, precio: 0, total: 0, para: null }]); setPaso('uno'); }}>
              {Icono.mas} Agregar un producto a mano
            </button>
          </Tarjeta>
          {t.texto && (
            <details><summary className="nota">Texto leído</summary><pre className="com-texto">{t.texto}</pre></details>
          )}
          <button className="btn btn-peligro" onClick={async () => { if (window.confirm('¿Borrar este ticket guardado? (no borra la compra si ya la guardaste)')) { await eliminar('com_tickets', t.id); onVolver(); } }}>
            {Icono.borrar} Borrar ticket
          </button>
        </>
      )}
      {paso === 'uno' && <UnoAUno t={t} onCambio={(x) => void guardarItems(x)} onListo={() => setPaso('cuenta')} />}
      {paso === 'cuenta' && <Cuenta t={t} onCerrado={onVolver} />}

      <Modal titulo="Copia del ticket" abierto={copia} onCerrar={() => setCopia(false)}>
        {/* Sin scripts: solo para mirar lo que se guardó. */}
        <iframe className="com-copia" sandbox="" srcDoc={t.html ?? ''} title="Ticket guardado" />
      </Modal>
    </div>
  );
}

export function PantallaTicket() {
  const { filas: tickets } = useTickets();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [estado, setEstado] = useState('');
  const t = tickets.find((x) => x.id === abierto) ?? null;
  if (t) return <VerTicket t={t} onVolver={() => setAbierto(null)} />;

  async function alLeer(texto: string) {
    setCamara(false);
    const q = clasificarQr(texto);
    if (q.tipo === 'fiscal') {
      const n = await nuevoTicket({ origen: 'qr', qr: texto, fiscal: q.fiscal, total: q.fiscal.importe, fecha: q.fiscal.fecha || undefined });
      setEstado('');
      setAbierto(n.id);
      return;
    }
    // Primero se guarda lo que dice el QR; después se baja la página UNA sola vez.
    const n = await nuevoTicket({ origen: 'qr', qr: texto, url: q.tipo === 'link' ? q.url : null });
    if (q.tipo !== 'link') { setAbierto(n.id); return; }
    setEstado('Guardando el ticket digital… no cierres la app.');
    try {
      const r = await bajarTicket(q.url);
      const items = leerProductos(r.texto);
      await cambiarTicket(n.id, { url: r.url, html: r.html || null, texto: r.texto || null, items, total: leerTotal(r.texto) });
      setEstado(items.length ? '' : r.error ? `Guardé el link pero la página dio error (${r.error}). Sacale foto al ticket.`
        : 'Guardé la página, pero no encontré los productos en ella. Sacale foto al ticket para leerlos.');
    } catch (e) {
      setEstado(`Guardé el link pero no pude bajar la página (${(e as Error).message}). Sacale foto al ticket.`);
    }
    setAbierto(n.id);
  }

  async function desdeFoto(texto: string) {
    const items = leerProductos(texto);
    const n = await nuevoTicket({ origen: 'foto', texto, items, total: leerTotal(texto) });
    if (!items.length) setEstado('No encontré productos en la foto. Probá con más luz, el ticket estirado y de cerca.');
    setAbierto(n.id);
  }

  const pendientes = tickets.filter((x) => x.estado === 'revisar').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const cerrados = tickets.filter((x) => x.estado === 'cerrado').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);

  return (
    <div className="pila">
      <Tarjeta titulo="Nuevo ticket">
        <p className="nota">Escaneá el QR <strong>solo desde acá</strong>: si lo abrís antes con la cámara del teléfono, el link puede vencer. La app lo guarda apenas lo lee.</p>
        {camara ? (
          <>
            <Escaner qr onCodigo={(x) => void alLeer(x)} pausado={false} />
            <button className="btn-link" onClick={() => setCamara(false)}>Cancelar</button>
          </>
        ) : <button className="btn btn-primario ancho" onClick={() => setCamara(true)}>📷 Escanear el QR del ticket</button>}
        <BotonFoto texto="📸 Sacar o elegir foto del ticket" onTexto={(x) => void desdeFoto(x)} />
        {estado && <p className="texto-aviso">{estado}</p>}
      </Tarjeta>

      {pendientes.length > 0 && (
        <Tarjeta titulo={`Para repartir (${pendientes.length})`}>
          <ul className="lista">
            {pendientes.map((x) => {
              const r = repartoTicket(x.items);
              const hechos = x.items.filter((i) => i.para).length;
              return (
                <li key={x.id} className="lista-item">
                  <button className="boton-fila crece" onClick={() => setAbierto(x.id)}>
                    <div className="crece"><strong>{fechaCorta(x.fecha)} · {x.items.length} productos</strong>
                      <small className="nota">{hechos} de {x.items.length} repartidos{x.origen === 'qr' && !x.items.length ? ' · falta la foto' : ''}</small></div>
                  </button>
                  <span className="num">{dinero(Number(x.total ?? r.total))}</span>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}
      {cerrados.length > 0 && (
        <Tarjeta titulo="Ya guardados">
          <ul className="lista">
            {cerrados.map((x) => {
              const r = repartoTicket(x.items);
              return (
                <li key={x.id} className="lista-item">
                  <button className="boton-fila crece" onClick={() => setAbierto(x.id)}>
                    <div className="crece"><strong>{fechaCorta(x.fecha)}</strong><small className="nota">Tuyo {dinero(r.yo)} · Ulises {dinero(r.ulises)}</small></div>
                  </button>
                  <span className="num">{dinero(Number(x.total ?? r.total))}</span>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
