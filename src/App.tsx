import { useEffect, useState } from 'react';
import { usePerfil, puedeEscribir, veModulo } from './core/auth';
import { almacen, contarLocales, noSubirDatosLocales, subirDatosLocales } from './core/db';
import { MODULOS } from './core/registry';
import { useRuta } from './core/router';
import { Hub } from './hub/Hub';
import { Icono } from './ui/ui';

export function App() {
  const ruta = useRuta();
  const perfil = usePerfil();
  const [idModulo = '', ...resto] = ruta.split('/');
  const subruta = resto.join('/');
  const visibles = MODULOS.filter((m) => veModulo(perfil, m.id));
  const modulo = visibles.find((m) => m.id === idModulo);
  const pantalla = modulo?.pantallas.find((p) => p.ruta === subruta) ?? modulo?.pantallas[0];
  const Componente = pantalla?.componente;

  const nav = [{ id: '', nombre: 'Inicio', icono: Icono.inicio }, ...visibles.map((m) => ({ id: m.id, nombre: m.nombre, icono: m.icono }))];

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
        <AvisoLocales />
        {!puedeEscribir(perfil) && <p className="aviso-msg" role="status">Tu cuenta es de solo lectura: podés mirar todo pero no cambiar nada.</p>}
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

/** Si este navegador tiene datos de cuando la app andaba en modo local, ofrece subirlos a la cuenta. */
function AvisoLocales() {
  const [n, setN] = useState(0);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { void contarLocales().then(setN); }, []);
  if (!n && !msg) return null;
  if (msg) return <p className="aviso-msg" role="status">{msg}</p>;
  return (
    <section className="tarjeta aviso-locales">
      <p><strong>Tenés {n} registros guardados solo en este navegador.</strong> Subilos a tu cuenta para verlos en todos lados. No se duplica nada y la copia de acá queda como respaldo.</p>
      <div className="acciones">
        <button className="btn btn-primario" disabled={ocupado} onClick={async () => {
          setOcupado(true);
          try {
            const subidos = await subirDatosLocales();
            setMsg(subidos ? `Listo: se subieron ${subidos} registros a tu cuenta.` : 'Ya estaba todo en tu cuenta.');
          } catch (e) {
            setMsg(`No se pudo subir: ${(e as Error).message}. Probá de nuevo desde Ajustes → Respaldo.`);
          }
          setOcupado(false);
        }}>{ocupado ? 'Subiendo…' : 'Subir a mi cuenta'}</button>
        <button className="btn" onClick={() => { noSubirDatosLocales(); setN(0); }}>No, gracias</button>
      </div>
    </section>
  );
}
