import { infoEjercicio, todos } from './biblioteca';
import { CICLO_BASE, type Ciclo, type SemanaCiclo } from './ciclo';
import { e, type DiaPlan, type EjercicioPlan } from './modelo';

/* ---------- Formato de tabla compacto para rutinas ----------
 *
 * Pensado para escribirlo a mano o pedírselo a Claude gastando pocas palabras:
 *
 *   RUTINA: Hipertrofia 3 días
 *   OBJETIVO: ganar masa, 3 días por semana
 *   CICLO: Adaptación rpe-1 | Carga | Sobrecarga s+1 | Descarga s50% rpe6 c85
 *   A: Pecho y bíceps
 *   Press de banca con barra | 4x6-10 | 150 | 8 | 2.5 | codos a 45°
 *   inclinado mancuernas | 3x8-12 | 120
 *   B: Espalda y tríceps
 *   ...
 *
 * Columnas: ejercicio | series x reps | descanso (s) | RPE | salto (kg) | nota. Solo las dos primeras son obligatorias.
 * El nombre puede ir abreviado ("inclinado mancuernas"): se busca en la biblioteca.
 * Semanas del CICLO: s+1 / s-1 (series), s50% (porcentaje de series), rpe-1 / rpe+1 (esfuerzo), rpe6 (esfuerzo fijo), c85 (% del peso).
 */

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca el ejercicio en la biblioteca aunque venga abreviado o sin tildes. */
export function resolverNombre(texto: string): string {
  const t = texto.trim();
  if (!t) return t;
  if (infoEjercicio(t)) return infoEjercicio(t)!.nombre;
  const palabras = sinTildes(t).split(/\s+/).filter((p) => p.length > 1);
  const candidatos = todos().filter((x) => {
    const n = sinTildes(x.nombre);
    return palabras.every((p) => n.includes(p));
  }).sort((a, b) => Number(b.compuesto) - Number(a.compuesto) || a.nombre.length - b.nombre.length);
  return candidatos[0]?.nombre ?? t;
}

function leerSemana(texto: string): SemanaCiclo {
  const partes = texto.trim().split(/\s+/);
  const nombre: string[] = [];
  const s: SemanaCiclo = { nombre: '' };
  for (const p of partes) {
    const x = sinTildes(p);
    let m: RegExpMatchArray | null;
    if ((m = x.match(/^s(\d+)%$/))) s.seriesPct = Number(m[1]);
    else if ((m = x.match(/^s([+-]\d+)$/))) s.series = Number(m[1]);
    else if ((m = x.match(/^rpe([+-]\d+(?:[.,]\d)?)$/))) s.rpe = Number(m[1].replace(',', '.'));
    else if ((m = x.match(/^rpe(\d+(?:[.,]\d)?)$/))) s.rpeFijo = Number(m[1].replace(',', '.'));
    else if ((m = x.match(/^c(\d+)%?$/))) s.carga = Number(m[1]);
    else nombre.push(p);
  }
  s.nombre = nombre.join(' ') || 'Semana';
  return s;
}

export function semanaATexto(s: SemanaCiclo): string {
  const t = [s.nombre];
  if (s.seriesPct != null) t.push(`s${s.seriesPct}%`);
  if (s.series) t.push(`s${s.series > 0 ? '+' : ''}${s.series}`);
  if (s.rpeFijo != null) t.push(`rpe${s.rpeFijo}`);
  else if (s.rpe) t.push(`rpe${s.rpe > 0 ? '+' : ''}${s.rpe}`);
  if (s.carga != null && s.carga !== 100) t.push(`c${s.carga}`);
  return t.join(' ');
}

export interface RutinaLeida {
  nombre: string;
  notas: string;
  dias: DiaPlan[];
  ciclo: Ciclo;
}

const num = (v: string | undefined, def: number) => {
  if (v == null || !v.trim()) return def;
  const n = Number(v.replace(',', '.').replace(/[^\d.-]/g, ''));
  return isFinite(n) && v.trim() ? n : def;
};

