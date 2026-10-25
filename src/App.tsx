import { useEffect, useState } from 'react';
import { usePerfil, puedeEscribir, veModulo } from './core/auth';
import { almacen, contarLocales, noSubirDatosLocales, subirDatosLocales } from './core/db';
import { MODULOS } from './core/registry';
import { useRuta } from './core/router';
import { Hub } from './hub/Hub';
import { BarraActividad, useHayBarra } from './ui/Actividad';
import { Avisos } from './ui/Avisos';
import { AvisoDeshacer, VentanaConfirmar } from './ui/Deshacer';
import { Icono, Modal } from './ui/ui';

/**
 * Módulos que van fijos en la barra flotante del celular (además de Inicio y "Más").
 * El resto queda en "Más". En la compu se ven todos en el menú lateral.
 */
const EN_BARRA = ['dia', 'economia', 'entrenamiento'];

export function App() {
  const ruta = useRuta();
  const perfil = usePerfil();
  const [idModulo = '', ...resto] = ruta.split('/');
  const subruta = resto.join('/');
  const visibles = MODULOS.filter((m) => veModulo(perfil, m.id));
  const modulo = visibles.find((m) => m.id === idModulo);
  const pantalla = modulo?.pantallas.find((p) => p.ruta === subruta) ?? modulo?.pantallas[0];
  const Componente = pantalla?.componente;
  const [verMas, setVerMas] = useState(false);

  // Cada pantalla nueva arranca desde arriba (con el hash el navegador deja el scroll donde estaba).
  useEffect(() => {
    window.scrollTo(0, 0);
    // En el celu las pestañas se deslizan: que la elegida quede a la vista.
    const a = document.querySelector<HTMLElement>('.pestanas .activa');
    const tira = a?.parentElement;
    if (a && tira) tira.scrollLeft = a.offsetLeft - (tira.clientWidth - a.offsetWidth) / 2;
  }, [ruta]);

  const hayBarra = useHayBarra();
  const actual = modulo?.id ?? '';
  const nav = [{ id: '', nombre: 'Inicio', icono: Icono.inicio }, ...visibles.map((m) => ({ id: m.id, nombre: m.nombre, icono: m.icono }))];
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
        <AvisoLocales />
        {!puedeEscribir(perfil) && <p className="aviso-msg" role="status">Tu cuenta es de solo lectura: podés mirar todo pero no cambiar nada.</p>}
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
      <AvisoDeshacer />
      <VentanaConfirmar />
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
