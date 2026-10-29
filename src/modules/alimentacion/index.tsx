import { crear } from '../../core/db';
import { diasEntre, dinero, hoy, sumarDias } from '../../core/format';
import type { Modulo, Senal, Vital } from '../../core/types';
import { Icono } from '../../ui/ui';
import { useCompras, useItems, usePrecios } from '../compras/modelo';
import { PantallaAsistente } from './Asistente';
import { armarCanasta, plataCanasta } from './canasta';
import { PantallaCuerpo } from './Cuerpo';
import { type Extra, METAS_BASE, metasDelDia, TA, totalesDia, useComidas, useDiaDeEntreno, useExtras, useMetas } from './modelo';
import { horasSinComer, useCuerpo } from './nutricion';
import { PantallaHoyComida, PantallaMetas, PantallaPlatos } from './Pantallas';
import './comida.css';

/** El agua se reparte de 9 a 22 h: en cada tramo de 2 horas, si vas atrasada, aparece el aviso con su botón. */
const TRAMO = 2;

function useSenalesComida(): Senal[] {
  const { filas: comidas } = useComidas();
  const { filas: extras } = useExtras();
  const { filas: metas } = useMetas();
  const { filas: cuerpo } = useCuerpo();
  const { filas: items } = useItems();
  const { filas: precios } = usePrecios();
  const { filas: compras } = useCompras();
  const senales: Senal[] = [];
  const ahora = new Date();
  const h = ahora.getHours() + ahora.getMinutes() / 60;
  const entreno = useDiaDeEntreno();
  const meta = metasDelDia(metas, entreno);
  const t = totalesDia(comidas, hoy());
  if (h >= 17 && t.proteina < meta.proteina * 0.6) {
    senales.push({
      id: 'ali-prot', modulo: 'alimentacion', nivel: entreno ? 'aviso' : 'info',
      titulo: `Te faltan ${Math.round(meta.proteina - t.proteina)} g de proteína hoy`,
      detalle: entreno ? 'Día de entreno: para ganar masa conviene llegar a la meta.' : 'Sumá huevos, pollo, atún o lácteos en la cena.',
      ruta: '#/alimentacion/asistente', accion: { texto: 'Qué como', ruta: '#/alimentacion/asistente' },
    });
  }

  // Agua: lo que esperados llevar a esta hora (de 9 a 22 h) contra lo que tomaste.
  const agua = extras.filter((x) => x.fecha === hoy() && x.tipo === 'agua').reduce((s, x) => s + Number(x.cantidad), 0);
  if (h >= 10 && h < 22 && meta.agua > 0) {
    const esperado = meta.agua * Math.min(1, (h - 9) / 13);
    if (agua < esperado - 400) {
      const desde = 9 + Math.floor((h - 9) / TRAMO) * TRAMO;
      senales.push({
        id: 'ali-agua', modulo: 'alimentacion', nivel: 'info',
        titulo: `Tomá agua · ${desde} a ${desde + TRAMO} h`,
        detalle: `Llevás ${(agua / 1000).toFixed(1)} L; a esta hora tendrías que ir por ${(esperado / 1000).toFixed(1)} L de ${(meta.agua / 1000).toFixed(1)} L.`,
        ruta: '#/alimentacion',
        accion: { texto: '+500 ml', ruta: '#/alimentacion', hacer: () => crear<Extra>(TA.extras, { fecha: hoy(), tipo: 'agua', nombre: 'Agua', cantidad: 500 }) },
      });
    }
  }

  // Creatina y otros suplementos: desde el mediodía, con el botón "Tomé".
  const supl = (metas[0]?.suplementos ?? METAS_BASE.suplementos).split(',').map((s) => s.trim()).filter(Boolean);
  const tomados = new Set(extras.filter((x) => x.fecha === hoy() && x.tipo === 'suplemento').map((x) => x.nombre));
  if (h >= 12) {
    for (const s of supl.filter((x) => !tomados.has(x))) {
      senales.push({
        id: `ali-supl-${s}`, modulo: 'alimentacion', nivel: 'info', titulo: `Tomá la ${s.toLowerCase()}`,
        detalle: /creatina/i.test(s) ? '5 g con cualquier comida. Todos los días, entrenes o no.' : undefined,
        ruta: '#/alimentacion',
        accion: { texto: 'Tomé', ruta: '#/alimentacion', hacer: () => crear<Extra>(TA.extras, { fecha: hoy(), tipo: 'suplemento', nombre: s, cantidad: 1 }) },
      });
    }
  }

  // Ventanas largas sin comer (lo que más frena ganar masa). Solo si venís cargando las comidas.
  const cargas = comidas.some((c) => c.fecha >= sumarDias(hoy(), -2));
  const sin = horasSinComer(comidas);
  if (cargas && sin != null && sin >= 4.5 && h >= 10 && h < 23) {
    senales.push({
      id: 'ali-ayuno', modulo: 'alimentacion', nivel: sin >= 6 ? 'aviso' : 'info',
      titulo: `Hace ${Math.floor(sin)} h que no comés`,
      detalle: 'Para ganar masa conviene comer cada 3 a 4 horas con unos 30 g de proteína. Algo rápido: huevos, atún, un sándwich, yogur con avena.',
      ruta: '#/alimentacion/asistente', accion: { texto: 'Qué como', ruta: '#/alimentacion/asistente' },
    });
  }

  // Pesarse una vez por semana como mínimo (en ayunas): sin eso no se puede medir el metabolismo.
  const ult = [...cuerpo].filter((m) => m.peso).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (!ult || diasEntre(ult.fecha, hoy()) >= 4) {
    senales.push({
      id: 'ali-peso', modulo: 'alimentacion', nivel: 'info', titulo: 'Pesate en ayunas',
      detalle: ult ? `La última vez fue hace ${diasEntre(ult.fecha, hoy())} días.` : 'Con el peso y lo que comés te calculo tu metabolismo real.',
      ruta: '#/alimentacion/cuerpo', accion: h < 11 ? { texto: 'Anotar peso', ruta: '#/alimentacion/cuerpo' } : undefined,
    });
  }

  // Sábado (día de cobro): cuánto separar para el súper de la semana.
  if (new Date().getDay() === 6) {
    const plata = plataCanasta(armarCanasta({ items, precios, compras, proteinaDia: meta.proteina }));
    if (plata.semana > 0) {
      senales.push({
        id: 'ali-separar', modulo: 'alimentacion', nivel: 'info', titulo: `Separá ${dinero(plata.semana)} para la comida de la semana`,
        detalle: 'Es la canasta para ganar masa con tus precios y la suba que venís viendo.',
        ruta: '#/alimentacion/asistente', accion: { texto: 'Ver la canasta', ruta: '#/alimentacion/asistente' },
      });
    }
  }
  return senales;
}

