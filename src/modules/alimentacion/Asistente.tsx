import { useState } from 'react';
import { dinero, hoy } from '../../core/format';
import { Cifra, Estado, Tarjeta } from '../../ui/ui';
import { useCompras, useItems, usePrecios } from '../compras/modelo';
import { armarDia, comeEnFabrica, useDias, usePlantilla, useTareas } from '../dia/modelo';
import { useProductos } from '../stock/modelo';
import { armarCanasta, buscarFaltantes, canastaALista, plataCanasta } from './canasta';
import { faltaPara, metasDelDia, totalesDia, useComidas, useDiaDeEntreno, useMetas, usePlatos } from './modelo';
import {
  gastoReal, horasSinComer, opcionesProteina, PESO_BASE, perfilDe, ritmoSemana, sugerirMetas, tendencia, ultimoPeso, useCuerpo, veredicto,
} from './nutricion';

const pct = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)} %`;
const cant = (x: number) => (Math.round(x * 100) / 100).toLocaleString('es-AR');

async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

/**
 * El asistente de comida: personal trainer + nutricionista. Qué comer ahora para llegar a la meta,
 * cómo viene tu ritmo de comidas, qué comprar en la semana y cuánta plata separar.
 */
export function PantallaAsistente() {
  const { filas: comidas } = useComidas();
  const { filas: metas } = useMetas();
  const { filas: platos } = usePlatos();
  const { filas: productos } = useProductos();
  const { filas: cuerpo } = useCuerpo();
  const { filas: items } = useItems();
  const { filas: precios } = usePrecios();
  const { filas: compras } = useCompras();
  const { filas: plantilla } = usePlantilla();
  const { filas: dias } = useDias();
  const { filas: tareas } = useTareas();
  const [msg, setMsg] = useState('');
  const [buscando, setBuscando] = useState(false);

  const dia = armarDia(hoy(), plantilla, dias, tareas);
  const gym = dia.bloques.find((b) => b.tipo === 'gym');
  const entreno = useDiaDeEntreno();
  const meta = metasDelDia(metas, entreno);
  const t = totalesDia(comidas, hoy());
  const falta = Math.max(0, Math.round(meta.proteina - t.proteina));
  const faltaKcal = Math.max(0, Math.round(meta.kcal - t.kcal));
  const perfil = perfilDe(metas);
  const peso = ultimoPeso(cuerpo) ?? PESO_BASE;
  const sug = sugerirMetas(perfil, peso, gastoReal(comidas, cuerpo).gasto);
  const sin = horasSinComer(comidas);
  const ritmo = ritmoSemana(comidas, sug.porComida);
  const v = veredicto(tendencia(cuerpo), perfil.kg_mes);
  const canasta = armarCanasta({ items, precios, compras, proteinaDia: meta.proteina });
  const plata = plataCanasta(canasta);
  const conStock = platos.filter((p) => p.ingredientes?.length && faltaPara(p, productos).length === 0).sort((a, b) => b.proteina - a.proteina);
  const opciones = opcionesProteina().sort((a, b) => Math.abs(a.proteina - Math.min(falta, 45)) - Math.abs(b.proteina - Math.min(falta, 45))).slice(0, 4);

  // Consejos del momento según el día (gym, fábrica) y la hora.
  const h = new Date().getHours();
  const consejos: string[] = [];
  if (gym) {
    const ini = Number(gym.inicio.slice(0, 2));
    if (h < ini) consejos.push(`Hoy vas al gym a las ${gym.inicio}: 1 a 2 horas antes comé carbohidratos y algo de proteína (arroz o fideos con pollo, o tostadas con huevo).`);
    else consejos.push('Después del gym: una comida con 30–40 g de proteína y carbohidratos en las 2 horas siguientes (ej. arroz con pollo, milanesa con puré).');
  }
  if (comeEnFabrica(dia.bloques)) consejos.push('Hoy comés en la fábrica: llevá una vianda con proteína (pollo, carne, huevos o atún) y algo para picar a media tarde, así no pasás 5 horas sin comer.');
  if (dia.bloques.some((b) => b.tipo === 'reparto')) consejos.push('Día de reparto: llevá agua y algo a mano (banana, sándwich, maní). Cargar bidones gasta mucho: no saltees el almuerzo.');
  if (h >= 21 && falta > 20) consejos.push(`Antes de dormir: algo con proteína lenta (queso, leche, yogur) para sumar los ${falta} g que faltan.`);

  const informe = [
    `Soy La Tía Titi. Quiero ganar masa muscular magra. ${perfil.altura_cm} cm, ${peso} kg${perfil.edad ? `, ${perfil.edad} años` : ''}. Actividad: reparto de bidones + gimnasio 3 días.`,
    `Metas: ${meta.proteina} g de proteína y ${meta.kcal} kcal hoy (${entreno ? 'día de entreno' : 'descanso'}). Gasto estimado ${sug.gasto} kcal.`,
    `Hoy llevo ${Math.round(t.proteina)} g de proteína y ${Math.round(t.kcal)} kcal.`,
    ritmo ? `Últimos 7 días: ${ritmo.comidas.toFixed(1)} comidas por día, ${Math.round(ritmo.proteina)} g de proteína promedio, hueco más largo ${ritmo.maxHueco.toFixed(1)} h, ${ritmo.buenas.toFixed(1)} comidas por día con ${sug.porComida} g o más de proteína.` : 'Todavía no cargué comidas de la semana.',
    `Cómo vengo: ${v.texto}`,
    `Canasta semanal (Mendoza): ${canasta.map((l) => `${l.basico.nombre} ${cant(l.semana)} ${l.unidad}${l.precio ? ` a ${dinero(l.precio)}` : ''}`).join('; ')}. Separar ${dinero(plata.semana)} por semana.`,
    'Armame un plan de comidas para esta semana con lo que conviene comprar, viandas para los días de fábrica y qué comer antes y después del gym.',
  ].join('\n');

  return (
    <div className="pila">
      <p className="nota">
        {entreno ? `Hoy es día de entreno${gym ? ` (gym ${gym.inicio})` : ''}: la meta sube.` : 'Hoy es día de descanso.'}
        {comeEnFabrica(dia.bloques) ? ' Almorzás en la fábrica.' : ''}
      </p>
      <div className="grilla-cifras">
        <Cifra etiqueta="Te falta proteína" valor={`${falta} g`} nota={`de ${meta.proteina} g`} tono={falta === 0 ? 'bien' : undefined} />
        <Cifra etiqueta="Te faltan calorías" valor={`${faltaKcal}`} nota={`de ${meta.kcal} kcal`} />
        <Cifra etiqueta="Sin comer" valor={sin == null ? '—' : `${sin.toFixed(1)} h`} tono={sin != null && sin > 4.5 ? 'mal' : undefined} nota="ideal: cada 3–4 h" />
        <Cifra etiqueta="Súper esta semana" valor={plata.semana ? dinero(plata.semana) : '—'} nota={plata.sinPrecio ? `${plata.sinPrecio} sin precio` : 'canasta para ganar masa'} />
      </div>

      <Tarjeta titulo="Qué comer ahora">
        {falta === 0 ? <p className="nota texto-bien">Ya llegaste a la proteína de hoy. Completá calorías con carbohidratos (arroz, papa, pan, fruta).</p> : (
          <>
            {conStock.length > 0 && (
              <>
                <p className="subtitulo">Con lo que hay en casa</p>
                <ul className="lista">
                  {conStock.slice(0, 3).map((p) => (
                    <li key={p.id} className="lista-item"><div className="crece"><strong>{p.nombre}</strong><small className="nota">{p.minutos} min</small></div><span className="mono">{p.proteina} g</span></li>
                  ))}
                </ul>
              </>
            )}
            <p className="subtitulo">Rápido, para sumar proteína</p>
            <ul className="lista">
              {opciones.map((o) => (
                <li key={o.texto} className="lista-item"><div className="crece"><strong>{o.texto}</strong><small className="nota">{o.kcal} kcal · cubre {Math.min(100, Math.round((o.proteina / falta) * 100))} % de lo que falta</small></div><span className="mono">{Math.round(o.proteina)} g</span></li>
              ))}
            </ul>
          </>
        )}
        {consejos.map((c) => <p key={c} className="nota consejo">{c}</p>)}
      </Tarjeta>

      <Tarjeta titulo="Tu ritmo de comidas (últimos 7 días)">
        {!ritmo ? <p className="nota">Cargá cada comida con su hora y en unos días te digo si estás pasando mucho tiempo sin comer.</p> : (
          <>
            <div className="grilla-cifras compacta">
              <Cifra etiqueta="Comidas por día" valor={ritmo.comidas.toFixed(1)} nota="ideal: 4 o más" tono={ritmo.comidas < 3.5 ? 'mal' : 'bien'} />
              <Cifra etiqueta="Hueco más largo" valor={`${ritmo.maxHueco.toFixed(1)} h`} nota="ideal: menos de 5 h" tono={ritmo.maxHueco > 5 ? 'mal' : 'bien'} />
              <Cifra etiqueta={`Comidas con ${sug.porComida} g+`} valor={ritmo.buenas.toFixed(1)} nota="ideal: 4 por día" tono={ritmo.buenas < 3 ? 'mal' : 'bien'} />
              <Cifra etiqueta="Proteína promedio" valor={`${Math.round(ritmo.proteina)} g`} nota={`meta ${sug.proteina_descanso}–${sug.proteina_entreno} g`} />
            </div>
            <div className="barra-acciones">
              <Estado nivel={ritmo.maxHueco > 5 || ritmo.comidas < 3.5 ? 'aviso' : 'ok'} />
              <p className="nota crece">
                {ritmo.maxHueco > 5 || ritmo.comidas < 3.5
                  ? 'Estás comiendo en ventanas largas. Para ganar músculo, el cuerpo arma proteína unas 3 a 5 horas después de cada comida con proteína: con pocas comidas grandes te quedan horas sin construir y te cuesta llegar a las calorías. Sumá una colación con proteína a media mañana o media tarde.'
                  : 'Buen ritmo: comidas repartidas y con proteína.'}
              </p>
            </div>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Qué comprar en la semana">
        <p className="nota">
          Para ganar masa con tu meta de proteína. Si ya lo compraste varias veces, uso lo que consumís de verdad.
          {plata.suba != null ? ` Tus precios vienen subiendo ${pct(plata.suba)} por mes en promedio.` : ' Cuando tengas dos tickets separados por dos semanas, te calculo cuánto sube cada cosa.'}
        </p>
        <ul className="lista">
          {canasta.map((l) => (
            <li key={l.basico.id} className="lista-item">
              <div className="crece">
                <strong>{l.basico.nombre}</strong>
                <small className="nota">{cant(l.semana)} {l.unidad} por semana{l.fuente === 'consumo' ? ' (lo que consumís)' : ''}
                  {l.suba != null ? ` · ${pct(l.suba)}/mes${l.subaPropia ? '' : ' (promedio)'}` : ''}</small>
              </div>
              <span className="mono">{l.precio ? dinero(l.precio * l.semana) : 'sin precio'}</span>
            </li>
          ))}
        </ul>
        <div className="grilla-cifras compacta">
          <Cifra etiqueta="Esta semana" valor={plata.semana ? dinero(plata.semana) : '—'} />
          <Cifra etiqueta="Próximas 4 semanas" valor={plata.mes ? dinero(plata.mes) : '—'} nota={plata.suba != null ? 'con la suba que venís viendo' : 'a precio de hoy'} />
        </div>
        {plata.sinPrecio > 0 && <p className="nota">Hay {plata.sinPrecio} cosas sin precio: el total va a ser mayor. Buscalas en la web (Carrefour, Vea, Jumbo) o cargá el ticket.</p>}
        <div className="acciones">
          {plata.sinPrecio > 0 && (
            <button className="btn" disabled={buscando} onClick={async () => {
              setBuscando(true); setMsg('Buscando precios en Carrefour, Vea y Jumbo…');
              try { const k = await buscarFaltantes(canasta); setMsg(k ? `Listo: encontré precio de ${k} cosas (precio web de referencia; el real sale del ticket).` : 'No encontré precios ahora. Probá más tarde.'); }
              catch { setMsg('No pude buscar precios (¿sin conexión?).'); }
              setBuscando(false);
            }}>{buscando ? 'Buscando…' : 'Buscar precios que faltan'}</button>
          )}
          <button className="btn btn-primario" onClick={async () => { const k = await canastaALista(canasta, items); setMsg(k ? `Sumé ${k} cosas a la lista de compras.` : 'Ya estaba todo en la lista.'); }}>Pasar a la lista de compras</button>
        </div>
        {msg && <p className="nota">{msg}</p>}
      </Tarjeta>

      <Tarjeta titulo="Preguntale al experto">
        <p className="nota">Copio un resumen con tus metas, cómo venís comiendo y la canasta. Pegalo en el chat con Claude (Zonka) y te arma el plan de la semana.</p>
        <button className="btn ancho" onClick={async () => setMsg((await copiar(informe)) ? 'Resumen copiado. Pegalo en el chat con Claude.' : 'No pude copiar solo.')}>Copiar resumen para Claude</button>
      </Tarjeta>
    </div>
  );
}
