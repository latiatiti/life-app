/* ---------- Biblioteca de ejercicios: grupo muscular, equipo y valores por defecto ---------- */

export type Grupo =
  | 'pecho' | 'espalda' | 'hombros' | 'biceps' | 'triceps' | 'antebrazo'
  | 'cuadriceps' | 'isquios' | 'gluteos' | 'gemelos' | 'core';

export const GRUPOS: Array<{ id: Grupo; nombre: string }> = [
  { id: 'pecho', nombre: 'Pecho' }, { id: 'espalda', nombre: 'Espalda' }, { id: 'hombros', nombre: 'Hombros' },
  { id: 'biceps', nombre: 'Bíceps' }, { id: 'triceps', nombre: 'Tríceps' }, { id: 'antebrazo', nombre: 'Antebrazo' },
  { id: 'cuadriceps', nombre: 'Cuádriceps' }, { id: 'isquios', nombre: 'Isquiotibiales' }, { id: 'gluteos', nombre: 'Glúteos' },
  { id: 'gemelos', nombre: 'Gemelos' }, { id: 'core', nombre: 'Abdomen / core' },
];
export const nombreGrupo = (g: Grupo) => GRUPOS.find((x) => x.id === g)?.nombre ?? g;

export type Equipo = 'barra' | 'mancuernas' | 'maquina' | 'polea' | 'peso corporal' | 'otro';

export interface EjercicioBase {
  nombre: string;
  /** Grupo que más trabaja: cuenta como 1 serie para ese grupo. */
  grupo: Grupo;
  /** Grupos que ayudan: cuentan como media serie. */
  secundarios: Grupo[];
  equipo: Equipo;
  /** Multiarticular (pesado, más descanso) o de aislamiento. */
  compuesto: boolean;
  /** Cuánto subir de peso cuando toca progresar (kg). */
  salto: number;
  /** Mapa de calor fino (0–1 por zona). Si no está, sale del grupo y los secundarios. */
  zonas?: Partial<Record<Zona, number>>;
  /** Qué tenés que sentir y dónde (pista de técnica). */
  sentir?: string;
  /** Hasta 5 ejercicios para rotar en su lugar (variedad entre ciclos o máquina ocupada). */
  variantes?: string[];
  /** true si lo cargó la usuaria (o Claude) y no viene de fábrica. */
  propio?: boolean;
}

/* ---------- Zonas del mapa muscular (más finas que los grupos) ---------- */

export type Zona =
  | 'pecho' | 'deltoide_ant' | 'deltoide_lat' | 'deltoide_post' | 'trapecio' | 'dorsales' | 'lumbar'
  | 'biceps' | 'triceps' | 'antebrazo' | 'abdominales' | 'oblicuos'
  | 'gluteos' | 'cuadriceps' | 'aductores' | 'isquios' | 'gemelos';

export const ZONAS: Array<{ id: Zona; nombre: string; grupo: Grupo }> = [
  { id: 'pecho', nombre: 'Pecho', grupo: 'pecho' },
  { id: 'deltoide_ant', nombre: 'Hombro frontal', grupo: 'hombros' },
  { id: 'deltoide_lat', nombre: 'Hombro lateral', grupo: 'hombros' },
  { id: 'deltoide_post', nombre: 'Hombro posterior', grupo: 'hombros' },
  { id: 'trapecio', nombre: 'Trapecio', grupo: 'espalda' },
  { id: 'dorsales', nombre: 'Dorsales', grupo: 'espalda' },
  { id: 'lumbar', nombre: 'Lumbar', grupo: 'espalda' },
  { id: 'biceps', nombre: 'Bíceps', grupo: 'biceps' },
  { id: 'triceps', nombre: 'Tríceps', grupo: 'triceps' },
  { id: 'antebrazo', nombre: 'Antebrazo', grupo: 'antebrazo' },
  { id: 'abdominales', nombre: 'Abdominales', grupo: 'core' },
  { id: 'oblicuos', nombre: 'Oblicuos', grupo: 'core' },
  { id: 'gluteos', nombre: 'Glúteos', grupo: 'gluteos' },
  { id: 'cuadriceps', nombre: 'Cuádriceps', grupo: 'cuadriceps' },
  { id: 'aductores', nombre: 'Aductores', grupo: 'cuadriceps' },
  { id: 'isquios', nombre: 'Isquiotibiales', grupo: 'isquios' },
  { id: 'gemelos', nombre: 'Gemelos', grupo: 'gemelos' },
];
export const nombreZona = (z: Zona) => ZONAS.find((x) => x.id === z)?.nombre ?? z;
export const esZona = (z: string): z is Zona => ZONAS.some((x) => x.id === z);

