import { useState } from 'react';
import { modificar } from '../../core/db';
import { dinero } from '../../core/format';
import { ir } from '../../core/router';
import { Icono, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { aComprar, faltantes, useProductos } from '../stock/modelo';
import { FormItem } from './FormItem';
import {
  actualizarTodo, BLOQUES, CADENAS, enOferta, estimar, type Item, leerEnCurso, masBarato, nuevoItem, SUGERIDOS, sumarFaltantes, TC,
  totalesPorCadena, useItems, usePrecios,
} from './modelo';

/** Cuestionario: recorre los bloques del súper y pregunta qué sumar. */
function Cuestionario({ items, onListo }: { items: Item[]; onListo: () => void }) {
  const [paso, setPaso] = useState(0);
  const [otro, setOtro] = useState('');
  const bloque = BLOQUES[paso];
  const delBloque = items.filter((i) => i.bloque === bloque);
  const nombres = new Set(delBloque.map((i) => i.nombre.toLowerCase()));
  const sugeridos = (SUGERIDOS[bloque] ?? []).filter((s) => !nombres.has(s.toLowerCase()));

  async function alternar(i: Item) { await modificar<Item>(TC.items, i.id, { en_lista: !i.en_lista }); }
  async function sumar(nombre: string) {
    const n = nombre.trim();
    if (!n) return;
    const ya = items.find((i) => i.nombre.toLowerCase() === n.toLowerCase());
    if (ya) await modificar<Item>(TC.items, ya.id, { en_lista: true });
    else await nuevoItem({ nombre: n, bloque, en_lista: true });
  }

  return (
    <div className="pila">
      <p className="nota">Paso {paso + 1} de {BLOQUES.length}</p>
      <h3 style={{ margin: 0 }}>¿Qué necesitás de {bloque}?</h3>
      <div className="com-chips">
        {delBloque.map((i) => (
          <button key={i.id} type="button" className={`chip com-chip ${i.en_lista ? 'chip-on' : ''}`} onClick={() => alternar(i)}>
            {i.en_lista ? '✓ ' : ''}{i.nombre}
          </button>
        ))}
        {sugeridos.map((s) => (
          <button key={s} type="button" className="chip com-chip" onClick={() => sumar(s)}>+ {s}</button>
        ))}
      </div>
      <form className="fila-campos" style={{ alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); void sumar(otro); setOtro(''); }}>
        <label className="campo"><span>Otra cosa</span><input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Escribí y Enter" /></label>
        <button className="btn">{Icono.mas}</button>
      </form>
      <div className="fila-campos">
        <button type="button" className="btn" disabled={paso === 0} onClick={() => setPaso(paso - 1)}>{Icono.flechaIzq} Atrás</button>
        {paso < BLOQUES.length - 1
          ? <button type="button" className="btn btn-primario" onClick={() => setPaso(paso + 1)}>Siguiente {Icono.flechaDer}</button>
          : <button type="button" className="btn btn-primario" onClick={onListo}>Listo</button>}
      </div>
    </div>
  );
}

