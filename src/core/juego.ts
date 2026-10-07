import { hoy, sumarDias } from './format';

/** Cada registro suma esta experiencia. */
export const XP_POR_REGISTRO = 10;

/** Experiencia necesaria para pasar del nivel n al n+1: crece de a poco (100, 150, 200…). */
const xpParaSubir = (n: number) => 50 + n * 50;

export interface Progreso {
  xp: number;
  nivel: number;
  /** Experiencia ganada dentro del nivel actual y la que falta para el siguiente. */
  enNivel: number;
  paraSubir: number;
  /** Días seguidos con al menos un registro, contando hasta hoy (o ayer si hoy todavía no hay). */
  racha: number;
}

export function calcularProgreso(fechas: string[]): Progreso {
  const xp = fechas.length * XP_POR_REGISTRO;
  let nivel = 1;
  let resto = xp;
  while (resto >= xpParaSubir(nivel)) {
    resto -= xpParaSubir(nivel);
    nivel++;
  }
  const dias = new Set(fechas);
  let dia = dias.has(hoy()) ? hoy() : sumarDias(hoy(), -1);
  let racha = 0;
  while (dias.has(dia)) {
    racha++;
    dia = sumarDias(dia, -1);
  }
  return { xp, nivel, enNivel: resto, paraSubir: xpParaSubir(nivel), racha };
}
