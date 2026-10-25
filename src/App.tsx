import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { usePerfil, puedeEscribir, veModulo } from './core/auth';
import { almacen, contarLocales, noSubirDatosLocales, subirDatosLocales } from './core/db';
import { MODULOS } from './core/registry';
import type { Modulo } from './core/types';
import { useRuta } from './core/router';
import { BotonCargar } from './hub/Cargar';
import { Hub } from './hub/Hub';
import { BarraActividad, useHayBarra } from './ui/Actividad';
import { Avisos } from './ui/Avisos';
import { AvisoDeshacer, VentanaConfirmar } from './ui/Deshacer';
import { Icono, Modal } from './ui/ui';

/**
 * Secciones que juntan varios módulos (pilar 4 y mapa de estructura, docs/mapa-estructura.md).
 * Las rutas de cada módulo siguen iguales (#/economia, #/pagos…); solo cambia el menú y las pestañas.
 * Pestañas: [módulo, ruta de la pantalla, nombre]. En el celu se ven las primeras 4; el resto, en "⋯".
 */
const GRUPOS: Array<{ id: string; nombre: string; icono: ReactNode; pestanas: Array<[string, string, string]> }> = [
  {
    id: 'plata', nombre: 'Plata', icono: Icono.economia,
    pestanas: [['economia', '', 'Resumen'], ['pagos', '', 'Pagos'], ['economia', 'ingresos', 'Ingresos'], ['economia', 'movimientos', 'Movimientos'],
      ['economia', 'proyeccion', 'Proyección'], ['economia', 'cuentas', 'Cuentas y categorías']],
  },
  {
    id: 'casa', nombre: 'Casa', icono: Icono.stock,
    pestanas: [['stock', '', 'En casa'], ['compras', '', 'Lista'], ['compras', 'escanear', 'Comprar'], ['alimentacion', '', 'Comida'],
      ['compras', 'comprando', 'Por pasillos'], ['compras', 'ticket', 'Ticket'], ['compras', 'precios', 'Precios'], ['compras', 'historial', 'Compras hechas'],
      ['alimentacion', 'platos', 'Platos'], ['alimentacion', 'metas', 'Metas de comida']],
  },
];

/** Cuántas pestañas entran en el celu antes de mandar el resto a "⋯". */
const PESTANAS_CELU = 4;

/** Secciones que van fijas en la barra flotante del celular (además de Inicio, el + y "Más"). En la compu se ven todas. */
const EN_BARRA = ['dia', 'plata'];

interface Pestana { modulo: string; ruta: string; titulo: string; href: string }
interface Seccion { id: string; nombre: string; icono: ReactNode; pestanas: Pestana[] }

const enlace = (modulo: string, ruta: string) => `#/${modulo}${ruta ? `/${ruta}` : ''}`;

