import { nombreZona, ZONAS, type Zona } from './biblioteca';

/*
 * Figura musculosa de frente y de espalda: silueta negra sobre fondo blanco y, encima,
 * cada músculo pintado con un mapa de calor (amarillo = ayuda, rojo = trabaja fuerte).
 * Se dibuja la mitad derecha y se espeja, así las dos mitades quedan iguales.
 */

type P = Array<[number, number]>;
const pts = (p: P) => p.map(([x, y]) => `${x},${y}`).join(' ');
const espejo = (p: P): P => p.map(([x, y]) => [200 - x, y]);

const MITAD_CUERPO: P = [
  [100, 50], [109, 50], [111, 59], [124, 63], [138, 67], [148, 75], [153, 90], [156, 110], [158, 132], [160, 150],
  [164, 170], [166, 192], [168, 206], [171, 218], [166, 230], [158, 228], [156, 214], [153, 196], [148, 174], [144, 154],
  [140, 134], [136, 114], [134, 106], [132, 122], [128, 146], [126, 162], [130, 180], [134, 200], [136, 226], [134, 256],
  [130, 282], [132, 300], [134, 326], [130, 352], [124, 380], [122, 398], [128, 410], [124, 416], [106, 416], [106, 400],
  [106, 370], [104, 340], [106, 310], [106, 292], [104, 262], [103, 232], [100, 214],
];
const CUERPO = `M${pts(MITAD_CUERPO)} L${pts(espejo(MITAD_CUERPO).reverse())} Z`;

const ANTEBRAZO: P = [[146, 154], [158, 152], [164, 174], [166, 194], [158, 200], [150, 180]];

const FRENTE: Array<[Zona, P]> = [
  ['trapecio', [[109, 56], [124, 64], [136, 69], [122, 68], [111, 63]]],
  ['pecho', [[102, 70], [122, 67], [136, 74], [138, 88], [132, 100], [116, 104], [102, 100]]],
  ['deltoide_ant', [[136, 72], [144, 76], [146, 92], [140, 100], [136, 90]]],
  ['deltoide_lat', [[142, 72], [150, 80], [154, 96], [148, 102], [146, 88]]],
  ['biceps', [[138, 104], [148, 104], [154, 120], [154, 140], [146, 148], [140, 132]]],
  ['antebrazo', ANTEBRAZO],
  ['oblicuos', [[116, 106], [130, 112], [128, 146], [126, 166], [118, 162], [117, 130]]],
  ['cuadriceps', [[106, 214], [126, 196], [134, 224], [132, 258], [124, 288], [112, 290], [107, 262]]],
  ['aductores', [[101, 214], [105, 216], [107, 246], [104, 258], [101, 240]]],
  ['gemelos', [[122, 300], [132, 312], [130, 346], [122, 356], [118, 330]]],
];
/** Los abdominales van como bloques (el "six pack"). */
const ABS: Array<[number, number]> = [[106, 16], [125, 15], [143, 15], [161, 21]];

const ESPALDA: Array<[Zona, P]> = [
  ['trapecio', [[101, 54], [110, 56], [124, 64], [138, 70], [120, 80], [108, 106], [101, 120]]],
  ['deltoide_post', [[136, 70], [148, 78], [154, 94], [146, 100], [138, 86]]],
  ['dorsales', [[108, 108], [122, 82], [134, 90], [134, 108], [130, 138], [116, 152], [104, 140]]],
  ['triceps', [[140, 100], [152, 102], [156, 124], [154, 144], [146, 148], [140, 128]]],
  ['antebrazo', ANTEBRAZO],
  ['lumbar', [[101, 124], [108, 118], [114, 148], [118, 172], [101, 178]]],
  ['gluteos', [[101, 184], [122, 178], [134, 198], [132, 220], [114, 226], [101, 220]]],
  ['isquios', [[104, 228], [130, 224], [134, 254], [126, 288], [112, 290], [106, 262]]],
  ['aductores', [[101, 230], [103, 230], [105, 262], [101, 266]]],
  ['gemelos', [[108, 296], [126, 296], [134, 320], [128, 350], [116, 356], [108, 330]]],
];

