import { hoy } from '../../core/format';
import type { Modulo, Senal } from '../../core/types';
import { Icono } from '../../ui/ui';
import { entrenoHoy, useSesiones } from '../entrenamiento/modelo';
import { metasDelDia, totalesDia, useComidas, useExtras, useMetas } from './modelo';
import { PantallaHoyComida, PantallaMetas, PantallaPlatos } from './Pantallas';

function useSenalesComida(): Senal[] {
  const { filas: comidas } = useComidas();
  const { filas: extras } = useExtras();
  const { filas: metas } = useMetas();
  const { filas: sesiones } = useSesiones();
  const senales: Senal[] = [];
  const h = new Date().getHours();
  const entreno = entrenoHoy(sesiones);
  const meta = metasDelDia(metas, entreno);
  const t = totalesDia(comidas, hoy());
  if (h >= 17 && t.proteina < meta.proteina * 0.6) {
    senales.push({
      id: 'ali-prot', modulo: 'alimentacion', nivel: entreno ? 'aviso' : 'info',
      titulo: `Te faltan ${Math.round(meta.proteina - t.proteina)} g de proteína hoy`,
      detalle: entreno ? 'Entrenaste: para ganar masa conviene llegar a la meta.' : 'Sumá huevos, pollo, atún o lácteos en la cena.',
      ruta: '#/alimentacion',
    });
  }
  const agua = extras.filter((x) => x.fecha === hoy() && x.tipo === 'agua').reduce((s, x) => s + Number(x.cantidad), 0);
  if (h >= 14 && agua < meta.agua * (h / 24) * 0.7) {
    senales.push({ id: 'ali-agua', modulo: 'alimentacion', nivel: 'info', titulo: 'Tomá agua', detalle: `Llevás ${(agua / 1000).toFixed(1)} L de ${(meta.agua / 1000).toFixed(1)} L.`, ruta: '#/alimentacion' });
  }
  const supl = (metas[0]?.suplementos ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const tomados = new Set(extras.filter((x) => x.fecha === hoy() && x.tipo === 'suplemento').map((x) => x.nombre));
  const pendientes = supl.filter((s) => !tomados.has(s));
  if (h >= 12 && pendientes.length) {
    senales.push({ id: 'ali-supl', modulo: 'alimentacion', nivel: 'info', titulo: `Suplementos pendientes: ${pendientes.join(', ')}`, ruta: '#/alimentacion' });
  }
  return senales;
}

function ResumenComida() {
  const { filas: comidas } = useComidas();
  const { filas: metas } = useMetas();
  const { filas: sesiones } = useSesiones();
  const meta = metasDelDia(metas, entrenoHoy(sesiones));
  const t = totalesDia(comidas, hoy());
  return (
    <div className="grilla-cifras compacta">
      <div className="cifra"><span className="cifra-etq">Proteína hoy</span><strong className="cifra-val">{Math.round(t.proteina)} g</strong><span className="cifra-nota">meta {meta.proteina} g</span></div>
      <div className="cifra"><span className="cifra-etq">Calorías hoy</span><strong className="cifra-val">{Math.round(t.kcal)}</strong><span className="cifra-nota">meta {meta.kcal}</span></div>
    </div>
  );
}

function useActividadComida(): string[] {
  return useComidas().filas.map((c) => c.fecha);
}

export const moduloAlimentacion: Modulo = {
  id: 'alimentacion',
  nombre: 'Comida',
  descripcion: 'Qué comés, macros, agua y suplementos',
  icono: Icono.comida,
  pantallas: [
    { ruta: '', titulo: 'Hoy', componente: PantallaHoyComida },
    { ruta: 'platos', titulo: 'Platos', componente: PantallaPlatos },
    { ruta: 'metas', titulo: 'Metas', componente: PantallaMetas },
  ],
  Resumen: ResumenComida,
  useSenales: useSenalesComida,
  useActividad: useActividadComida,
};
