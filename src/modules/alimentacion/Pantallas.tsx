import { confirmar } from '../../ui/Deshacer';
import { useState } from 'react';
import { crear, eliminar, modificar } from '../../core/db';
import { hoy } from '../../core/format';
import { Campo, Cifra, Icono, Medidor, Modal, Pestanas, Tarjeta, Vacio } from '../../ui/ui';
import { Escaner } from '../compras/Escaner';
import { ALIMENTOS, buscarPorCodigo, horaDe, horasSinComer, macrosDe } from './nutricion';
import { useProductos } from '../stock/modelo';
import {
  faltaPara, guardarMetas, METAS_BASE, metasDelDia, MOMENTOS, registrarComida, TA, totalesDia,
  useComidas, useDiaDeEntreno, useExtras, useMetas, usePlatos,
  type Extra, type Ingrediente, type Momento, type Plato,
} from './modelo';

const n = (t: string) => Number(t.replace(',', '.')) || 0;

function momentoSugerido(): Momento {
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 15 ? 'almuerzo' : h < 19 ? 'merienda' : 'cena';
}

type Modo = 'plato' | 'tabla' | 'escanear' | 'otra';
const ahoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const MODOS: Array<{ id: Modo; nombre: string }> = [
  { id: 'tabla', nombre: 'Alimento' }, { id: 'plato', nombre: 'Mi plato' }, { id: 'escanear', nombre: 'Escanear' }, { id: 'otra', nombre: 'Otra cosa' },
];

/**
 * Cargar lo que comiste: un alimento de la tabla con los gramos (calcula proteína y macros),
 * uno de tus platos (descuenta del stock), un paquete escaneado (Open Food Facts) u otra cosa a ojo.
 */
