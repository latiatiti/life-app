/** Utilidades de formato y fechas. Las fechas se guardan como texto YYYY-MM-DD (hora local). */

export function dinero(monto: number, moneda = 'ARS'): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: Math.abs(monto) >= 1000 ? 0 : 2,
    }).format(monto);
  } catch {
    return `${moneda} ${monto.toFixed(2)}`;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function aISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hoy(): string {
  return aISO(new Date());
}

export function desdeISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(s: string, dias: number): string {
  const d = desdeISO(s);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

/** Suma meses respetando el día deseado (si el mes es más corto, usa el último día). */
export function sumarMeses(s: string, meses: number, diaDeseado?: number): string {
  const d = desdeISO(s);
  const dia = diaDeseado ?? d.getDate();
  const objetivo = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimo = new Date(objetivo.getFullYear(), objetivo.getMonth() + 1, 0).getDate();
  objetivo.setDate(Math.min(dia, ultimo));
  return aISO(objetivo);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((desdeISO(hasta).getTime() - desdeISO(desde).getTime()) / 86400000);
}

export function fechaCorta(s: string): string {
  return desdeISO(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function fechaLarga(s: string): string {
  return desdeISO(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "hoy", "mañana", "en 5 días", "hace 3 días". */
export function relativo(s: string): string {
  const n = diasEntre(hoy(), s);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

export function mesActual(): string {
  return hoy().slice(0, 7);
}

export function nombreMes(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function moverMes(yyyymm: string, delta: number): string {
  return sumarMeses(`${yyyymm}-01`, delta).slice(0, 7);
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Convierte "12.500,50" o "12500.5" en número. */
export function parsearMonto(txt: string): number {
  const limpio = txt.trim().replace(/\s|\$/g, '');
  if (!limpio) return NaN;
  const conComa = limpio.includes(',');
  // "12.500" o "1.250.000" sin coma: los puntos son separadores de miles.
  const soloMiles = !conComa && /^-?\d{1,3}(\.\d{3})+$/.test(limpio);
  const normal = conComa
    ? limpio.replace(/\./g, '').replace(',', '.')
    : soloMiles
      ? limpio.replace(/\./g, '')
      : limpio;
  return Number(normal);
}
