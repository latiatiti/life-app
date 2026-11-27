/**
 * Línea de tiempo de LIFE (Panel → LIFE). Una entrada por actualización publicada, la más nueva arriba.
 * Regla para todos los hilos: cada PR que cambia la app suma su entrada acá (fecha = día que se publica,
 * área, título corto y qué cambió en palabras simples). Como viaja con el código, lo que se ve es lo que
 * de verdad tiene la versión que está corriendo.
 */
export type Area = 'Base' | 'Diseño' | 'Plata' | 'Día' | 'Entreno' | 'Casa' | 'Tablero' | 'WhatsApp' | 'Cuentas' | 'Seguridad';

export interface Novedad {
  fecha: string; // YYYY-MM-DD
  area: Area;
  titulo: string;
  que: string[];
  pr?: number;
  /** También cambió la nube (tablas o funciones). */
  nube?: boolean;
}

export const NOVEDADES: Novedad[] = [
  {
    fecha: '2026-11-27', area: 'Tablero', titulo: 'Burbuja flotante de pendientes',
    que: [
      'Una viñetita con tus pendientes flota en todas las pantallas. La agarrás y la llevás a donde quieras: queda pegada al costado y se acuerda dónde la dejaste.',
      'En la compu, al pasar el cursor se agranda y muestra lo primero que tenés. Con un clic (o un toque en el celu) se despliega el Tablero completo encima de lo que estás viendo.',
    ],
  },
  {
    fecha: '2026-11-26', area: 'Día', titulo: 'Chequeo de la mañana y de la noche', nube: true,
    que: [
      'Arriba del Inicio, dos tarjetas: ☀ Arranque y ☾ Cierre. Siempre se ve si lo hiciste (✓ con la hora) o si falta.',
      'Arranque (5 pasos, ~40 s): cuánto dormiste, con cuánta pila arrancás, cómo está el cuerpo (tocás la figura: cargado o duele, síntomas y peso), si el plan de hoy se mantiene y tus 3 prioridades.',
      'Cierre (6 pasos, ~1 min): agua por vasos, comida, qué hiciste (tilda en el Día y el Tablero), gastos sin cargar, cómo fue el día y algo para mañana.',
      'Cada dato va a su lugar de siempre (agua a Comida, gastos a Plata, prioridades al Día, lo de mañana al Tablero). El gym ya viene con el sueño, la energía y el dolor de la mañana.',
      'Cada chequeo suma 30 XP. Si te interrumpen, se minimiza y lo retomás con "Volver".',
    ],
  },
  {
    fecha: '2026-11-26', area: 'Diseño', titulo: 'Inicio para llevar el día', pr: 41,
    que: [
      'Arriba del Inicio, "Para hacer hoy": las prioridades del día, los pendientes de hoy o atrasados, lo que está en marcha o es de prioridad alta y los vencimientos, todo en una lista para ir tildando.',
      'Una barra muestra cuánto llevás hecho del día; lo que tildás acá queda tildado en el Día y en el Tablero.',
      'Al costado (abajo en el celu): botón directo al sistema de la sodería, Pendientes y WhatsApp, y los mensajes sin leer.',
      'Los accesos se eligen en Ajustes → Accesos del Inicio.',
    ],
  },
  {
    fecha: '2026-11-24', area: 'Tablero', titulo: 'Pendientes a mano desde cualquier pantalla', pr: 40,
    que: [
      'En la compu, pasá el cursor por la pestaña ancha "Pendientes" de arriba y baja al toque, casi hasta abajo; al sacar el cursor por debajo se guarda sola.',
      'En el celu, arrastrá desde arriba (como las notificaciones) o tocá la pestañita "Pendientes" de arriba.',
      'Arriba de todo, "Hoy": cómo va tu día, comida, agua, entreno y plata, cada uno con su barra.',
      'Adentro: lo que estás haciendo ahora con su paso, tus pendientes por etapa con ◀ ▶ para moverlos, y anotar al toque.',
      'No cambia la pantalla en la que estás: cerrás la cortina y seguís donde estabas.',
    ],
  },
  {
    fecha: '2026-11-19', area: 'Cuentas', titulo: 'Panel de la superadmin, botón Informar y esta línea de tiempo', nube: true,
    que: [
      'Sección Panel (solo superadmin): cómo viene cada cuenta, quién espera tu OK, roles, módulos y qué puede cada rol.',
      'Botón "! Informar" arriba para todas las cuentas: problema, idea, necesidad u otra cosa en un formulario corto.',
      'Bandeja de informes con estados, respuesta y "Pasar al Tablero". Cada cuenta ve la respuesta en Ajustes → Mis informes.',
      'La app avisa sola cuando una pantalla se rompe (error automático) y muestra "Esta pantalla tropezó" en vez de quedar en blanco.',
      'Panel → LIFE: esta línea de tiempo y cómo viene la base.',
    ],
  },
  {
    fecha: '2026-11-18', area: 'Cuentas', titulo: 'Portada y pedir cuenta', pr: 34, nube: true,
    que: ['Sin sesión se ve qué es LIFE con Iniciar sesión / Registrarme.', 'Las cuentas nuevas quedan en espera hasta tu OK, con mail de aviso.', 'Aprobar o rechazar desde Ajustes.'],
  },
  {
    fecha: '2026-11-12', area: 'WhatsApp', titulo: 'WhatsApp web de LIFE', pr: 31, nube: true,
    que: ['Tu número conectado por QR a un puente en tu PC.', 'Chats en la app y Claude puede leer y mandar con tu OK.'],
  },
  {
    fecha: '2026-11-08', area: 'Tablero', titulo: 'Seguimiento y recordatorios', pr: 29, nube: true,
    que: ['Cada tarjeta guarda lo que fue pasando y su paso actual.', 'Recordatorio por WhatsApp a tu número y contacto con mensaje listo.'],
  },
  {
    fecha: '2026-11-08', area: 'Tablero', titulo: 'Tablero de pendientes e ideas', pr: 28, nube: true,
    que: ['Kanban con etapas propias, prioridad y categorías.', 'Arrastrar en la compu y deslizar en el celu.'],
  },
  {
    fecha: '2026-11-06', area: 'Casa', titulo: 'Ticket: repartir distinto un producto', pr: 26,
    que: ['Un renglón del ticket se puede partir entre Yo y Ulises (ej. 6 latas y 2).'],
  },
  {
    fecha: '2026-11-04', area: 'Entreno', titulo: 'Variante de pierna sin prensa', pr: 23,
    que: ['Días con variantes (B y B2) sin sumar días a la semana.'],
  },
  {
    fecha: '2026-10-30', area: 'Entreno', titulo: 'Entrenar en una sola vista', pr: 14,
    que: ['Llegar → Serie ↔ Descanso → Cierre, todo sin scroll.', 'Escala de rendimiento de rojo a morado épico y animaciones para toda la app.'],
  },
  {
    fecha: '2026-10-30', area: 'Seguridad', titulo: 'Seguridad con Gonzalito', pr: 17, nube: true,
    que: ['Encabezados de seguridad, service worker más seguro y reglas para todos.', 'Sin perfil no se escribe en la nube.'],
  },
  {
    fecha: '2026-10-27', area: 'Diseño', titulo: 'Modo juego y pilares de diseño', pr: 8,
    que: ['Estilo "Signos vitales · modo juego", Inicio con 8 tarjetas.', 'Secciones Plata y Casa, botón + y DESHACER después de guardar.'],
  },
  {
    fecha: '2026-10-27', area: 'Entreno', titulo: 'Mi rutina de 3 días', pr: 10,
    que: ['Rutina propia A/B/C y ejercicios nuevos; el Inicio sugiere el día que toca.'],
  },
  {
    fecha: '2026-10-16', area: 'Diseño', titulo: 'Rediseño y modo actividad', pr: 7,
    que: ['Tema central, barra flotante en el celu e Inicio con días tocables.', 'Actividades a pantalla completa con barra para volver y avisos flotantes.'],
  },
  {
    fecha: '2026-10-15', area: 'Cuentas', titulo: 'Cuentas con roles y conexión con Claude', pr: 6, nube: true,
    que: ['Nube integrada, login por usuario y roles (superadmin, usuario, solo lectura).', 'Conector para que Claude lea y cargue con tu clave.'],
  },
  {
    fecha: '2026-10-15', area: 'Día', titulo: 'Día: línea del día y semana tipo', pr: 5, nube: true,
    que: ['Línea del día deslizable, tareas, prioridades y calendario con feriados.'],
  },
  {
    fecha: '2026-10-15', area: 'Plata', titulo: 'Ingresos y proyección', pr: 4, nube: true,
    que: ['Cobros con deuda (la fábrica que paga atrasado).', 'Plata día por día a 30/60/90 días.'],
  },
  {
    fecha: '2026-10-10', area: 'Casa', titulo: 'Compras con escáner y ticket', nube: true,
    que: ['Escanear códigos, modo compra, QR del ticket, foto con OCR y reparto con Ulises.'],
  },
  {
    fecha: '2026-10-08', area: 'Entreno', titulo: 'Mapa muscular y ejercicios propios', pr: 1, nube: true,
    que: ['Figura con calor por músculo, ejercicios propios y variantes.'],
  },
  {
    fecha: '2026-10-07', area: 'Base', titulo: 'Nace LIFE', nube: true,
    que: ['Economía, pagos, entreno, stock, compras y comida conectados entre sí.'],
  },
];
