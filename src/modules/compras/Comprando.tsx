import { useState } from 'react';
import { crear, modificar } from '../../core/db';
import { dinero, parsearMonto } from '../../core/format';
import { ir } from '../../core/router';
import { Campo, Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { useCategorias, useCuentas } from '../economia/modelo';
import { faltantes, useProductos } from '../stock/modelo';
import {
  cerrarCompra, type EnCurso, estimar, frecuentes, guardarEnCurso, type Item, leerEnCurso, type LineaCompra, NOMBRE_CADENA,
  nuevoItem, ordenBloques, type Super, type CadenaSuper, TC, useCompras, useItems, usePrecios, useSupers, adivinarBloque,
} from './modelo';

function ElegirSuper({ onEmpezar }: { onEmpezar: (s: Super) => void }) {
  const { filas: supers } = useSupers();
  const [nombre, setNombre] = useState('');
  const [cadena, setCadena] = useState<CadenaSuper>('vea');

  async function crearSuper(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    onEmpezar(await crear<Super>(TC.supers, { nombre: nombre.trim(), cadena, bloques: [] }));
  }

  return (
    <div className="pila">
      <Tarjeta titulo="¿Dónde estás comprando?">
        {supers.length > 0 && (
          <ul className="lista" style={{ marginBottom: 12 }}>
            {supers.map((s) => (
              <li key={s.id} className="lista-item">
                <div className="crece"><strong>{s.nombre}</strong><small className="nota">{NOMBRE_CADENA[s.cadena]}{s.bloques.length ? ' · recorrido guardado' : ''}</small></div>
                <button className="btn btn-primario" onClick={() => onEmpezar(s)}>Empezar</button>
              </li>
            ))}
          </ul>
        )}
        <form className="form" onSubmit={crearSuper}>
          <div className="fila-campos">
            <Campo etiqueta="Súper nuevo"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Vea Godoy Cruz" /></Campo>
            <Campo etiqueta="Cadena">
              <select value={cadena} onChange={(e) => setCadena(e.target.value as CadenaSuper)}>
                {(Object.keys(NOMBRE_CADENA) as CadenaSuper[]).map((c) => <option key={c} value={c}>{NOMBRE_CADENA[c]}</option>)}
              </select>
            </Campo>
          </div>
          <button className="btn">Crear y empezar</button>
        </form>
      </Tarjeta>
    </div>
  );
}

function Cerrar({ s, lineas, items, onListo }: { s: Super; lineas: LineaCompra[]; items: Item[]; onListo: () => void }) {
  const { filas: cuentas } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: productos } = useProductos();
  const sumaReal = lineas.reduce((t, l) => t + (l.real ?? l.estimado) * l.cantidad, 0);
  const [total, setTotal] = useState(String(Math.round(sumaReal)));
  const activas = cuentas.filter((c) => !c.archivada);
  const [cuenta, setCuenta] = useState(activas[0]?.id ?? '');
  const [gasto, setGasto] = useState(activas.length > 0);
  const [guardando, setGuardando] = useState(false);
  const cat = categorias.find((c) => c.tipo === 'gasto' && /s[uú]per/i.test(c.nombre)) ?? null;
  const estimado = lineas.reduce((t, l) => t + l.estimado * l.cantidad, 0);
  const tot = parsearMonto(total) || 0;

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    await cerrarCompra({ super: s, lineas, total: tot, items, productos, gasto: gasto && cuenta ? { cuenta_id: cuenta, categoria_id: cat?.id ?? null } : null });
    onListo();
  }

  return (
    <form className="form" onSubmit={confirmar}>
      <p className="nota">{lineas.length} productos · estimado {dinero(estimado)}</p>
      <Campo etiqueta="Total del ticket"><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} autoFocus /></Campo>
      {tot > 0 && (
        <p className={tot > estimado ? 'texto-critico' : 'texto-bien'}>
          {tot > estimado ? `Gastaste ${dinero(tot - estimado)} más de lo estimado` : `Gastaste ${dinero(estimado - tot)} menos de lo estimado`}
        </p>
      )}
      {activas.length > 0 && (
        <>
          <label className="lista-item"><input type="checkbox" checked={gasto} onChange={(e) => setGasto(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} /> Anotar el gasto en Economía{cat ? ` (${cat.nombre})` : ''}</label>
          {gasto && (
            <Campo etiqueta="Pagado con">
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>{activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            </Campo>
          )}
        </>
      )}
      <p className="nota">Lo enlazado al stock se suma solo. Los precios que anotaste quedan guardados para la próxima.</p>
      <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Cerrar compra'}</button>
    </form>
  );
}

