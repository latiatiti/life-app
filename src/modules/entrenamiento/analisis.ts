import { desdeISO, diasEntre, hoy, sumarDias } from '../../core/format';
import { GRUPOS, infoEjercicio, nombreGrupo, type Grupo } from './biblioteca';
import { describirSemana, estadoCiclo, type Ciclo, type Perfil } from './ciclo';
import { e, efectivas, progresoEjercicio, ultimaVez, unoRM, type DiaPlan, type EjercicioPlan, type Serie, type Sesion } from './modelo';

/* ---------- Semanas (de lunes a domingo) ---------- */

export function inicioSemana(fecha: string): string {
  const dow = (desdeISO(fecha).getDay() + 6) % 7;
  return sumarDias(fecha, -dow);
}
const enSemana = (fecha: string, lunes: string) => fecha >= lunes && fecha <= sumarDias(lunes, 6);

export const tonelaje = (series: Serie[]) => efectivas(series).reduce((t, s) => t + (Number(s.peso) || 0) * s.reps, 0);
export const mejor1RM = (series: Serie[]) => Math.max(0, ...efectivas(series).map((s) => unoRM(Number(s.peso) || 0, s.reps)));

/* ---------- Volumen por grupo muscular ---------- */

/**
 * Rango de series efectivas por semana para ganar masa. Referencia: Schoenfeld, Ogborn y Krieger 2017
 * (relación dosis-respuesta, ≥10 series/semana por músculo) y Pelland et al. 2024 (beneficio que se aplana arriba de ~20).
 * Brazos, gemelos y core reciben trabajo indirecto, por eso su rango es menor.
 */
export function rangoSeries(g: Grupo): [number, number] {
  if (g === 'biceps' || g === 'triceps') return [8, 16];
  if (g === 'gemelos' || g === 'core' || g === 'antebrazo') return [6, 12];
  return [10, 20];
}

/** Series efectivas por grupo: el grupo principal suma 1 y los que ayudan, 0,5. */
export function seriesPorGrupo(series: Serie[]): Record<Grupo, number> {
  const r = Object.fromEntries(GRUPOS.map((g) => [g.id, 0])) as Record<Grupo, number>;
  for (const s of efectivas(series)) {
    const info = infoEjercicio(s.ejercicio);
    if (!info) continue;
    r[info.grupo] += 1;
    for (const g of info.secundarios) r[g] += 0.5;
  }
  return r;
}

export interface Semana {
  lunes: string;
  sesiones: number;
  series: number;
  reps: number;
  tonelaje: number;
  /** Carga interna (método de Foster): RPE de la sesión × minutos. */
  carga: number;
  porGrupo: Record<Grupo, number>;
}

export function semanas(sesiones: Sesion[], series: Serie[], cuantas = 8, ref = hoy()): Semana[] {
  const lunesHoy = inicioSemana(ref);
  const out: Semana[] = [];
  for (let i = cuantas - 1; i >= 0; i--) {
    const lunes = sumarDias(lunesHoy, -7 * i);
    const ss = series.filter((s) => enSemana(s.fecha, lunes));
    const ses = sesiones.filter((s) => enSemana(s.fecha, lunes));
    const ef = efectivas(ss);
    out.push({
      lunes,
      sesiones: ses.length,
      series: ef.length,
      reps: ef.reduce((t, s) => t + s.reps, 0),
      tonelaje: tonelaje(ss),
      carga: ses.reduce((t, s) => t + (s.rpe_sesion ?? 0) * (s.duracion_min ?? 0), 0),
      porGrupo: seriesPorGrupo(ss),
    });
  }
  return out;
}

/* ---------- Comparación de un ejercicio: esta semana contra la pasada ---------- */

export interface CompEjercicio {
  nombre: string;
  esta: { series: number; reps: number; tonelaje: number; mejor: number };
  pasada: { series: number; reps: number; tonelaje: number; mejor: number };
}

