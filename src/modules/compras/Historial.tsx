import { eliminar } from '../../core/db';
import { dinero, fechaLarga } from '../../core/format';
import { Icono, Tarjeta, Vacio } from '../../ui/ui';
import { CADENAS, type Compra, masBarato, NOMBRE_CADENA, PERSONAS, TC, useCompras, useItems, useSupers } from './modelo';

export function PantallaHistorial() {
  const { filas: compras, cargado } = useCompras();
  const { filas: supers } = useSupers();
  const { filas: items } = useItems();
  const orden = [...compras].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const mes = orden.filter((c) => c.fecha.slice(0, 7) === orden[0]?.fecha.slice(0, 7));
  const totalMes = mes.reduce((t, c) => t + Number(c.total), 0);

  if (cargado && !compras.length) {
    return <Vacio titulo="Todavía no cerraste ninguna compra"><p>Usá el modo compra: al terminar, anotás el total del ticket y queda acá comparado con lo estimado.</p></Vacio>;
  }

  return (
    <div className="pila">
      <div className="grilla-cifras compacta">
        <div className="cifra"><span className="cifra-etq">Compras este mes</span><strong className="cifra-val">{mes.length}</strong></div>
        <div className="cifra"><span className="cifra-etq">Gastado</span><strong className="cifra-val">{dinero(totalMes)}</strong></div>
      </div>
      {orden.map((c: Compra) => {
        const s = supers.find((x) => x.id === c.super_id);
        const dif = Number(c.total) - Number(c.estimado);
        // Cuánto hubiera salido lo mismo en la cadena online más barata de cada producto.
        let online = 0, conOnline = 0;
        for (const l of c.items ?? []) {
          const it = items.find((i) => i.id === l.item_id);
          const mb = it ? masBarato(it) : null;
          if (mb) { online += mb.precio.p * l.cantidad; conOnline++; }
        }
        return (
          <Tarjeta key={c.id} titulo={`${s?.nombre ?? 'Súper'} · ${fechaLarga(c.fecha)}`}
            accion={<button className="btn-icono" aria-label="Borrar compra" onClick={async () => { if (window.confirm('¿Borrar esta compra del historial? (No borra el gasto ni los precios)')) await eliminar(TC.compras, c.id); }}>{Icono.borrar}</button>}>
            <div className="grilla-cifras compacta">
              <div className="cifra"><span className="cifra-etq">Ticket</span><strong className="cifra-val">{dinero(Number(c.total))}</strong></div>
              <div className="cifra"><span className="cifra-etq">Estimado</span><strong className="cifra-val">{dinero(Number(c.estimado))}</strong>
                <span className={`cifra-nota ${dif > 0 ? 'texto-critico' : 'texto-bien'}`}>{dif > 0 ? '+' : ''}{dinero(dif)}</span></div>
            </div>
            {c.reparto && (
              <p className={c.reparto.debe > 0 ? 'texto-aviso' : 'nota'} style={{ marginTop: 8 }}>
                Yo {dinero(c.reparto.yo)} · Ulises {dinero(c.reparto.ulises)}
                {c.reparto.debe > 0 ? (c.reparto.pago === 'yo' ? ` · Ulises te debe ${dinero(c.reparto.debe)}` : ` · le debés a Ulises ${dinero(c.reparto.debe)}`) : ''}
              </p>
            )}
            <ul className="lista" style={{ marginTop: 8 }}>
              {(c.items ?? []).map((l) => {
                const d = l.real != null && l.estimado > 0 ? l.real - l.estimado : null;
                return (
                  <li key={l.item_id} className="lista-item">
                    <span className="crece"><strong>{l.nombre}{l.para && l.para !== 'yo' ? ` · ${PERSONAS[l.para]}` : ''}</strong><small className="nota">{l.cantidad} × {l.real != null ? dinero(l.real) : 'sin precio anotado'} · {l.estimado > 0 ? `estimado ${dinero(l.estimado)}` : 'primera vez'}</small></span>
                    {d != null && Math.abs(d) >= 1 && <span className={`num ${d > 0 ? 'texto-critico' : 'texto-bien'}`}>{d > 0 ? '+' : ''}{dinero(d)}</span>}
                  </li>
                );
              })}
            </ul>
            {conOnline > 0 && (
              <p className="nota" style={{ marginTop: 8 }}>
                Hoy, eligiendo la cadena más barata online para cada cosa ({conOnline} con precio), esos productos salen {dinero(online)}.
                {s && s.cadena !== 'otro' ? ` Compraste en ${NOMBRE_CADENA[s.cadena]}.` : ''}
              </p>
            )}
          </Tarjeta>
        );
      })}
      <p className="nota">Cadenas comparadas: {Object.values(CADENAS).join(', ')}.</p>
    </div>
  );
}
