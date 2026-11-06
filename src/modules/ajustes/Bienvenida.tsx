import { useState } from 'react';
import { recargarPerfil, usePerfil, type Respuestas } from '../../core/auth';
import { almacen, crear, supabase } from '../../core/db';
import { hoy, sumarMeses } from '../../core/format';
import { ModoActividad, icoConfirmar } from '../../ui/Actividad';
import { Campo } from '../../ui/ui';
import { COLORES, T, type Categoria, type Cuenta, type FrecuenciaCobro, type Ingreso, type Pago, type TipoCuenta } from '../economia/modelo';
import { METAS_BASE, TA, type Metas } from '../alimentacion/modelo';
import { TD, type BloquePlantilla, type TipoBloque } from '../dia/modelo';

/**
 * Encuesta de bienvenida (2026-11-06): la primera vez que entra una cuenta nueva junta lo
 * necesario para que LIFE arranque con sus datos (no con los de otra persona): secciones que usa,
 * dónde tiene la plata, lo que cobra, gastos fijos, su semana, cuerpo y entreno, comida y con quién
 * comparte gastos. Cada paso se puede saltar. Al terminar carga todo y guarda las respuestas en su
 * perfil (perfiles.bienvenida) para que Claude y los módulos las usen. Se repite desde Ajustes.
 */

const SECCIONES: Array<[string, string, string]> = [
  ['dia', 'Día', 'Tu horario, tareas y prioridades'],
  ['economia', 'Plata', 'Gastos, ingresos, cuentas y proyección'],
  ['pagos', 'Pagos', 'Vencimientos que se repiten'],
  ['entrenamiento', 'Entreno', 'Rutina del gimnasio y progreso'],
  ['alimentacion', 'Comida', 'Qué comés, proteína y agua'],
  ['stock', 'En casa', 'Lo que hay en la heladera y la alacena'],
  ['compras', 'Compras', 'Lista del súper, precios y tickets'],
];

const LUGARES: Array<[TipoCuenta, string]> = [['efectivo', 'Efectivo'], ['billetera', 'Mercado Pago'], ['banco', 'Banco'], ['inversion', 'Inversiones']];
const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

interface Fuente { nombre: string; monto: string; frecuencia: FrecuenciaCobro; proximo: string }
interface Fijo { nombre: string; monto: string; dia: string }
interface Trabajo { nombre: string; dias: number[]; desde: string; hasta: string }

interface Datos {
  nombre: string;
  modulos: string[];
  plata: Partial<Record<TipoCuenta, string>>;   // lugar → saldo (texto)
  fuentes: Fuente[];
  fijos: Fijo[];
  despierta: string;
  duerme: string;
  trabajos: Trabajo[];
  entrena: boolean;
  diasGym: number;
  objetivo: 'masa' | 'fuerza' | 'bajar' | 'salud';
  nivel: 'empiezo' | 'intermedio' | 'avanzado';
  peso: string;
  altura: string;
  edad: string;
  comidas: number;
  noCome: string;
  comparteCon: string;      // usuario LIFE (invitar)
  convive: string;          // nombre de alguien sin cuenta
}

const PASOS = ['Vos', 'Secciones', 'Tu plata', 'Lo que cobrás', 'Gastos fijos', 'Tu semana', 'Cuerpo y entreno', 'Comida', 'Con quién compartís', 'Listo'];
const n = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

