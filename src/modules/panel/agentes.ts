import { crear, modificar, useTabla, type Fila } from '../../core/db';
import { hoy } from '../../core/format';
import { TD, type Tarea } from '../dia/modelo';

/**
 * Panel → Agentes (2026-11-27, opción A de "Agentes que trabajan en equipo").
 * Los agentes de LIFE (habilidades de Claude) anotan lo que hacen con el conector
 * (agentes_anotar / agentes_proponer) y ella lo ve acá en vivo: quién está trabajando,
 * por qué estación va cada tarea y qué propuestas esperan su Sí / No / Cambiar.
 * SQL: supabase/agentes.sql.
 */

export const TABLA_TRABAJOS = 'age_trabajos';
export const TABLA_PROPUESTAS = 'age_propuestas';

export type EstadoTrabajo = 'en_curso' | 'espera_ok' | 'hecho' | 'frenado';
export type EstadoEstacion = 'hecho' | 'ahora' | 'falta';
export interface Estacion { nombre: string; agente?: string; estado: EstadoEstacion }
export interface NovedadAgente { fecha: string; agente?: string; texto: string }

export interface Trabajo extends Fila {
  titulo: string;
  agente: string;
  receta?: string | null;
  estado: EstadoTrabajo;
  estaciones: Estacion[];
  vueltas: number;
  novedades: NovedadAgente[];
  nota?: number | null;
  link?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type EstadoPropuesta = 'pendiente' | 'si' | 'no' | 'cambiar';
export interface Propuesta extends Fila {
  agente: string;
  texto: string;
  porque?: string | null;
  link?: string | null;
  trabajo_id?: string | null;
  estado: EstadoPropuesta;
  respuesta?: string | null;
  respondida_at?: string | null;
  created_at?: string;
}

export interface Agente {
  id: string;
  nombre: string;
  inicial: string;
  hace: string;
  /** Cómo se lo llama desde el chat. */
  llamar: string;
  /** Todavía no trabaja: se está analizando. */
  enAnalisis?: boolean;
}

/** El equipo. Coincide con docs/agentes/mapa-agentes.md; un agente nuevo se suma acá y en el mapa. */
export const AGENTES: Agente[] = [
  { id: 'zonka', nombre: 'Zonka', inicial: 'Z', hace: 'Mejoras, qué falta medir y coach de entreno y comida', llamar: 'Llamá a Zonka' },
  { id: 'lupita', nombre: 'Lupita', inicial: 'L', hace: 'Usabilidad: que cada pantalla sea práctica y clara', llamar: 'Llamá a Lupita' },
  { id: 'sapires', nombre: 'Sapires', inicial: 'S', hace: 'Estructura y diseño: ordena la información con forma', llamar: 'Llamá a Sapires' },
  { id: 'gonzalito', nombre: 'Gonzalito', inicial: 'G', hace: 'Seguridad: claves, permisos y respaldo', llamar: 'Llamá a Gonzalito' },
  { id: 'constructor', nombre: 'Constructor', inicial: 'C', hace: 'Los hilos que hacen el código y el PR con vista previa', llamar: 'Lo abre el chat del proyecto' },
  { id: 'hermes', nombre: 'Hermes', inicial: 'H', hace: 'Agente que aprende habilidades solo, en tu PC. Se está analizando si suma', llamar: 'Todavía no', enAnalisis: true },
];

export const agenteDe = (id?: string | null): Agente | undefined => {
  const v = (id ?? '').toLowerCase();
  return AGENTES.find((a) => a.id === v || a.nombre.toLowerCase() === v);
};
export const nombreAgente = (id?: string | null) => agenteDe(id)?.nombre ?? (id ? id[0].toUpperCase() + id.slice(1) : 'Agente');

export const useTrabajos = () => useTabla<Trabajo>(TABLA_TRABAJOS);
export const usePropuestas = () => useTabla<Propuesta>(TABLA_PROPUESTAS);

export const abierto = (t: Trabajo) => t.estado === 'en_curso' || t.estado === 'espera_ok';
const instante = (t: Trabajo) => t.updated_at ?? t.created_at ?? '';
export const recientes = (ts: Trabajo[]) => [...ts].sort((a, b) => instante(b).localeCompare(instante(a)));

/** La estación en la que está ahora (o la primera que falta). */
export function estacionActual(t: Trabajo): Estacion | undefined {
  return t.estaciones?.find((e) => e.estado === 'ahora') ?? t.estaciones?.find((e) => e.estado === 'falta');
}

export type EstadoAgente = 'trabaja' | 'espera' | 'libre' | 'analisis';
export interface Situacion { estado: EstadoAgente; texto: string; trabajo?: Trabajo }

/** Qué está haciendo cada agente, sacado de sus trabajos y propuestas. */
export function situacion(a: Agente, trabajos: Trabajo[], propuestas: Propuesta[]): Situacion {
  if (a.enAnalisis) return { estado: 'analisis', texto: a.hace };
  const mios = recientes(trabajos.filter((t) => t.agente === a.id && abierto(t)));
  const enCurso = mios.find((t) => t.estado === 'en_curso');
  const pend = propuestas.filter((p) => p.agente === a.id && p.estado === 'pendiente').length;
  if (enCurso) return { estado: 'trabaja', texto: enCurso.titulo + (estacionActual(enCurso) ? ` · ${estacionActual(enCurso)!.nombre}` : ''), trabajo: enCurso };
  if (mios.length || pend) {
    const partes = [mios.length ? `${mios[0].titulo} espera tu OK` : '', pend ? `${pend} ${pend === 1 ? 'propuesta' : 'propuestas'} para vos` : ''].filter(Boolean);
    return { estado: 'espera', texto: partes.join(' · '), trabajo: mios[0] };
  }
  const ultimo = recientes(trabajos.filter((t) => t.agente === a.id))[0];
  return { estado: 'libre', texto: ultimo ? `Último: ${ultimo.titulo}` : a.hace };
}

/** Todo lo que fueron anotando, de todas las tareas, lo más nuevo arriba. */
export function feed(trabajos: Trabajo[], max = 30): Array<NovedadAgente & { trabajo: Trabajo }> {
  return trabajos
    .flatMap((t) => (t.novedades ?? []).map((n) => ({ ...n, trabajo: t })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, max);
}

const ahora = () => new Date().toISOString();
const conNovedad = (t: Trabajo, texto: string): NovedadAgente[] => [...(t.novedades ?? []), { fecha: ahora(), agente: 'vos', texto }].slice(-60);

/** Ella da el OK final: la tarea queda hecha. */
export async function darOk(t: Trabajo) {
  const estaciones = (t.estaciones ?? []).map((e) => ({ ...e, estado: 'hecho' as const }));
  await modificar<Trabajo>(TABLA_TRABAJOS, t.id, { estado: 'hecho', estaciones, novedades: conNovedad(t, 'Le diste el OK'), updated_at: ahora() });
}

/** Ella la devuelve con una nota: vuelve a la estación anterior a la suya y suma una vuelta. */
export async function devolver(t: Trabajo, nota: string) {
  await modificar<Trabajo>(TABLA_TRABAJOS, t.id, {
    estado: 'en_curso', vueltas: (t.vueltas ?? 0) + 1,
    novedades: conNovedad(t, `La devolviste: ${nota || 'sin nota'}`), updated_at: ahora(),
  });
}

export async function frenar(t: Trabajo) {
  await modificar<Trabajo>(TABLA_TRABAJOS, t.id, { estado: 'frenado', novedades: conNovedad(t, 'La frenaste'), updated_at: ahora() });
}

/** Responde una propuesta. Con Sí queda como tarjeta del Tablero en "Ideas de desarrollo" (una cosa, un solo lugar). */
export async function responder(p: Propuesta, estado: Exclude<EstadoPropuesta, 'pendiente'>, respuesta = '') {
  await modificar<Propuesta>(TABLA_PROPUESTAS, p.id, { estado, respuesta: respuesta || null, respondida_at: ahora() });
  if (estado === 'si') {
    await crear<Tarea & { categoria: string; etapa: null }>(TD.tareas, {
      fecha: null, titulo: p.texto.split('\n')[0].slice(0, 80), hecho: false, prioridad: 'media',
      nota: `Propuesta de ${nombreAgente(p.agente)} (${p.created_at?.slice(0, 10) ?? hoy()}): ${p.texto}${p.porque ? `\nSe basa en: ${p.porque}` : ''}${p.link ? `\n${p.link}` : ''}`,
      origen: 'app', categoria: 'Ideas de desarrollo', etapa: null,
    });
  }
}

/** Hace cuánto, corto: "hace 5 min", "hace 3 h", "ayer", "12/11". */
export function haceCuanto(iso?: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  if (min < 48 * 60) return 'ayer';
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
