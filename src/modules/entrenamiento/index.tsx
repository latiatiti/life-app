import { diasEntre, hoy } from '../../core/format';
import type { Modulo, Senal } from '../../core/types';
import { Icono } from '../../ui/ui';
import { leerEnCurso } from './Entrenando';
import { necesitaDescarga } from './analisis';
import { entrenoHoy, progresoEjercicio, proximoDia, tendencia, useRutina, useSeries, useSesiones } from './modelo';
import { PantallaEntrenador, PantallaHistorial, PantallaHoy, PantallaProgreso } from './Pantallas';
import { PantallaRutina } from './Rutina';

function useSenalesEntreno(): Senal[] {
  const { filas: sesiones, cargado } = useSesiones();
  const { filas: series } = useSeries();
  const { dias } = useRutina();
  if (!cargado) return [];
  const senales: Senal[] = [];
  if (leerEnCurso()) {
    senales.push({ id: 'ent-curso', modulo: 'entrenamiento', nivel: 'info', titulo: 'Tenés un entreno a medias', detalle: 'Tocá para seguir donde quedaste.', ruta: '#/entrenamiento' });
  } else if (!entrenoHoy(sesiones)) {
    const ult = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const hace = ult ? diasEntre(ult.fecha, hoy()) : null;
    if (hace == null || hace >= 2) {
      const p = proximoDia(sesiones, dias);
      senales.push({
        id: 'ent-toca', modulo: 'entrenamiento', nivel: hace != null && hace >= 4 ? 'aviso' : 'info',
        titulo: `Hoy toca: Día ${p.id} · ${p.nombre}`,
        detalle: hace == null ? 'Arrancá tu primera sesión.' : `Hace ${hace} días que no entrenás.`,
        ruta: '#/entrenamiento',
      });
    }
  }
  const descarga = necesitaDescarga(sesiones, series);
  if (descarga) senales.push({ id: 'ent-descarga', modulo: 'entrenamiento', nivel: 'aviso', titulo: 'Fatiga acumulada: toca descarga', detalle: descarga, ruta: '#/entrenamiento' });
  const estancados = dias.flatMap((d) => d.ejercicios).filter((ej) => tendencia(progresoEjercicio(series, ej.nombre)) === 'estancado');
  if (estancados.length) {
    senales.push({
      id: 'ent-estanc', modulo: 'entrenamiento', nivel: 'aviso',
      titulo: `${estancados.length === 1 ? '1 ejercicio estancado' : `${estancados.length} ejercicios estancados`}`,
      detalle: `${estancados.map((e) => e.nombre).join(', ')}. Probá dormir y comer más proteína, o bajar 10 % el peso y volver a subir.`,
      ruta: '#/entrenamiento/progreso',
    });
  }
  return senales;
}

function ResumenEntreno() {
  const { filas: sesiones } = useSesiones();
  const { dias } = useRutina();
  const semana = sesiones.filter((s) => diasEntre(s.fecha, hoy()) < 7).length;
  const p = proximoDia(sesiones, dias);
  return (
    <div className="grilla-cifras compacta">
      <div className="cifra"><span className="cifra-etq">Esta semana</span><strong className="cifra-val">{semana}/{dias.length}</strong><span className="cifra-nota">entrenos</span></div>
      <div className="cifra"><span className="cifra-etq">Próximo</span><strong className="cifra-val">Día {p.id}</strong><span className="cifra-nota">{p.nombre}</span></div>
    </div>
  );
}

/** Cada entreno vale 5 registros (50 XP). */
function useActividadEntreno(): string[] {
  return useSesiones().filas.flatMap((s) => Array(5).fill(s.fecha));
}

export const moduloEntrenamiento: Modulo = {
  id: 'entrenamiento',
  nombre: 'Entreno',
  descripcion: 'Rutina editable, modo entrenando, sobrecarga y progreso',
  icono: Icono.entreno,
  pantallas: [
    { ruta: '', titulo: 'Hoy', componente: PantallaHoy },
    { ruta: 'progreso', titulo: 'Progreso', componente: PantallaProgreso },
    { ruta: 'historial', titulo: 'Historial', componente: PantallaHistorial },
    { ruta: 'rutina', titulo: 'Rutina', componente: PantallaRutina },
    { ruta: 'entrenador', titulo: 'Coach', componente: PantallaEntrenador },
  ],
  Resumen: ResumenEntreno,
  useSenales: useSenalesEntreno,
  useActividad: useActividadEntreno,
};
