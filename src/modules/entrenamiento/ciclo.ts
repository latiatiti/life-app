import { desdeISO, diasEntre, hoy, sumarDias } from '../../core/format';
import { alternativas, infoEjercicio, nombreGrupo, type Grupo } from './biblioteca';
import type { DiaPlan, EjercicioPlan, Serie, Sesion } from './modelo';

/* ---------- Preparador: ciclos de 4 semanas (mesociclos) ---------- */

/**
 * Cómo se ajusta la rutina una semana del ciclo.
 * series: series de más (+1) o de menos (−1) por ejercicio · seriesPct: % de las series (50 = la mitad, para descargar)
 * rpe: esfuerzo de más o de menos (−1 = una repetición más en reserva) · rpeFijo: esfuerzo fijo (descarga)
 * carga: % del peso sugerido (100 = normal, 85 = 15 % menos).
 */
export interface SemanaCiclo {
  nombre: string;
  series?: number;
  seriesPct?: number;
  rpe?: number;
  rpeFijo?: number;
  carga?: number;
  nota?: string;
}

export type Nivel = 'nuevo' | 'intermedio' | 'avanzado';

/** Datos de la persona para estimar pesos iniciales. Se guardan junto al ciclo. */
export interface Perfil {
  peso_kg: number;
  nivel: Nivel;
  sexo?: 'f' | 'm' | null;
  altura_cm?: number | null;
}

export interface Ciclo {
  semanas: SemanaCiclo[];
  /** Objetivo del ciclo, en palabras (lo escribe la persona, Claude o la propuesta automática). */
  objetivo?: string;
  perfil?: Perfil | null;
  /** Número de ciclo (1, 2, 3…), para el historial. */
  numero?: number;
}

/** Ciclo por defecto: tres semanas subiendo el esfuerzo y una de descarga. */
export const CICLO_BASE: SemanaCiclo[] = [
  { nombre: 'Adaptación', rpe: -1, nota: 'Técnica y pesos cómodos: dejá 3 repeticiones en reserva.' },
  { nombre: 'Carga', nota: 'Esfuerzo normal: buscá sumar repeticiones o peso.' },
  { nombre: 'Sobrecarga', series: 1, nota: 'Una serie más en los ejercicios: es la semana más dura.' },
  { nombre: 'Descarga', seriesPct: 50, rpeFijo: 6, carga: 85, nota: 'La mitad de las series, 15 % menos de peso y lejos del fallo. Acá se consolida lo ganado.' },
];

export interface EstadoCiclo {
  /** 0 = primera semana. */
  indice: number;
  semana: SemanaCiclo;
  total: number;
  /** Ya pasaron todas las semanas: toca armar el próximo. */
  terminado: boolean;
  diasRestantes: number;
}

/** Lunes de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const dow = (desdeISO(fecha).getDay() + 6) % 7;
  return sumarDias(fecha, -dow);
}

export function estadoCiclo(ciclo: Ciclo | null | undefined, inicio: string | null | undefined, fecha = hoy()): EstadoCiclo | null {
  if (!ciclo?.semanas?.length || !inicio) return null;
  const d = diasEntre(inicio, fecha);
  if (d < 0) return null;
  const total = ciclo.semanas.length;
  const i = Math.floor(d / 7);
  const terminado = i >= total;
  const indice = Math.min(i, total - 1);
  return { indice, semana: ciclo.semanas[indice], total, terminado, diasRestantes: Math.max(0, total * 7 - d) };
}

/** Aplica la semana del ciclo a un ejercicio: series y esfuerzo objetivo. */
export function ajustarEjercicio(ej: EjercicioPlan, s: SemanaCiclo | null | undefined): EjercicioPlan {
  if (!s) return ej;
  let series = ej.series;
  if (s.seriesPct != null) series = Math.max(1, Math.round((series * s.seriesPct) / 100));
  if (s.series) series = Math.max(1, series + s.series);
  let rpe = ej.rpe;
  if (s.rpeFijo != null) rpe = s.rpeFijo;
  else if (s.rpe) rpe = Math.max(5, Math.min(10, rpe + s.rpe));
  return { ...ej, series, rpe };
}

export const ajustarDia = (d: DiaPlan, s: SemanaCiclo | null | undefined): DiaPlan => (s ? { ...d, ejercicios: d.ejercicios.map((x) => ajustarEjercicio(x, s)) } : d);

/** Texto corto para mostrar qué cambia esta semana. */
export function describirSemana(s: SemanaCiclo): string {
  const p: string[] = [];
  if (s.seriesPct != null && s.seriesPct !== 100) p.push(`${s.seriesPct} % de las series`);
  if (s.series) p.push(`${s.series > 0 ? '+' : ''}${s.series} serie${Math.abs(s.series) === 1 ? '' : 's'} por ejercicio`);
  if (s.rpeFijo != null) p.push(`RPE ${s.rpeFijo}`);
  else if (s.rpe) p.push(`RPE ${s.rpe > 0 ? '+' : ''}${s.rpe}`);
  if (s.carga != null && s.carga !== 100) p.push(`${s.carga} % del peso`);
  return p.length ? p.join(' · ') : 'Rutina tal cual';
}

