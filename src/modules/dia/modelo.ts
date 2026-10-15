import { crear, eliminar, modificar, useTabla, type Fila } from '../../core/db';
import { desdeISO, sumarDias } from '../../core/format';

/**
 * Módulo Día: semana tipo (bloques horarios por día de la semana), días puntuales
 * (libre, feriado, prioridades, horario propio) y tareas con fecha.
 * Las tres tablas están pensadas para que la API de Claude lea y escriba sin la app:
 * todo es texto simple (fecha YYYY-MM-DD, hora HH:MM) y cada fila se entiende sola.
 */

export const TD = {
  plantilla: 'dia_plantilla',
  dias: 'dia_dias',
  tareas: 'dia_tareas',
} as const;

export type TipoBloque = 'descanso' | 'casa' | 'fabrica' | 'reparto' | 'gym' | 'comida' | 'traslado' | 'libre' | 'otro';

export const TIPOS: Record<TipoBloque, { nombre: string; color: string; emoji: string }> = {
  descanso: { nombre: 'Descanso', color: '#64748b', emoji: '😴' },
  casa: { nombre: 'Casa', color: '#a78bfa', emoji: '🏠' },
  fabrica: { nombre: 'Fábrica', color: '#38bdf8', emoji: '🏭' },
  reparto: { nombre: 'Reparto', color: '#facc15', emoji: '🚚' },
  gym: { nombre: 'Gimnasio', color: '#f472b6', emoji: '🏋️' },
  comida: { nombre: 'Comida', color: '#4ade80', emoji: '🍽️' },
  traslado: { nombre: 'Traslado', color: '#94a3b8', emoji: '🛵' },
  libre: { nombre: 'Libre', color: '#22d3ee', emoji: '🌿' },
  otro: { nombre: 'Otro', color: '#fb923c', emoji: '📌' },
};

/** Un tramo del día. Se usa igual en la semana tipo y en el horario propio de una fecha. */
export interface Bloque {
  inicio: string; // HH:MM
  fin: string; // HH:MM
  titulo: string;
  tipo: TipoBloque;
  nota?: string;
  /** Solo si se da (ej. gimnasio "si está planificado"). */
  opcional?: boolean;
  /** Come en ese lugar (los días de fábrica come allá). Lo lee Alimentación. */
  come_alla?: boolean;
}

/** Fila de dia_plantilla: un bloque de la semana tipo. dia_semana: 0 = domingo … 6 = sábado. */
export interface BloquePlantilla extends Fila, Bloque {
  dia_semana: number;
}

export type EstadoDia = 'normal' | 'libre' | 'feriado' | 'especial';

export interface Prioridad {
  texto: string;
  hecho?: boolean;
}

/** Fila de dia_dias: lo que se marcó para una fecha puntual (una fila por fecha). */
export interface DiaMarcado extends Fila {
  fecha: string;
  estado: EstadoDia;
  /** Nombre del feriado o del día especial. */
  nombre?: string | null;
  nota?: string | null;
  prioridades: Prioridad[];
  /** Horario propio de ese día. null = usa la semana tipo. */
  bloques: Bloque[] | null;
}

export type NivelPrioridad = 'alta' | 'media' | 'baja';