/** Zonas que cubre cada grupo cuando un ejercicio no trae su mapa fino. */
const ZONAS_DE_GRUPO: Record<Grupo, Zona[]> = {
  pecho: ['pecho'], espalda: ['dorsales', 'trapecio'], hombros: ['deltoide_ant', 'deltoide_lat', 'deltoide_post'],
  biceps: ['biceps'], triceps: ['triceps'], antebrazo: ['antebrazo'], cuadriceps: ['cuadriceps'], isquios: ['isquios'],
  gluteos: ['gluteos'], gemelos: ['gemelos'], core: ['abdominales', 'oblicuos'],
};

const b = (nombre: string, grupo: Grupo, secundarios: Grupo[], equipo: Equipo, compuesto: boolean, salto = 2.5): EjercicioBase =>
  ({ nombre, grupo, secundarios, equipo, compuesto, salto });

export const BIBLIOTECA: EjercicioBase[] = [
  // Pecho
  b('Press de banca con barra', 'pecho', ['triceps', 'hombros'], 'barra', true),
  b('Press de banca con mancuernas', 'pecho', ['triceps', 'hombros'], 'mancuernas', true, 2),
  b('Press inclinado con barra', 'pecho', ['hombros', 'triceps'], 'barra', true),
  b('Press inclinado con mancuernas', 'pecho', ['hombros', 'triceps'], 'mancuernas', true, 2),
  b('Press declinado con barra', 'pecho', ['triceps'], 'barra', true),
  b('Press de pecho en máquina', 'pecho', ['triceps', 'hombros'], 'maquina', true, 5),
  b('Fondos en paralelas (o press declinado)', 'pecho', ['triceps', 'hombros'], 'peso corporal', true),
  b('Aperturas en polea o máquina', 'pecho', [], 'polea', false),
  b('Aperturas con mancuernas', 'pecho', [], 'mancuernas', false, 2),
  b('Cruce de poleas', 'pecho', [], 'polea', false),
  b('Flexiones de brazos', 'pecho', ['triceps', 'hombros'], 'peso corporal', true, 0),
  // Espalda
  b('Dominadas o jalón al pecho', 'espalda', ['biceps'], 'peso corporal', true),
  b('Dominadas', 'espalda', ['biceps'], 'peso corporal', true),
  b('Jalón al pecho agarre abierto', 'espalda', ['biceps'], 'polea', true, 5),
  b('Jalón al pecho agarre neutro', 'espalda', ['biceps'], 'polea', true, 5),
  b('Remo con barra', 'espalda', ['biceps', 'isquios'], 'barra', true),
  b('Remo con mancuerna a una mano', 'espalda', ['biceps'], 'mancuernas', true, 2),
  b('Remo sentado en polea', 'espalda', ['biceps'], 'polea', true, 5),
  b('Remo en máquina con apoyo de pecho', 'espalda', ['biceps'], 'maquina', true, 5),
  b('Remo en T', 'espalda', ['biceps'], 'barra', true),
  b('Pullover en polea', 'espalda', [], 'polea', false),
  b('Peso muerto convencional', 'espalda', ['gluteos', 'isquios', 'cuadriceps'], 'barra', true, 5),
  b('Hiperextensiones', 'espalda', ['gluteos', 'isquios'], 'peso corporal', false),
  // Hombros
  b('Press militar con barra', 'hombros', ['triceps'], 'barra', true),
  b('Press de hombros con mancuernas', 'hombros', ['triceps'], 'mancuernas', true, 2),
  b('Press de hombros en máquina', 'hombros', ['triceps'], 'maquina', true, 5),
  b('Elevaciones laterales con mancuernas', 'hombros', [], 'mancuernas', false, 1),
  b('Elevaciones laterales en polea', 'hombros', [], 'polea', false, 1.25),
  b('Pájaros (deltoides posterior)', 'hombros', ['espalda'], 'mancuernas', false, 1),
  b('Face pull en polea', 'hombros', ['espalda'], 'polea', false),
  b('Remo al mentón', 'hombros', ['biceps'], 'barra', true),
  b('Encogimientos (trapecio)', 'espalda', [], 'mancuernas', false, 2),
  // Bíceps
  b('Curl de bíceps con barra', 'biceps', ['antebrazo'], 'barra', false, 2),
  b('Curl con barra Z', 'biceps', ['antebrazo'], 'barra', false, 2),
  b('Curl alternado con mancuernas', 'biceps', ['antebrazo'], 'mancuernas', false, 1),
  b('Curl martillo con mancuernas', 'biceps', ['antebrazo'], 'mancuernas', false, 2),
  b('Curl inclinado con mancuernas', 'biceps', [], 'mancuernas', false, 1),
  b('Curl predicador (banco Scott)', 'biceps', [], 'maquina', false, 2),
  b('Curl en polea', 'biceps', [], 'polea', false),
  // Tríceps
  b('Press francés con barra Z', 'triceps', [], 'barra', false, 2),
  b('Extensión de tríceps en polea', 'triceps', [], 'polea', false),
  b('Extensión de tríceps con soga', 'triceps', [], 'polea', false),
  b('Extensión por encima de la cabeza en polea', 'triceps', [], 'polea', false),
  b('Press cerrado con barra', 'triceps', ['pecho'], 'barra', true),
  b('Fondos en banco', 'triceps', ['pecho'], 'peso corporal', false, 0),
  b('Patada de tríceps', 'triceps', [], 'mancuernas', false, 1),
  // Antebrazo
  b('Curl de muñeca', 'antebrazo', [], 'barra', false, 1),
  b('Caminata del granjero', 'antebrazo', ['espalda', 'core'], 'mancuernas', true, 2),
  // Piernas
  b('Sentadilla con barra', 'cuadriceps', ['gluteos', 'isquios'], 'barra', true, 5),
  b('Sentadilla frontal', 'cuadriceps', ['gluteos'], 'barra', true, 2.5),
  b('Sentadilla hack', 'cuadriceps', ['gluteos'], 'maquina', true, 5),
  b('Sentadilla goblet', 'cuadriceps', ['gluteos'], 'mancuernas', true, 2),
  b('Sentadilla búlgara', 'cuadriceps', ['gluteos'], 'mancuernas', true, 2),
  b('Prensa de piernas', 'cuadriceps', ['gluteos'], 'maquina', true, 10),
  b('Estocadas caminando con mancuernas', 'cuadriceps', ['gluteos'], 'mancuernas', true, 2),
  b('Extensión de cuádriceps', 'cuadriceps', [], 'maquina', false, 5),
  b('Peso muerto rumano', 'isquios', ['gluteos', 'espalda'], 'barra', true, 5),
  b('Peso muerto rumano con mancuernas', 'isquios', ['gluteos'], 'mancuernas', true, 2),
  b('Curl femoral en máquina', 'isquios', [], 'maquina', false),
  b('Curl femoral sentado', 'isquios', [], 'maquina', false),
  b('Hip thrust con barra', 'gluteos', ['isquios'], 'barra', true, 5),
  b('Puente de glúteos', 'gluteos', ['isquios'], 'peso corporal', false),
  b('Abducción de cadera en máquina', 'gluteos', [], 'maquina', false, 5),
  b('Elevación de talones (gemelos)', 'gemelos', [], 'maquina', false, 5),
  b('Gemelos sentado', 'gemelos', [], 'maquina', false, 5),
  // Core
  b('Plancha', 'core', [], 'peso corporal', false, 0),
  b('Crunch en polea', 'core', [], 'polea', false),
  b('Elevación de piernas colgado', 'core', [], 'peso corporal', false, 0),
  b('Rueda abdominal', 'core', [], 'otro', false, 0),
  b('Pallof press', 'core', [], 'polea', false),
];

