declare const __LIFE_VERSION__: string;

/** Versión de LIFE que está corriendo: "2026-11-19 · abc1234" (fecha del build + commit publicado). */
export const VERSION: string = typeof __LIFE_VERSION__ === 'string' ? __LIFE_VERSION__ : 'local';
