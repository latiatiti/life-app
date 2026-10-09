import { useState } from 'react';
import { escribirStorage, leerStorage } from '../../core/config';
import { hoy } from '../../core/format';

/** Chequeo de la mañana: horas de sueño y energía. El dolor muscular se pregunta al empezar a entrenar. */
export interface Manana { fecha: string; sueno_h: number | null; energia: number | null }

const CLAVE = 'life.entreno.manana';

/** Lo que se contestó hoy a la mañana (o null si todavía no). */
export function leerManana(): Manana | null {
  try {
    const m = JSON.parse(leerStorage(CLAVE) ?? 'null') as Manana | null;
    return m && m.fecha === hoy() ? m : null;
  } catch { return null; }
}

function guardarManana(m: Manana) { escribirStorage(CLAVE, JSON.stringify(m)); }

/** Tarjeta chica para el inicio: aparece hasta que se contesta el día. */
export function ChequeoManana() {
  const [m, setM] = useState<Manana>(() => leerManana() ?? { fecha: hoy(), sueno_h: null, energia: null });
  const [listo, setListo] = useState(() => !!leerManana()?.energia);
  if (listo) {
    return <p className="nota" style={{ margin: '8px 0 0' }}>Hoy: dormiste {m.sueno_h ?? '—'} h · energía {m.energia ?? '—'}/5 <button type="button" className="btn-link" onClick={() => setListo(false)}>cambiar</button></p>;
  }
  const poner = (k: 'sueno_h' | 'energia', v: number) => {
    const n = { ...m, [k]: v };
    setM(n); guardarManana(n);
    if (n.sueno_h != null && n.energia != null) setListo(true);
  };
  return (
    <div className="ent-manana">
      <p className="subtitulo" style={{ margin: 0 }}>☀️ ¿Cuántas horas dormiste?</p>
      <div className="segmentado">
        {[[4, '≤4'], [5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, '9+']].map(([v, t]) => (
          <button key={v} type="button" className={m.sueno_h === v ? 'activo' : ''} onClick={() => poner('sueno_h', v as number)}>{t}</button>
        ))}
      </div>
      <p className="subtitulo" style={{ margin: 0 }}>¿Cuánta energía tenés? (1 = sin nafta, 5 = a full)</p>
      <div className="segmentado">
        {[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" className={m.energia === v ? 'activo' : ''} onClick={() => poner('energia', v)}>{v}</button>)}
      </div>
    </div>
  );
}
