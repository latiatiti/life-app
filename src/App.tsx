import { useEffect, useState } from 'react';
import { almacen } from './core/db';
import { MODULOS } from './core/registry';
import { useRuta } from './core/router';
import { Hub } from './hub/Hub';
import { BarraActividad, useHayBarra } from './ui/Actividad';
import { Avisos } from './ui/Avisos';
import { Icono, Modal } from './ui/ui';

/**
 * Módulos que van fijos en la barra flotante del celular (además de Inicio y "Más").
 * El resto queda en "Más". En la compu se ven todos en el menú lateral.
 */
const EN_BARRA = ['economia', 'entrenamiento', 'compras'];

export function App() {
  const ruta = useRuta();
  const [idModulo = '', ...resto] = ruta.split('/');
  const subruta = resto.join('/');
  const modulo = MODULOS.find((m) => m.id === idModulo);
  const pantalla = modulo?.pantallas.find((p) => p.ruta === subruta) ?? modulo?.pantallas[0];
  const Componente = pantalla?.componente;
  const [verMas, setVerMas] = useState(false);

  // Cada pantalla nueva arranca desde arriba (con el hash el navegador deja el scroll donde estaba).
  useEffect(() => { window.scrollTo(0, 0); }, [ruta]);

  const hayBarra = useHayBarra();
  const actual = modulo?.id ?? '';
  const nav = [{ id: '', nombre: 'Inicio', icono: Icono.inicio }, ...MODULOS.map((m) => ({ id: m.id, nombre: m.nombre, icono: m.icono }))];
  const enBarra = (id: string) => id === '' || EN_BARRA.includes(id);

  return (
    <div className={`app ${hayBarra ? 'con-barra' : ''}`}>
      <nav className="nav" aria-label="Principal">
        <a href="#/" className="marca"><span className="marca-logo" aria-hidden="true">L</span>LIFE</a>
        {nav.map((n) => (
          <a key={n.id} href={`#/${n.id}`}
            className={`nav-item ${actual === n.id ? 'activo' : ''} ${enBarra(n.id) ? '' : 'solo-compu'}`}
            aria-current={actual === n.id ? 'page' : undefined}>
            {n.icono}
            <span>{n.nombre}</span>
          </a>
        ))}
        <button type="button" className={`nav-mas ${enBarra(actual) ? '' : 'activo'}`} onClick={() => setVerMas(true)}>
          {Icono.modulos}
          <span>Más</span>
        </button>
        <span className={`modo modo-${almacen.tipo}`} title={almacen.tipo === 'nube' ? 'Sincronizado con Supabase' : 'Datos solo en este navegador'}>
          {almacen.tipo === 'nube' ? 'Nube' : 'Modo local'}
        </span>
      </nav>

      <Modal titulo="Todo" abierto={verMas} onCerrar={() => setVerMas(false)}>
        <div className="hoja-mas">
          {nav.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={actual === n.id ? 'activo' : ''} onClick={() => setVerMas(false)}>
              {n.icono}
              {n.nombre}
            </a>
          ))}
        </div>
      </Modal>

      <main className="contenido">
        {/* La key hace que cada pantalla nueva entre con la animación */}
        <div className="vista" key={ruta}>
          {modulo && Componente ? (
            <>
              <header className="modulo-cab">
                <h1>{modulo.nombre}</h1>
                {modulo.pantallas.length > 1 && (
                  <nav className="pestanas" aria-label={`Secciones de ${modulo.nombre}`}>
                    {modulo.pantallas.map((p) => (
                      <a key={p.ruta} href={`#/${modulo.id}${p.ruta ? `/${p.ruta}` : ''}`}
                        className={p === pantalla ? 'activa' : ''} aria-current={p === pantalla ? 'page' : undefined}>{p.titulo}</a>
                    ))}
                  </nav>
                )}
              </header>
              <Componente />
            </>
          ) : (
            <Hub />
          )}
        </div>
      </main>

      <Avisos />
      <BarraActividad />
    </div>
  );
}
