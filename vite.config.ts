import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `--mode surveys` (or VITE_APP_MODE=surveys, e.g. a Docker build arg) builds the standalone surveys service
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const appMode = mode === 'surveys' || env.VITE_APP_MODE === 'surveys' ? 'surveys' : 'platform';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_MODE': JSON.stringify(appMode),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@formily')) {
              return 'formily-runtime';
            }
            if (id.includes('node_modules/@formily/antd-v5')) {
              return 'formily-runtime';
            }
          },
        },
      },
    },
  };
});
