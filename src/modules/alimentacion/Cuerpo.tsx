import { useState } from 'react';
import { eliminar } from '../../core/db';
import { fechaCorta, hoy } from '../../core/format';
import { Campo, Cifra, Estado, Icono, Tarjeta } from '../../ui/ui';
import { guardarMetas, useComidas, useMetas } from './modelo';
import {
  ACTIVIDAD, type Actividad, gastoReal, guardarMedicion, PESO_BASE, type Perfil, perfilDe, sugerirMetas, tendencia, TCU,
  ultimoPeso, useCuerpo, veredicto,
} from './nutricion';

const n = (t: string) => Number(t.replace(',', '.')) || 0;
const signo = (x: number, d = 1) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;

/** Qué medir para ganar masa magra, cada cuánto y para qué (lo que pide el experto). */
const QUE_MEDIR: Array<[string, string, string]> = [
  ['Peso en ayunas', '2 o 3 veces por semana', 'Al levantarte, después del baño, antes de comer. Con la tendencia sale tu metabolismo real.'],
  ['Cintura (al ombligo)', '1 vez por semana', 'Si sube más de 1 cm por mes mientras subís de peso, estás sumando grasa en la panza.'],
  ['Brazo (contraído)', 'Cada 2 semanas', 'Si crece mientras la cintura queda igual, es músculo.'],
  ['Todas las comidas con hora', 'Todos los días', 'Así veo las horas sin comer y la proteína de cada comida.'],
  ['Proteína del día', 'Todos los días', `Meta: unos 2 g por kilo, repartida en 4 comidas de 30 g o más.`],
  ['Fuerza en el gimnasio', 'Cada entreno (ya lo mide Entreno)', 'Si los pesos suben y el peso corporal también, vas bien.'],
  ['Sueño y energía', 'Antes de entrenar (chequeo de Entreno)', 'Dormir poco frena la ganancia de músculo tanto como comer poco.'],
];

