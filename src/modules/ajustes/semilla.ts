import { almacen, crear, recargar } from '../../core/db';
import { aISO, hoy, sumarMeses } from '../../core/format';
import {
  COLORES, T,
  type Categoria, type Cuenta, type Ingreso, type Pago,
} from '../economia/modelo';
import { METAS_BASE, TA, type Metas, type Plato } from '../alimentacion/modelo';
import { TS, type Lugar, type Producto, type Unidad } from '../stock/modelo';

/**
 * Configuración inicial personal (relevada en el cuestionario del 2026-10-05).
 * Se puede correr más de una vez: solo agrega lo que falta, buscando por nombre.
 */

function proximoSabado(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return aISO(d);
}

/** Próxima fecha con ese día del mes (este mes si todavía no pasó, si no el que viene). */
function proximoDia(dia: number): string {
  const h = hoy();
  const esteMes = `${h.slice(0, 8)}${String(dia).padStart(2, '0')}`;
  return esteMes >= h ? esteMes : sumarMeses(esteMes, 1, dia);
}

const CATEGORIAS: Array<Pick<Categoria, 'nombre' | 'tipo'>> = [
  { nombre: 'Reparto de soda', tipo: 'ingreso' },
  { nombre: 'Fábrica', tipo: 'ingreso' },
  { nombre: 'Otros ingresos', tipo: 'ingreso' },
  { nombre: 'Súper', tipo: 'gasto' },
  { nombre: 'Verdulería', tipo: 'gasto' },
  { nombre: 'Carnicería', tipo: 'gasto' },
  { nombre: 'Delivery', tipo: 'gasto' },
  { nombre: 'Salidas', tipo: 'gasto' },
  { nombre: 'Transporte', tipo: 'gasto' },
  { nombre: 'Nafta/GNC', tipo: 'gasto' },
  { nombre: 'Salud', tipo: 'gasto' },
  { nombre: 'Ropa', tipo: 'gasto' },
  { nombre: 'Regalos', tipo: 'gasto' },
  { nombre: 'Vivienda', tipo: 'gasto' },
  { nombre: 'Servicios', tipo: 'gasto' },
  { nombre: 'Gimnasio', tipo: 'gasto' },
  { nombre: 'Suscripciones', tipo: 'gasto' },
];

async function asegurar<F extends { id: string; nombre: string }>(tabla: string, nombre: string, datos: Omit<F, 'id'>): Promise<F> {
  const existentes = await almacen.listar<F>(tabla);
  const ya = existentes.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase());
  if (ya) return ya;
  return crear<F>(tabla, datos);
}