/** Fila de dia_tareas. fecha null = sin fecha (bandeja). */
export interface Tarea extends Fila {
  fecha: string | null;
  hora?: string | null;
  titulo: string;
  hecho: boolean;
  prioridad: NivelPrioridad;
  nota?: string | null;
  /** Quién la cargó: 'app' o 'claude'. */
  origen?: string;
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

/** Horario del gimnasio: el domingo no abre, el sábado abre a las 7. Entrenos de ~1 h 30 (express). */
export const GIMNASIO = { cerrado: [0], abreSabado: '07:00', duracionMin: 90 };

/* ---------- Semana tipo de fábrica (lo que contó la usuaria el 2026-10-15) ---------- */

const b = (dia_semana: number, inicio: string, fin: string, titulo: string, tipo: TipoBloque, extra: Partial<Bloque> = {}) =>
  ({ dia_semana, inicio, fin, titulo, tipo, ...extra });

export const SEMANA_BASE: Array<Omit<BloquePlantilla, 'id'>> = [
  // Lunes: reparto
  b(1, '00:00', '08:30', 'Dormir', 'descanso'),
  b(1, '08:30', '11:00', 'Despertar y mañana en casa', 'casa', { nota: 'Me despierto entre las 8 y las 9' }),
  b(1, '11:00', '12:00', 'A la fábrica a cargar', 'traslado'),
  b(1, '12:00', '15:30', 'Reparto', 'reparto', { nota: 'Hasta las 3 o 4' }),
  b(1, '15:30', '16:30', 'Almuerzo', 'comida'),
  b(1, '17:00', '18:00', 'Reparto de la siesta', 'reparto', { opcional: true, nota: 'Si quedaron clientes: uno o dos' }),
  b(1, '18:00', '19:30', 'Gimnasio', 'gym', { opcional: true, nota: 'Si está planificado' }),
  b(1, '19:30', '24:00', 'En casa', 'casa'),
  // Martes y miércoles: fábrica
  ...[2, 3].flatMap((d) => [
    b(d, '00:00', '07:00', 'Dormir', 'descanso'),
    b(d, '07:00', '08:00', 'Despertar y salir', 'traslado'),
    b(d, '08:00', '17:00', 'Fábrica', 'fabrica', { come_alla: true, nota: 'Como en la fábrica' }),
    b(d, '17:00', '18:00', 'Reparto de un par de clientes', 'reparto', { nota: 'Me llevo un poco de carga' }),
    b(d, '18:30', '20:00', 'Gimnasio', 'gym', { opcional: true }),
    b(d, '20:00', '24:00', 'En casa', 'casa'),
  ]),
  // Jueves: reparto partido con gimnasio en el medio
  b(4, '00:00', '08:30', 'Dormir', 'descanso'),
  b(4, '08:30', '11:00', 'Mañana en casa', 'casa'),
  b(4, '11:00', '14:30', 'Reparto', 'reparto', { nota: 'Paso por la fábrica a cargar' }),
  b(4, '14:30', '15:30', 'Almuerzo en casa', 'comida'),
  b(4, '15:30', '18:00', 'Siesta / casa', 'casa'),
  b(4, '18:00', '19:00', 'Reparto cerca del gym', 'reparto'),
  b(4, '19:00', '20:30', 'Gimnasio', 'gym', { nota: 'Entreno express, ~1 h 30' }),
  b(4, '20:30', '21:00', 'Vuelta', 'traslado'),
  b(4, '21:00', '24:00', 'En casa', 'casa'),
  // Viernes: fábrica + reparto largo (zona El Challao)
  b(5, '00:00', '07:00', 'Dormir', 'descanso'),
  b(5, '07:00', '08:00', 'Despertar y salir', 'traslado'),
  b(5, '08:00', '17:00', 'Fábrica', 'fabrica', { come_alla: true, nota: 'Como en la fábrica' }),
  b(5, '17:00', '20:00', 'Reparto zona El Challao', 'reparto', { nota: 'Reparto más abundante' }),
  b(5, '20:00', '24:00', 'En casa', 'casa'),
  // Sábado: reparto de mañana y cobro
  b(6, '00:00', '09:00', 'Dormir', 'descanso'),
  b(6, '09:00', '10:30', 'Mañana en casa', 'casa'),
  b(6, '10:30', '14:30', 'Reparto', 'reparto', { nota: 'Salgo de la fábrica 10:30, termino 2 o 3' }),
  b(6, '14:30', '15:30', 'Almuerzo · día de cobro', 'comida'),
  b(6, '15:30', '24:00', 'Tarde libre', 'libre', { nota: 'El gimnasio abre a las 7 por si voy' }),
  // Domingo: libre, el gimnasio no abre
  b(0, '00:00', '10:00', 'Dormir', 'descanso'),
  b(0, '10:00', '18:00', 'Día libre', 'libre', { nota: 'El gimnasio no abre' }),
  b(0, '18:00', '19:00', 'Organizar la semana', 'otro'),
  b(0, '19:00', '24:00', 'En casa', 'casa'),
];

/* ---------- Feriados de Argentina (+ Mendoza) ---------- */

export interface Feriado {
  fecha: string;
  nombre: string;
  tipo: 'nacional' | 'puente' | 'provincial';
}

/** Feriados nacionales 2026–2027 (con los traslados de la ley 27.399) y el de Mendoza. */
export const FERIADOS: Feriado[] = [
  ['2026-01-01', 'Año Nuevo'], ['2026-02-16', 'Carnaval'], ['2026-02-17', 'Carnaval'],
  ['2026-03-23', 'Día no laborable con fines turísticos', 'puente'], ['2026-03-24', 'Día de la Memoria'],
  ['2026-04-02', 'Malvinas · Jueves Santo'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajador'],
  ['2026-05-25', 'Revolución de Mayo'], ['2026-06-15', 'Paso a la Inmortalidad de Güemes'], ['2026-06-20', 'Día de la Bandera'],
  ['2026-07-09', 'Día de la Independencia'], ['2026-07-10', 'Día no laborable con fines turísticos', 'puente'],
  ['2026-07-25', 'Santiago Apóstol (Mendoza)', 'provincial'], ['2026-08-17', 'Paso a la Inmortalidad de San Martín'],
  ['2026-10-12', 'Día de la Diversidad Cultural'], ['2026-11-23', 'Día de la Soberanía Nacional'],
  ['2026-12-07', 'Día no laborable con fines turísticos', 'puente'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'], ['2027-02-08', 'Carnaval'], ['2027-02-09', 'Carnaval'], ['2027-03-24', 'Día de la Memoria'],
  ['2027-03-25', 'Jueves Santo'], ['2027-03-26', 'Viernes Santo'], ['2027-04-02', 'Día de Malvinas'], ['2027-05-01', 'Día del Trabajador'],
  ['2027-05-25', 'Revolución de Mayo'], ['2027-06-20', 'Día de la Bandera'], ['2027-06-21', 'Paso a la Inmortalidad de Güemes'],
  ['2027-07-09', 'Día de la Independencia'], ['2027-07-25', 'Santiago Apóstol (Mendoza)', 'provincial'],
  ['2027-08-16', 'Paso a la Inmortalidad de San Martín'], ['2027-10-11', 'Día de la Diversidad Cultural'],
  ['2027-11-20', 'Día de la Soberanía Nacional'], ['2027-12-08', 'Inmaculada Concepción'], ['2027-12-25', 'Navidad'],
].map(([fecha, nombre, tipo]) => ({ fecha, nombre, tipo: (tipo ?? 'nacional') as Feriado['tipo'] }));

const FERIADO_POR_FECHA = new Map(FERIADOS.map((f) => [f.fecha, f]));

export function feriadoDe(fecha: string): Feriado | undefined {
  return FERIADO_POR_FECHA.get(fecha);
}

/* ---------- Horas ---------- */

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function deMinutos(min: number): string {
  const h = Math.floor(min / 60);
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "18:00" → "18 h", "18:30" → "18:30". */
export function horaCorta(hhmm: string): string {
  return hhmm.endsWith(':00') ? `${Number(hhmm.slice(0, 2))} h` : hhmm.replace(/^0/, '');
}

export function ahoraMinutos(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const ordenar = <T extends Bloque>(bs: T[]) => [...bs].sort((x, y) => aMinutos(x.inicio) - aMinutos(y.inicio));

/* ---------- Hooks ---------- */

export const usePlantilla = () => useTabla<BloquePlantilla>(TD.plantilla);
export const useDias = () => useTabla<DiaMarcado>(TD.dias);
export const useTareas = () => useTabla<Tarea>(TD.tareas);

/** Semana tipo efectiva: la guardada, o la de fábrica si todavía no se guardó ninguna. */
export function semanaTipo(plantilla: BloquePlantilla[]): Array<Omit<BloquePlantilla, 'id'> & { id?: string }> {
  return plantilla.length ? plantilla : SEMANA_BASE;
}

export interface VistaDia {
  fecha: string;
  diaSemana: number;
  marcado?: DiaMarcado;
  feriado?: Feriado;
  estado: EstadoDia;
  bloques: Bloque[];
  /** true si el horario sale de la semana tipo (no se tocó para esta fecha). */
  tipo: boolean;
  tareas: Tarea[];
}

/** Arma el día: horario (propio o de la semana tipo), feriado, marcas y tareas. */
export function armarDia(fecha: string, plantilla: BloquePlantilla[], dias: DiaMarcado[], tareas: Tarea[]): VistaDia {
  const diaSemana = desdeISO(fecha).getDay();
  const marcado = dias.find((d) => d.fecha === fecha);
  const feriado = feriadoDe(fecha);
  const propio = marcado?.bloques ?? null;
  let bloques: Bloque[] = propio ?? semanaTipo(plantilla).filter((x) => x.dia_semana === diaSemana);
  const estado: EstadoDia = marcado?.estado ?? (feriado && feriado.tipo !== 'puente' ? 'feriado' : 'normal');
  // Un día libre sin horario propio se ve como libre (solo dormir y el resto libre).
  if (!propio && estado === 'libre') bloques = [{ inicio: '00:00', fin: '09:00', titulo: 'Dormir', tipo: 'descanso' }, { inicio: '09:00', fin: '24:00', titulo: 'Día libre', tipo: 'libre' }];
  return {
    fecha, diaSemana, marcado, feriado, estado, tipo: !propio,
    bloques: ordenar(bloques),
    tareas: tareas.filter((t) => t.fecha === fecha).sort((x, y) => (x.hora ?? '99').localeCompare(y.hora ?? '99')),
  };
}

/** Bloque que está pasando a esa hora (en minutos desde las 0). */
export function bloqueEn(bloques: Bloque[], min: number): Bloque | undefined {
  return bloques.find((x) => aMinutos(x.inicio) <= min && min < aMinutos(x.fin));
}

/**
 * Para Alimentación: ¿ese día come afuera (en la fábrica)? Mira los bloques con come_alla.
 * Se usa con los bloques de armarDia().
 */
export function comeEnFabrica(bloques: Bloque[]): boolean {
  return bloques.some((x) => x.come_alla);
}

/** Semana (lunes a domingo) que contiene la fecha. */
export function semanaDe(fecha: string): string[] {
  const dow = desdeISO(fecha).getDay();
  const lunes = sumarDias(fecha, -((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** Celdas del mes (empieza en lunes, completa con días del mes anterior/siguiente). */
export function celdasMes(yyyymm: string): string[] {
  const primero = `${yyyymm}-01`;
  const inicio = semanaDe(primero)[0];
  return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
}

/* ---------- Escrituras ---------- */

/** Guarda o actualiza la fila de una fecha (una sola por fecha). */
export async function guardarDia(dias: DiaMarcado[], fecha: string, cambios: Partial<Omit<DiaMarcado, 'id' | 'fecha'>>) {
  const existe = dias.find((d) => d.fecha === fecha);
  if (existe) return modificar<DiaMarcado>(TD.dias, existe.id, cambios);
  await crear<DiaMarcado>(TD.dias, { fecha, estado: 'normal', nombre: null, nota: null, prioridades: [], bloques: null, ...cambios });
}

/** Si la semana tipo todavía es la de fábrica, la guarda en la tabla (para poder editarla y que Claude la lea). */
export async function guardarSemanaBase(plantilla: BloquePlantilla[]) {
  if (plantilla.length) return 0;
  for (const x of SEMANA_BASE) await crear<BloquePlantilla>(TD.plantilla, x);
  return SEMANA_BASE.length;
}

/** Reemplaza los bloques de un día de la semana tipo. Si todavía era la de fábrica, guarda el resto tal cual. */
export async function guardarDiaPlantilla(plantilla: BloquePlantilla[], diaSemana: number, bloques: Bloque[]) {
  if (!plantilla.length) {
    for (const x of SEMANA_BASE.filter((y) => y.dia_semana !== diaSemana)) await crear<BloquePlantilla>(TD.plantilla, x);
  } else {
    for (const f of plantilla.filter((y) => y.dia_semana === diaSemana)) await eliminar(TD.plantilla, f.id);
  }
  for (const x of ordenar(bloques)) await crear<BloquePlantilla>(TD.plantilla, { ...x, dia_semana: diaSemana });
}
