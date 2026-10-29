// Guarda en LIFE lo que dice el software de la sodería Tía Titi sobre su repartidor.
// Lo usan life-mcp (herramienta soderia_guardar, cuando Claude lee el conector de la sodería)
// y la función soderia (sincronización automática con la clave de la sodería).
// La sodería es la fuente de verdad: cada vez pisa la copia anterior.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;

const DIAS: Record<string, number> = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, 'MIÉRCOLES': 3, JUEVES: 4, VIERNES: 5, SABADO: 6, 'SÁBADO': 6 };
const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const hora = (v: unknown) => (typeof v === 'string' && HORA.test(v) ? v : null);
const num = (v: unknown) => Number(v) || 0;

/** De la persona que devuelve la herramienta `personal` de la sodería, los movimientos en una sola lista. */
function movimientosDe(p: Json) {
  const lista = (clave: string, tipo: string) =>
    ((p[clave] as Json[] | undefined) ?? []).map((m) => ({ dia: String(m.dia ?? ''), tipo, concepto: String(m.concepto ?? ''), monto: num(m.monto) }));
  const inicial = num(p.saldoInicial)
    ? [{ dia: String(p.fechaSaldoInicial ?? ''), tipo: 'inicial', concepto: 'Lo que ya te debían cuando se empezó a llevar la cuenta', monto: num(p.saldoInicial) }]
    : [];
  return [
    ...inicial,
    ...lista('cierresDevengados', 'devengado'),
    ...lista('pagos', 'pago'),
    ...lista('compensaciones', 'compensacion'),
    ...lista('ajustes', 'ajuste'),
  ].sort((a, b) => b.dia.localeCompare(a.dia));
}

/** Junta las tiradas de `horarios_de_pasada` (o `armar_recorrido`) en una fila por día. */
function repartosDe(tiradas: Json[], fecha: string | null) {
  const porDia = new Map<number, { salida: string | null; regreso: string | null; paradas: Json[] }>();
  for (const t of tiradas) {
    const d = DIAS[String(t.dia ?? '').toUpperCase()];
    if (d === undefined) continue;
    const r = porDia.get(d) ?? { salida: null, regreso: null, paradas: [] };
    r.salida ??= hora(t.salida);
    r.regreso = hora(t.regreso) ?? r.regreso;
    for (const p of (t.paradas as Json[] | undefined) ?? []) {
      r.paradas.push({ nombre: String(p.nombre ?? ''), zona: p.zona ?? null, llegada: hora(p.llegada), sale: hora(p.sale), tirada: num(t.tirada) || 1 });
    }
    porDia.set(d, r);
  }
  return [...porDia].map(([dia_semana, r]) => ({ dia_semana, fecha, ...r }));
}

export interface DatosSoderia {
  /** Una persona de la herramienta `personal` de la sodería (la del repartidor). */
  persona?: Json;
  /** Las tiradas de `horarios_de_pasada` (todos los días) o de `armar_recorrido` con fecha. */
  tiradas?: Json[];
  /** Solo si las tiradas son de una fecha puntual (YYYY-MM-DD). */
  fecha?: string;
}

export async function guardarSoderia(db: SupabaseClient, userId: string, datos: DatosSoderia, origen: 'claude' | 'auto') {
  const salida: Json = {};
  const ahora = new Date().toISOString();

  if (datos.persona) {
    const p = datos.persona;
    if (!p.personaId || p.saldo === undefined) throw new Error('Falta la persona de la sodería (personaId y saldo, de la herramienta personal).');
    const fila = {
      user_id: userId,
      persona_id: String(p.personaId),
      persona: String(p.nombre ?? ''),
      saldo: num(p.saldo),
      monto_semanal: p.formaDeCobro === 'semanal' ? num(p.monto) : null,
      cierres_impagos: num(p.cierresImpagos),
      movimientos: movimientosDe(p),
      actualizado: ahora,
      origen,
    };
    const { error } = await db.from('sod_cuenta').upsert(fila, { onConflict: 'user_id' });
    if (error) throw new Error(`sod_cuenta: ${error.message}`);

    // Lo que te debe la sodería pasa a ser lo adeudado del ingreso del reparto, así entra en la proyección.
    const { data: ingresos } = await db.from('eco_ingresos').select('id, nombre').eq('user_id', userId).ilike('nombre', '%reparto%');
    const ingreso = (ingresos as { id: string }[] | null)?.[0];
    if (ingreso) {
      const { error: e } = await db.from('eco_ingresos').update({ adeudado: fila.saldo, puede_adeudarse: true }).eq('id', ingreso.id).eq('user_id', userId);
      if (e) throw new Error(`eco_ingresos: ${e.message}`);
    }
    salida.cuenta = { saldo: fila.saldo, cierres_impagos: fila.cierres_impagos, ingreso_actualizado: !!ingreso };
  }

  if (datos.tiradas?.length) {
    const fecha = datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : null;
    const filas = repartosDe(datos.tiradas, fecha).map((r) => ({ ...r, user_id: userId, actualizado: ahora }));
    // Se reemplazan los días que llegaron (los otros quedan como estaban).
    for (const r of filas) {
      let borrar = db.from('sod_repartos').delete().eq('user_id', userId).eq('dia_semana', r.dia_semana);
      borrar = fecha ? borrar.eq('fecha', fecha) : borrar.is('fecha', null);
      const { error } = await borrar;
      if (error) throw new Error(`sod_repartos: ${error.message}`);
    }
    if (filas.length) {
      const { error } = await db.from('sod_repartos').insert(filas);
      if (error) throw new Error(`sod_repartos: ${error.message}`);
    }
    salida.repartos = filas.map((r) => ({ dia_semana: r.dia_semana, fecha: r.fecha, salida: r.salida, regreso: r.regreso, paradas: r.paradas.length }));
  }

  if (!salida.cuenta && !salida.repartos) throw new Error('No llegó nada para guardar: mandá persona y/o tiradas.');
  return salida;
}
