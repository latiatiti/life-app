// Genera un historial de entrenamiento simulado (12 semanas + 1) como respaldo importable en LIFE.
// Uso: node gen-historial.mjs salida.json
import { writeFileSync } from 'node:fs';

let semillaRnd = 20261006;
const rnd = () => { semillaRnd = (semillaRnd * 1103515245 + 12345) % 2147483648; return semillaRnd / 2147483648; };
const ruido = (a) => (rnd() * 2 - 1) * a;

let contador = 0;
// Todos los ids de prueba empiezan con "cafe0000": así se pueden borrar de una sola vez desde Ajustes.
const id = () => `cafe0000-0000-4000-8000-${String(++contador).padStart(12, '0')}`;

const pad = (n) => String(n).padStart(2, '0');
const sumar = (iso, d) => { const [y, m, dd] = iso.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd + d)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };

/* ---------- Ejercicios: fuerza inicial (1RM estimado), salto y paso de carga ---------- */
const EJ = {
  'Press de banca con barra': { s: 55, salto: 2.5, paso: 2.5, g: 0.016 },
  'Press inclinado con mancuernas': { s: 19, salto: 2, paso: 1, g: 0.014 },
  'Aperturas en polea o máquina': { s: 24, salto: 2.5, paso: 2.5, g: 0.012 },
  'Fondos en paralelas (o press declinado)': { s: 0, salto: 0, paso: 0, g: 0.02, bw: 11 },
  'Press declinado con barra': { s: 58, salto: 2.5, paso: 2.5, g: 0.015 },
  'Curl de bíceps con barra': { s: 30, salto: 2, paso: 2.5, g: 0.004 }, // se estanca: el ciclo 4 lo cambia
  'Curl con barra Z': { s: 31, salto: 2, paso: 2.5, g: 0.012 },
  'Curl martillo con mancuernas': { s: 12, salto: 2, paso: 1, g: 0.01 },
  'Dominadas o jalón al pecho': { s: 58, salto: 2.5, paso: 2.5, g: 0.014 },
  'Remo con barra': { s: 52, salto: 2.5, paso: 2.5, g: 0.015 },
  'Remo con mancuerna a una mano': { s: 23, salto: 2, paso: 1, g: 0.013 },
  'Face pull en polea': { s: 26, salto: 2.5, paso: 2.5, g: 0.01 },
  'Press francés con barra Z': { s: 26, salto: 2, paso: 2.5, g: 0.012 },
  'Extensión de tríceps en polea': { s: 30, salto: 2.5, paso: 2.5, g: 0.012 },
  'Sentadilla con barra': { s: 72, salto: 5, paso: 2.5, g: 0.02 },
  'Peso muerto rumano': { s: 75, salto: 5, paso: 2.5, g: 0.018 },
  'Prensa de piernas': { s: 150, salto: 10, paso: 5, g: 0.02 },
  'Sentadilla hack': { s: 95, salto: 5, paso: 5, g: 0.018 },
  'Estocadas caminando con mancuernas': { s: 15, salto: 2, paso: 1, g: 0.015 },
  'Curl femoral en máquina': { s: 38, salto: 2.5, paso: 2.5, g: 0.012 },
  'Elevación de talones (gemelos)': { s: 85, salto: 5, paso: 5, g: 0.012 },
};
const e = (nombre, series, repsMin, repsMax, descanso, rpe) => ({ nombre, series, repsMin, repsMax, descanso, rpe, salto: EJ[nombre].salto });

