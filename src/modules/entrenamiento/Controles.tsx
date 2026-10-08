import { useEffect, useState } from 'react';
import { infoEjercicio, queSentir, zonasDe } from './biblioteca';
import { MapaMuscular, textoZonas } from './MapaMuscular';

/** Botones grandes − valor + para anotar con el pulgar. El número también se puede tocar y escribir. */
export function Stepper({ etiqueta, valor, onCambio, paso = 1, min = 0, sufijo, decimales = false }: {
  etiqueta: string; valor: number; onCambio: (n: number) => void; paso?: number; min?: number; sufijo?: string; decimales?: boolean;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return (
    <div className="stepper">
      <span className="stepper-etq">{etiqueta}</span>
      <div className="stepper-fila">
        <button type="button" className="stepper-btn" aria-label={`Menos ${etiqueta}`} onClick={() => onCambio(Math.max(min, redondear(valor - paso)))}>−</button>
        <input
          className="stepper-val" inputMode={decimales ? 'decimal' : 'numeric'} aria-label={etiqueta}
          value={texto ?? String(valor).replace('.', ',')}
          onFocus={(e) => { setTexto(String(valor).replace('.', ',')); e.target.select(); }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            const n = Number((texto ?? '').replace(',', '.'));
            if (isFinite(n) && (texto ?? '').trim() !== '') onCambio(Math.max(min, n));
            setTexto(null);
          }}
        />
        <button type="button" className="stepper-btn" aria-label={`Más ${etiqueta}`} onClick={() => onCambio(redondear(valor + paso))}>+</button>
      </div>
      {sufijo && <span className="stepper-suf">{sufijo}</span>}
    </div>
  );
}

/* ---------- Cómo se hace: fotos reales + imagen IA opcional ---------- */

/**
 * Fotos de Free Exercise DB (github.com/yuhonas/free-exercise-db, dominio público / Unlicense):
 * cada ejercicio tiene dos fotos, posición inicial y final. Alternándolas se ve el movimiento.
 * Se sirven gratis por el CDN de jsDelivr.
 */
const FOTOS: Record<string, string> = {
  "Press de banca con barra": 'Barbell_Bench_Press_-_Medium_Grip',
  "Press de banca con mancuernas": 'Dumbbell_Bench_Press',
  "Press inclinado con barra": 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  "Press inclinado con mancuernas": 'Incline_Dumbbell_Press',
  "Press declinado con barra": 'Decline_Barbell_Bench_Press',
  "Press de pecho en máquina": 'Machine_Bench_Press',
  "Fondos en paralelas (o press declinado)": 'Dips_-_Chest_Version',
  "Aperturas en polea o máquina": 'Butterfly',
  "Aperturas con mancuernas": 'Dumbbell_Flyes',
  "Cruce de poleas": 'Cable_Crossover',
  "Flexiones de brazos": 'Pushups',
  "Dominadas o jalón al pecho": 'Wide-Grip_Lat_Pulldown',
  "Dominadas": 'Pullups',
  "Jalón al pecho agarre abierto": 'Wide-Grip_Lat_Pulldown',
  "Jalón al pecho agarre neutro": 'V-Bar_Pulldown',
  "Remo con barra": 'Bent_Over_Barbell_Row',
  "Remo con mancuerna a una mano": 'One-Arm_Dumbbell_Row',
  "Remo sentado en polea": 'Seated_Cable_Rows',
  "Remo en máquina con apoyo de pecho": 'Lying_T-Bar_Row',
  "Remo en T": 'T-Bar_Row_with_Handle',
  "Pullover en polea": 'Straight-Arm_Pulldown',
  "Peso muerto convencional": 'Barbell_Deadlift',
  "Hiperextensiones": 'Hyperextensions_Back_Extensions',
  "Press militar con barra": 'Standing_Military_Press',
  "Press de hombros con mancuernas": 'Dumbbell_Shoulder_Press',
  "Press de hombros en máquina": 'Machine_Shoulder_Military_Press',
  "Elevaciones laterales con mancuernas": 'Side_Lateral_Raise',
  "Elevaciones laterales en polea": 'Cable_Seated_Lateral_Raise',
  "Pájaros (deltoides posterior)": 'Seated_Bent-Over_Rear_Delt_Raise',
  "Face pull en polea": 'Face_Pull',
  "Remo al mentón": 'Upright_Barbell_Row',
  "Encogimientos (trapecio)": 'Dumbbell_Shrug',
  "Curl de bíceps con barra": 'Barbell_Curl',
  "Curl con barra Z": 'Close-Grip_EZ_Bar_Curl',
  "Curl alternado con mancuernas": 'Dumbbell_Alternate_Bicep_Curl',
  "Curl martillo con mancuernas": 'Hammer_Curls',
  "Curl inclinado con mancuernas": 'Alternate_Incline_Dumbbell_Curl',
  "Curl predicador (banco Scott)": 'Preacher_Curl',
  "Curl en polea": 'Standing_Biceps_Cable_Curl',
  "Press francés con barra Z": 'EZ-Bar_Skullcrusher',
  "Extensión de tríceps en polea": 'Triceps_Pushdown',
  "Extensión de tríceps con soga": 'Triceps_Pushdown_-_Rope_Attachment',
  "Extensión por encima de la cabeza en polea": 'Cable_Rope_Overhead_Triceps_Extension',
  "Press cerrado con barra": 'Close-Grip_Barbell_Bench_Press',
  "Fondos en banco": 'Bench_Dips',
  "Patada de tríceps": 'Tricep_Dumbbell_Kickback',
  "Curl de muñeca": 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench',
  "Caminata del granjero": 'Farmers_Walk',
  "Sentadilla con barra": 'Barbell_Squat',
  "Sentadilla frontal": 'Front_Barbell_Squat',
  "Sentadilla hack": 'Hack_Squat',
  "Sentadilla goblet": 'Goblet_Squat',
  "Sentadilla búlgara": 'Split_Squat_with_Dumbbells',
  "Prensa de piernas": 'Leg_Press',
  "Estocadas caminando con mancuernas": 'Dumbbell_Lunges',
  "Extensión de cuádriceps": 'Leg_Extensions',
  "Peso muerto rumano": 'Romanian_Deadlift',
  "Peso muerto rumano con mancuernas": 'Stiff-Legged_Dumbbell_Deadlift',
  "Curl femoral en máquina": 'Lying_Leg_Curls',
  "Curl femoral sentado": 'Seated_Leg_Curl',
  "Hip thrust con barra": 'Barbell_Hip_Thrust',
  "Puente de glúteos": 'Butt_Lift_Bridge',
  "Abducción de cadera en máquina": 'Thigh_Abductor',
  "Elevación de talones (gemelos)": 'Standing_Calf_Raises',
  "Gemelos sentado": 'Seated_Calf_Raise',
  "Plancha": 'Plank',
  "Crunch en polea": 'Cable_Crunch',
  "Elevación de piernas colgado": 'Hanging_Leg_Raise',
  "Rueda abdominal": 'Ab_Roller',
  "Pallof press": 'Pallof_Press',
};

