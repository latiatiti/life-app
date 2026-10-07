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
}

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

/** Datos de un ejercicio por nombre. Los inventados por la usuaria se tratan como aislamiento sin grupo conocido. */
export function infoEjercicio(nombre: string): EjercicioBase | undefined {
  const n = nombre.trim().toLowerCase();
  return BIBLIOTECA.find((x) => x.nombre.toLowerCase() === n);
}

/** Alternativas del mismo grupo para cambiar un ejercicio (máquina ocupada, molestia, etc.). */
export function alternativas(nombre: string): EjercicioBase[] {
  const info = infoEjercicio(nombre);
  if (!info) return BIBLIOTECA;
  return BIBLIOTECA.filter((x) => x.grupo === info.grupo && x.nombre !== info.nombre);
}