const DIAS_C1 = [
  { id: 'A', nombre: 'Pecho y bíceps', ejercicios: [
    e('Press de banca con barra', 4, 6, 10, 150, 8), e('Press inclinado con mancuernas', 3, 8, 12, 120, 8), e('Aperturas en polea o máquina', 3, 12, 15, 75, 9),
    e('Fondos en paralelas (o press declinado)', 3, 8, 12, 90, 8), e('Curl de bíceps con barra', 3, 8, 12, 90, 8), e('Curl martillo con mancuernas', 3, 10, 14, 75, 9)] },
  { id: 'B', nombre: 'Espalda y tríceps', ejercicios: [
    e('Dominadas o jalón al pecho', 4, 6, 10, 150, 8), e('Remo con barra', 4, 8, 10, 120, 8), e('Remo con mancuerna a una mano', 3, 10, 12, 90, 8),
    e('Face pull en polea', 3, 12, 15, 60, 9), e('Press francés con barra Z', 3, 8, 12, 90, 8), e('Extensión de tríceps en polea', 3, 12, 15, 60, 9)] },
  { id: 'C', nombre: 'Piernas', ejercicios: [
    e('Sentadilla con barra', 4, 6, 10, 180, 8), e('Peso muerto rumano', 3, 8, 10, 150, 8), e('Prensa de piernas', 3, 10, 12, 120, 8),
    e('Estocadas caminando con mancuernas', 3, 10, 12, 90, 8), e('Curl femoral en máquina', 3, 10, 14, 75, 9), e('Elevación de talones (gemelos)', 4, 12, 15, 60, 9)] },
];
const reemplazar = (dias, viejo, nuevo, extra = {}) => dias.map((d) => ({ ...d, ejercicios: d.ejercicios.map((x) => (x.nombre === viejo ? { ...x, ...extra, nombre: nuevo, salto: EJ[nuevo].salto } : x)) }));
const DIAS_C2 = reemplazar(DIAS_C1, 'Fondos en paralelas (o press declinado)', 'Press declinado con barra', { nota: 'Reemplaza a fondos por la molestia en el hombro.' })
  .map((d) => (d.id === 'B' ? { ...d, ejercicios: d.ejercicios.map((x) => (x.nombre === 'Face pull en polea' ? { ...x, series: 4 } : x)) } : d));
const DIAS_C3 = DIAS_C2;
const DIAS_C4 = reemplazar(DIAS_C3, 'Curl de bíceps con barra', 'Curl con barra Z', { nota: 'Reemplaza al curl con barra recta: 2 ciclos sin mejorar.' });

const SEM = [
  { nombre: 'Adaptación', rpe: -1, nota: 'Técnica y pesos cómodos: dejá 3 repeticiones en reserva.' },
  { nombre: 'Carga', nota: 'Esfuerzo normal: buscá sumar repeticiones o peso.' },
  { nombre: 'Sobrecarga', series: 1, nota: 'Una serie más en los ejercicios: es la semana más dura.' },
  { nombre: 'Descarga', seriesPct: 50, rpeFijo: 6, carga: 85, nota: 'La mitad de las series, 15 % menos de peso y lejos del fallo.' },
];
const PERFIL = { peso_kg: 72, nivel: 'nuevo', sexo: null };

const CICLOS = [
  { inicio: '2026-07-13', dias: DIAS_C1, nombre: 'Hipertrofia 3 días', objetivo: 'Primer ciclo: aprender técnica y encontrar los pesos.', notas: '' },
  { inicio: '2026-08-10', dias: DIAS_C2, nombre: 'Hipertrofia 3 días', objetivo: 'Ciclo de progresión: más volumen de hombro posterior y cambio de fondos por molestia.', notas: 'Fondos → press declinado (molestia en el hombro). Face pull 3 → 4 series.' },
  { inicio: '2026-09-07', dias: DIAS_C3, nombre: 'Hipertrofia 3 días', objetivo: 'Mantener la progresión. Ojo: se viene un viaje en la semana 2.', notas: '' },
  { inicio: '2026-10-05', dias: DIAS_C4, nombre: 'Hipertrofia 3 días', objetivo: 'Ciclo de consolidación: entrenaste 8 de ~12 sesiones en el ciclo 3. Prioridad: constancia.', notas: 'Curl con barra recta → curl con barra Z (2 ciclos sin mejorar).' },
];