function ResumenComida() {
  const { filas: comidas } = useComidas();
  const { filas: metas } = useMetas();
  const meta = metasDelDia(metas, useDiaDeEntreno());
  const t = totalesDia(comidas, hoy());
  return (
    <div className="grilla-cifras compacta">
      <div className="cifra"><span className="cifra-etq">Proteína hoy</span><strong className="cifra-val">{Math.round(t.proteina)} g</strong><span className="cifra-nota">meta {meta.proteina} g</span></div>
      <div className="cifra"><span className="cifra-etq">Calorías hoy</span><strong className="cifra-val">{Math.round(t.kcal)}</strong><span className="cifra-nota">meta {meta.kcal}</span></div>
    </div>
  );
}

function useVitalComida(): Vital {
  const { filas: comidas } = useComidas();
  const { filas: metas } = useMetas();
  const meta = metasDelDia(metas, useDiaDeEntreno());
  const t = totalesDia(comidas, hoy());
  return {
    cifra: `${Math.round(t.proteina)} / ${meta.proteina} g`,
    sub: `Proteína de hoy · ${Math.round(t.kcal)} de ${meta.kcal} kcal`,
    barra: meta.proteina ? Math.min(1, t.proteina / meta.proteina) : undefined,
    accion: { texto: 'Comí', ruta: '#/alimentacion' },
  };
}

function useActividadComida(): string[] {
  return useComidas().filas.map((c) => c.fecha);
}

export const moduloAlimentacion: Modulo = {
  id: 'alimentacion',
  nombre: 'Comida',
  descripcion: 'Qué comés, macros, agua, creatina, tu cuerpo y qué comprar para ganar masa',
  icono: Icono.comida,
  pantallas: [
    { ruta: '', titulo: 'Hoy', componente: PantallaHoyComida },
    { ruta: 'asistente', titulo: 'Asistente', componente: PantallaAsistente },
    { ruta: 'cuerpo', titulo: 'Cuerpo', componente: PantallaCuerpo },
    { ruta: 'platos', titulo: 'Platos', componente: PantallaPlatos },
    { ruta: 'metas', titulo: 'Metas', componente: PantallaMetas },
  ],
  Resumen: ResumenComida,
  useVital: useVitalComida,
  useSenales: useSenalesComida,
  useActividad: useActividadComida,
};