/** Mapas finos de los ejercicios de fábrica (1 = trabaja fuerte, 0,5 = ayuda, 0,3 = estabiliza). */
const FINO: Record<string, Partial<Record<Zona, number>>> = {
  'Press de banca con barra': { pecho: 1, deltoide_ant: 0.5, triceps: 0.5 },
  'Press inclinado con barra': { pecho: 1, deltoide_ant: 0.7, triceps: 0.5 },
  'Press inclinado con mancuernas': { pecho: 1, deltoide_ant: 0.7, triceps: 0.4 },
  'Fondos en paralelas (o press declinado)': { pecho: 1, triceps: 0.7, deltoide_ant: 0.5 },
  'Dominadas o jalón al pecho': { dorsales: 1, biceps: 0.5, deltoide_post: 0.3, antebrazo: 0.3 },
  'Dominadas': { dorsales: 1, biceps: 0.6, antebrazo: 0.4, abdominales: 0.3 },
  'Remo con barra': { dorsales: 1, trapecio: 0.7, deltoide_post: 0.5, biceps: 0.5, lumbar: 0.4 },
  'Remo con mancuerna a una mano': { dorsales: 1, trapecio: 0.5, deltoide_post: 0.4, biceps: 0.5 },
  'Remo sentado en polea': { dorsales: 1, trapecio: 0.7, deltoide_post: 0.4, biceps: 0.5 },
  'Peso muerto convencional': { lumbar: 1, gluteos: 1, isquios: 0.8, trapecio: 0.6, cuadriceps: 0.5, antebrazo: 0.5 },
  'Hiperextensiones': { lumbar: 1, gluteos: 0.6, isquios: 0.5 },
  'Press militar con barra': { deltoide_ant: 1, deltoide_lat: 0.5, triceps: 0.6, trapecio: 0.3 },
  'Press de hombros con mancuernas': { deltoide_ant: 1, deltoide_lat: 0.6, triceps: 0.5 },
  'Press de hombros en máquina': { deltoide_ant: 1, deltoide_lat: 0.5, triceps: 0.5 },
  'Elevaciones laterales con mancuernas': { deltoide_lat: 1, trapecio: 0.3 },
  'Elevaciones laterales en polea': { deltoide_lat: 1, trapecio: 0.3 },
  'Pájaros (deltoides posterior)': { deltoide_post: 1, trapecio: 0.5 },
  'Face pull en polea': { deltoide_post: 1, trapecio: 0.7 },
  'Remo al mentón': { deltoide_lat: 1, trapecio: 0.8, biceps: 0.3 },
  'Encogimientos (trapecio)': { trapecio: 1, antebrazo: 0.4 },
  'Curl martillo con mancuernas': { biceps: 1, antebrazo: 0.8 },
  'Press cerrado con barra': { triceps: 1, pecho: 0.6, deltoide_ant: 0.4 },
  'Caminata del granjero': { antebrazo: 1, trapecio: 0.7, abdominales: 0.4, oblicuos: 0.5 },
  'Sentadilla con barra': { cuadriceps: 1, gluteos: 0.8, aductores: 0.5, lumbar: 0.3 },
  'Sentadilla búlgara': { cuadriceps: 1, gluteos: 0.8, aductores: 0.4 },
  'Prensa de piernas': { cuadriceps: 1, gluteos: 0.6, aductores: 0.4 },
  'Estocadas caminando con mancuernas': { cuadriceps: 1, gluteos: 0.8, aductores: 0.4 },
  'Peso muerto rumano': { isquios: 1, gluteos: 0.8, lumbar: 0.5 },
  'Peso muerto rumano con mancuernas': { isquios: 1, gluteos: 0.8, lumbar: 0.4 },
  'Hip thrust con barra': { gluteos: 1, isquios: 0.4 },
  'Abducción de cadera en máquina': { gluteos: 1 },
  'Plancha': { abdominales: 1, oblicuos: 0.6 },
  'Pallof press': { oblicuos: 1, abdominales: 0.5 },
  'Elevación de piernas colgado': { abdominales: 1, antebrazo: 0.3 },
};

