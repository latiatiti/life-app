import { useRef, useState } from 'react';
import { configDesdeEntorno, configGuardada, guardarConfigNube } from '../../core/config';
import { almacen, borrarPrueba, contarPrueba, exportarTodo, importarTodo, supabase } from '../../core/db';
import { hoy } from '../../core/format';
import type { Modulo } from '../../core/types';
import { Campo, Icono, Tarjeta } from '../../ui/ui';
import { cargarConfiguracionInicial } from './semilla';

function PantallaAjustes() {
  const fija = configDesdeEntorno();
  const guardada = configGuardada();
  const [url, setUrl] = useState(guardada?.url ?? '');
  const [clave, setClave] = useState(guardada?.anonKey ?? '');
  const [msg, setMsg] = useState('');
  const archivo = useRef<HTMLInputElement>(null);

  function conectar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https:\/\/.+/.test(url.trim()) || clave.trim().length < 20) {
      setMsg('Revisá la URL (empieza con https://) y la clave anon.');
      return;
    }
    guardarConfigNube({ url: url.trim(), anonKey: clave.trim() });
    window.location.reload();
  }

  async function exportar() {
    const datos = await exportarTodo();
    const blob = new Blob([JSON.stringify({ app: 'LIFE', version: 1, fecha: hoy(), datos }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `life-respaldo-${hoy()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function cargarPrueba() {
    if (!window.confirm('¿Cargar un historial de entrenamiento simulado (13 semanas, 4 ciclos)? Se suma a tus datos y después lo podés borrar con un toque.')) return;
    setMsg('Cargando historial de prueba…');
    try {
      const json = await (await fetch(`${import.meta.env.BASE_URL}historial-prueba.json`)).json();
      const n = await importarTodo(json.datos);
      setMsg(`Listo: se cargaron ${n} registros de prueba. Mirá Entreno → Historial.`);
    } catch (err) {
      setMsg(`No se pudo cargar: ${(err as Error).message}`);
    }
  }

  async function quitarPrueba() {
    const n = await contarPrueba();
    if (!n) { setMsg('No hay datos de prueba cargados.'); return; }
    if (!window.confirm(`¿Borrar ${n} registros de prueba? Lo que cargaste vos no se toca.`)) return;
    setMsg('Borrando…');
    await borrarPrueba();
    setMsg(`Listo: se borraron ${n} registros de prueba.`);
  }

  async function importar(f: File) {
    try {
      const json = JSON.parse(await f.text());
      const n = await importarTodo(json.datos ?? json);
      setMsg(`Listo: se importaron ${n} registros.`);
    } catch (err) {
      setMsg(`No se pudo importar: ${(err as Error).message}`);
    }
  }

  return (
    <div className="pila">
      {msg && <p className="aviso-msg" role="status">{msg}</p>}
      <Tarjeta titulo="Dónde se guardan tus datos">
        {almacen.tipo === 'nube' ? (
          <>
            <p>Conectado a <strong>Supabase</strong>: tus datos se sincronizan entre la PC y el celular.</p>
            <div className="acciones">
              <button className="btn" onClick={() => supabase?.auth.signOut().then(() => window.location.reload())}>Cerrar sesión</button>
              {!fija && (
                <button className="btn" onClick={() => { guardarConfigNube(null); window.location.reload(); }}>
                  Volver al modo local
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p><strong>Modo local:</strong> los datos quedan solo en este navegador. Sirve para probar; para usarla en PC y celular, conectá Supabase.</p>
            <form className="form" onSubmit={conectar}>
              <Campo etiqueta="URL del proyecto Supabase"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></Campo>
              <Campo etiqueta="Clave anon (pública)" ayuda="Supabase → Project Settings → API. Es la clave pública, no la service_role.">
                <input value={clave} onChange={(e) => setClave(e.target.value)} />
              </Campo>
              <button className="btn btn-primario">Conectar</button>
            </form>
            <p className="nota">Antes de pasar a la nube, descargá un respaldo: después lo importás y no perdés nada.</p>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Tu configuración inicial">
        <p className="nota">Carga tus cuentas (Mercado Pago, efectivo, Cocos), tus categorías, tus dos trabajos de los sábados tus gastos fijos (alquiler, internet, gimnasio, celular), los básicos de la casa, tus platos y metas de comida. Si ya existen, no los duplica.</p>
        <div className="acciones">
          <button className="btn btn-primario" onClick={async () => {
            try {
              const n = await cargarConfiguracionInicial();
              setMsg(n ? `Listo: se agregaron ${n} cosas. Revisalas en Economía y Pagos.` : 'Ya estaba todo cargado.');
            } catch (err) {
              setMsg(`No se pudo cargar: ${(err as Error).message}`);
            }
          }}>Cargar mi configuración</button>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Datos de prueba">
        <p className="nota" style={{ marginTop: 0 }}>Un historial simulado de entrenamiento para probar la app: 4 ciclos con progresión, descargas, un resfrío, un viaje, días salteados, cambios de ejercicio y notas en cada entreno. Se identifica aparte y se borra sin tocar tus datos.</p>
        <div className="acciones">
          <button className="btn" onClick={cargarPrueba}>Cargar historial de prueba</button>
          <button className="btn btn-peligro" onClick={quitarPrueba}>Borrar datos de prueba</button>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Respaldo">
        <p className="nota">Descargá todos tus datos en un archivo, o importalos en otro dispositivo o en la nube.</p>
        <div className="acciones">
          <button className="btn" onClick={exportar}>Descargar respaldo</button>
          <button className="btn" onClick={() => archivo.current?.click()}>Importar respaldo</button>
          <input ref={archivo} type="file" accept="application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); e.target.value = ''; }} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Instalar en el celular">
        <p className="nota">Con la app publicada (ver LEEME), abrila en el navegador del celular y elegí “Agregar a pantalla principal”.</p>
      </Tarjeta>
    </div>
  );
}

export const moduloAjustes: Modulo = {
  id: 'ajustes',
  nombre: 'Ajustes',
  descripcion: 'Conexión, respaldo e instalación',
  icono: Icono.ajustes,
  pantallas: [{ ruta: '', titulo: 'Ajustes', componente: PantallaAjustes }],
  enHub: false,
};
