import { MODULOS } from './registry';
import type { NivelSenal, Senal } from './types';

const ORDEN: Record<NivelSenal, number> = { critico: 0, aviso: 1, info: 2, ok: 3 };

/** Junta las señales de todos los módulos. La lista de módulos es fija, así el orden de hooks no cambia. */
export function useTodasLasSenales(): Senal[] {
  const todas: Senal[] = [];
  for (const m of MODULOS) if (m.useSenales) todas.push(...m.useSenales());
  return todas.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}