const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises';
export const fotosEjercicio = (nombre: string): [string, string] | null => {
  const id = FOTOS[infoEjercicio(nombre)?.nombre ?? nombre];
  return id ? [`${CDN}/${id}/0.jpg`, `${CDN}/${id}/1.jpg`] : null;
};

/**
 * Imagen generada con IA (Pollinations.ai: gratis, sin cuenta). Misma descripción de "modelo" y misma semilla
 * por ejercicio, para que las imágenes salgan parecidas entre sí y siempre la misma para cada ejercicio.
 * Es experimental: el modelo gratuito a veces dibuja mal la postura.
 */
export const MODELO_IMAGEN = 'fitness illustration, grey 3D mannequin athlete, side view, dark gym, violet rim light, no text';

function semilla(t: string) {
  let h = 7;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return h;
}

export function urlImagenIA(nombre: string, lado = 512): string {
  const prompt = `${nombre} (gym exercise), ${MODELO_IMAGEN}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${lado}&height=${lado}&seed=${semilla(nombre)}&nologo=true`;
}

/** Alterna las dos fotos cada segundo: un "reel" mínimo del movimiento. */
function Movimiento({ fotos, nombre }: { fotos: [string, string]; nombre: string }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  useEffect(() => {
    if (pausa) return;
    const t = setInterval(() => setI((x) => 1 - x), 1100);
    return () => clearInterval(t);
  }, [pausa]);
  return (
    <button type="button" className="ent-mov" onClick={() => setPausa((p) => !p)} aria-label={pausa ? 'Reanudar' : 'Pausar'}>
      {fotos.map((f, k) => <img key={f} src={f} alt={`${nombre}: ${k === 0 ? 'posición inicial' : 'posición final'}`} loading="lazy" style={{ opacity: i === k ? 1 : 0 }} />)}
      <span className="ent-mov-etq">{i === 0 ? 'Inicio' : 'Final'}{pausa ? ' · pausa' : ''}</span>
    </button>
  );
}

function FotosEjercicio({ nombre }: { nombre: string }) {
  const [abierta, setAbierta] = useState(false);
  const [ia, setIa] = useState(false);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const fotos = fotosEjercicio(nombre);
  if (!abierta) return <button type="button" className="btn chico" onClick={() => setAbierta(true)}>▶ Ver fotos del movimiento</button>;
  return (
    <figure className="ent-imagen">
      {fotos && !ia ? <Movimiento key={nombre} fotos={fotos} nombre={nombre} /> : (
        <>
          {estado === 'cargando' && <p className="nota">Generando imagen con IA… (puede tardar)</p>}
          {estado === 'error' && <p className="nota">El generador gratuito no respondió. Probá más tarde.</p>}
          <img key={nombre} src={urlImagenIA(nombre)} alt={`Imagen IA: ${nombre}`} onLoad={() => setEstado('ok')} onError={() => setEstado('error')} style={{ display: estado === 'ok' ? 'block' : 'none' }} />
        </>
      )}
      <figcaption className="nota">
        {fotos && !ia ? 'Fotos de Free Exercise DB (dominio público). Tocá para pausar.' : 'Imagen generada por IA (experimental): puede dibujar mal la postura.'}{' '}
        {fotos && <button type="button" className="btn-link" onClick={() => { setIa(!ia); setEstado('cargando'); }}>{ia ? 'Ver fotos' : 'Probar imagen IA'}</button>}{' · '}
        <button type="button" className="btn-link" onClick={() => setAbierta(false)}>Ocultar</button>
      </figcaption>
    </figure>
  );
}

/** Qué músculo trabaja: figura con mapa de calor, qué sentir y, si querés, las fotos del movimiento. */
export function ImagenEjercicio({ nombre }: { nombre: string }) {
  const zonas = zonasDe(nombre);
  const hay = Object.keys(zonas).length > 0;
  return (
    <div className="pila" style={{ gap: 8 }}>
      <div className="ent-guia">
        {hay ? <MapaMuscular valores={zonas} chico /> : null}
        <div className="pila" style={{ gap: 4 }}>
          {hay ? <p className="nota">{textoZonas(zonas)}</p> : <p className="nota">Este ejercicio no tiene mapa: cargalo en Rutina → Mis ejercicios.</p>}
          {queSentir(nombre) && <p>🎯 {queSentir(nombre)}</p>}
        </div>
      </div>
      <FotosEjercicio nombre={nombre} />
    </div>
  );
}
