import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Versión que se ve en Panel → LIFE y viaja con cada informe: fecha del build + commit corto. */
declare const process: { env: Record<string, string | undefined> };
function version(): string {
  // Netlify pasa el commit que está publicando; en la compu queda "local".
  const commit = (process.env.COMMIT_REF ?? '').slice(0, 7) || 'local';
  return `${new Date().toISOString().slice(0, 10)} · ${commit}`;
}

// `npm run build`        -> carpeta dist/ para publicar (Netlify, Vercel)
// `npm run build:single` -> un solo index.html que se abre con doble clic
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __LIFE_VERSION__: JSON.stringify(version()) },
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