/** Qué sentir en los básicos. El resto arma la frase desde el mapa. */
const SENTIR: Record<string, string> = {
  'Press de banca con barra': 'Escápulas juntas y abajo; el pecho empuja, los codos a ~45°. Tenés que sentir el estiramiento del pecho abajo.',
  'Press inclinado con mancuernas': 'Sentí la parte alta del pecho; bajá controlado hasta estirar.',
  'Aperturas en polea o máquina': 'Brazos semi flexionados fijos; abrazá un árbol y apretá el pecho al cerrar.',
  'Dominadas o jalón al pecho': 'Tirá con los codos hacia los bolsillos, no con las manos: sentí los costados de la espalda.',
  'Remo con barra': 'Espalda neutra, llevá los codos atrás y juntá los omóplatos al final.',
  'Face pull en polea': 'Tirá hacia la cara separando las manos: sentí la parte de atrás del hombro.',
  'Elevaciones laterales con mancuernas': 'Subí hasta la altura del hombro guiando con los codos; sentí el costado del hombro, no el trapecio.',
  'Curl de bíceps con barra': 'Codos pegados y quietos; sin balanceo. Apretá arriba.',
  'Press francés con barra Z': 'Codos apuntando al techo; solo se mueve el antebrazo.',
  'Extensión de tríceps en polea': 'Codos pegados al cuerpo; estirá del todo y apretá abajo.',
  'Sentadilla con barra': 'Pecho arriba, rodillas siguen la punta de los pies; empujá el piso con todo el pie.',
  'Peso muerto rumano': 'Cadera atrás con rodillas casi fijas: tenés que sentir que estiran los isquios.',
  'Prensa de piernas': 'Bajá hasta que la cadera no se despegue del respaldo; empujá con talones y mitad del pie.',
  'Hip thrust con barra': 'Mentón adentro, empujá con los talones y apretá glúteos arriba un segundo.',
  'Elevación de talones (gemelos)': 'Bajá a estirar del todo, pausa abajo, y subí en puntas.',
};

