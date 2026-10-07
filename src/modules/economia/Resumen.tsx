import { useState } from 'react';
import { dinero, mesActual, moverMes, nombreMes } from '../../core/format';
import { ir } from '../../core/router';
import { Cifra, Icono, Medidor, Modal, Tarjeta, Vacio } from '../../ui/ui';
import { FormMovimiento } from './FormMovimiento';
import {
  crearDatosIniciales, disponible, gastoPorCategoria, saldoCuenta, saldosPorMoneda, totalesMes,
  TIPOS_CUENTA, useCategorias, useCuentas, useMovimientos,
} from './modelo';

export function SelectorMes({ mes, onCambio }: { mes: string; onCambio: (m: string) => void }) {
  return (
    <div className="selector-mes">
      <button className="btn-icono" onClick={() => onCambio(moverMes(mes, -1))} aria-label="Mes anterior">{Icono.flechaIzq}</button>
      <span>{nombreMes(mes)}</span>
      <button className="btn-icono" onClick={() => onCambio(moverMes(mes, 1))} aria-label="Mes siguiente">{Icono.flechaDer}</button>
    </div>
  );
}

export function Bienvenida() {
  const { filas: categorias } = useCategorias();
  const { filas: cuentas } = useCuentas();
  const [creando, setCreando] = useState(false);
  return (
    <Vacio titulo="Empecemos por lo básico">
      <p>Creo una cuenta “Efectivo” y categorías típicas (Supermercado, Servicios, Sueldo…). Después las podés editar.</p>
      <button className="btn btn-primario" disabled={creando}
        onClick={async () => { setCreando(true); await crearDatosIniciales(categorias, cuentas); setCreando(false); }}>
        {creando ? 'Creando…' : 'Crear cuenta y categorías sugeridas'}
      </button>
      <button className="btn" onClick={() => ir('economia/cuentas')}>Prefiero crearlas a mano</button>
    </Vacio>
  );
}

export function PantallaResumen() {
  const [mes, setMes] = useState(mesActual());
  const [nuevo, setNuevo] = useState(false);
  const { filas: cuentas, cargado } = useCuentas();
  const { filas: categorias } = useCategorias();
  const { filas: movs } = useMovimientos();

  if (cargado && cuentas.length === 0) return <Bienvenida />;

  const saldos = saldosPorMoneda(cuentas, movs);
  const { ingresos, gastos } = totalesMes(movs, cuentas, mes, 'ARS');
  const balance = ingresos - gastos;
  const porCat = gastoPorCategoria(movs, cuentas, categorias, mes);
  const maxGasto = Math.max(1, ...porCat.map((g) => Math.max(g.gastado, g.presupuesto ?? 0)));

  return (
    <div className="pila">
      <div className="barra-acciones">
        <SelectorMes mes={mes} onCambio={setMes} />
        <button className="btn btn-primario" onClick={() => setNuevo(true)}>{Icono.mas} Movimiento</button>
      </div>

      <div className="grilla-cifras">
        <Cifra etiqueta="Disponible en pesos" valor={dinero(disponible(cuentas, movs, 'ARS'))}
          nota="Sin tarjetas ni inversiones" />
        {saldos.USD !== undefined && <Cifra etiqueta="Total en dólares" valor={dinero(saldos.USD, 'USD')} />}
        <Cifra etiqueta="Ingresos del mes" valor={dinero(ingresos)} />
        <Cifra etiqueta="Gastos del mes" valor={dinero(gastos)} />
        <Cifra etiqueta="Balance del mes" valor={dinero(balance)} tono={balance >= 0 ? 'bien' : 'mal'} />
      </div>

      <Tarjeta titulo="Gastos por categoría (ARS)"
        accion={<button className="btn-link" onClick={() => ir('economia/cuentas')}>Presupuestos</button>}>
        {porCat.length === 0 ? (
          <p className="nota">Todavía no hay gastos en {nombreMes(mes).toLowerCase()}.</p>
        ) : (
          <ul className="lista-cat">
            {porCat.map((g) => (
              <li key={g.categoria?.id ?? 'sin'}>
                <div className="lista-cat-cab">
                  <span className="punto" style={{ background: g.categoria?.color ?? 'var(--muted)' }} />
                  <span className="lista-cat-nombre">{g.categoria?.nombre ?? 'Sin categoría'}</span>
                  <span className="num">{dinero(g.gastado)}</span>
                  {g.presupuesto != null && (
                    <span className="nota num"> de {dinero(g.presupuesto)}</span>
                  )}
                </div>
                {g.uso != null ? (
                  <>
                    <Medidor uso={g.uso} color={g.categoria?.color} />
                    {g.uso >= 0.8 && (
                      <small className={g.uso >= 1 ? 'texto-critico' : 'texto-aviso'}>
                        {g.uso >= 1 ? 'Presupuesto superado' : 'Cerca del límite'} · {Math.round(g.uso * 100)} %
                      </small>
                    )}
                  </>
                ) : (
                  <div className="medidor medidor-sin" title="Sin presupuesto">
                    <div className="medidor-barra" style={{ width: `${(g.gastado / maxGasto) * 100}%`, background: g.categoria?.color ?? 'var(--muted)' }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Cuentas" accion={<button className="btn-link" onClick={() => ir('economia/cuentas')}>Administrar</button>}>
        <ul className="lista">
          {cuentas.filter((c) => !c.archivada).map((c) => {
            const s = saldoCuenta(c, movs);
            return (
              <li key={c.id} className="lista-item">
                <div className="crece">
                  <strong>{c.nombre}</strong>
                  <small className="nota">{TIPOS_CUENTA[c.tipo]}</small>
                </div>
                <span className={`num ${s < 0 ? 'texto-critico' : ''}`}>{dinero(s, c.moneda)}</span>
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <Modal titulo="Nuevo movimiento" abierto={nuevo} onCerrar={() => setNuevo(false)}>
        <FormMovimiento onListo={() => setNuevo(false)} />
      </Modal>
    </div>
  );
}

/** Tarjeta que Economía aporta al hub. */
export function ResumenHub() {
  const { filas: cuentas } = useCuentas();
  const { filas: movs } = useMovimientos();
  if (cuentas.length === 0) {
    return <p className="nota">Configurá tus cuentas para ver tu plata acá. <a href="#/economia">Empezar</a></p>;
  }
  const mes = mesActual();
  const { ingresos, gastos } = totalesMes(movs, cuentas, mes, 'ARS');
  const saldos = saldosPorMoneda(cuentas, movs);
  return (
    <div className="grilla-cifras compacta">
      <Cifra etiqueta="Disponible" valor={dinero(disponible(cuentas, movs, 'ARS'))} />
      <Cifra etiqueta="Gastos del mes" valor={dinero(gastos)} />
      <Cifra etiqueta="Balance del mes" valor={dinero(ingresos - gastos)} tono={ingresos - gastos >= 0 ? 'bien' : 'mal'} />
      {saldos.USD !== undefined && <Cifra etiqueta="Dólares" valor={dinero(saldos.USD, 'USD')} />}
    </div>
  );
}