/* ---------- Agenda: qué pasó cada día (incluye fallas humanas) ---------- */
// t: tipo; dia: A/B/C; prep: [sueño, energía, dolor]; nota; extra: ajustes del día
const AGENDA = [
  // Ciclo 1
  ['2026-07-13', 'A', [7, 4, 1], 'Primer día con la rutina nueva. Aprendiendo la técnica de banca.'],
  ['2026-07-15', 'B', [7, 4, 3], 'Dolor en el pecho del lunes. Espalda bien.'],
  ['2026-07-17', 'C', [6, 3, 2], 'Sentadilla me cuesta la profundidad. Bajé el peso.'],
  ['2026-07-20', 'A', [8, 4, 3], 'Agujetas de piernas fuertes, igual entrené.'],
  ['2026-07-22', 'B', [7, 4, 2], ''],
  ['2026-07-24', 'C', [7, 4, 1], 'Me sentí fuerte'],
  ['2026-07-25', 'otro', null, 'Fútbol con los chicos', { deporte: 'Fútbol', min: 70, rpe: 7 }],
  ['2026-07-27', 'A', [6, 3, 2], 'Sobrecarga: la serie extra en banca se hizo larga.'],
  ['2026-07-31', 'B', [5, 3, 2], 'Se me complicó el reparto el miércoles y no fui. Dormí poco', { tarde: true }],
  ['2026-08-03', 'C', [7, 4, 1], 'Descarga. Raro ir tan liviano.'],
  ['2026-08-05', 'A', [7, 4, 1], 'Descarga. Molestia en hombro con fondos, la próxima los cambio'],
  ['2026-08-07', 'B', [8, 5, 1], 'Descarga'],
  // Ciclo 2
  ['2026-08-10', 'C', [7, 4, 1], 'Arranca ciclo 2. Me sentí fuerte'],
  ['2026-08-12', 'A', [7, 4, 2], 'Press declinado en vez de fondos: el hombro bien.'],
  ['2026-08-14', 'B', [6, 3, 2], 'Poco tiempo. Llamaron del trabajo y me fui antes', { corte: 3 }],
  ['2026-08-19', 'C', [5, 2, 2], 'Resfriada, entrené suave. Sin ganas.', { enferma: true }],
  ['2026-08-24', 'A', [7, 4, 1], 'Volví bien después del resfrío'],
  ['2026-08-26', 'B', [7, 5, 2], 'Me sentí fuerte. Récord en remo.'],
  ['2026-08-28', 'C', [7, 4, 2], 'Máquina ocupada: hice hack en vez de prensa', { cambio: ['Prensa de piernas', 'Sentadilla hack'] }],
  ['2026-08-29', 'otro', null, 'Fútbol', { deporte: 'Fútbol', min: 60, rpe: 8 }],
  ['2026-08-31', 'A', [8, 5, 1], 'No hice la descarga, me sentía bien y le di normal.', { saltaDescarga: true }],
  ['2026-09-02', 'B', [6, 3, 3], 'Cansancio acumulado. Debería haber descargado.', { saltaDescarga: true }],
  ['2026-09-04', 'C', [5, 2, 4], 'Dormí poco. Molestia en rodilla en estocadas, las salteé', { saltaDescarga: true, sin: ['Estocadas caminando con mancuernas'] }],
  // Ciclo 3
  ['2026-09-07', 'A', [7, 3, 2], 'Ciclo 3. Me olvidé de anotar el peso en una serie de martillo', { sinPeso: 'Curl martillo con mancuernas' }],
  ['2026-09-09', 'B', [7, 4, 1], ''],
  ['2026-09-11', 'C', [6, 4, 2], 'Gimnasio lleno, tardé mucho entre series'],
  ['2026-09-16', 'otro', null, 'Viaje: caminata por la montaña', { deporte: 'Trekking', min: 180, rpe: 6 }],
  ['2026-09-21', 'A', [7, 3, 2], 'Volví del viaje, me costó. Bajé un poco los pesos.', { vuelta: true }],
  ['2026-09-23', 'B', [7, 4, 2], ''],
  ['2026-09-25', 'C', [8, 4, 2], 'Técnica mejor en sentadilla'],
  ['2026-09-29', 'A', [7, 4, 1], 'Descarga'],
  ['2026-10-02', 'B', [6, 4, 1], 'Descarga. Esta semana solo pude ir dos días por trabajo.'],
  // Ciclo 4
  ['2026-10-05', 'C', [7, 4, 1], 'Ciclo 4: arranco con la propuesta de la app.'],
];

