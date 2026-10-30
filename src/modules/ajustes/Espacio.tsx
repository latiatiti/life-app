import { useEffect, useState } from 'react';
import { almacen, supabase } from '../../core/db';
import type { Senal } from '../../core/types';
import { Medidor, Tarjeta } from '../../ui/ui';

/** Espacio que ocupa la base en la nube frente al límite del plan gratis (función life_uso, supabase/uso.sql). */
export interface Uso { bytes: number; limite: number; tablas: { tabla: string; bytes: number }[] }

const AVISO = 0.7, URGENTE = 0.9;
let cache: { uso: Uso; cuando: number } | null = null;

export function useUso(): Uso | null {
  const [uso, setUso] = useState<Uso | null>(cache?.uso ?? null);
  useEffect(() => {
    if (almacen.tipo !== 'nube' || !supabase || (cache && Date.now() - cache.cuando < 3600_000)) return;
    let vivo = true;
    supabase.rpc('life_uso').then(({ data, error }) => {
      if (error || !data || !vivo) return;
      cache = { uso: data as Uso, cuando: Date.now() };
      setUso(cache.uso);
    });
    return () => { vivo = false; };
  }, []);
  return uso;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export function useSenalesEspacio(): Senal[] {
  const uso = useUso();
  if (!uso) return [];
  const p = uso.bytes / uso.limite;
  if (p < AVISO) return [];
  return [{
    id: 'ajustes-espacio', modulo: 'ajustes', nivel: p >= URGENTE ? 'critico' : 'aviso',
    titulo: `La nube está al ${Math.round(p * 100)} %`,
    detalle: `Usás ${mb(uso.bytes)} de ${mb(uso.limite)} gratis. Descargá un respaldo antes de que se llene.`,
    ruta: '#/ajustes', accion: { texto: 'Ver espacio', ruta: '#/ajustes' },
  }];
}

export function TarjetaEspacio() {
  const uso = useUso();
  if (almacen.tipo !== 'nube') return null;
  if (!uso) return <Tarjeta titulo="Espacio en la nube"><p className="nota">Calculando…</p></Tarjeta>;
  const p = uso.bytes / uso.limite;
  return (
    <Tarjeta titulo="Espacio en la nube">
      <p style={{ marginTop: 0 }}><strong>{mb(uso.bytes)}</strong> de {mb(uso.limite)} gratis · {Math.round(p * 100)} %</p>
      <Medidor uso={p} />
      <p className="nota">
        {p < AVISO ? 'Te sobra lugar. ' : p < URGENTE ? 'Se está llenando: descargá un respaldo. ' : 'Casi lleno: descargá un respaldo ya. '}
        Te aviso en el Inicio cuando pase el 70 %.
      </p>
      <p className="nota">Lo que más ocupa: {uso.tablas.slice(0, 3).map((t) => `${t.tabla} (${mb(t.bytes)})`).join(', ')}.</p>
    </Tarjeta>
  );
}