function leerFilaEjercicio(celdas: string[]): EjercicioPlan {
  const nombre = resolverNombre(celdas[0]);
  const compuesto = infoEjercicio(nombre)?.compuesto ?? false;
  const sr = (celdas[1] ?? '').toLowerCase().replace(/\s/g, '').match(/^(\d+)[x×*](\d+)(?:[-–a](\d+))?$/);
  const series = sr ? Number(sr[1]) : compuesto ? 3 : 3;
  const repsMin = sr ? Number(sr[2]) : compuesto ? 6 : 10;
  const repsMax = sr ? Number(sr[3] ?? sr[2]) : compuesto ? 10 : 15;
  const base = e(nombre, series, repsMin, repsMax, num(celdas[2], compuesto ? 150 : 75), num(celdas[3], compuesto ? 8 : 9),
    celdas[4]?.trim() ? num(celdas[4], 2.5) : undefined);
  const nota = celdas.slice(5).join(' | ').trim();
  return nota ? { ...base, nota } : base;
}

/** Lee el formato de tabla. Lanza un error en castellano si no encuentra nada útil. */
export function leerTabla(texto: string): RutinaLeida {
  const bloque = texto.match(/```(?:\w+)?\s*([\s\S]*?)```/)?.[1] ?? texto;
  let nombre = 'Rutina';
  const notas: string[] = [];
  let objetivo = '';
  let semanas: SemanaCiclo[] = CICLO_BASE;
  const dias: DiaPlan[] = [];
  for (const crudo of bloque.split(/\r?\n/)) {
    let l = crudo.trim();
    if (!l || l.startsWith('#') || l.startsWith('//') || /^\|?\s*:?-{3,}/.test(l)) continue;
    const clave = l.match(/^(RUTINA|NOMBRE|NOTAS?|OBJETIVO|CICLO)\s*:\s*(.*)$/i);
    if (clave) {
      const k = clave[1].toUpperCase();
      const v = clave[2].trim();
      if (k === 'RUTINA' || k === 'NOMBRE') nombre = v || nombre;
      else if (k === 'OBJETIVO') objetivo = v;
      else if (k === 'CICLO') semanas = v.split('|').map(leerSemana).filter((s) => s.nombre);
      else notas.push(v);
      continue;
    }
    const dia = !l.includes('|') && !l.includes(';') ? l.match(/^(?:D[IÍ]A\s+)?([A-Z0-9]{1,4})\s*[:·.)-]\s*(.+)$/i) : null;
    if (dia) {
      dias.push({ id: dia[1].toUpperCase(), nombre: dia[2].trim(), ejercicios: [] });
      continue;
    }
    l = l.replace(/^\|/, '').replace(/\|$/, '');
    let celdas = l.split(/[|;]/).map((c) => c.trim());
    if (celdas.length === 1) {
      // "Press de banca 4x6-10 150 8": todo en una línea, separado por espacios.
      const m = l.match(/^(.+?)\s+(\d+\s*[x×*]\s*\d+(?:\s*[-–]\s*\d+)?)\s*(.*)$/i);
      if (m) celdas = [m[1], m[2], ...m[3].split(/\s+/).filter(Boolean)];
    }
    if (/^ejercicio/i.test(celdas[0])) continue; // fila de títulos
    if (!dias.length) dias.push({ id: 'A', nombre: 'Día A', ejercicios: [] });
    // Columna opcional "var: Variante 1 / Variante 2" con hasta 5 ejercicios para rotar.
    const iVar = celdas.findIndex((c) => /^var(iantes)?\s*:/i.test(c));
    const variantes = iVar >= 0 ? celdas[iVar].replace(/^[^:]*:/, '').split('/').map((v) => resolverNombre(v.trim())).filter(Boolean).slice(0, 5) : [];
    if (iVar >= 0) celdas.splice(iVar, 1);
    const fila = leerFilaEjercicio(celdas);
    dias[dias.length - 1].ejercicios.push(variantes.length ? { ...fila, variantes } : fila);
  }
  const conEj = dias.filter((d) => d.ejercicios.length);
  if (!conEj.length) throw new Error('No encontré ejercicios. Cada día empieza con "A: Nombre del día" y abajo un ejercicio por línea.');
  return { nombre, notas: notas.join('\n'), dias: conEj, ciclo: { semanas: semanas.length ? semanas : CICLO_BASE, objetivo } };
}