/* ---------- Peso inicial estimado (cuando nunca hiciste el ejercicio) ---------- */

/**
 * Peso de trabajo aproximado para 8–10 repeticiones, como fracción del peso corporal,
 * para alguien que recién empieza (varón). Son puntos de partida conservadores, no un test:
 * la primera semana del ciclo es de adaptación justamente para corregirlos.
 * En mancuernas el valor es por mano.
 */
const RELACIONES: Array<[RegExp, number]> = [
  [/peso muerto convencional/, 0.7],
  [/peso muerto rumano con mancuernas/, 0.18],
  [/peso muerto rumano/, 0.5],
  [/hip thrust/, 0.6],
  [/sentadilla con barra|sentadilla frontal/, 0.55],
  [/sentadilla hack/, 0.6],
  [/sentadilla goblet/, 0.2],
  [/sentadilla búlgara|estocadas/, 0.1],
  [/prensa/, 1.2],
  [/gemelos|talones/, 0.6],
  [/extensión de cuádriceps|curl femoral/, 0.35],
  [/abducción/, 0.4],
  [/press de banca con barra|press de pecho en máquina/, 0.45],
  [/press inclinado con barra|press declinado/, 0.38],
  [/press cerrado/, 0.35],
  [/press (de banca|inclinado) con mancuernas/, 0.14],
  [/press militar/, 0.28],
  [/press de hombros con mancuernas/, 0.1],
  [/press de hombros en máquina/, 0.3],
  [/remo con barra|remo en t/, 0.4],
  [/remo con mancuerna/, 0.18],
  [/remo sentado|remo en máquina|jalón/, 0.45],
  [/pullover/, 0.2],
  [/aperturas con mancuernas|elevaciones laterales con|pájaros|patada/, 0.05],
  [/aperturas|cruce de poleas|elevaciones laterales en polea|face pull/, 0.15],
  [/curl de bíceps con barra|curl con barra z|curl predicador/, 0.2],
  [/curl (alternado|martillo|inclinado)/, 0.08],
  [/curl en polea/, 0.18],
  [/press francés/, 0.18],
  [/extensión (de tríceps|por encima)/, 0.2],
  [/remo al mentón/, 0.25],
  [/encogimientos|caminata del granjero/, 0.25],
  [/crunch en polea|pallof/, 0.3],
  [/curl de muñeca/, 0.12],
];

const FACTOR_NIVEL: Record<Nivel, number> = { nuevo: 1, intermedio: 1.45, avanzado: 1.9 };

/** Redondea a lo que se puede cargar: 2,5 kg en barra/máquina, 1 kg en mancuernas. */
export function redondearCarga(peso: number, nombre: string): number {
  const eq = infoEjercicio(nombre)?.equipo;
  const paso = eq === 'mancuernas' ? 1 : eq === 'barra' || eq === 'maquina' ? 2.5 : 1.25;
  return Math.max(0, Math.round(peso / paso) * paso);
}

export function pesoInicial(perfil: Perfil | null | undefined, nombre: string): number | null {
  if (!perfil?.peso_kg) return null;
  const info = infoEjercicio(nombre);
  if (info?.equipo === 'peso corporal') return 0;
  const n = nombre.toLowerCase();
  const r = RELACIONES.find(([re]) => re.test(n))?.[1] ?? (info?.compuesto ? 0.3 : 0.12);
  const inferior = info && ['cuadriceps', 'isquios', 'gluteos', 'gemelos'].includes(info.grupo);
  const sexo = perfil.sexo === 'f' ? (inferior ? 0.75 : 0.6) : perfil.sexo === 'm' ? 1 : 0.85;
  return redondearCarga(perfil.peso_kg * r * FACTOR_NIVEL[perfil.nivel] * sexo, nombre);
}

/* ---------- Propuesta automática para el próximo ciclo ---------- */

export interface CambioPropuesto {
  tipo: 'cambio' | 'series' | 'reps' | 'ok';
  texto: string;
}

export interface Propuesta {
  dias: DiaPlan[];
  cambios: CambioPropuesto[];
  objetivo: string;
}

interface ApoyoAnalisis {
  progreso: (series: Serie[], nombre: string) => Array<{ fecha: string; mejor: number }>;
  porGrupo: (series: Serie[]) => Record<Grupo, number>;
  rango: (g: Grupo) => [number, number];
}