/** Devuelve cuántas cosas agregó. */
export async function cargarConfiguracionInicial(): Promise<number> {
  let n = 0;
  const contar = async <F extends { id: string; nombre: string }>(tabla: string, datos: Omit<F, 'id'> & { nombre: string }) => {
    const antes = (await almacen.listar(tabla)).length;
    const f = await asegurar<F>(tabla, datos.nombre, datos);
    if ((await almacen.listar(tabla)).length > antes) n++;
    return f;
  };

  const mp = await contar<Cuenta>(T.cuentas, { nombre: 'Mercado Pago', tipo: 'billetera', moneda: 'ARS', saldo_inicial: 0, archivada: false });
  const efectivo = await contar<Cuenta>(T.cuentas, { nombre: 'Efectivo', tipo: 'efectivo', moneda: 'ARS', saldo_inicial: 0, archivada: false });
  await contar<Cuenta>(T.cuentas, { nombre: 'Cocos Capital', tipo: 'inversion', moneda: 'ARS', saldo_inicial: 0, archivada: false });

  const cat = new Map<string, string>();
  let i = 0;
  for (const c of CATEGORIAS) {
    const f = await contar<Categoria>(T.categorias, { ...c, color: COLORES[i++ % COLORES.length], presupuesto: null });
    cat.set(c.nombre, f.id);
  }

  const sabado = proximoSabado();
  await contar<Ingreso>(T.ingresos, {
    nombre: 'Reparto de soda', monto: 120000, moneda: 'ARS', frecuencia: 'semanal', proximo_cobro: sabado,
    cuenta_id: efectivo.id, categoria_id: cat.get('Reparto de soda') ?? null, activo: true, notas: '3 días por semana',
  });
  await contar<Ingreso>(T.ingresos, {
    nombre: 'Fábrica', monto: 135000, moneda: 'ARS', frecuencia: 'semanal', proximo_cobro: sabado,
    cuenta_id: efectivo.id, categoria_id: cat.get('Fábrica') ?? null, activo: true, notas: '3 días por semana',
  });

  const pago = (nombre: string, monto: number, dia: number, categoria: string, cuenta: string | null, notas: string) =>
    contar<Pago>(T.pagos, {
      nombre, monto, moneda: 'ARS', frecuencia: 'mensual', dia, proximo_vencimiento: proximoDia(dia),
      categoria_id: cat.get(categoria) ?? null, cuenta_id: cuenta, activo: true, notas,
    });
  await pago('Alquiler', 200000, 5, 'Vivienda', null, 'Incluye expensas, luz, gas y agua. Efectivo o transferencia. Sube según el consumo de suministros.');
  await pago('Internet (mi mitad)', 9250, 10, 'Servicios', mp.id, 'Total $18.500 entre dos; lo paga Uli por Mercado Pago y le pasás tu mitad.');
  await pago('Gimnasio', 80000, 5, 'Gimnasio', mp.id, 'Se lo pasás a tu papá, que lo paga con su tarjeta.');
  await pago('Carga de celular', 8000, 15, 'Servicios', mp.id, 'Monto aproximado: depende del consumo de datos.');

  // Básicos de la casa (cantidad 0: contá lo que tenés y ajustalo con + y −).
  const prod = new Map<string, string>();
  const BASICOS: Array<[string, Lugar, Unidad, number, number]> = [
    ['Leche', 'heladera', 'l', 2, 4], ['Huevos', 'heladera', 'u', 12, 30], ['Pechuga de pollo', 'freezer', 'g', 1000, 2000],
    ['Avena', 'alacena', 'g', 500, 1000], ['Fideos', 'alacena', 'g', 1000, 2000], ['Arroz', 'alacena', 'g', 1000, 1000],
    ['Atún en lata', 'alacena', 'u', 3, 6], ['Arvejas en lata', 'alacena', 'u', 2, 4], ['Porotos en lata', 'alacena', 'u', 2, 4],
    ['Pan rallado', 'alacena', 'g', 250, 500], ['Pan', 'alacena', 'g', 300, 500],
    ['Bananas', 'frutas', 'u', 3, 6], ['Manzanas', 'frutas', 'u', 3, 6], ['Papas', 'frutas', 'g', 1000, 2000], ['Lechuga', 'frutas', 'u', 1, 1],
    ['Papel higiénico', 'bano', 'u', 4, 12], ['Rollo de cocina', 'limpieza', 'u', 1, 3], ['Detergente', 'limpieza', 'u', 1, 1], ['Lavandina', 'limpieza', 'u', 1, 1],
  ];
  for (const [nombre, lugar, unidad, minimo, compra] of BASICOS) {
    const f = await contar<Producto>(TS.productos, { nombre, lugar, unidad, minimo, compra, cantidad: 0, vence: null, basico: true });
    prod.set(nombre, f.id);
  }

  // Platos que repetís, con macros aproximados por porción.
  const ing = (...xs: Array<[string, number]>) => xs.filter(([n]) => prod.has(n)).map(([n, cantidad]) => ({ producto_id: prod.get(n)!, cantidad }));
  const PLATOS: Array<Omit<Plato, 'id'>> = [
    { nombre: 'Milanesas de pollo', ingredientes: ing(['Pechuga de pollo', 250], ['Huevos', 1], ['Pan rallado', 50]), proteina: 55, carbos: 30, grasas: 18, kcal: 500, minutos: 30 },
    { nombre: 'Fideos con atún', ingredientes: ing(['Fideos', 120], ['Atún en lata', 1]), proteina: 40, carbos: 90, grasas: 8, kcal: 590, minutos: 15 },
    { nombre: 'Ensalada césar con pollo', ingredientes: ing(['Pechuga de pollo', 150], ['Lechuga', 0.5], ['Pan', 30]), proteina: 40, carbos: 15, grasas: 20, kcal: 420, minutos: 15 },
    { nombre: 'Tortilla de papas', ingredientes: ing(['Huevos', 2], ['Papas', 200]), proteina: 16, carbos: 35, grasas: 14, kcal: 330, minutos: 30 },
    { nombre: 'Tostadas con huevo', ingredientes: ing(['Pan', 60], ['Huevos', 2]), proteina: 18, carbos: 30, grasas: 11, kcal: 300, minutos: 10 },
    { nombre: 'Avena con leche y banana', ingredientes: ing(['Avena', 60], ['Leche', 0.25], ['Bananas', 1]), proteina: 16, carbos: 70, grasas: 8, kcal: 420, minutos: 5 },
  ];
  for (const p of PLATOS) await contar<Plato>(TA.platos, p);

  if ((await almacen.listar<Metas>(TA.metas)).length === 0) { await crear<Metas>(TA.metas, METAS_BASE); n++; }

  for (const t of [T.cuentas, T.categorias, T.ingresos, T.pagos, TS.productos, TA.platos, TA.metas]) await recargar(t);
  return n;
}