/** Escribe una rutina en el formato de tabla (para copiarla o pasársela a Claude). */
export function rutinaATabla(dias: DiaPlan[], nombre: string, notas = '', ciclo?: Ciclo | null): string {
  const l: string[] = [`RUTINA: ${nombre}`];
  if (ciclo?.objetivo) l.push(`OBJETIVO: ${ciclo.objetivo}`);
  l.push(`CICLO: ${(ciclo?.semanas?.length ? ciclo.semanas : CICLO_BASE).map(semanaATexto).join(' | ')}`);
  for (const n of notas.split('\n').filter(Boolean)) l.push(`NOTAS: ${n}`);
  l.push('# ejercicio | series x reps | descanso s | RPE | salto kg | nota | var: variante 1 / variante 2 (opcional)');
  for (const d of dias) {
    l.push(`${d.id}: ${d.nombre}`);
    for (const x of d.ejercicios) {
      const cols = [x.nombre, `${x.series}x${x.repsMin}${x.repsMax !== x.repsMin ? `-${x.repsMax}` : ''}`, x.descanso, x.rpe, x.salto, x.nota ?? ''];
      if (x.variantes?.length) cols.push(`var: ${x.variantes.join(' / ')}`);
      l.push(cols.join(' | ').replace(/ \| $/, ''));
    }
  }
  return l.join('\n');
}