export function compararSemana(series: Serie[], nombre: string, ref = hoy()): CompEjercicio {
  const lunes = inicioSemana(ref);
  const del = efectivas(series).filter((s) => s.ejercicio === nombre);
  const datos = (l: string) => {
    const x = del.filter((s) => enSemana(s.fecha, l));
    return { series: x.length, reps: x.reduce((t, s) => t + s.reps, 0), tonelaje: tonelaje(x), mejor: mejor1RM(x) };
  };
  return { nombre, esta: datos(lunes), pasada: datos(sumarDias(lunes, -7)) };
}

/**
 * Lo que te toca hoy en un ejercicio para progresar (sobrecarga progresiva):
 * superar el volumen de la última vez, sumando repeticiones o peso.
 */
export function objetivoHoy(series: Serie[], ej: EjercicioPlan): { texto: string; tonelajePrevio: number } | null {
  const prev = ultimaVez(series, ej.nombre);
  if (!prev.length) return null;
  const tp = tonelaje(prev);
  const reps = prev.map((s) => s.reps);
  const peso = Math.max(...prev.map((s) => Number(s.peso) || 0));
  const faltan = prev.findIndex((s) => s.reps < ej.repsMax);
  const texto = faltan >= 0
    ? `Con ${peso} kg, sumá 1 rep a alguna serie (la última vez: ${reps.join('-')}).`
    : `Completaste el tope: subí a ${peso + ej.salto} kg y empezá desde ${ej.repsMin} reps.`;
  return { texto, tonelajePrevio: tp };
}

/* ---------- Chequeo antes de entrenar (autorregulación) ---------- */

export interface Preparacion { sueno_h?: number | null; energia?: number | null; agujetas?: number | null }

export function evaluarPreparacion(p: Preparacion): { puntaje: number; nivel: 'bien' | 'medio' | 'bajo'; consejo: string } | null {
  if (p.sueno_h == null && p.energia == null && p.agujetas == null) return null;
  const partes: number[] = [];
  if (p.sueno_h != null) partes.push(p.sueno_h >= 7 ? 1 : p.sueno_h >= 6 ? 0.7 : p.sueno_h >= 5 ? 0.4 : 0.15);
  if (p.energia != null) partes.push((p.energia - 1) / 4);
  if (p.agujetas != null) partes.push((5 - p.agujetas) / 4);
  const puntaje = Math.round((partes.reduce((a, b) => a + b, 0) / partes.length) * 100);
  if (puntaje >= 65) return { puntaje, nivel: 'bien', consejo: 'Estás para entrenar normal: buscá progresar como te sugiere la app.' };
  if (puntaje >= 40) return { puntaje, nivel: 'medio', consejo: 'Día medio: mantené los pesos de la última vez y no pases de RPE 8. Nada de subir peso hoy.' };
  return { puntaje, nivel: 'bajo', consejo: 'Venís cansado: hacé una serie menos por ejercicio y bajá ~10 % el peso. Entrenar suave hoy suma más que forzar.' };
}

/* ---------- Señales de fatiga acumulada / descarga ---------- */

export function necesitaDescarga(sesiones: Sesion[], series: Serie[], ref = hoy()): string | null {
  // Semanas seguidas entrenando (≥2 sesiones de gimnasio) sin una semana liviana.
  const ss = semanas(sesiones.filter((s) => s.dia !== 'otro'), series, 12, ref);
  let seguidas = 0;
  for (let i = ss.length - 2; i >= 0; i--) { // la semana actual está en curso: no la cuento
    if (ss[i].sesiones >= 2) seguidas++;
    else break;
  }
  if (seguidas >= 6) return `Llevás ${seguidas} semanas seguidas entrenando fuerte. Planificá una semana de descarga: mismos ejercicios, la mitad de series y RPE 6–7.`;
  // Preparación baja en las últimas 3 sesiones.
  const ult = [...sesiones].filter((s) => s.energia != null).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3);
  const bajas = ult.filter((s) => (evaluarPreparacion(s)?.nivel ?? 'bien') === 'bajo').length;
  if (ult.length === 3 && bajas >= 2) return 'Dos de tus últimos tres entrenos llegaste muy cansado. Revisá sueño y comida, y considerá una semana de descarga.';
  return null;
}