/** Arma el menú: cada módulo es su propia sección, salvo los que se juntan en GRUPOS. Respeta el orden del registro. */
function armarSecciones(visibles: Modulo[]): Seccion[] {
  const ids = new Set(visibles.map((m) => m.id));
  const salida: Seccion[] = [];
  for (const m of visibles) {
    const g = GRUPOS.find((x) => x.pestanas.some(([mod]) => mod === m.id));
    if (!g) {
      salida.push({ id: m.id, nombre: m.nombre, icono: m.icono, pestanas: m.pantallas.map((p) => ({ modulo: m.id, ruta: p.ruta, titulo: p.titulo, href: enlace(m.id, p.ruta) })) });
    } else if (!salida.some((x) => x.id === g.id)) {
      const pestanas = g.pestanas.filter(([mod]) => ids.has(mod)).map(([mod, ruta, titulo]) => ({ modulo: mod, ruta, titulo, href: enlace(mod, ruta) }));
      salida.push({ id: g.id, nombre: g.nombre, icono: g.icono, pestanas });
    }
  }
  return salida;
}

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
  const [verPestanas, setVerPestanas] = useState(false);

  const secciones = armarSecciones(visibles);
  const seccion = secciones.find((x) => x.pestanas.some((p) => p.modulo === modulo?.id));
  const activa = seccion?.pestanas.find((p) => p.modulo === modulo?.id && p.ruta === pantalla?.ruta);

  // Cada pantalla nueva arranca desde arriba (con el hash el navegador deja el scroll donde estaba).
  useEffect(() => {
    window.scrollTo(0, 0);
    setVerPestanas(false);
    // En el celu las pestañas se deslizan: que la elegida quede a la vista.
    const a = document.querySelector<HTMLElement>('.pestanas .activa');
    const tira = a?.parentElement;
    if (a && tira) tira.scrollLeft = a.offsetLeft - (tira.clientWidth - a.offsetWidth) / 2;
  }, [ruta]);

  const hayBarra = useHayBarra();
  const actual = seccion?.id ?? '';
  const nav = [{ id: '', nombre: 'Inicio', icono: Icono.inicio, href: '#/' }, ...secciones.map((x) => ({ id: x.id, nombre: x.nombre, icono: x.icono, href: x.pestanas[0]?.href ?? '#/' }))];
  const enBarra = (id: string) => id === '' || EN_BARRA.includes(id);
  const extras = seccion ? seccion.pestanas.slice(PESTANAS_CELU) : [];

  return (
    <div className={`app ${hayBarra ? 'con-barra' : ''}`}>
      <nav className="nav" aria-label="Principal">
        <a href="#/" className="marca"><span className="marca-logo" aria-hidden="true">L</span>LIFE</a>
        {nav.map((n) => (
          <Fragment key={n.id}>
            <a href={n.href}
              className={`nav-item ${actual === n.id ? 'activo' : ''} ${enBarra(n.id) ? '' : 'solo-compu'}`}
              aria-current={actual === n.id ? 'page' : undefined}>
              {n.icono}
              <span>{n.nombre}</span>
            </a>
            {/* El + va al medio de la barra del celu (después de Día); en la compu queda arriba del menú por el orden de CSS */}
            {n.id === 'dia' && puedeEscribir(perfil) && <BotonCargar ve={(id) => visibles.some((m) => m.id === id)} />}
          </Fragment>
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
            <a key={n.id} href={n.href} className={actual === n.id ? 'activo' : ''} onClick={() => setVerMas(false)}>
              {n.icono}
              {n.nombre}
            </a>
          ))}
        </div>
      </Modal>

      {seccion && (
        <Modal titulo={`Más de ${seccion.nombre}`} abierto={verPestanas} onCerrar={() => setVerPestanas(false)}>
          <div className="hoja-mas">
            {extras.map((p) => (
              <a key={p.href} href={p.href} className={p === activa ? 'activo' : ''} onClick={() => setVerPestanas(false)}>{p.titulo}</a>
            ))}
          </div>
        </Modal>
      )}

      <main className="contenido">
        <AvisoLocales />
        {!puedeEscribir(perfil) && <p className="aviso-msg" role="status">Tu cuenta es de solo lectura: podés mirar todo pero no cambiar nada.</p>}
        {/* La key hace que cada pantalla nueva entre con la animación */}
        <div className="vista" key={ruta}>
          {modulo && Componente ? (
            <>
              <header className="modulo-cab">
                <h1>{seccion?.nombre ?? modulo.nombre}</h1>
                {seccion && seccion.pestanas.length > 1 && (
                  <nav className="pestanas" aria-label={`Secciones de ${seccion.nombre}`}>
                    {seccion.pestanas.map((p, i) => (
                      <a key={p.href} href={p.href}
                        className={`${p === activa ? 'activa' : ''} ${i >= PESTANAS_CELU && p !== activa ? 'extra' : ''}`}
                        aria-current={p === activa ? 'page' : undefined}>{p.titulo}</a>
                    ))}
                    {extras.length > 0 && (
                      <button type="button" className="pestanas-mas" aria-label={`Más de ${seccion.nombre}`} onClick={() => setVerPestanas(true)}>⋯</button>
                    )}
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