export function PantallaComprando() {
  const { filas: supers } = useSupers();
  const { filas: items } = useItems();
  const { filas: precios } = usePrecios();
  const { filas: compras } = useCompras();
  const { filas: productos } = useProductos();
  const [ec, setEc] = useState<EnCurso | null>(leerEnCurso());
  const [cerrando, setCerrando] = useState(false);
  const [extra, setExtra] = useState('');
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());

  const cambiar = (e: EnCurso | null) => { guardarEnCurso(e); setEc(e); };
  const s = ec ? supers.find((x) => x.id === ec.super_id) : null;

  if (!ec) return <ElegirSuper onEmpezar={(sup) => cambiar({ super_id: sup.id, inicio: Date.now(), reales: {}, tildados: [] })} />;
  if (!s) return <Vacio titulo="Cargando…" />;

  const lista = items.filter((i) => i.en_lista);
  const tild = new Set(ec.tildados);
  const bloques = ordenBloques(s, lista.map((i) => i.bloque));
  const conCosas = bloques.filter((b) => lista.some((i) => i.bloque === b));
  const actual = conCosas.find((b) => lista.some((i) => i.bloque === b && !tild.has(i.id))) ?? null;
  const est = (i: Item) => estimar(i, precios, s);
  const estimado = lista.reduce((t, i) => t + est(i) * Number(i.cantidad || 1), 0);
  const enCarro = lista.filter((i) => tild.has(i.id)).reduce((t, i) => t + (ec.reales[i.id] ?? est(i)) * Number(i.cantidad || 1), 0);
  const frec = frecuentes(compras);
  const faltaIds = new Set(faltantes(productos).map((p) => p.id));

  /** "En este pasillo también": lo que comprás seguido o falta en casa y no está en la lista. */
  const relacionados = (b: string) => items.filter((i) => i.bloque === b && !i.en_lista &&
    ((frec.get(i.id) ?? 0) >= 2 || (i.producto_id && faltaIds.has(i.producto_id)))).slice(0, 6);

  function tildar(i: Item) {
    const t = new Set(ec!.tildados);
    if (t.has(i.id)) t.delete(i.id); else t.add(i.id);
    cambiar({ ...ec!, tildados: [...t] });
  }
  function precioReal(i: Item, txt: string) {
    const n = parsearMonto(txt);
    cambiar({ ...ec!, reales: { ...ec!.reales, [i.id]: Number.isFinite(n) && n > 0 ? n : null } });
  }
  async function mover(b: string, d: -1 | 1) {
    const orden = [...conCosas];
    const k = orden.indexOf(b), j = k + d;
    if (j < 0 || j >= orden.length) return;
    [orden[k], orden[j]] = [orden[j], orden[k]];
    // Los bloques sin cosas hoy mantienen su lugar relativo al final.
    const resto = bloques.filter((x) => !orden.includes(x));
    await modificar<Super>(TC.supers, s!.id, { bloques: [...orden, ...resto] });
  }
  async function sumarExtra(e: React.FormEvent) {
    e.preventDefault();
    const n = extra.trim();
    if (!n) return;
    const ya = items.find((i) => i.nombre.toLowerCase() === n.toLowerCase());
    if (ya) await modificar<Item>(TC.items, ya.id, { en_lista: true });
    else await nuevoItem({ nombre: n, bloque: adivinarBloque(n), en_lista: true });
    setExtra('');
  }

  const lineas: LineaCompra[] = lista.filter((i) => tild.has(i.id)).map((i) => ({
    item_id: i.id, nombre: i.nombre, cantidad: Number(i.cantidad || 1), estimado: est(i), real: ec.reales[i.id] ?? null,
  }));

  return (
    <div className="pila">
      <div className="grilla-cifras compacta">
        <div className="cifra"><span className="cifra-etq">{s.nombre}</span><strong className="cifra-val">{tild.size}/{lista.length}</strong><span className="cifra-nota">en el carro</span></div>
        <div className="cifra"><span className="cifra-etq">En el carro</span><strong className="cifra-val">{dinero(enCarro)}</strong><span className="cifra-nota">de {dinero(estimado)} estimado</span></div>
      </div>

      {lista.length === 0 && <Vacio titulo="La lista está vacía"><p>Sumá cosas abajo o volvé a Lista → Armar lista.</p></Vacio>}

      {conCosas.map((b, k) => {
        const del = lista.filter((i) => i.bloque === b);
        const hechos = del.every((i) => tild.has(i.id));
        const esActual = b === actual;
        const mostrar = !cerrados.has(b);
        const rel = esActual ? relacionados(b) : [];
        return (
          <Tarjeta key={b} className={`com-bloque ${esActual ? 'com-actual' : ''} ${hechos ? 'com-hecho' : ''}`}
            titulo={<button className="boton-fila" onClick={() => { const a = new Set(cerrados); if (a.has(b)) a.delete(b); else a.add(b); setCerrados(a); }}>
              {hechos ? '✓ ' : esActual ? '▶ ' : ''}{k + 1}. {b} <small className="nota">({del.filter((i) => tild.has(i.id)).length}/{del.length})</small>
            </button>}
            accion={<div className="fila-derecha">
              <button className="btn-icono" aria-label="Subir bloque" onClick={() => mover(b, -1)} disabled={k === 0}>▲</button>
              <button className="btn-icono" aria-label="Bajar bloque" onClick={() => mover(b, 1)} disabled={k === conCosas.length - 1}>▼</button>
            </div>}>
            {mostrar && (
              <ul className="lista">
                {del.map((i) => (
                  <li key={i.id} className={`lista-item ${tild.has(i.id) ? 'com-tildado' : ''}`}>
                    <label className="crece lista-item" style={{ padding: 0 }}>
                      <input type="checkbox" checked={tild.has(i.id)} onChange={() => tildar(i)} style={{ width: 'auto', minHeight: 0 }} />
                      <span className="crece"><strong>{i.nombre}</strong><small className="nota">{Number(i.cantidad)} {i.unidad}{est(i) ? ` · aprox. ${dinero(est(i))} c/u` : ''}</small></span>
                    </label>
                    {tild.has(i.id) && (
                      <input className="com-precio" inputMode="decimal" aria-label={`Precio real de ${i.nombre}`} placeholder="$ real"
                        defaultValue={ec.reales[i.id] ?? ''} onBlur={(e) => precioReal(i, e.target.value)} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {rel.length > 0 && (
              <div className="com-rel">
                <small className="nota">En este pasillo también solés llevar:</small>
                <div className="com-chips">
                  {rel.map((i) => (
                    <button key={i.id} className="chip com-chip" onClick={() => modificar<Item>(TC.items, i.id, { en_lista: true })}>+ {i.nombre}</button>
                  ))}
                </div>
              </div>
            )}
          </Tarjeta>
        );
      })}

      <form className="fila-campos" style={{ alignItems: 'end' }} onSubmit={sumarExtra}>
        <label className="campo"><span>Me olvidé de algo</span><input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Escribí y Enter" /></label>
        <button className="btn">{Icono.mas}</button>
      </form>

      <p className="nota">Con ▲▼ ordenás los bloques como están en este súper; la próxima vez arranca en ese orden.</p>
      <div className="barra-acciones">
        <button className="btn btn-peligro" onClick={() => { if (window.confirm('¿Cancelar esta compra? No se guarda nada.')) { cambiar(null); ir('compras'); } }}>Cancelar</button>
        <button className="btn btn-primario" disabled={!lineas.length} onClick={() => setCerrando(true)}>Terminar compra ({lineas.length})</button>
      </div>

      <Modal titulo="Cerrar compra" abierto={cerrando} onCerrar={() => setCerrando(false)}>
        <Cerrar s={s} lineas={lineas} items={items} onListo={() => { setCerrando(false); setEc(null); ir('compras/historial'); }} />
      </Modal>
    </div>
  );
}