/** Ejercicios cargados por la usuaria (tabla ent_ejercicios). Los fija useBiblioteca(). */
let PROPIOS: EjercicioBase[] = [];
export function fijarPropios(lista: EjercicioBase[]) { PROPIOS = lista.map((x) => ({ ...x, propio: true })); }
export const todos = (): EjercicioBase[] => [...PROPIOS, ...BIBLIOTECA.filter((b) => !PROPIOS.some((p) => p.nombre.toLowerCase() === b.nombre.toLowerCase()))];

/** Mapa de calor del ejercicio: 0–1 por zona. */
export function zonasDe(nombre: string): Partial<Record<Zona, number>> {
  const info = infoEjercicio(nombre);
  if (!info) return {};
  if (info.zonas && Object.keys(info.zonas).length) return info.zonas;
  if (FINO[info.nombre]) return FINO[info.nombre];
  const r: Partial<Record<Zona, number>> = {};
  for (const g of info.secundarios) for (const z of ZONAS_DE_GRUPO[g]) r[z] = 0.5;
  for (const z of ZONAS_DE_GRUPO[info.grupo]) r[z] = 1;
  return r;
}

/** Frase de qué sentir: la cargada, o armada con las zonas del mapa. */
export function queSentir(nombre: string): string {
  const info = infoEjercicio(nombre);
  if (info?.sentir) return info.sentir;
  if (info && SENTIR[info.nombre]) return SENTIR[info.nombre];
  const z = Object.entries(zonasDe(nombre)) as Array<[Zona, number]>;
  if (!z.length) return '';
  const fuertes = z.filter(([, v]) => v >= 0.8).map(([k]) => nombreZona(k).toLowerCase());
  const ayudan = z.filter(([, v]) => v < 0.8).map(([k]) => nombreZona(k).toLowerCase());
  return `Tenés que sentirlo en ${fuertes.join(' y ') || ayudan.join(' y ')}${fuertes.length && ayudan.length ? `; ayudan ${ayudan.join(', ')}` : ''}.`;
}

/** Datos de un ejercicio por nombre. Los inventados por la usuaria se tratan como aislamiento sin grupo conocido. */
export function infoEjercicio(nombre: string): EjercicioBase | undefined {
  const n = nombre.trim().toLowerCase();
  return PROPIOS.find((x) => x.nombre.toLowerCase() === n) ?? BIBLIOTECA.find((x) => x.nombre.toLowerCase() === n);
}

/** Alternativas del mismo grupo para cambiar un ejercicio (máquina ocupada, molestia, etc.). */
export function alternativas(nombre: string): EjercicioBase[] {
  const info = infoEjercicio(nombre);
  if (!info) return todos();
  return todos().filter((x) => x.grupo === info.grupo && x.nombre !== info.nombre);
}

/**
 * Hasta 5 variantes para rotar: las elegidas a mano primero y, si faltan, las más parecidas
 * (mismo grupo, mismo tipo compuesto/aislamiento, que compartan zonas).
 */
export function variantesDe(nombre: string, elegidas: string[] = []): string[] {
  const info = infoEjercicio(nombre);
  const propias = [...elegidas, ...(info?.variantes ?? [])].filter((v) => v.toLowerCase() !== nombre.toLowerCase());
  const z = zonasDe(nombre);
  const parecido = (x: EjercicioBase) => {
    const zx = zonasDe(x.nombre);
    let p = Number(x.compuesto === info?.compuesto) * 2;
    for (const k of Object.keys(z) as Zona[]) p += Math.min(z[k] ?? 0, zx[k] ?? 0) * 3;
    return p;
  };
  const auto = alternativas(nombre).sort((a, b) => parecido(b) - parecido(a)).map((x) => x.nombre);
  return [...new Set([...propias, ...auto])].slice(0, 5);
}