export function Bienvenida({ onListo }: { onListo?: () => void }) {
  const perfil = usePerfil();
  const previas = (perfil.bienvenida ?? null) as Partial<Datos> | null;
  const [paso, setPaso] = useState(0);
  const [d, setD] = useState<Datos>({
    nombre: perfil.nombre || '', modulos: SECCIONES.map(([id]) => id), plata: { efectivo: '' }, fuentes: [], fijos: [],
    despierta: '08:00', duerme: '00:00', trabajos: [], entrena: false, diasGym: 3, objetivo: 'salud', nivel: 'empiezo',
    peso: '', altura: '', edad: '', comidas: 4, noCome: '', comparteCon: '', convive: '',
    ...previas,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const poner = (c: Partial<Datos>) => setD((x) => ({ ...x, ...c }));
  const usa = (id: string) => d.modulos.includes(id);

  // Los pasos de secciones que no eligió se saltan solos.
  const salta = (i: number) => (i === 2 || i === 3) ? !usa('economia') : i === 4 ? !usa('pagos') && !usa('economia')
    : i === 6 ? !usa('entrenamiento') && !usa('alimentacion') : i === 7 ? !usa('alimentacion') : false;
  const ir = (dir: 1 | -1) => {
    let i = paso + dir;
    while (i > 0 && i < PASOS.length - 1 && salta(i)) i += dir;
    setPaso(Math.max(0, Math.min(PASOS.length - 1, i)));
  };

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await cargarDatos(d);
      if (supabase) {
        const r = { ...d, version: 1, fecha: hoy() } as unknown as Respuestas;
        const { error: e } = await supabase.rpc('life_guardar_bienvenida', { respuestas: r, nombre_nuevo: d.nombre });
        if (e) throw new Error(e.message);
        await recargarPerfil();
      }
      onListo?.();
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`);
      setGuardando(false);
    }
  }

  const ultimo = paso === PASOS.length - 1;
  const pie = (
    <>
      {paso > 0 && <button className="btn grande-boton" onClick={() => ir(-1)} disabled={guardando}>Atrás</button>}
      {ultimo
        ? <button className="btn btn-confirmar grande-boton crece" onClick={guardar} disabled={guardando}>{icoConfirmar} {guardando ? 'Guardando…' : 'Guardar y empezar'}</button>
        : <button className="btn btn-confirmar grande-boton crece" onClick={() => ir(1)} disabled={paso === 1 && !d.modulos.length}>Seguir</button>}
    </>
  );

  return (
    <ModoActividad etiqueta="Bienvenida" titulo={PASOS[paso]} total={PASOS.length} hechos={paso} pie={pie}
      onSalir={() => (onListo ? onListo() : setPaso(PASOS.length - 1))}>
      {paso === 0 && (
        <>
          <p>¡Hola! Con estas preguntas LIFE arranca con <strong>tus</strong> datos. Son unos minutos y cualquier paso se puede saltar; después todo se cambia desde cada sección.</p>
          <Campo etiqueta="¿Cómo te decimos?"><input value={d.nombre} onChange={(e) => poner({ nombre: e.target.value })} autoFocus /></Campo>
        </>
      )}

      {paso === 1 && (
        <>
          <p>¿Qué querés usar? Lo que no marques no aparece en el menú (lo podés sumar después repitiendo esta encuesta).</p>
          {SECCIONES.map(([id, nombre, ayuda]) => (
            <label key={id} className="check">
              <input type="checkbox" checked={usa(id)} onChange={(e) => poner({ modulos: e.target.checked ? [...d.modulos, id] : d.modulos.filter((x) => x !== id) })} />
              <span><strong>{nombre}</strong> <small className="nota">· {ayuda}</small></span>
            </label>
          ))}
        </>
      )}

      {paso === 2 && (
        <>
          <p>¿Dónde tenés la plata? Marcá cada lugar y, si querés, cuánto hay hoy.</p>
          {LUGARES.map(([tipo, nombre]) => (
            <div key={tipo} className="fila-bienvenida">
              <label className="check crece">
                <input type="checkbox" checked={d.plata[tipo] !== undefined}
                  onChange={(e) => { const p = { ...d.plata }; if (e.target.checked) p[tipo] = ''; else delete p[tipo]; poner({ plata: p }); }} /> {nombre}
              </label>
              {d.plata[tipo] !== undefined && (
                <input inputMode="decimal" placeholder="$ hoy" aria-label={`Saldo en ${nombre}`} value={d.plata[tipo]}
                  onChange={(e) => poner({ plata: { ...d.plata, [tipo]: e.target.value } })} />
              )}
            </div>
          ))}
        </>
      )}

      {paso === 3 && (
        <>
          <p>¿Qué cobrás seguido? Sueldo, changas, un cliente fijo… Sirve para saber si te alcanza.</p>
          {d.fuentes.map((f, i) => (
            <fieldset key={i} className="check-grupo">
              <Campo etiqueta="De dónde"><input value={f.nombre} onChange={(e) => poner({ fuentes: cambiar(d.fuentes, i, { nombre: e.target.value }) })} placeholder="Ej. Sueldo" /></Campo>
              <Campo etiqueta="Cuánto"><input inputMode="decimal" value={f.monto} onChange={(e) => poner({ fuentes: cambiar(d.fuentes, i, { monto: e.target.value }) })} /></Campo>
              <Campo etiqueta="Cada cuánto">
                <select value={f.frecuencia} onChange={(e) => poner({ fuentes: cambiar(d.fuentes, i, { frecuencia: e.target.value as FrecuenciaCobro }) })}>
                  <option value="semanal">Cada semana</option><option value="quincenal">Cada 15 días</option><option value="mensual">Cada mes</option>
                </select>
              </Campo>
              <Campo etiqueta="Próximo cobro"><input type="date" value={f.proximo} onChange={(e) => poner({ fuentes: cambiar(d.fuentes, i, { proximo: e.target.value }) })} /></Campo>
              <button className="btn-link" onClick={() => poner({ fuentes: d.fuentes.filter((_, j) => j !== i) })}>Quitar</button>
            </fieldset>
          ))}
          <button className="btn" onClick={() => poner({ fuentes: [...d.fuentes, { nombre: '', monto: '', frecuencia: 'mensual', proximo: hoy() }] })}>+ Agregar un cobro</button>
        </>
      )}

      {paso === 4 && (
        <>
          <p>¿Qué pagás todos los meses? Alquiler, internet, gimnasio, celular, suscripciones…</p>
          {d.fijos.map((f, i) => (
            <div key={i} className="fila-bienvenida">
              <input className="crece" value={f.nombre} placeholder="Qué" aria-label="Qué pagás" onChange={(e) => poner({ fijos: cambiar(d.fijos, i, { nombre: e.target.value }) })} />
              <input inputMode="decimal" value={f.monto} placeholder="$" aria-label="Cuánto" onChange={(e) => poner({ fijos: cambiar(d.fijos, i, { monto: e.target.value }) })} />
              <input inputMode="numeric" value={f.dia} placeholder="Día" aria-label="Qué día del mes" style={{ width: 64 }} onChange={(e) => poner({ fijos: cambiar(d.fijos, i, { dia: e.target.value }) })} />
              <button className="btn-link" aria-label="Quitar" onClick={() => poner({ fijos: d.fijos.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn" onClick={() => poner({ fijos: [...d.fijos, { nombre: '', monto: '', dia: '10' }] })}>+ Agregar un gasto fijo</button>
        </>
      )}

      {paso === 5 && (
        <>
          <p>Contanos tu semana tipo. Con esto LIFE calcula tu tiempo libre y te avisa a tiempo.</p>
          <div className="fila-bienvenida">
            <Campo etiqueta="Me despierto"><input type="time" value={d.despierta} onChange={(e) => poner({ despierta: e.target.value })} /></Campo>
            <Campo etiqueta="Me duermo"><input type="time" value={d.duerme} onChange={(e) => poner({ duerme: e.target.value })} /></Campo>
          </div>
          {d.trabajos.map((t, i) => (
            <fieldset key={i} className="check-grupo">
              <Campo etiqueta="Trabajo o actividad fija"><input value={t.nombre} placeholder="Ej. Oficina, facultad" onChange={(e) => poner({ trabajos: cambiar(d.trabajos, i, { nombre: e.target.value }) })} /></Campo>
              <div className="chips-dias" role="group" aria-label="Qué días">
                {DIAS.map((x, dia) => (
                  <button key={dia} type="button" className={`chip-dia ${t.dias.includes(dia) ? 'activo' : ''}`} aria-pressed={t.dias.includes(dia)}
                    onClick={() => poner({ trabajos: cambiar(d.trabajos, i, { dias: t.dias.includes(dia) ? t.dias.filter((y) => y !== dia) : [...t.dias, dia] }) })}>{x}</button>
                ))}
              </div>
              <div className="fila-bienvenida">
                <Campo etiqueta="Desde"><input type="time" value={t.desde} onChange={(e) => poner({ trabajos: cambiar(d.trabajos, i, { desde: e.target.value }) })} /></Campo>
                <Campo etiqueta="Hasta"><input type="time" value={t.hasta} onChange={(e) => poner({ trabajos: cambiar(d.trabajos, i, { hasta: e.target.value }) })} /></Campo>
              </div>
              <button className="btn-link" onClick={() => poner({ trabajos: d.trabajos.filter((_, j) => j !== i) })}>Quitar</button>
            </fieldset>
          ))}
          {d.trabajos.length < 3 && (
            <button className="btn" onClick={() => poner({ trabajos: [...d.trabajos, { nombre: '', dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '17:00' }] })}>+ Agregar trabajo o actividad</button>
          )}
        </>
      )}

      {paso === 6 && (
        <>
          <label className="check"><input type="checkbox" checked={d.entrena} onChange={(e) => poner({ entrena: e.target.checked })} /> Voy (o quiero ir) al gimnasio</label>
          {d.entrena && (
            <>
              <Campo etiqueta="Días por semana">
                <select value={d.diasGym} onChange={(e) => poner({ diasGym: Number(e.target.value) })}>{[2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </Campo>
              <Campo etiqueta="Experiencia">
                <select value={d.nivel} onChange={(e) => poner({ nivel: e.target.value as Datos['nivel'] })}>
                  <option value="empiezo">Recién empiezo</option><option value="intermedio">Hace más de 6 meses</option><option value="avanzado">Hace años</option>
                </select>
              </Campo>
            </>
          )}
          <Campo etiqueta="Objetivo">
            <select value={d.objetivo} onChange={(e) => poner({ objetivo: e.target.value as Datos['objetivo'] })}>
              <option value="salud">Estar bien / salud</option><option value="masa">Ganar músculo</option><option value="fuerza">Ganar fuerza</option><option value="bajar">Bajar grasa</option>
            </select>
          </Campo>
          <div className="fila-bienvenida">
            <Campo etiqueta="Peso (kg)"><input inputMode="decimal" value={d.peso} onChange={(e) => poner({ peso: e.target.value })} /></Campo>
            <Campo etiqueta="Altura (cm)"><input inputMode="numeric" value={d.altura} onChange={(e) => poner({ altura: e.target.value })} /></Campo>
            <Campo etiqueta="Edad"><input inputMode="numeric" value={d.edad} onChange={(e) => poner({ edad: e.target.value })} /></Campo>
          </div>
          <p className="nota">Con el peso se arman tus metas de proteína, calorías y agua. Son tuyos: nadie más los ve.</p>
        </>
      )}

      {paso === 7 && (
        <>
          <Campo etiqueta="¿Cuántas comidas hacés por día?">
            <select value={d.comidas} onChange={(e) => poner({ comidas: Number(e.target.value) })}>{[2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </Campo>
          <Campo etiqueta="¿Algo que no comas?" ayuda="Alergias, vegetariano, lo que no te gusta.">
            <input value={d.noCome} onChange={(e) => poner({ noCome: e.target.value })} />
          </Campo>
        </>
      )}

      {paso === 8 && (
        <>
          <p>¿Compartís gastos con alguien (con quien vivís, pareja, amigo)?</p>
          <Campo etiqueta="Si tiene LIFE: su usuario" ayuda="Le llega una invitación. Cuando la acepte, los dos ven lo que se deben.">
            <input value={d.comparteCon} autoCapitalize="none" onChange={(e) => poner({ comparteCon: e.target.value })} placeholder="ej. ulises" />
          </Campo>
          <Campo etiqueta="Si no tiene LIFE: su nombre" ayuda="Igual podés llevar la cuenta con esa persona.">
            <input value={d.convive} onChange={(e) => poner({ convive: e.target.value })} />
          </Campo>
        </>
      )}

      {ultimo && (
        <>
          <p>Esto es lo que se va a cargar en tu cuenta:</p>
          <ul className="lista-simple">
            <li>Secciones: {SECCIONES.filter(([id]) => usa(id)).map(([, x]) => x).join(', ') || 'ninguna'}</li>
            {usa('economia') && <li>{Object.keys(d.plata).length} lugares para tu plata y {d.fuentes.filter((f) => f.nombre).length} cobros</li>}
            {(usa('pagos') || usa('economia')) && <li>{d.fijos.filter((f) => f.nombre).length} gastos fijos</li>}
            <li>Tu semana: dormir de {d.duerme} a {d.despierta}{d.trabajos.length ? ` y ${d.trabajos.length} actividad(es) fija(s)` : ''}</li>
            {n(d.peso) > 0 && <li>Metas de comida según {n(d.peso)} kg</li>}
            {d.comparteCon && <li>Invitación a «{d.comparteCon}» para compartir gastos</li>}
          </ul>
          <p className="nota">Si ya tenías algo cargado con el mismo nombre, no se duplica.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}
    </ModoActividad>
  );
}

function cambiar<X>(lista: X[], i: number, c: Partial<X>): X[] {
  return lista.map((x, j) => (j === i ? { ...x, ...c } : x));
}

/** Próxima fecha con ese día del mes. */
function proximoDia(dia: number): string {
  const h = hoy();
  const d = Math.min(28, Math.max(1, dia || 1));
  const esteMes = `${h.slice(0, 8)}${String(d).padStart(2, '0')}`;
  return esteMes >= h ? esteMes : sumarMeses(esteMes, 1, d);
}

const CATEGORIAS: Array<Pick<Categoria, 'nombre' | 'tipo'>> = [
  { nombre: 'Sueldo', tipo: 'ingreso' }, { nombre: 'Otros ingresos', tipo: 'ingreso' },
  ...['Súper', 'Verdulería', 'Carnicería', 'Delivery', 'Salidas', 'Transporte', 'Salud', 'Ropa', 'Regalos', 'Vivienda', 'Servicios', 'Gimnasio', 'Suscripciones']
    .map((nombre) => ({ nombre, tipo: 'gasto' as const })),
];

/** Carga lo respondido sin duplicar (busca por nombre). */
async function cargarDatos(d: Datos) {
  const existe = async (tabla: string, nombre: string) =>
    (await almacen.listar<{ id: string; nombre: string }>(tabla)).find((x) => x.nombre?.toLowerCase() === nombre.toLowerCase());

  // Plata
  let principal: string | null = null;
  if (d.modulos.includes('economia') || d.modulos.includes('pagos')) {
    for (const [tipo, nombre] of LUGARES) {
      if (d.plata[tipo] === undefined) continue;
      const ya = await existe(T.cuentas, nombre);
      const c = ya ?? await crear<Cuenta>(T.cuentas, { nombre, tipo, moneda: 'ARS', saldo_inicial: n(d.plata[tipo] ?? ''), archivada: false });
      principal ??= c.id;
    }
    if (!(await almacen.listar(T.categorias)).length) {
      let i = 0;
      for (const c of CATEGORIAS) await crear<Categoria>(T.categorias, { ...c, color: COLORES[i++ % COLORES.length], presupuesto: null });
    }
  }
  const cats = await almacen.listar<Categoria>(T.categorias);
  const cat = (nombre: string) => cats.find((c) => c.nombre === nombre)?.id ?? null;

  for (const f of d.fuentes.filter((x) => x.nombre.trim() && n(x.monto) > 0)) {
    if (await existe(T.ingresos, f.nombre.trim())) continue;
    await crear<Ingreso>(T.ingresos, {
      nombre: f.nombre.trim(), monto: n(f.monto), moneda: 'ARS', frecuencia: f.frecuencia, proximo_cobro: f.proximo || hoy(),
      cuenta_id: principal, categoria_id: cat('Sueldo'), activo: true, notas: '', puede_adeudarse: false, adeudado: 0,
    });
  }
  for (const f of d.fijos.filter((x) => x.nombre.trim() && n(x.monto) > 0)) {
    if (await existe(T.pagos, f.nombre.trim())) continue;
    const dia = Math.round(n(f.dia)) || 10;
    await crear<Pago>(T.pagos, {
      nombre: f.nombre.trim(), monto: n(f.monto), moneda: 'ARS', categoria_id: null, cuenta_id: principal,
      frecuencia: 'mensual', dia, proximo_vencimiento: proximoDia(dia), activo: true, notas: '',
    });
  }

  // Semana tipo: solo si todavía no tiene una (así no ve la de ejemplo, que es de otra persona).
  if (!(await almacen.listar(TD.plantilla)).length) {
    for (let dia = 0; dia < 7; dia++) for (const b of bloquesDelDia(d, dia)) await crear<BloquePlantilla>(TD.plantilla, { ...b, dia_semana: dia });
  }

  // Metas de comida según el peso.
  const peso = n(d.peso);
  if (peso >= 30 && peso <= 250 && !(await almacen.listar(TA.metas)).length) {
    const ajuste = d.objetivo === 'masa' ? 300 : d.objetivo === 'bajar' ? -400 : 0;
    const base = Math.round((peso * 31 + ajuste) / 50) * 50;
    await crear<Metas>(TA.metas, {
      ...METAS_BASE,
      proteina_descanso: Math.round(peso * 1.6), proteina_entreno: Math.round(peso * (d.objetivo === 'masa' || d.objetivo === 'fuerza' ? 2 : 1.8)),
      kcal_descanso: base, kcal_entreno: base + 250, agua_ml: Math.round(peso * 35 / 100) * 100,
    });
  }

  // Invitación para compartir gastos.
  if (d.comparteCon.trim() && supabase) {
    const { error } = await supabase.rpc('life_invitar', { usuario_otro: d.comparteCon.trim() });
    if (error) throw new Error(`invitación a ${d.comparteCon}: ${error.message}`);
  }
}

const aMin = (h: string) => { const [a, b] = (h || '00:00').split(':').map(Number); return a * 60 + (b || 0); };
const aHora = (m: number) => (m >= 1440 ? '24:00' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

/** Bloques de un día: dormir, actividades fijas de ese día y el resto en casa. Nada se pisa. */
export function bloquesDelDia(d: Pick<Datos, 'despierta' | 'duerme' | 'trabajos'>, dia: number): Array<Omit<BloquePlantilla, 'id' | 'dia_semana'>> {
  const despierta = aMin(d.despierta);
  const duerme = aMin(d.duerme) || 1440; // 00:00 = medianoche
  const ocupado: Array<{ ini: number; fin: number; titulo: string; tipo: TipoBloque }> = [];
  if (despierta > 0) ocupado.push({ ini: 0, fin: despierta, titulo: 'Dormir', tipo: 'descanso' });
  if (duerme < 1440 && duerme > despierta) ocupado.push({ ini: duerme, fin: 1440, titulo: 'Dormir', tipo: 'descanso' });
  for (const t of d.trabajos.filter((x) => x.dias.includes(dia))) {
    const ini = aMin(t.desde), fin = aMin(t.hasta) || 1440;
    if (fin > ini) ocupado.push({ ini, fin, titulo: t.nombre.trim() || 'Trabajo', tipo: 'otro' });
  }
  ocupado.sort((a, b) => a.ini - b.ini);
  const salida: Array<Omit<BloquePlantilla, 'id' | 'dia_semana'>> = [];
  let cursor = 0;
  for (const o of ocupado) {
    const ini = Math.max(o.ini, cursor);
    if (o.fin <= ini) continue;
    if (ini > cursor) salida.push({ inicio: aHora(cursor), fin: aHora(ini), titulo: 'En casa', tipo: 'casa' });
    salida.push({ inicio: aHora(ini), fin: aHora(o.fin), titulo: o.titulo, tipo: o.tipo });
    cursor = o.fin;
  }
  if (cursor < 1440) salida.push({ inicio: aHora(cursor), fin: '24:00', titulo: 'En casa', tipo: 'casa' });
  return salida;
}