/**
 * Arma el próximo ciclo a partir de lo que pasó en este:
 * - ejercicio sin mejora en todo el ciclo → se cambia por otro del mismo músculo;
 * - músculo por debajo del rango de series semanales → +1 serie en su primer ejercicio;
 * - músculo por encima del rango → −1 serie;
 * - ejercicio que progresó bien → se mantiene (la doble progresión sigue subiendo el peso).
 */
export function proponerCiclo(dias: DiaPlan[], sesiones: Sesion[], series: Serie[], inicio: string, a: ApoyoAnalisis, fin = hoy()): Propuesta {
  const delCiclo = series.filter((s) => s.fecha >= inicio && s.fecha <= fin && s.tipo !== 'calentamiento');
  const antes = series.filter((s) => s.fecha < inicio && s.tipo !== 'calentamiento');
  const sesionesCiclo = sesiones.filter((s) => s.fecha >= inicio && s.fecha <= fin && s.dia !== 'otro');
  const cambios: CambioPropuesto[] = [];
  const usados = new Set(dias.flatMap((d) => d.ejercicios.map((x) => x.nombre)));

  const nuevos = dias.map((d) => ({
    ...d,
    ejercicios: d.ejercicios.map((ej) => {
      const pts = a.progreso(delCiclo, ej.nombre);
      const previos = a.progreso(antes, ej.nombre);
      if (pts.length < 2) return ej;
      const mejorAntes = Math.max(0, ...previos.map((p) => p.mejor), pts[0].mejor);
      const mejorAhora = Math.max(...pts.slice(1).map((p) => p.mejor));
      const sube = (mejorAhora - mejorAntes) / (mejorAntes || 1);
      if (sube <= 0.01 && pts.length >= 3) {
        const alt = alternativas(ej.nombre).find((x) => !usados.has(x.nombre) && x.compuesto === (infoEjercicio(ej.nombre)?.compuesto ?? x.compuesto));
        if (alt) {
          usados.add(alt.nombre);
          cambios.push({ tipo: 'cambio', texto: `${ej.nombre} no mejoró en el ciclo: lo cambio por ${alt.nombre} (mismo músculo, estímulo nuevo).` });
          return { ...ej, nombre: alt.nombre, salto: alt.salto, nota: `Reemplaza a ${ej.nombre}.` };
        }
      }
      if (sube >= 0.05) cambios.push({ tipo: 'ok', texto: `${ej.nombre}: +${Math.round(sube * 100)} % de fuerza estimada. Se mantiene.` });
      return ej;
    }),
  }));

  const esperadas = dias.length * 3; // 3 semanas de carga
  const hechas = sesionesCiclo.length;
  const adherencia = Math.min(1, hechas / esperadas);

  // Volumen semanal promedio por grupo durante las semanas de carga (sin la descarga).
  // Si faltaste a muchas sesiones, el volumen bajo es por las faltas y no por la rutina: no se suman series.
  const semanasCarga = Math.max(1, Math.round(diasEntre(inicio, fin) / 7) - 1);
  const porGrupo = a.porGrupo(delCiclo.filter((s) => s.fecha < sumarDias(inicio, semanasCarga * 7)));
  for (const [g, total] of Object.entries(porGrupo) as Array<[Grupo, number]>) {
    const prom = total / semanasCarga;
    const [min, max] = a.rango(g);
    const objetivo = nuevos.flatMap((d) => d.ejercicios).find((x) => infoEjercicio(x.nombre)?.grupo === g);
    if (!objetivo || total === 0) continue;
    if (prom < min * 0.8 && adherencia >= 0.7) {
      objetivo.series += 1;
      cambios.push({ tipo: 'series', texto: `${nombreGrupo(g)}: promediaste ${prom.toFixed(1).replace('.', ',')} series por semana (rango ${min}–${max}). +1 serie en ${objetivo.nombre}.` });
    } else if (prom > max * 1.1 && objetivo.series > 2) {
      objetivo.series -= 1;
      cambios.push({ tipo: 'series', texto: `${nombreGrupo(g)}: ${prom.toFixed(1).replace('.', ',')} series por semana, por encima de ${max}. −1 serie en ${objetivo.nombre}.` });
    }
  }

  if (adherencia < 0.7) cambios.unshift({ tipo: 'ok', texto: `Hiciste ${hechas} de ${esperadas} sesiones de carga: no subo el volumen. Mismo plan, el objetivo es completar las semanas.` });
  const objetivo = adherencia < 0.7
    ? `Ciclo de consolidación: hiciste ${hechas} de ${esperadas} sesiones de carga. Prioridad: constancia antes que sumar volumen.`
    : 'Ciclo de progresión: mismos patrones, más volumen donde faltaba y ejercicios nuevos donde te estancaste.';
  if (!cambios.length) cambios.push({ tipo: 'ok', texto: 'Todo progresó dentro de lo esperado: repetimos la rutina y la doble progresión sigue subiendo pesos.' });
  return { dias: nuevos, cambios, objetivo };
}