/** Acepta tanto la tabla como el JSON viejo. */
export function esJson(texto: string): boolean {
  const b = texto.match(/```(?:\w+)?\s*([\s\S]*?)```/)?.[1] ?? texto;
  return /^\s*[[{]/.test(b);
}

/* ---------- Presets listos para usar ---------- */

export interface Preset { id: string; nombre: string; para: string; tabla: string }

export const PRESETS: Preset[] = [
  {
    id: 'fb3', nombre: 'Principiante · cuerpo completo 3 días', para: 'Recién empezás o volvés después de mucho tiempo. Pocos ejercicios, mucha técnica.',
    tabla: `RUTINA: Cuerpo completo 3 días
OBJETIVO: aprender los movimientos básicos y ganar fuerza de base
CICLO: Adaptación rpe-2 | Carga rpe-1 | Sobrecarga | Descarga s50% rpe6 c85
A: Cuerpo completo A
Sentadilla goblet | 3x8-12 | 120 | 7
Press de banca con mancuernas | 3x8-12 | 120 | 7
Jalón al pecho agarre neutro | 3x8-12 | 120 | 7
Peso muerto rumano con mancuernas | 3x8-12 | 120 | 7
Plancha | 3x30-45 | 60 | 7 | 0 | segundos, no repeticiones
B: Cuerpo completo B
Prensa de piernas | 3x10-15 | 120 | 7
Press de hombros con mancuernas | 3x8-12 | 120 | 7
Remo sentado en polea | 3x8-12 | 120 | 7
Puente de glúteos | 3x10-15 | 90 | 7
Curl alternado con mancuernas | 2x10-15 | 60 | 8
C: Cuerpo completo C
Sentadilla búlgara | 3x8-12 | 120 | 7
Press de pecho en máquina | 3x8-12 | 120 | 7
Remo con mancuerna a una mano | 3x8-12 | 90 | 7
Curl femoral en máquina | 3x10-15 | 75 | 8
Extensión de tríceps con soga | 2x10-15 | 60 | 8`,
  },
  {
    id: 'hip3', nombre: 'Hipertrofia 3 días por músculo', para: 'Ya entrenás hace unos meses y querés ganar masa con 3 días.',
    tabla: `RUTINA: Hipertrofia 3 días
OBJETIVO: ganar masa muscular
CICLO: Adaptación rpe-1 | Carga | Sobrecarga s+1 | Descarga s50% rpe6 c85
A: Pecho y bíceps
Press de banca con barra | 4x6-10 | 150 | 8 | 2.5
Press inclinado con mancuernas | 3x8-12 | 120 | 8 | 2
Aperturas en polea o máquina | 3x12-15 | 75 | 9
Fondos en paralelas (o press declinado) | 3x8-12 | 90 | 8
Curl de bíceps con barra | 3x8-12 | 90 | 8 | 2
Curl martillo con mancuernas | 3x10-14 | 75 | 9 | 2
B: Espalda y tríceps
Dominadas o jalón al pecho | 4x6-10 | 150 | 8
Remo con barra | 4x8-10 | 120 | 8
Remo con mancuerna a una mano | 3x10-12 | 90 | 8 | 2
Face pull en polea | 3x12-15 | 60 | 9
Press francés con barra Z | 3x8-12 | 90 | 8 | 2
Extensión de tríceps en polea | 3x12-15 | 60 | 9
C: Piernas
Sentadilla con barra | 4x6-10 | 180 | 8 | 5
Peso muerto rumano | 3x8-10 | 150 | 8 | 5
Prensa de piernas | 3x10-12 | 120 | 8 | 10
Estocadas caminando con mancuernas | 3x10-12 | 90 | 8 | 2
Curl femoral en máquina | 3x10-14 | 75 | 9
Elevación de talones (gemelos) | 4x12-15 | 60 | 9 | 5`,
  },
  {
    id: 'tp4', nombre: 'Torso / pierna 4 días', para: 'Podés ir 4 días: cada músculo se entrena 2 veces por semana.',
    tabla: `RUTINA: Torso / pierna 4 días
OBJETIVO: ganar masa con frecuencia 2 por músculo
CICLO: Adaptación rpe-1 | Carga | Sobrecarga s+1 | Descarga s50% rpe6 c85
T1: Torso fuerza
Press de banca con barra | 4x5-8 | 180 | 8
Remo con barra | 4x6-10 | 150 | 8
Press militar con barra | 3x6-10 | 150 | 8
Jalón al pecho agarre abierto | 3x8-12 | 90 | 8
Curl con barra Z | 2x8-12 | 75 | 9
Press francés con barra Z | 2x8-12 | 75 | 9
P1: Pierna fuerza
Sentadilla con barra | 4x5-8 | 180 | 8 | 5
Peso muerto rumano | 3x6-10 | 150 | 8 | 5
Prensa de piernas | 3x10-12 | 120 | 8 | 10
Elevación de talones (gemelos) | 4x10-15 | 60 | 9
T2: Torso volumen
Press inclinado con mancuernas | 4x8-12 | 120 | 8 | 2
Remo en máquina con apoyo de pecho | 4x10-12 | 90 | 8
Elevaciones laterales con mancuernas | 4x12-20 | 60 | 9 | 1
Aperturas en polea o máquina | 3x12-15 | 60 | 9
Curl inclinado con mancuernas | 3x10-14 | 60 | 9 | 1
Extensión por encima de la cabeza en polea | 3x10-14 | 60 | 9
P2: Pierna volumen
Sentadilla hack | 3x8-12 | 150 | 8
Hip thrust con barra | 3x8-12 | 120 | 8 | 5
Extensión de cuádriceps | 3x12-15 | 75 | 9
Curl femoral sentado | 3x10-14 | 75 | 9
Gemelos sentado | 3x12-20 | 60 | 9`,
  },
];