export function PantallaLista() {
  const { filas: items, cargado } = useItems();
  const { filas: precios } = usePrecios();
  const { filas: productos } = useProductos();
  const [editando, setEditando] = useState<Item | 'nuevo' | null>(null);
  const [preguntando, setPreguntando] = useState(false);
  const [actualizando, setActualizando] = useState('');

  const lista = items.filter((i) => i.en_lista);
  const faltan = faltantes(productos)
    .filter((p) => !lista.some((i) => i.producto_id === p.id || i.nombre.toLowerCase() === p.nombre.toLowerCase()))
    .map((p) => ({ ...p, aComprar: aComprar(p) }));
  const totales = totalesPorCadena(lista);
  const conPrecio = totales.filter((t) => t.con > 0);
  const mejor = conPrecio.length ? [...conPrecio].filter((t) => t.con === conPrecio[0].con).sort((a, b) => a.total - b.total)[0] : null;
  const estimado = lista.reduce((s, i) => s + estimar(i, precios) * Number(i.cantidad || 1), 0);
  const enCurso = leerEnCurso();

  async function actualizar() {
    setActualizando('Buscando precios…');
    try { const n = await actualizarTodo(items); setActualizando(`Listo: ${n} producto${n === 1 ? '' : 's'} actualizado${n === 1 ? '' : 's'}.`); }
    catch (e) { setActualizando((e as Error).message); }
  }

  const cambiarCant = (i: Item, d: number) => modificar<Item>(TC.items, i.id, { cantidad: Math.max(0.5, Number(i.cantidad || 1) + d) });

  return (
    <div className="pila">
      <div className="barra-acciones">
        <button className="btn btn-primario" onClick={() => ir(`compras/comprando`)}>{enCurso ? 'Seguir comprando' : 'Modo compra'}</button>
        <button className="btn" onClick={() => setPreguntando(true)}>Armar lista</button>
        <button className="btn" onClick={() => setEditando('nuevo')}>{Icono.mas} Producto</button>
      </div>

      {faltan.length > 0 && (
        <Tarjeta titulo={`Falta en casa (${faltan.length})`} accion={<button className="btn" onClick={() => sumarFaltantes(faltan, items)}>Sumar a la lista</button>}>
          <p className="nota">{faltan.map((p) => `${p.nombre} (${p.aComprar} ${p.unidad})`).join(' · ')}</p>
        </Tarjeta>
      )}

      {cargado && lista.length === 0 ? (
        <Vacio titulo="La lista está vacía">
          <p>Tocá "Armar lista" y te pregunto bloque por bloque qué necesitás.</p>
        </Vacio>
      ) : (
        <>
          <div className="grilla-cifras">
            <div className="cifra"><span className="cifra-etq">En la lista</span><strong className="cifra-val">{lista.length}</strong></div>
            <div className="cifra"><span className="cifra-etq">Estimado</span><strong className="cifra-val">{dinero(estimado)}</strong><span className="cifra-nota">con tus últimos precios</span></div>
            {mejor && (
              <div className="cifra"><span className="cifra-etq">Más barato online</span><strong className="cifra-val bien">{CADENAS[mejor.cadena]}</strong>
                <span className="cifra-nota">{dinero(mejor.total)} · {mejor.con} de {lista.length} con precio</span></div>
            )}
          </div>
          {conPrecio.length > 1 && (
            <Tarjeta titulo="Comparación por súper (online)">
              <ul className="lista">
                {conPrecio.map((t) => (
                  <li key={t.cadena} className="lista-item">
                    <span className="crece"><strong>{CADENAS[t.cadena]}</strong><small className="nota">{t.con} de {lista.length} productos con precio</small></span>
                    <span className="num">{dinero(t.total)}</span>
                  </li>
                ))}
              </ul>
              <p className="nota" style={{ marginTop: 8 }}>Son precios de la web de cada cadena: sirven para comparar. El real lo anotás en el modo compra.</p>
            </Tarjeta>
          )}
          {BLOQUES.map((b) => {
            const del = lista.filter((i) => i.bloque === b);
            if (!del.length) return null;
            return (
              <Tarjeta key={b} titulo={`${b} (${del.length})`}>
                <ul className="lista">
                  {del.map((i) => {
                    const mb = masBarato(i);
                    return (
                      <li key={i.id} className="lista-item">
                        <button className="boton-fila crece" onClick={() => setEditando(i)}>
                          <div className="crece">
                            <strong>{i.nombre}{i.marca ? ` · ${i.marca}` : ''}</strong>
                            <small className="nota">
                              {mb ? `${CADENAS[mb.cadena]} ${dinero(mb.precio.p)}${enOferta(mb.precio) ? ' · oferta' : ''}` : 'Sin precio online'}
                            </small>
                          </div>
                        </button>
                        <div className="fila-derecha">
                          <button className="btn-icono" aria-label="Menos" onClick={() => cambiarCant(i, -1)}>{Icono.menos}</button>
                          <span className="num" style={{ minWidth: 44, textAlign: 'center' }}>{Number(i.cantidad)} {i.unidad}</span>
                          <button className="btn-icono" aria-label="Más" onClick={() => cambiarCant(i, 1)}>{Icono.mas}</button>
                          <button className="btn-icono" aria-label="Sacar de la lista" onClick={() => modificar<Item>(TC.items, i.id, { en_lista: false })}>{Icono.cerrar}</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Tarjeta>
            );
          })}
        </>
      )}

      {items.some((i) => i.ean) && (
        <div className="barra-acciones">
          <p className="nota">{actualizando || 'Los precios online se guardan en cada producto.'}</p>
          <button className="btn" onClick={actualizar}>Actualizar precios</button>
        </div>
      )}

      <Modal titulo="Armar la lista" abierto={preguntando} onCerrar={() => setPreguntando(false)}>
        <Cuestionario items={items} onListo={() => setPreguntando(false)} />
      </Modal>
      <Modal titulo={editando === 'nuevo' ? 'Nuevo producto' : 'Producto'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormItem inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
    </div>
  );
}
