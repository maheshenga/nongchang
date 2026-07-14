import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { manualChunksForBuild } from './src/config/manual-chunks';
import { resolveProductionWebEnv } from './src/config/production-env';

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, __dirname, '') };
  if (mode === 'production') {
    resolveProductionWebEnv(env);
  }
  const demoDashboardEnabled = env.VITE_ENABLE_DEMO_DASHBOARD === 'true';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // @nongchang/shared resolves (via workspace symlink) to packages/shared/dist,
      // which sits outside web/node_modules, so Vite's CommonJS plugin skips it by
      // default and treats its CJS output as ESM (named value exports appear missing).
      // Explicitly include it so named exports (e.g. BatchStatus) are detected.
      commonjsOptions: {
        include: [/shared[\\/]dist/, /node_modules/],
      },
      rollupOptions: {
        output: {
          manualChunks: manualChunksForBuild(demoDashboardEnabled),
        },
      },
    },
    optimizeDeps: {
      include: ['@nongchang/shared'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  };
});