/* ---------- Resumen de una sesión ---------- */

export interface ResumenEj {
  nombre: string;
  series: Serie[];
  tonelaje: number;
  mejor: number;
  previo: { tonelaje: number; mejor: number; series: Serie[] } | null;
  record: boolean;
}

export interface ResumenSesion {
  ejercicios: ResumenEj[];
  series: number;
  reps: number;
  tonelaje: number;
  rpeMedio: number | null;
  records: number;
  carga: number | null;
  porGrupo: Record<Grupo, number>;
}

export function resumirSesion(sesion: Sesion, todas: Serie[]): ResumenSesion {
  const propias = todas.filter((s) => s.sesion_id === sesion.id).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const anteriores = todas.filter((s) => s.sesion_id !== sesion.id && (s.fecha < sesion.fecha || (s.fecha === sesion.fecha && (s.created_at ?? '') < (propias[0]?.created_at ?? ''))));
  const nombres = [...new Set(propias.map((s) => s.ejercicio))];
  const ejercicios = nombres.map((nombre): ResumenEj => {
    const ss = propias.filter((s) => s.ejercicio === nombre).sort((a, b) => a.numero - b.numero);
    const prev = ultimaVez(anteriores, nombre);
    const mejorHistorico = mejor1RM(anteriores.filter((s) => s.ejercicio === nombre));
    const m = mejor1RM(ss);
    return {
      nombre, series: ss, tonelaje: tonelaje(ss), mejor: m,
      previo: prev.length ? { tonelaje: tonelaje(prev), mejor: mejor1RM(prev), series: prev } : null,
      record: mejorHistorico > 0 && m > mejorHistorico,
    };
  });
  const ef = efectivas(propias);
  const conRpe = ef.filter((s) => s.rpe != null);
  return {
    ejercicios,
    series: ef.length,
    reps: ef.reduce((t, s) => t + s.reps, 0),
    tonelaje: tonelaje(propias),
    rpeMedio: conRpe.length ? conRpe.reduce((t, s) => t + (s.rpe ?? 0), 0) / conRpe.length : null,
    records: ejercicios.filter((x) => x.record).length,
    carga: sesion.rpe_sesion && sesion.duracion_min ? sesion.rpe_sesion * sesion.duracion_min : null,
    porGrupo: seriesPorGrupo(propias),
  };
}

export const pct = (actual: number, previo: number) => (previo > 0 ? ((actual - previo) / previo) * 100 : null);

/* ---------- Informe para Claude como entrenador ---------- */

const kg = (n: number) => `${Math.round(n * 10) / 10}`;

export const progresoPorFecha = progresoEjercicio;