/** Amarillo (ayuda) → naranja → rojo (principal). */
export function colorCalor(v: number) {
  const t = Math.max(0, Math.min(1, v));
  return `hsl(${Math.round(52 - 52 * t)} 95% ${Math.round(58 - 8 * t)}%)`;
}

type Valores = Partial<Record<Zona, number>>;

function Figura({ titulo, zonas, abs, valores, onZona }: {
  titulo: string; zonas: Array<[Zona, P]>; abs?: boolean; valores: Valores; onZona?: (z: Zona) => void;
}) {
  const relleno = (z: Zona) => {
    const v = valores[z] ?? 0;
    return v > 0 ? colorCalor(v) : '#262626';
  };
  const prop = (z: Zona) => ({
    fill: relleno(z),
    stroke: (valores[z] ?? 0) > 0 ? '#0b0b0b' : '#3a3a3a',
    strokeWidth: 0.8,
    onClick: onZona ? () => onZona(z) : undefined,
    style: onZona ? { cursor: 'pointer' } : undefined,
    filter: (valores[z] ?? 0) >= 0.8 ? 'url(#mm-brillo)' : undefined,
  });
  const lado = (espejado: boolean) => (
    <g transform={espejado ? 'translate(200,0) scale(-1,1)' : undefined}>
      {zonas.map(([z, p]) => <polygon key={z} points={pts(p)} {...prop(z)}><title>{nombreZona(z)}</title></polygon>)}
      {abs && ABS.map(([y, h], i) => <rect key={i} x={102} y={y} width={12} height={h} rx={3} {...prop('abdominales')}><title>Abdominales</title></rect>)}
    </g>
  );
  return (
    <svg viewBox="0 0 200 440" role="img" aria-label={titulo} className="mm-fig">
      <defs>
        <filter id="mm-brillo" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <ellipse cx="100" cy="29" rx="16" ry="20" fill="#0b0b0b" />
      <path d={CUERPO} fill="#0b0b0b" />
      {lado(false)}
      {lado(true)}
      <text x="100" y="436" textAnchor="middle" fontSize="13" fill="#555" fontWeight="600">{titulo}</text>
    </svg>
  );
}

/** Mapa de calor de frente y espalda. Con `onZona`, cada músculo se puede tocar (para cargar ejercicios). */
export function MapaMuscular({ valores, onZona, chico = false, leyenda = true }: {
  valores: Valores; onZona?: (z: Zona) => void; chico?: boolean; leyenda?: boolean;
}) {
  return (
    <div className={`mm ${chico ? 'mm-chico' : ''}`}>
      <div className="mm-figuras">
        <Figura titulo="Frente" zonas={FRENTE} abs valores={valores} onZona={onZona} />
        <Figura titulo="Espalda" zonas={ESPALDA} valores={valores} onZona={onZona} />
      </div>
      {leyenda && (
        <div className="mm-leyenda" aria-hidden="true">
          <span>Ayuda</span><i style={{ background: `linear-gradient(90deg, ${colorCalor(0.2)}, ${colorCalor(0.6)}, ${colorCalor(1)})` }} /><span>Principal</span>
        </div>
      )}
    </div>
  );
}

/** Lista en texto de lo que pinta el mapa (para no depender solo del color). */
export function textoZonas(valores: Valores): string {
  const orden = ZONAS.filter((z) => (valores[z.id] ?? 0) > 0).sort((a, b) => (valores[b.id] ?? 0) - (valores[a.id] ?? 0));
  const fuertes = orden.filter((z) => (valores[z.id] ?? 0) >= 0.8).map((z) => z.nombre);
  const resto = orden.filter((z) => (valores[z.id] ?? 0) < 0.8).map((z) => z.nombre);
  return [fuertes.length ? `Principal: ${fuertes.join(', ')}` : '', resto.length ? `Ayudan: ${resto.join(', ')}` : ''].filter(Boolean).join(' · ');
}
