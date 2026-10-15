import { useMemo } from 'react';
import { hoy, sumarDias } from '../../core/format';
import type { ItemAgenda, Modulo, Senal } from '../../core/types';
import { aMinutos, ahoraMinutos, armarDia, bloqueEn, FERIADOS, horaCorta, TIPOS, useDias, usePlantilla, useTareas } from './modelo';
import { PantallaDia, PantallaSemana } from './Pantallas';

const icono = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);

function useHoy() {
  const { filas: plantilla } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  return useMemo(() => armarDia(hoy(), plantilla, dias, tareas), [plantilla, dias, tareas]);
}

function useSenalesDia(): Senal[] {
  const { filas: tareas } = useTareas();
  const v = useHoy();
  const h = hoy();
  const senales: Senal[] = [];
  const atrasadas = tareas.filter((t) => !t.hecho && t.fecha && t.fecha < h);
  if (atrasadas.length) senales.push({
    id: 'dia-atrasadas', modulo: 'dia', nivel: 'aviso',
    titulo: atrasadas.length === 1 ? `Quedó pendiente: ${atrasadas[0].titulo}` : `${atrasadas.length} tareas quedaron pendientes`,
    detalle: atrasadas.slice(0, 4).map((t) => t.titulo).join(', '), ruta: '#/dia',
  });
  const prios = (v.marcado?.prioridades ?? []).filter((p) => !p.hecho);
  if (prios.length) senales.push({ id: 'dia-prios', modulo: 'dia', nivel: 'info', titulo: `Prioridad de hoy: ${prios[0].texto}`, detalle: prios.slice(1).map((p) => p.texto).join(', ') || undefined, ruta: '#/dia' });
  const manana = FERIADOS.find((f) => f.fecha === sumarDias(h, 1));
  if (manana) senales.push({ id: 'dia-feriado', modulo: 'dia', nivel: 'info', titulo: `Mañana es feriado: ${manana.nombre}`, ruta: '#/dia' });
  return senales;
}

function useAgendaDia(): ItemAgenda[] {
  const { filas: tareas } = useTareas();
  const { filas: dias } = useDias();
  const h = hoy();
  const limite = sumarDias(h, 60);
  const items: ItemAgenda[] = tareas.filter((t) => t.fecha && t.fecha >= h && t.fecha <= limite).map((t) => ({
    id: `tarea-${t.id}`, modulo: 'dia', fecha: t.fecha!, titulo: t.hora ? `${t.hora} ${t.titulo}` : t.titulo, hecho: t.hecho, ruta: '#/dia',
  }));
  for (const f of FERIADOS) if (f.fecha >= h && f.fecha <= limite) items.push({ id: `feriado-${f.fecha}`, modulo: 'dia', fecha: f.fecha, titulo: `Feriado: ${f.nombre}`, ruta: '#/dia' });
  for (const d of dias) if (d.fecha >= h && d.fecha <= limite && d.estado === 'libre') items.push({ id: `libre-${d.id}`, modulo: 'dia', fecha: d.fecha, titulo: d.nombre ? `Libre: ${d.nombre}` : 'Día libre', ruta: '#/dia' });
  return items;
}

function useActividadDia(): string[] {
  return useTareas().filas.filter((t) => t.hecho && t.fecha).map((t) => t.fecha!);
}

function ResumenDia() {
  const v = useHoy();
  const min = ahoraMinutos();
  const actual = bloqueEn(v.bloques, min);
  const siguiente = v.bloques.find((x) => aMinutos(x.inicio) > min);
  const pend = v.tareas.filter((t) => !t.hecho).length;
  return (
    <div className="pila" style={{ gap: 8 }}>
      {actual && <div><small className="nota">Ahora</small><br /><strong>{TIPOS[actual.tipo].emoji} {actual.titulo}</strong> <small className="nota">hasta {horaCorta(actual.fin)}</small></div>}
      {siguiente && <small className="nota">Después: {horaCorta(siguiente.inicio)} {siguiente.titulo}</small>}
      <small className="nota">{pend ? `${pend} tarea${pend > 1 ? 's' : ''} para hoy` : 'Sin tareas para hoy'}{v.feriado ? ` · ${v.feriado.nombre}` : ''}</small>
    </div>
  );
}

export const moduloDia: Modulo = {
  id: 'dia',
  nombre: 'Día',
  descripcion: 'Línea de tiempo del día, semana tipo, tareas y calendario',
  icono,
  pantallas: [
    { ruta: '', titulo: 'Hoy', componente: PantallaDia },
    { ruta: 'semana', titulo: 'Semana tipo', componente: PantallaSemana },
  ],
  Resumen: ResumenDia,
  useSenales: useSenalesDia,
  useAgenda: useAgendaDia,
  useActividad: useActividadDia,
};
