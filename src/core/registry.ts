import { moduloAjustes } from '../modules/ajustes';
import { moduloAlimentacion } from '../modules/alimentacion';
import { moduloCompras } from '../modules/compras';
import { moduloEconomia } from '../modules/economia';
import { moduloEntrenamiento } from '../modules/entrenamiento';
import { moduloPagos } from '../modules/pagos';
import { moduloStock } from '../modules/stock';
import type { Modulo } from './types';

/**
 * Registro de módulos. Para sumar uno nuevo (Tareas, Calendario, Compras…):
 * 1. Crear src/modules/<nombre>/index.tsx exportando un objeto `Modulo`.
 * 2. Agregarlo a esta lista. El hub y el menú lo toman solos.
 *
 * El orden de la lista es fijo: los hooks de señales y agenda se llaman en este orden.
 */
export const MODULOS: Modulo[] = [moduloEconomia, moduloPagos, moduloEntrenamiento, moduloStock, moduloCompras, moduloAlimentacion, moduloAjustes];