/* ---------- Simulación ---------- */
const fuerza = Object.fromEntries(Object.entries(EJ).map(([k, v]) => [k, v.bw ?? v.s]));
const pesoTrabajo = {};
const redondear = (x, paso) => Math.max(0, Math.round(x / paso) * paso);
const sesiones = [], series = [];
let ultimaFecha = '2026-07-12';

function cicloDe(fecha) {
  let c = 0;
  for (let i = 0; i < CICLOS.length; i++) if (fecha >= CICLOS[i].inicio) c = i;
  const semana = Math.min(3, Math.floor((Date.parse(fecha) - Date.parse(CICLOS[c].inicio)) / (7 * 86400000)));
  return { c, semana };
}

for (const [fecha, dia, prep, notas, extra = {}] of AGENDA) {
  // La fuerza sube con el tiempo entrenando; baja con el resfrío y el viaje.
  const dias = (Date.parse(fecha) - Date.parse(ultimaFecha)) / 86400000;
  ultimaFecha = fecha;
  for (const k of Object.keys(fuerza)) {
    const g = EJ[k].g;
    if (extra.vuelta) fuerza[k] *= 0.96;
    else if (extra.enferma) fuerza[k] *= 0.985;
    else fuerza[k] *= 1 + g * Math.min(dias, 4) / 2.3;
  }
  const hora = 18 + Math.floor(rnd() * 3);
  let minuto = Math.floor(rnd() * 50);
  const ts = () => { minuto += 2 + Math.floor(rnd() * 3); const h = hora + Math.floor(minuto / 60); return `${fecha}T${pad(h)}:${pad(minuto % 60)}:00-03:00`; };

  if (dia === 'otro') {
    sesiones.push({ id: id(), fecha, dia: 'otro', deporte: extra.deporte, duracion_min: extra.min, sensacion: 8, notas, rpe_sesion: extra.rpe, sueno_h: null, energia: null, agujetas: null, dia_nombre: null, created_at: ts() });
    continue;
  }

  const { c, semana } = cicloDe(fecha);
  const sem = extra.saltaDescarga ? SEM[1] : SEM[semana];
  const plan = CICLOS[c].dias.find((d) => d.id === dia);
  const [sueno, energia, dolor] = prep;
  const forma = 1 + ruido(0.025) - (sueno <= 5 ? 0.05 : 0) - (energia <= 2 ? 0.05 : 0) - (extra.enferma ? 0.06 : 0);
  const sesion = { id: id(), fecha, dia, deporte: 'Gimnasio', dia_nombre: plan.nombre, sueno_h: sueno, energia, agujetas: dolor, notas, created_at: ts() };
  let n = 0;
  let ejercicios = plan.ejercicios.filter((x) => !(extra.sin ?? []).includes(x.nombre));
  if (extra.corte) ejercicios = ejercicios.slice(0, extra.corte);
  for (let x of ejercicios) {
    if (extra.cambio && x.nombre === extra.cambio[0]) x = { ...x, nombre: extra.cambio[1], salto: EJ[extra.cambio[1]].salto };
    const info = EJ[x.nombre];
    let nSeries = x.series;
    if (sem.seriesPct) nSeries = Math.max(1, Math.round((nSeries * sem.seriesPct) / 100));
    if (sem.series) nSeries += sem.series;
    if (extra.enferma) nSeries = Math.max(2, nSeries - 1);
    const rpeObj = sem.rpeFijo ?? Math.min(10, x.rpe + (sem.rpe ?? 0));
    const S = fuerza[x.nombre] * forma;

    // Peso de trabajo: el que sugiere la doble progresión (o uno inicial cómodo).
    let w;
    if (info.bw) w = 0;
    else {
      w = pesoTrabajo[x.nombre] ?? redondear(info.s / (1 + (x.repsMin + 3) / 30), info.paso);
      if (sem.carga) w = redondear((w * sem.carga) / 100, info.paso);
      if (extra.vuelta) w = redondear(w * 0.92, info.paso);
      if (extra.enferma) w = redondear(w * 0.9, info.paso);
    }
    // Calentamiento en los básicos.
    if (!info.bw && x === ejercicios[0] || ['Sentadilla con barra', 'Peso muerto rumano'].includes(x.nombre)) {
      if (!info.bw && w > 20) {
        series.push({ id: id(), sesion_id: sesion.id, fecha, ejercicio: x.nombre, numero: 1, peso: redondear(w * 0.5, info.paso), reps: 10, rpe: null, tipo: 'calentamiento', created_at: ts() });
      }
    }
    const hechas = [];
    for (let k = 0; k < nSeries; k++) {
      const fallo = info.bw ? S - k * 0.9 : 30 * (S / w - 1) - k * 0.8;
      let reps = Math.round(fallo - (10 - rpeObj) + ruido(0.8));
      reps = Math.max(1, Math.min(x.repsMax + (rnd() < 0.08 ? 1 : 0), reps));
      if (sem.rpeFijo) reps = Math.min(reps, x.repsMin + 1);
      let rpe = Math.max(6, Math.min(10, Math.round(10 - (fallo - reps))));
      if (rnd() < 0.08) rpe = null; // a veces no se anota el esfuerzo
      const peso = extra.sinPeso === x.nombre && k === 1 ? 0 : w;
      const s = { id: id(), sesion_id: sesion.id, fecha, ejercicio: x.nombre, numero: series.filter((z) => z.sesion_id === sesion.id && z.ejercicio === x.nombre).length + 1, peso, reps, rpe, tipo: 'efectiva', created_at: ts() };
      series.push(s); hechas.push(s); n++;
    }
    // Doble progresión para la próxima vez (no se progresa en descarga).
    if (!info.bw && !sem.seriesPct) {
      const base = pesoTrabajo[x.nombre] ?? w;
      if (hechas.length >= x.series && hechas.every((s) => s.reps >= x.repsMax)) pesoTrabajo[x.nombre] = base + x.salto;
      else if (hechas.some((s) => s.reps < x.repsMin - 1)) pesoTrabajo[x.nombre] = redondear(base * 0.95, info.paso);
      else pesoTrabajo[x.nombre] = base;
    }
  }
  const dur = Math.round(n * 3.2 + (extra.tarde ? 10 : 0) + ruido(6)) + 8;
  const rpeSes = sem.rpeFijo ? 5 : Math.max(5, Math.min(10, Math.round(7 + ruido(1) + (energia <= 2 ? 1 : 0) + (semana === 2 ? 1 : 0))));
  const sens = Math.max(3, Math.min(10, Math.round(4 + energia + ruido(1) - (dolor >= 4 ? 1 : 0))));
  Object.assign(sesion, { duracion_min: dur, rpe_sesion: rpeSes, sensacion: sens });
  sesiones.push(sesion);
}

const rutinas = CICLOS.map((c, i) => ({
  id: id(), nombre: c.nombre, notas: c.notas, dias: c.dias, activa: i === CICLOS.length - 1, inicio: c.inicio,
  ciclo: { semanas: SEM, objetivo: c.objetivo, perfil: PERFIL, numero: i + 1 }, created_at: `${c.inicio}T08:00:00-03:00`,
}));

const salida = { app: 'LIFE', tipo: 'historial-simulado', creado: '2026-10-06', nota: 'Datos de prueba. Los ids empiezan con cafe0000: se borran desde Ajustes → Datos de prueba.', datos: { ent_rutinas: rutinas, ent_sesiones: sesiones, ent_series: series } };
writeFileSync(process.argv[2] ?? 'historial.json', JSON.stringify(salida, null, 1));
console.log(`${sesiones.length} sesiones, ${series.length} series, ${rutinas.length} rutinas`);