export function informeEntrenador(sesiones: Sesion[], series: Serie[], dias: DiaPlan[], notasRutina = '', ref = hoy(),
  extra: { ciclo?: Ciclo | null; inicio?: string | null; perfil?: Perfil | null } = {}): string {
  const desde = sumarDias(ref, -28);
  const recientes = [...sesiones].filter((s) => s.fecha >= desde).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const l: string[] = [];
  l.push(`# Informe de entrenamiento (${ref})`);
  l.push('Objetivo: ganar masa muscular. Gimnasio de pesas, ~3 días por semana. Sin wearables.');
  l.push('Pesos en kg. RPE 1–10 (10 = al fallo). Preparación: sueño en horas, energía y dolor muscular de 1 a 5.');
  if (extra.perfil) l.push(`Perfil: ${extra.perfil.peso_kg} kg, nivel ${extra.perfil.nivel}${extra.perfil.sexo ? `, ${extra.perfil.sexo === 'f' ? 'mujer' : 'varón'}` : ''}.`);
  const est = estadoCiclo(extra.ciclo, extra.inicio, ref);
  if (extra.ciclo && est) {
    l.push(`Ciclo${extra.ciclo.numero ? ` ${extra.ciclo.numero}` : ''} desde ${extra.inicio}: ${est.terminado ? 'terminado' : `semana ${est.indice + 1} de ${est.total}`}. Semanas: ${extra.ciclo.semanas.map((s, i) => `S${i + 1} ${s.nombre} (${describirSemana(s)})`).join('; ')}.`);
    if (extra.ciclo.objetivo) l.push(`Objetivo del ciclo: ${extra.ciclo.objetivo}`);
  }
  l.push('');
  l.push('## Rutina actual');
  if (notasRutina) l.push(notasRutina);
  for (const d of dias) {
    l.push(`- Día ${d.id} · ${d.nombre}: ` + d.ejercicios.map((x) => `${x.nombre} ${x.series}×${x.repsMin}-${x.repsMax} RPE${x.rpe} desc ${x.descanso}s`).join('; '));
  }
  l.push('');
  l.push('## Volumen semanal (series efectivas por grupo; rango sugerido entre corchetes)');
  const ss = semanas(sesiones, series, 4, ref);
  for (const s of ss) {
    const grupos = GRUPOS.filter((g) => s.porGrupo[g.id] > 0).map((g) => `${g.nombre} ${kg(s.porGrupo[g.id])} [${rangoSeries(g.id).join('-')}]`);
    l.push(`- Semana del ${s.lunes}: ${s.sesiones} sesiones, ${s.series} series, ${Math.round(s.tonelaje)} kg totales, carga interna ${s.carga}. ${grupos.join(', ') || 'sin series'}`);
  }
  l.push('');
  l.push('## Sesiones de las últimas 4 semanas');
  if (!recientes.length) l.push('(sin sesiones registradas)');
  for (const s of recientes) {
    const prep = [s.sueno_h != null ? `sueño ${s.sueno_h} h` : '', s.energia != null ? `energía ${s.energia}/5` : '', s.agujetas != null ? `dolor ${s.agujetas}/5` : ''].filter(Boolean).join(', ');
    l.push(`### ${s.fecha} · ${s.dia === 'otro' ? s.deporte : `Día ${s.dia} ${s.dia_nombre ?? ''}`.trim()}`);
    l.push([s.duracion_min ? `${s.duracion_min} min` : '', s.rpe_sesion ? `RPE sesión ${s.rpe_sesion}` : '', s.sensacion ? `sensación ${s.sensacion}/10` : '', prep].filter(Boolean).join(' · '));
    if (s.notas) l.push(`Notas: ${s.notas}`);
    const propias = series.filter((x) => x.sesion_id === s.id);
    for (const nombre of [...new Set(propias.map((x) => x.ejercicio))]) {
      const xs = propias.filter((x) => x.ejercicio === nombre).sort((a, b) => a.numero - b.numero);
      l.push(`- ${nombre}: ` + xs.map((x) => `${x.tipo === 'calentamiento' ? '(cal) ' : ''}${kg(Number(x.peso))}×${x.reps}${x.rpe ? `@${x.rpe}` : ''}`).join(', '));
    }
  }
  l.push('');
  l.push('## Progreso por ejercicio (1RM estimado, Epley)');
  const nombres = [...new Set(efectivas(series).map((s) => s.ejercicio))];
  for (const n of nombres) {
    const pts = progresoEjercicio(series, n).slice(-6);
    l.push(`- ${n}: ${pts.map((p) => `${p.fecha.slice(5)} ${kg(p.mejor)}`).join(' → ')}`);
  }
  const ult = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (ult) l.push(`\nÚltimo entreno hace ${diasEntre(ult.fecha, ref)} días.`);
  l.push('');
  l.push('## Pedido');
  l.push('Analizá mi progreso, adherencia y fatiga, y armá el próximo ciclo de 4 semanas (sobrecarga progresiva y descarga).');
  l.push('Devolvé la rutina en un bloque de código con el formato de tabla de LIFE, sin JSON:');
  l.push('RUTINA: nombre / OBJETIVO: una línea / CICLO: Adaptación rpe-1 | Carga | Sobrecarga s+1 | Descarga s50% rpe6 c85 / NOTAS: por qué cambiaste lo que cambiaste');
  l.push('Después, por cada día una línea "A: Nombre del día" y un ejercicio por línea: ejercicio | series x reps | descanso s | RPE | salto kg | nota | var: hasta 5 variantes separadas por /');
  l.push('Si usás ejercicios que no están en la app, agregá OTRO bloque ```json {"ejercicios":[{"nombre","zonas":{"pecho":1,"triceps":0.5},"equipo","compuesto","salto","sentir","variantes":[]}]} (zonas: pecho, deltoide_ant, deltoide_lat, deltoide_post, trapecio, dorsales, lumbar, biceps, triceps, antebrazo, abdominales, oblicuos, gluteos, cuadriceps, aductores, isquios, gemelos; 1 = principal, 0.5 = ayuda).');
  l.push('(s = series, rpe = esfuerzo, c = % del peso). Usá nombres de ejercicios comunes en castellano.');
  return l.join('\n');
}

