import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
