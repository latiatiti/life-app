import { almacen } from './core/db';
import { MODULOS } from './core/registry';
import { useRuta } from './core/router';
import { Hub } from './hub/Hub';
import { Icono } from './ui/ui';

export function App() {
  const ruta = useRuta();
  const [idModulo = '', ...resto] = ruta.split('/');
  const subruta = resto.join('/');
  const modulo = MODULOS.find((m) => m.id === idModulo);
  const pantalla = modulo?.pantallas.find((p) => p.ruta === subruta) ?? modulo?.pantallas[0];
  const Componente = pantalla?.componente;

  const nav = [{ id: '', nombre: 'Inicio', icono: Icono.inicio }, ...MODULOS.map((m) => ({ id: m.id, nombre: m.nombre, icono: m.icono }))];

  return (
    <div className="app">
      <nav className="nav" aria-label="Principal">
        <a href="#/" className="marca">LIFE</a>
        {nav.map((n) => (
          <a key={n.id} href={`#/${n.id}`} className={`nav-item ${(modulo?.id ?? '') === n.id ? 'activo' : ''}`}
            aria-current={(modulo?.id ?? '') === n.id ? 'page' : undefined}>
            {n.icono}
            <span>{n.nombre}</span>
          </a>
        ))}
        <span className={`modo modo-${almacen.tipo}`} title={almacen.tipo === 'nube' ? 'Sincronizado con Supabase' : 'Datos solo en este navegador'}>
          {almacen.tipo === 'nube' ? 'Nube' : 'Modo local'}
        </span>
      </nav>

      <main className="contenido">
        {modulo && Componente ? (
          <>
            <header className="modulo-cab">
              <h1>{modulo.nombre}</h1>
              {modulo.pantallas.length > 1 && (
                <div className="pestanas">
                  {modulo.pantallas.map((p) => (
                    <a key={p.ruta} href={`#/${modulo.id}${p.ruta ? `/${p.ruta}` : ''}`}
                      className={p === pantalla ? 'activa' : ''}>{p.titulo}</a>
                  ))}
                </div>
              )}
            </header>
            <Componente key={ruta} />
          </>
        ) : (
          <Hub />
        )}
      </main>
    </div>
  );
}
