import type { FC, ReactNode } from 'react';

/** Nivel de una señal: define color, ícono y orden en el hub. */
export type NivelSenal = 'critico' | 'aviso' | 'info' | 'ok';

/** Alerta o sugerencia que surge de los datos de un módulo (o de cruzar varios). */
export interface Senal {
  id: string;
  modulo: string;
  nivel: NivelSenal;
  titulo: string;
  detalle?: string;
  /** Ruta a la que lleva la señal al tocarla, ej. "#/pagos". */
  ruta?: string;
  /** Acceso directo que se ofrece en el aviso flotante, ej. { texto: 'Pagar', ruta: '#/pagos/al-dia' }. */
  accion?: { texto: string; ruta: string };
}

/**
 * Algo que quedó a medias (un entreno, una compra, ponerse al día con los pagos).
 * Se muestra en la barra flotante para volver con un toque.
 */
export interface ActividadEnCurso {
  id: string;
  titulo: string;
  detalle?: string;
  /** Ruta donde sigue la actividad, ej. "#/entrenamiento". */
  ruta: string;
  /** La actividad está minimizada aunque estés en su pantalla. */
  minimizada?: boolean;
  /** Se ejecuta al tocar "Volver" (antes de navegar), ej. para desminimizar. */
  volver?: () => void;
}

/**
 * Elemento de la agenda compartida. Cualquier módulo publica aquí lo que tiene fecha
 * (vencimientos, tareas, eventos, sesiones) y el hub/Calendario lo leen sin copiarlo.
 */
export interface ItemAgenda {
  id: string;
  modulo: string;
  fecha: string; // YYYY-MM-DD
  titulo: string;
  detalle?: string;
  monto?: number;
  moneda?: string;
  hecho?: boolean;
  ruta?: string;
}

export interface Pantalla {
  /** Ruta relativa al módulo: "" es la principal, "movimientos" queda en #/economia/movimientos. */
  ruta: string;
  titulo: string;
  componente: FC;
}

/**
 * Contrato común de un módulo. Para sumar un módulo nuevo alcanza con crear un objeto
 * que cumpla esto y agregarlo en core/registry.ts.
 */
export interface Modulo {
  id: string;
  nombre: string;
  descripcion: string;
  icono: ReactNode;
  /** Etapa del plan en la que se activa. */
  pantallas: Pantalla[];
  /** Tarjeta resumen que se muestra en el hub. */
  Resumen?: FC;
  /** Hook que devuelve las señales actuales del módulo. */
  useSenales?: () => Senal[];
  /** Hook que devuelve los elementos que el módulo publica en la agenda. */
  useAgenda?: () => ItemAgenda[];
  /**
   * Hook que devuelve las fechas (YYYY-MM-DD) de cada cosa que registraste en el módulo:
   * un gasto, un entreno, una comida. Alimenta el nivel, la experiencia y la racha del hub.
   */
  useActividad?: () => string[];
  /**
   * Lee (sin hooks) si hay algo de este módulo a medias. La barra de actividad lo consulta
   * cada segundo, así que tiene que ser liviano (leer localStorage, no la base).
   */
  enCurso?: () => ActividadEnCurso | null;
  /** Si es false, se muestra en el menú pero no en el hub. */
  enHub?: boolean;
}
