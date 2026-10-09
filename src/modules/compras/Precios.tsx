import { useState } from 'react';
import { dinero, fechaCorta } from '../../core/format';
import { Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { FormItem } from './FormItem';
import {
  actualizarTodo, BLOQUES, cambiosDePrecio, CADENAS, type Cadena, descuento, enOferta, type Item, masBarato, NOMBRE_CADENA, ultimoTicket, useItems,
  usePrecios, useSupers,
} from './modelo';

/** Oportunidades: ofertas de hoy en tu catálogo y cosas que online están más baratas que lo que pagaste. */
export function oportunidades(items: Item[], precios: ReturnType<typeof usePrecios>['filas']) {
  const r: Array<{ item: Item; texto: string; ahorro: number }> = [];
  for (const i of items) {
    const mb = masBarato(i);
    if (!mb) continue;
    const t = ultimoTicket(precios, i.id);
    if (t && mb.precio.p < Number(t.precio) * 0.95) {
      r.push({ item: i, ahorro: Math.round(Number(t.precio) - mb.precio.p), texto: `En ${CADENAS[mb.cadena]} ${dinero(mb.precio.p)}; la última vez pagaste ${dinero(Number(t.precio))}` });
    } else if (enOferta(mb.precio)) {
      r.push({ item: i, ahorro: Math.round(mb.precio.l - mb.precio.p), texto: `Oferta en ${CADENAS[mb.cadena]}: ${dinero(mb.precio.p)} (−${descuento(mb.precio)} %)` });
    }
  }
  return r.sort((a, b) => b.ahorro - a.ahorro);
}

export function PantallaPrecios() {
  const { filas: items, cargado } = useItems();
  const { filas: precios } = usePrecios();
  const { filas: supers } = useSupers();
  const [editando, setEditando] = useState<Item | 'nuevo' | null>(null);
  const [estado, setEstado] = useState('');
  const [filtro, setFiltro] = useState('');

  const ops = oportunidades(items, precios);
  const cambios = cambiosDePrecio(precios, items);
  const visibles = items
    .filter((i) => !filtro || i.nombre.toLowerCase().includes(filtro.toLowerCase()) || i.bloque === filtro)
    .sort((a, b) => BLOQUES.indexOf(a.bloque) - BLOQUES.indexOf(b.bloque) || a.nombre.localeCompare(b.nombre));
  const cadenas = Object.keys(CADENAS) as Cadena[];

  async function actualizar() {
    setEstado('Buscando precios…');
    try { const n = await actualizarTodo(items); setEstado(`Listo: ${n} actualizados.`); } catch (e) { setEstado((e as Error).message); }
  }

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">{estado || 'Tu catálogo con precios online de Carrefour, Vea y Jumbo, y lo que pagaste en cada ticket.'}</p>
        <button className="btn" onClick={actualizar} disabled={!items.some((i) => i.ean)}>Actualizar precios</button>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Producto</button>
      </div>

      {cambios.length > 0 && (
        <Tarjeta titulo={`Subas y bajas (${cambios.length})`}>
          <p className="nota">Último ticket contra el anterior.</p>
          <ul className="lista">
            {cambios.slice(0, 12).map((x) => (
              <li key={x.item.id} className="lista-item">
                <div className="crece"><strong>{x.item.nombre}</strong><small className="nota">{dinero(x.antes)} → {dinero(x.ahora)} · {fechaCorta(x.fecha)}</small></div>
                <span className={`num ${x.pct > 0 ? 'texto-critico' : 'texto-bien'}`}>{x.pct > 0 ? `▲ ${x.pct}` : `▼ ${-x.pct}`} %</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {ops.length > 0 && (
        <Tarjeta titulo={`Oportunidades (${ops.length})`}>
          <ul className="lista">
            {ops.slice(0, 8).map((o) => (
              <li key={o.item.id} className="lista-item">
                <div className="crece"><strong>{o.item.nombre}</strong><small className="nota">{o.texto}</small></div>
                <span className="num texto-bien">−{dinero(o.ahorro)}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {cargado && items.length === 0 ? (
        <Vacio titulo="Todavía no hay productos">
          <p>Sumalos desde la lista ("Armar lista") o con "+ Producto" y buscá su precio online.</p>
        </Vacio>
      ) : (
        <Tarjeta titulo="Planilla de precios" accion={
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 'auto' }} aria-label="Filtrar por bloque">
            <option value="">Todos</option>
            {BLOQUES.map((b) => <option key={b}>{b}</option>)}
          </select>
        }>
          <div className="com-tabla-caja">
            <table className="com-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  {cadenas.map((c) => <th key={c} className="num">{CADENAS[c]}</th>)}
                  <th className="num">Último ticket</th>
                  <th className="num">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((i) => {
                  const mb = masBarato(i);
                  const t = ultimoTicket(precios, i.id);
                  const sup = t?.super_id ? supers.find((s) => s.id === t.super_id) : null;
                  const dif = t && mb ? Number(t.precio) - mb.precio.p : null;
                  return (
                    <tr key={i.id} onClick={() => setEditando(i)}>
                      <td>
                        <strong>{i.nombre}</strong>
                        <small className="nota">{i.bloque}{i.marca ? ` · ${i.marca}` : ''}{i.en_lista ? ' · en lista' : ''}</small>
                      </td>
                      {cadenas.map((c) => {
                        const p = i.precios?.[c];
                        return (
                          <td key={c} className={`num ${mb?.cadena === c ? 'com-mejor' : ''}`}>
                            {p ? dinero(p.p) : '—'}
                            {p && enOferta(p) && <small className="com-oferta">−{descuento(p)} %</small>}
                          </td>
                        );
                      })}
                      <td className="num">
                        {t ? dinero(Number(t.precio)) : '—'}
                        {t && <small className="nota">{sup?.nombre ?? NOMBRE_CADENA[t.cadena]} · {fechaCorta(t.fecha)}</small>}
                      </td>
                      <td className={`num ${dif == null ? '' : dif > 0 ? 'texto-critico' : 'texto-bien'}`}>
                        {dif == null ? '—' : `${dif > 0 ? '+' : ''}${dinero(dif)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="nota" style={{ marginTop: 8 }}>Verde: la cadena más barata online. "Dif." = lo que pagaste de más (+) o de menos (−) contra el más barato online.</p>
        </Tarjeta>
      )}

      <Modal titulo={editando === 'nuevo' ? 'Nuevo producto' : 'Producto'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormItem inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
    </div>
  );
}