export function FormComida({ onListo }: { onListo: () => void }) {
  const { filas: platos } = usePlatos();
  const { filas: productos } = useProductos();
  const [modo, setModo] = useState<Modo>('tabla');
  const [momento, setMomento] = useState<Momento>(momentoSugerido());
  const [hora, setHora] = useState(ahoraHHMM());
  const [platoId, setPlatoId] = useState('');
  const [porciones, setPorciones] = useState('1');
  const [desc, setDesc] = useState('');
  const [prot, setProt] = useState('');
  const [kcal, setKcal] = useState('');
  // Alimentos elegidos de la tabla o escaneados, con sus gramos.
  const [lineas, setLineas] = useState<Array<{ a: { nombre: string; p: number; c: number; g: number; kcal: number }; gramos: string; etiqueta?: string; porcion?: number | null }>>([]);
  const [buscar, setBuscar] = useState('');
  const [camara, setCamara] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const plato = modo === 'plato' ? platos.find((p) => p.id === platoId) ?? null : null;
  const falta = plato ? faltaPara(plato, productos) : [];
  const suma = lineas.reduce((t, l) => {
    const m = macrosDe(l.a, n(l.gramos));
    return { proteina: t.proteina + m.proteina, carbos: t.carbos + m.carbos, grasas: t.grasas + m.grasas, kcal: t.kcal + m.kcal };
  }, { proteina: 0, carbos: 0, grasas: 0, kcal: 0 });
  const encontrados = buscar.trim().length >= 2
    ? ALIMENTOS.filter((a) => a.nombre.toLowerCase().includes(buscar.trim().toLowerCase())).slice(0, 6) : [];

  async function leerCodigo(ean: string) {
    setCamara(false);
    setMsg('Buscando el producto…');
    try {
      const pr = await buscarPorCodigo(ean);
      if (!pr) { setMsg('No lo encontré en la base libre. Cargalo como "Otra cosa" con lo que dice la etiqueta.'); return; }
      setLineas((ls) => [...ls, { a: { nombre: `${pr.nombre}${pr.marca ? ` (${pr.marca})` : ''}`, p: pr.p, c: pr.c, g: pr.g, kcal: pr.kcal }, gramos: String(pr.porcion ?? 100), porcion: pr.porcion }]);
      setMsg(pr.p || pr.kcal ? '' : 'Lo encontré pero sin datos de nutrición: completá a mano.');
    } catch {
      setMsg('Sin conexión para buscar el código.');
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const base = { fecha: hoy(), momento, hora: /^\d{2}:\d{2}$/.test(hora) ? hora : null };
    if (modo === 'plato') {
      if (!plato) return;
      const k = n(porciones) || 1;
      await registrarComida({
        ...base, plato_id: plato.id, descripcion: `${plato.nombre}${k !== 1 ? ` ×${k}` : ''}`,
        proteina: plato.proteina * k, carbos: plato.carbos * k, grasas: plato.grasas * k, kcal: plato.kcal * k,
      }, plato, productos, k);
    } else if (modo === 'otra') {
      if (!desc.trim()) return;
      await registrarComida({ ...base, plato_id: null, descripcion: desc.trim(), proteina: n(prot), carbos: 0, grasas: 0, kcal: n(kcal) }, null, productos);
    } else {
      if (!lineas.length) return;
      await registrarComida({
        ...base, plato_id: null, descripcion: desc.trim() || lineas.map((l) => `${l.a.nombre} ${Math.round(n(l.gramos))} g`).join(' + '),
        proteina: Math.round(suma.proteina), carbos: Math.round(suma.carbos), grasas: Math.round(suma.grasas), kcal: Math.round(suma.kcal),
      }, null, productos);
    }
    onListo();
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Pestanas opciones={MODOS} valor={modo} onCambio={(m) => { setModo(m); setMsg(''); }} />
      <div className="fila-campos">
        <Campo etiqueta="Momento">
          <select value={momento} onChange={(e) => setMomento(e.target.value as Momento)}>
            {Object.entries(MOMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Hora"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
      </div>

      {modo === 'plato' && (platos.length === 0 ? <p className="nota">Todavía no cargaste platos. Armalos en la pestaña Platos.</p> : (
        <>
          <Campo etiqueta="Plato">
            <select value={platoId} onChange={(e) => setPlatoId(e.target.value)}>
              <option value="">Elegí…</option>
              {platos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          {plato && (
            <>
              <Campo etiqueta="Porciones"><input inputMode="decimal" value={porciones} onChange={(e) => setPorciones(e.target.value)} /></Campo>
              <p className="nota">{plato.proteina * (n(porciones) || 1)} g de proteína · {plato.kcal * (n(porciones) || 1)} kcal. Se descuentan los ingredientes del stock.</p>
              {falta.length > 0 && <p className="texto-aviso nota">Según el stock te falta: {falta.map((f) => `${f.nombre} (${f.falta} ${f.unidad})`).join(', ')}. Si igual lo comiste, el stock queda en cero.</p>}
            </>
          )}
        </>
      ))}

      {modo === 'tabla' && (
        <Campo etiqueta="Buscar alimento" ayuda="Escribí y tocá el que comiste. Podés sumar varios (ej. arroz + pollo).">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="huevo, pollo, arroz…" />
        </Campo>
      )}
      {modo === 'tabla' && encontrados.length > 0 && (
        <div className="acciones">
          {encontrados.map((a) => (
            <button key={a.nombre} type="button" className="btn chico" onClick={() => { setLineas([...lineas, { a, gramos: String(a.porcion), etiqueta: a.etiqueta }]); setBuscar(''); }}>
              {Icono.mas} {a.nombre}
            </button>
          ))}
        </div>
      )}

      {modo === 'escanear' && (
        <>
          {camara ? <Escaner onCodigo={(c) => void leerCodigo(c)} pausado={false} aviso="Apuntá al código del paquete" />
            : <button type="button" className="btn ancho" onClick={() => setCamara(true)}>{Icono.mas} Abrir la cámara</button>}
          <div className="fila-campos">
            <Campo etiqueta="O escribí el código"><input inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Campo>
            <button type="button" className="btn" disabled={codigo.length < 8} onClick={() => void leerCodigo(codigo)}>Buscar</button>
          </div>
        </>
      )}
      {msg && <p className="nota">{msg}</p>}

      {(modo === 'tabla' || modo === 'escanear') && lineas.length > 0 && (
        <>
          <ul className="lista">
            {lineas.map((l, k) => {
              const m = macrosDe(l.a, n(l.gramos));
              return (
                <li key={k} className="lista-item">
                  <div className="crece"><strong>{l.a.nombre}</strong><small className="nota">{m.proteina} g prot · {m.carbos} g carb · {m.grasas} g grasa · {m.kcal} kcal{l.etiqueta ? ` · ${l.etiqueta} ≈ ${l.gramos} g` : ''}</small></div>
                  <input className="input-gramos" inputMode="decimal" aria-label="Gramos" value={l.gramos} onChange={(e) => setLineas(lineas.map((x, j) => (j === k ? { ...x, gramos: e.target.value } : x)))} />
                  <span className="nota">g</span>
                  <button type="button" className="btn-icono" aria-label="Quitar" onClick={() => setLineas(lineas.filter((_, j) => j !== k))}>{Icono.cerrar}</button>
                </li>
              );
            })}
          </ul>
          <p className="nota"><strong>Total: {Math.round(suma.proteina)} g de proteína</strong> · {Math.round(suma.carbos)} g carb · {Math.round(suma.grasas)} g grasa · {Math.round(suma.kcal)} kcal</p>
          <Campo etiqueta="Nombre (opcional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Arroz con pollo" /></Campo>
        </>
      )}

      {modo === 'otra' && (
        <>
          <Campo etiqueta="Qué comiste"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Hamburguesa de delivery, yogur…" /></Campo>
          <div className="fila-campos">
            <Campo etiqueta="Proteína (g, aprox.)"><input inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} /></Campo>
            <Campo etiqueta="Calorías (aprox.)"><input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></Campo>
          </div>
        </>
      )}
      <button className="btn btn-primario">Registrar (+10 XP)</button>
    </form>
  );
}

export function PantallaHoyComida() {
  const { filas: comidas } = useComidas();
  const { filas: extras } = useExtras();
  const { filas: metas } = useMetas();
  const { filas: platos } = usePlatos();
  const { filas: productos } = useProductos();
  const [nueva, setNueva] = useState(false);
  const entreno = useDiaDeEntreno();
  const meta = metasDelDia(metas, entreno);
  const t = totalesDia(comidas, hoy());
  const agua = extras.filter((x) => x.fecha === hoy() && x.tipo === 'agua').reduce((s, x) => s + Number(x.cantidad), 0);
  const deHoy = comidas.filter((c) => c.fecha === hoy()).sort((a, b) => horaDe(a).localeCompare(horaDe(b)));
  const supl = (metas[0]?.suplementos ?? METAS_BASE.suplementos).split(',').map((s) => s.trim()).filter(Boolean);
  const tomados = new Set(extras.filter((x) => x.fecha === hoy() && x.tipo === 'suplemento').map((x) => x.nombre));
  const posibles = platos.filter((p) => p.ingredientes?.length && faltaPara(p, productos).length === 0);
  const sinComer = horasSinComer(comidas);
  const conCreatina = supl.some((x) => /creatina/i.test(x));

  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">{entreno ? 'Hoy es día de entreno: la meta sube.' : 'Día de descanso: meta normal.'}</p>
        <button className="btn btn-primario" onClick={() => setNueva(true)}>{Icono.mas} Comida</button>
      </div>
      <div className="grilla-cifras">
        <Cifra etiqueta="Proteína" valor={`${Math.round(t.proteina)} / ${meta.proteina} g`} tono={t.proteina >= meta.proteina ? 'bien' : undefined} />
        <Cifra etiqueta="Calorías" valor={`${Math.round(t.kcal)} / ${meta.kcal}`} />
        <Cifra etiqueta="Agua" valor={`${(agua / 1000).toFixed(1)} / ${(meta.agua / 1000).toFixed(1)} L`} tono={agua >= meta.agua ? 'bien' : undefined} />
        <Cifra etiqueta="Sin comer" valor={sinComer == null ? '—' : `${sinComer.toFixed(1)} h`} tono={sinComer != null && sinComer > 4.5 ? 'mal' : undefined}
          nota="Para ganar masa: no más de 4 h" />
      </div>
      <Tarjeta titulo="Agua" accion={<div className="acciones">
        {[250, 500].map((ml) => <button key={ml} className="btn chico" onClick={() => crear<Extra>(TA.extras, { fecha: hoy(), tipo: 'agua', nombre: 'Agua', cantidad: ml })}>+{ml} ml</button>)}
      </div>}>
        <Medidor uso={Math.min(agua / meta.agua, 0.999)} color="var(--xp)" />
      </Tarjeta>
      {!conCreatina && (
        <Tarjeta titulo="Recordatorio de creatina">
          <div className="barra-acciones">
            <p className="nota crece">5 g por día, todos los días (entrenes o no). Te aviso si para el mediodía no la marcaste.</p>
            <button className="btn chico" onClick={() => guardarMetas(metas, { suplementos: ['Creatina', ...supl].join(', ') })}>Activar</button>
          </div>
        </Tarjeta>
      )}
      {supl.length > 0 && (
        <Tarjeta titulo="Suplementos de hoy">
          <div className="acciones">
            {supl.map((s) => (
              <button key={s} className={`btn chico ${tomados.has(s) ? 'btn-primario' : ''}`} disabled={tomados.has(s)}
                onClick={() => crear<Extra>(TA.extras, { fecha: hoy(), tipo: 'suplemento', nombre: s, cantidad: 1 })}>
                {tomados.has(s) ? '✓ ' : ''}{s}
              </button>
            ))}
          </div>
        </Tarjeta>
      )}
      <Tarjeta titulo="Comidas de hoy">
        {deHoy.length === 0 ? <p className="nota">Todavía nada. Registrá lo que comés y suma a tus metas.</p> : (
          <ul className="lista">
            {deHoy.map((c) => (
              <li key={c.id} className="lista-item">
                <div className="crece"><strong>{c.descripcion}</strong><small className="nota">{horaDe(c)} · {MOMENTOS[c.momento]} · {Math.round(c.proteina)} g prot · {Math.round(c.kcal)} kcal</small></div>
                <button className="btn-icono" aria-label="Borrar" onClick={() => eliminar(TA.comidas, c.id)}>{Icono.borrar}</button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {posibles.length > 0 && (
        <Tarjeta titulo="Con lo que hay en casa podés hacer">
          <ul className="lista">
            {posibles.sort((a, b) => b.proteina - a.proteina).map((p) => (
              <li key={p.id} className="lista-item"><div className="crece"><strong>{p.nombre}</strong><small className="nota">{p.proteina} g prot · {p.kcal} kcal · {p.minutos} min</small></div></li>
            ))}
          </ul>
        </Tarjeta>
      )}
      <Modal titulo="Registrar comida" abierto={nueva} onCerrar={() => setNueva(false)}>
        {nueva && <FormComida onListo={() => setNueva(false)} />}
      </Modal>
    </div>
  );
}

function FormPlato({ inicial, onListo }: { inicial?: Plato; onListo: () => void }) {
  const { filas: productos } = useProductos();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [ings, setIngs] = useState<Ingrediente[]>(inicial?.ingredientes ?? []);
  const [prot, setProt] = useState(String(inicial?.proteina ?? ''));
  const [carb, setCarb] = useState(String(inicial?.carbos ?? ''));
  const [gras, setGras] = useState(String(inicial?.grasas ?? ''));
  const [kcal, setKcal] = useState(String(inicial?.kcal ?? ''));
  const [min, setMin] = useState(String(inicial?.minutos ?? ''));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const datos = { nombre: nombre.trim(), ingredientes: ings.filter((i) => i.producto_id && i.cantidad > 0), proteina: n(prot), carbos: n(carb), grasas: n(gras), kcal: n(kcal), minutos: n(min) };
    if (inicial) await modificar<Plato>(TA.platos, inicial.id, datos);
    else await crear<Plato>(TA.platos, datos);
    onListo();
  }

  return (
    <form className="form" onSubmit={guardar}>
      <Campo etiqueta="Nombre"><input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
      <p className="subtitulo">Ingredientes por porción (del stock)</p>
      {ings.map((i, k) => {
        const p = productos.find((x) => x.id === i.producto_id);
        return (
          <div key={k} className="fila-campos">
            <select value={i.producto_id} onChange={(e) => setIngs(ings.map((x, j) => (j === k ? { ...x, producto_id: e.target.value } : x)))}>
              <option value="">Elegí…</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <div className="acciones" style={{ flexWrap: 'nowrap' }}>
              <input inputMode="decimal" value={i.cantidad || ''} placeholder={p?.unidad ?? 'cant.'}
                onChange={(e) => setIngs(ings.map((x, j) => (j === k ? { ...x, cantidad: n(e.target.value) } : x)))} />
              <button type="button" className="btn-icono" aria-label="Quitar" onClick={() => setIngs(ings.filter((_, j) => j !== k))}>{Icono.cerrar}</button>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn chico" onClick={() => setIngs([...ings, { producto_id: '', cantidad: 0 }])}>{Icono.mas} Ingrediente</button>
      <div className="fila-campos">
        <Campo etiqueta="Proteína (g)"><input inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} /></Campo>
        <Campo etiqueta="Calorías"><input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Carbohidratos (g)"><input inputMode="decimal" value={carb} onChange={(e) => setCarb(e.target.value)} /></Campo>
        <Campo etiqueta="Grasas (g)"><input inputMode="decimal" value={gras} onChange={(e) => setGras(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Minutos de preparación"><input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></Campo>
      <button className="btn btn-primario">Guardar</button>
      {inicial && <button type="button" className="btn btn-peligro ancho" onClick={async () => { if (await confirmar('¿Borrar este plato?')) { await eliminar(TA.platos, inicial.id); onListo(); } }}>{Icono.borrar} Borrar</button>}
    </form>
  );
}

export function PantallaPlatos() {
  const { filas: platos, cargado } = usePlatos();
  const { filas: productos } = useProductos();
  const [editando, setEditando] = useState<Plato | 'nuevo' | null>(null);
  return (
    <div className="pila">
      <div className="barra-acciones">
        <p className="nota">Tus platos con ingredientes y macros por porción (aproximados).</p>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>{Icono.mas} Plato</button>
      </div>
      {cargado && platos.length === 0 && <Vacio titulo="Sin platos"><p>Cargá tus platos desde Ajustes → Cargar mi configuración, o agregalos a mano.</p></Vacio>}
      {platos.length > 0 && (
        <Tarjeta>
          <ul className="lista">
            {platos.map((p) => {
              const falta = faltaPara(p, productos);
              return (
                <li key={p.id} className="lista-item">
                  <button className="boton-fila crece" onClick={() => setEditando(p)}>
                    <div className="crece">
                      <strong>{p.nombre}</strong>
                      <small className="nota">{p.proteina} g prot · {p.carbos} g carb · {p.grasas} g grasa · {p.kcal} kcal{falta.length ? ` · falta ${falta.map((f) => f.nombre).join(', ')}` : ' · ✓ hay todo'}</small>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}
      <Modal titulo={editando === 'nuevo' ? 'Nuevo plato' : 'Editar plato'} abierto={!!editando} onCerrar={() => setEditando(null)}>
        {editando && <FormPlato inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />}
      </Modal>
    </div>
  );
}

export function PantallaMetas() {
  const { filas: metas } = useMetas();
  const m = metas[0] ?? METAS_BASE;
  const [v, setV] = useState({
    pe: String(m.proteina_entreno), pd: String(m.proteina_descanso), ke: String(m.kcal_entreno),
    kd: String(m.kcal_descanso), agua: String(m.agua_ml), supl: m.suplementos,
  });
  const [msg, setMsg] = useState('');
  return (
    <Tarjeta titulo="Metas diarias">
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        await guardarMetas(metas, { proteina_entreno: n(v.pe), proteina_descanso: n(v.pd), kcal_entreno: n(v.ke), kcal_descanso: n(v.kd), agua_ml: n(v.agua), suplementos: v.supl });
        setMsg('Guardado.');
      }}>
        <p className="nota">Valores de arranque para ganar masa (~1,8 g de proteína por kilo). Cuando hagas la medición corporal los ajustamos a tu peso.</p>
        <div className="fila-campos">
          <Campo etiqueta="Proteína día de entreno (g)"><input inputMode="numeric" value={v.pe} onChange={(e) => setV({ ...v, pe: e.target.value })} /></Campo>
          <Campo etiqueta="Proteína día de descanso (g)"><input inputMode="numeric" value={v.pd} onChange={(e) => setV({ ...v, pd: e.target.value })} /></Campo>
        </div>
        <div className="fila-campos">
          <Campo etiqueta="Calorías día de entreno"><input inputMode="numeric" value={v.ke} onChange={(e) => setV({ ...v, ke: e.target.value })} /></Campo>
          <Campo etiqueta="Calorías día de descanso"><input inputMode="numeric" value={v.kd} onChange={(e) => setV({ ...v, kd: e.target.value })} /></Campo>
        </div>
        <Campo etiqueta="Agua por día (ml)"><input inputMode="numeric" value={v.agua} onChange={(e) => setV({ ...v, agua: e.target.value })} /></Campo>
        <Campo etiqueta="Suplementos diarios" ayuda="Separados por coma. Ej: Creatina, Proteína en polvo">
          <input value={v.supl} onChange={(e) => setV({ ...v, supl: e.target.value })} />
        </Campo>
        <button className="btn btn-primario">Guardar metas</button>
        {msg && <p className="nota">{msg}</p>}
      </form>
    </Tarjeta>
  );
}
