import { useState } from 'react';
import { leerStorage, escribirStorage } from '../../core/config';
import { dinero, fechaCorta, fechaLarga, hoy, parsearMonto, sumarDias } from '../../core/format';
import { ir } from '../../core/router';
import { Campo, Cifra, Pestanas, Tarjeta, Vacio } from '../../ui/ui';
import { Bienvenida } from './Resumen';
import {
  proyectar, simular, useCuentas, useIngresos, useMovimientos, usePagos,
  type Cuenta, type DiaProyeccion, type Ingreso, type Movimiento, type Pago, type Proyeccion,
} from './modelo';

type Horizonte = '30' | '60' | '90';

const corto = (n: number) => {
  const a = Math.abs(n);
  const t = a >= 1e6 ? `${(a / 1e6).toFixed(1).replace('.', ',')} M` : a >= 1e3 ? `${Math.round(a / 1e3)} k` : String(Math.round(a));
  return `${n < 0 ? '−' : ''}$${t}`;
};

const diaSemana = (f: string) => fechaLarga(f).split(' ')[0];

/**
 * Línea de tiempo de la plata: violeta = contando todo lo que te tienen que pagar,
 * gris punteada = si las fuentes que suelen deber no pagan. El cursor (o el deslizador) elige un día.
 */
function GraficoPlata({ p, sel, onSel }: { p: Proyeccion; sel: number; onSel: (i: number) => void }) {
  const w = 340, h = 180, izq = 6, der = 6, arriba = 14, abajo = 22;
  const dias = p.dias;
  const valores = dias.flatMap((d) => [d.conTodo, d.seguro]);
  const max = Math.max(0, ...valores), min = Math.min(0, ...valores);
  const rango = max - min || 1;
  const x = (i: number) => izq + (i / Math.max(1, dias.length - 1)) * (w - izq - der);
  const y = (v: number) => arriba + ((max - v) / rango) * (h - arriba - abajo);
  // Escalones: la plata cambia de golpe el día del cobro o del pago.
  const camino = (k: 'conTodo' | 'seguro') =>
    dias.map((d, i) => (i === 0 ? `M${x(0)},${y(d[k]).toFixed(1)}` : `H${x(i).toFixed(1)} V${y(d[k]).toFixed(1)}`)).join(' ');
  const iguales = dias.every((d) => d.conTodo === d.seguro);
  const d = dias[sel];
  const elegir = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * w;
    onSel(Math.max(0, Math.min(dias.length - 1, Math.round(((rel - izq) / (w - izq - der)) * (dias.length - 1)))));
  };
  const marcas = dias.map((dd, i) => ({ dd, i })).filter(({ dd }) => desdeSabado(dd.fecha));

  return (
    <div className="eco-graf">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" className="eco-graf-svg"
        aria-label={`Plata proyectada día por día. Hoy ${dinero(dias[0].conTodo)}, en ${dias.length - 1} días ${dinero(dias[dias.length - 1].conTodo)}.`}
        onPointerDown={elegir} onPointerMove={(e) => e.buttons && elegir(e)}>
        {marcas.map(({ dd, i }) => (
          <g key={dd.fecha}>
            <line x1={x(i)} x2={x(i)} y1={arriba} y2={h - abajo} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fill="var(--muted)">{fechaCorta(dd.fecha)}</text>
          </g>
        ))}
        {min < 0 && <line x1={izq} x2={w - der} y1={y(0)} y2={y(0)} stroke="var(--critical)" strokeOpacity=".5" />}
        {!iguales && <path d={camino('seguro')} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}
        <path d={camino('conTodo')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <line x1={x(sel)} x2={x(sel)} y1={arriba - 6} y2={h - abajo} stroke="var(--ink)" strokeOpacity=".5" />
        {!iguales && <circle cx={x(sel)} cy={y(d.seguro)} r="4" fill="var(--muted)" stroke="var(--surface)" strokeWidth="2" />}
        <circle cx={x(sel)} cy={y(d.conTodo)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
        <text x={Math.min(w - 40, Math.max(40, x(sel)))} y={9} textAnchor="middle" fontSize="10" fill="var(--ink)">{corto(d.conTodo)}</text>
      </svg>
      <input type="range" className="eco-desliz" min={0} max={dias.length - 1} value={sel}
        onChange={(e) => onSel(Number(e.target.value))} aria-label="Elegí un día" />
      <div className="eco-leyenda">
        <span><i style={{ background: 'var(--accent)' }} /> Contando todo lo que te deben</span>
        {!iguales && <span><i className="punteada" /> Si no te pagan lo que deben</span>}
      </div>
    </div>
  );
}

const desdeSabado = (f: string) => new Date(`${f}T12:00`).getDay() === 6;

const CLAVE_PAGO = 'life.proyeccion.pagoSemanal';

/** "¿Cuánto vas a tener a tal fecha?": fecha libre y cuánto te paga por semana quien te debe. */
function Simulador({ cuentas, movs, ingresos, pagos }: { cuentas: Cuenta[]; movs: Movimiento[]; ingresos: Ingreso[]; pagos: Pago[] }) {
  const [hasta, setHasta] = useState(sumarDias(hoy(), 30));
  const [pago, setPago] = useState(() => leerStorage(CLAVE_PAGO) ?? '0');
  const deudores = ingresos.filter((i) => i.activo && i.puede_adeudarse).map((i) => i.nombre);
  const montoPago = parsearMonto(pago || '0');
  const s = simular(cuentas, movs, ingresos, pagos, hasta < hoy() ? hoy() : hasta, Number.isNaN(montoPago) ? 0 : montoPago);
  const cambiarPago = (v: string) => { setPago(v); escribirStorage(CLAVE_PAGO, v); };
  return (
    <Tarjeta titulo="¿Cuánto vas a tener a tal fecha?">
      <div className="fila-campos">
        <Campo etiqueta="Fecha"><input type="date" value={hasta} min={hoy()} max={sumarDias(hoy(), 730)} onChange={(e) => setHasta(e.target.value)} /></Campo>
        {deudores.length > 0 && (
          <Campo etiqueta="Te pagan por semana" ayuda={`De lo que te deben (${deudores.join(', ')}). Probá distintos montos.`}>
            <input inputMode="decimal" value={pago} onChange={(e) => cambiarPago(e.target.value)} placeholder="0" />
          </Campo>
        )}
      </div>
      <div className="grilla-cifras">
        <Cifra etiqueta="Vas a haber ganado" valor={dinero(s.ganado)} nota={`Del ${fechaCorta(hoy())} al ${fechaCorta(s.hasta)}`} />
        <Cifra etiqueta="En mano ese día" valor={dinero(s.enManoFinal)} tono={s.enManoFinal >= 0 ? 'bien' : 'mal'}
          nota={`Hoy ${dinero(s.enMano)}${s.teDevuelven ? ` + ${dinero(s.teDevuelven)} que te pagan` : ''}${s.pagos ? ` − ${dinero(s.pagos)} de pagos` : ''}`} />
        <Cifra etiqueta="Te van a deber" valor={dinero(s.deudaFinal)} tono={s.deudaFinal > s.deudaHoy ? 'mal' : undefined}
          nota={`Hoy te deben ${dinero(s.deudaHoy)}`} />
      </div>
    </Tarjeta>
  );
}

function DetalleDia({ d, adeudado, esHoy }: { d: DiaProyeccion; adeudado: number; esHoy: boolean }) {
  return (
    <div className="eco-dia">
      <div className="eco-dia-cab">
        <span className="eco-dia-fecha">{esHoy ? 'Hoy' : diaSemana(d.fecha)} <small>{fechaCorta(d.fecha)}</small></span>
        <strong className={`eco-dia-monto ${d.conTodo < 0 ? 'texto-critico' : ''}`}>{dinero(d.conTodo)}</strong>
      </div>
      {d.seguro !== d.conTodo && (
        <p className="nota">Si no te pagan lo pendiente: <b className={d.seguro < 0 ? 'texto-critico' : ''}>{dinero(d.seguro)}</b></p>
      )}
      {esHoy && adeudado > 0 && <p className="nota">Incluye {dinero(adeudado)} que te deben.</p>}
      {d.eventos.length > 0 && (
        <ul className="eco-eventos">
          {d.eventos.map((e, i) => (
            <li key={i} className={e.tipo}>
              <span className="eco-ev-signo">{e.tipo === 'cobro' ? '+' : '−'}</span>
              <span className="crece">{e.nombre}{e.dudoso && <small className="eco-chip">puede quedar debiendo</small>}{e.atrasado && <small className="eco-chip aviso">sin registrar</small>}</span>
              <span className="num">{dinero(e.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PantallaProyeccion() {
  const { filas: cuentas, cargado } = useCuentas();
  const { filas: movs } = useMovimientos();
  const { filas: ingresos } = useIngresos();
  const { filas: pagos } = usePagos();
  const [horizonte, setHorizonte] = useState<Horizonte>('30');
  const [sel, setSel] = useState(0);

  if (cargado && cuentas.length === 0) return <Bienvenida />;
  if (ingresos.length === 0) {
    return (
      <Vacio titulo="Primero contame cuánto y cuándo cobrás">
        <p>Con tus cobros y tus pagos fijos armo la línea de tiempo de tu plata.</p>
        <button className="btn btn-primario" onClick={() => ir('economia/ingresos')}>Configurar ingresos</button>
      </Vacio>
    );
  }

  const p = proyectar(cuentas, movs, ingresos, pagos, Number(horizonte));
  const i = Math.min(sel, p.dias.length - 1);
  const fin = p.dias[p.dias.length - 1];
  const minimo = p.dias.reduce((m, d) => (d.seguro < m.seguro ? d : m), p.dias[0]);
  const conMovida = p.dias.filter((d) => d.eventos.length > 0);

  return (
    <div className="pila">
      <div className="barra-acciones">
        <Pestanas opciones={[{ id: '30', nombre: '30 días' }, { id: '60', nombre: '60 días' }, { id: '90', nombre: '90 días' }]}
          valor={horizonte} onCambio={(h) => { setHorizonte(h); setSel(0); }} />
      </div>

      <div className="grilla-cifras">
        <Cifra etiqueta="En mano hoy" valor={dinero(p.inicial)} nota="Cobrado, en tus cuentas" />
        <Cifra etiqueta="Te deben" valor={dinero(p.adeudado)} tono={p.adeudado > 0 ? 'mal' : undefined} nota={p.adeudado > 0 ? 'No está pago todavía' : 'Nada pendiente'} />
        <Cifra etiqueta={`En mano en ${horizonte} días`} valor={dinero(fin.seguro)} tono={fin.seguro >= 0 ? 'bien' : 'mal'}
          nota={fin.seguro !== fin.conTodo ? `${dinero(fin.conTodo)} si te pagan todo` : undefined} />
        <Cifra etiqueta="Día más justo" valor={dinero(minimo.seguro)} tono={minimo.seguro >= 0 ? undefined : 'mal'}
          nota={fechaCorta(minimo.fecha)} />
      </div>

      <Simulador cuentas={cuentas} movs={movs} ingresos={ingresos} pagos={pagos} />

      <Tarjeta titulo="Línea de tiempo de tu plata">
        <GraficoPlata p={p} sel={i} onSel={setSel} />
        <DetalleDia d={p.dias[i]} adeudado={p.adeudado} esHoy={i === 0} />
      </Tarjeta>

      <Tarjeta titulo="Lo que entra y sale">
        <ol className="eco-timeline">
          {conMovida.map((d) => (
            <li key={d.fecha} className={d.fecha === p.dias[i].fecha ? 'activo' : ''}>
              <button className="boton-fila" onClick={() => setSel(p.dias.indexOf(d))}>
                <span className="eco-tl-fecha"><b>{d.fecha === hoy() ? 'Hoy' : diaSemana(d.fecha).slice(0, 3)}</b>{fechaCorta(d.fecha)}</span>
                <span className="crece eco-tl-ev">
                  {d.eventos.map((e, k) => (
                    <span key={k} className={e.tipo}>{e.tipo === 'cobro' ? '+' : '−'}{corto(e.monto)} {e.nombre}</span>
                  ))}
                </span>
                <span className={`num ${d.conTodo < 0 ? 'texto-critico' : ''}`}>{corto(d.conTodo)}</span>
              </button>
            </li>
          ))}
        </ol>
      </Tarjeta>
    </div>
  );
}