/* ---------- Importar / exportar rutina en JSON ---------- */

export function rutinaAJson(dias: DiaPlan[], nombre: string, notas: string): string {
  return JSON.stringify({ nombre, notas, dias }, null, 2);
}

/** Lee una rutina pegada (acepta el bloque ```json que escribe Claude). Lanza un error en castellano si algo no cierra. */
export function leerRutinaJson(texto: string): { nombre: string; notas: string; dias: DiaPlan[] } {
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? texto;
  const ini = bloque.search(/[[{]/);
  if (ini < 0) throw new Error('No encontré una rutina en el texto pegado.');
  let datos: unknown;
  try { datos = JSON.parse(bloque.slice(ini)); } catch { throw new Error('El texto no es un JSON válido. Copiá el bloque completo.'); }
  const obj = (Array.isArray(datos) ? { dias: datos } : datos) as { nombre?: string; notas?: string; dias?: unknown[] };
  if (!Array.isArray(obj.dias) || !obj.dias.length) throw new Error('La rutina no trae días.');
  const num = (v: unknown, def: number) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : def);
  const dias = obj.dias.map((d, i): DiaPlan => {
    const dd = d as { id?: string; nombre?: string; ejercicios?: unknown[] };
    if (!Array.isArray(dd.ejercicios) || !dd.ejercicios.length) throw new Error(`El día ${i + 1} no tiene ejercicios.`);
    return {
      id: String(dd.id ?? String.fromCharCode(65 + i)).slice(0, 4),
      nombre: String(dd.nombre ?? `Día ${i + 1}`),
      ejercicios: dd.ejercicios.map((x) => {
        const xx = x as Record<string, unknown>;
        if (!xx.nombre) throw new Error(`Hay un ejercicio sin nombre en el día ${i + 1}.`);
        const base = e(String(xx.nombre), num(xx.series, 3), num(xx.repsMin, 8), num(xx.repsMax, 12), num(xx.descanso, 90), num(xx.rpe, 8), xx.salto != null ? num(xx.salto, 2.5) : undefined);
        const conNota = xx.nota ? { ...base, nota: String(xx.nota) } : base;
        return Array.isArray(xx.variantes) ? { ...conNota, variantes: xx.variantes.map(String).slice(0, 5) } : conNota;
      }),
    };
  });
  return { nombre: String(obj.nombre ?? 'Rutina de Claude'), notas: String(obj.notas ?? ''), dias };
}

export { nombreGrupo };