export function PantallaCuerpo() {
  const { filas: cuerpo, error } = useCuerpo();
  const { filas: comidas } = useComidas();
  const { filas: metas } = useMetas();
  const perfil = perfilDe(metas);
  const peso = ultimoPeso(cuerpo) ?? PESO_BASE;
  const t = tendencia(cuerpo);
  const real = gastoReal(comidas, cuerpo);
  const sug = sugerirMetas(perfil, peso, real.gasto);
  const v = veredicto(t, perfil.kg_mes);
  const [m, setM] = useState({ peso: '', cintura: '', brazo: '' });
  const [p, setP] = useState({ altura: String(perfil.altura_cm), edad: perfil.edad ? String(perfil.edad) : '', formula: perfil.formula ?? '', actividad: perfil.actividad, kg: String(perfil.kg_mes) });
  const [msg, setMsg] = useState('');
  const [msgPerfil, setMsgPerfil] = useState('');
  const historial = [...cuerpo].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 12);
  const ultimaCintura = historial.find((x) => x.cintura)?.cintura;

  const nuevoPerfil = (): Perfil => ({
    altura_cm: n(p.altura) || 182, edad: n(p.edad) || null, formula: (p.formula || null) as Perfil['formula'],
    actividad: p.actividad as Actividad, kg_mes: n(p.kg) || 0.75,
  });

  return (
    <div className="pila">
      <p className="nota">Lo que hay que ir midiendo para ganar masa magra, y las metas que salen de tu cuerpo.</p>
      <div className="grilla-cifras">
        <Cifra etiqueta="Peso" valor={ultimoPeso(cuerpo) ? `${peso.toFixed(1)} kg` : '—'} nota={ultimoPeso(cuerpo) ? undefined : 'Anotá el primero'} />
        <Cifra etiqueta="Cómo venís" valor={t.kgMes == null ? '—' : `${signo(t.kgMes)} kg/mes`} nota={`meta +${perfil.kg_mes} kg/mes`} />
        <Cifra etiqueta="Cintura" valor={ultimaCintura ? `${Number(ultimaCintura).toFixed(1)} cm` : '—'} nota={t.cmMes == null ? 'al ombligo' : `${signo(t.cmMes)} cm/mes`} tono={t.cmMes != null && t.cmMes > 1 ? 'mal' : undefined} />
        <Cifra etiqueta="Gastás por día" valor={`${sug.gasto} kcal`} nota={real.gasto ? 'medido con tus datos' : 'estimado por fórmula'} />
      </div>

      <Tarjeta titulo="Cómo vas">
        <div className="barra-acciones"><Estado nivel={v.nivel} /><p className="nota crece">{v.texto}</p></div>
      </Tarjeta>

      <Tarjeta titulo="Anotar medición">
        <form className="form" onSubmit={async (e) => {
          e.preventDefault();
          if (!n(m.peso) && !n(m.cintura) && !n(m.brazo)) return;
          try {
            await guardarMedicion({ fecha: hoy(), peso: n(m.peso) || null, cintura: n(m.cintura) || null, brazo: n(m.brazo) || null, nota: null });
            setM({ peso: '', cintura: '', brazo: '' });
            setMsg('');
          } catch {
            setMsg('Todavía no está activada la tabla de mediciones en la nube. Avisale a Claude.');
          }
        }}>
          <div className="fila-campos tres">
            <Campo etiqueta="Peso en ayunas (kg)"><input inputMode="decimal" value={m.peso} onChange={(e) => setM({ ...m, peso: e.target.value })} placeholder={String(peso)} /></Campo>
            <Campo etiqueta="Cintura (cm)"><input inputMode="decimal" value={m.cintura} onChange={(e) => setM({ ...m, cintura: e.target.value })} /></Campo>
            <Campo etiqueta="Brazo (cm)"><input inputMode="decimal" value={m.brazo} onChange={(e) => setM({ ...m, brazo: e.target.value })} /></Campo>
          </div>
          <button className="btn btn-primario">Guardar medición</button>
          {(msg || error) && <p className="texto-aviso nota">{msg || 'No pude leer las mediciones de la nube (falta activar la tabla).'}</p>}
        </form>
      </Tarjeta>

      <Tarjeta titulo="Tu metabolismo real">
        {real.gasto ? (
          <p className="nota">En las últimas 3 semanas comiste en promedio <strong>{real.media} kcal</strong> por día y tu peso cambió {signo((real.kgSemana ?? 0), 2)} kg por semana.
            Entonces gastás unas <strong>{real.gasto} kcal</strong> por día (la fórmula decía {Math.round(sug.basal * ACTIVIDAD[perfil.actividad].factor)}).</p>
        ) : (
          <>
            <p className="nota">Las fórmulas fallan hasta en 300 kcal en gente muy activa. La forma de saberlo de verdad: cargar todo lo que comés y pesarte. Lo que no se va en el peso, lo gastaste.</p>
            <p className="nota">Para calcularlo me faltan: {real.falta.join(' y ')}.</p>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Tus metas sugeridas">
        <div className="fila-campos tres">
          <Campo etiqueta="Altura (cm)"><input inputMode="numeric" value={p.altura} onChange={(e) => setP({ ...p, altura: e.target.value })} /></Campo>
          <Campo etiqueta="Edad"><input inputMode="numeric" value={p.edad} onChange={(e) => setP({ ...p, edad: e.target.value })} /></Campo>
          <Campo etiqueta="Fórmula">
            <select value={p.formula} onChange={(e) => setP({ ...p, formula: e.target.value })}>
              <option value="">Elegí…</option><option value="hombre">Hombre</option><option value="mujer">Mujer</option>
            </select>
          </Campo>
        </div>
        <div className="fila-campos">
          <Campo etiqueta="Actividad" ayuda={ACTIVIDAD[p.actividad as Actividad].ayuda}>
            <select value={p.actividad} onChange={(e) => setP({ ...p, actividad: e.target.value as Actividad })}>
              {Object.entries(ACTIVIDAD).map(([k, a]) => <option key={k} value={k}>{a.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Subir por mes (kg)" ayuda="Masa magra: 0,5 a 1 kg">
            <input inputMode="decimal" value={p.kg} onChange={(e) => setP({ ...p, kg: e.target.value })} />
          </Campo>
        </div>
        {(() => {
          const s = sugerirMetas(nuevoPerfil(), peso, real.gasto);
          return (
            <>
              {!s.completo && <p className="texto-aviso nota">Completá edad y fórmula para afinar la cuenta (por ahora uso 30 años).</p>}
              <ul className="lista">
                <li className="lista-item"><div className="crece"><strong>Calorías (entreno / descanso)</strong><small className="nota">Basal {s.basal} · gasto {s.gasto}</small></div><span className="mono">{s.kcal_entreno} / {s.kcal_descanso}</span></li>
                <li className="lista-item"><div className="crece"><strong>Proteína en g (entreno / descanso)</strong><small className="nota">2 g/kg entrenando · 1,8 g/kg descanso · {s.porComida} g o más por comida</small></div><span className="mono">{s.proteina_entreno} / {s.proteina_descanso}</span></li>
                <li className="lista-item"><div className="crece"><strong>Grasas mínimas (g)</strong><small className="nota">El resto, carbohidratos (arroz, fideos, papa, avena, pan)</small></div><span className="mono">{s.grasas}</span></li>
                <li className="lista-item"><div className="crece"><strong>Agua</strong><small className="nota">35 ml por kilo + lo que transpirás repartiendo</small></div><span className="mono">{(s.agua_ml / 1000).toFixed(2)} L</span></li>
              </ul>
              <button className="btn" onClick={async () => {
                await guardarMetas(metas, {
                  perfil: nuevoPerfil(), kcal_entreno: s.kcal_entreno, kcal_descanso: s.kcal_descanso,
                  proteina_entreno: s.proteina_entreno, proteina_descanso: s.proteina_descanso, agua_ml: s.agua_ml,
                });
                setMsgPerfil('Listo: tus metas de Comida quedaron con estos números.');
              }}>Usar estas metas</button>
              {msgPerfil && <p className="nota">{msgPerfil}</p>}
            </>
          );
        })()}
      </Tarjeta>

      <Tarjeta titulo="Qué medimos y cada cuánto">
        <ul className="lista">
          {QUE_MEDIR.map(([que, cada, para]) => (
            <li key={que} className="lista-item"><div className="crece"><strong>{que}</strong><small className="nota">{cada} · {para}</small></div></li>
          ))}
        </ul>
      </Tarjeta>

      {historial.length > 0 && (
        <Tarjeta titulo="Mediciones">
          <ul className="lista">
            {historial.map((x) => (
              <li key={x.id} className="lista-item">
                <div className="crece"><strong>{fechaCorta(x.fecha)}</strong>
                  <small className="nota">{[x.peso && `${Number(x.peso).toFixed(1)} kg`, x.cintura && `cintura ${x.cintura} cm`, x.brazo && `brazo ${x.brazo} cm`].filter(Boolean).join(' · ')}</small></div>
                <button className="btn-icono" aria-label="Borrar" onClick={() => eliminar(TCU, x.id)}>{Icono.borrar}</button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
