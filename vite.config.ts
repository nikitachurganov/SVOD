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
          // Libraries every page needs live in long-cached vendor chunks. Each group has to be named
          // explicitly: a manual chunk takes in the dependencies nobody else claimed, so a lone formily
          // chunk used to swallow React and antd and was preloaded on every page.
          manualChunks(id) {
            // Vite's own helpers for dynamic imports and CommonJS: needed by the entry from the start
            if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react-vendor';
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)\//.test(id)) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/@formily/')) {
              return 'formily-runtime';
            }
            if (
              /node_modules\/(antd|@ant-design\/(icons|icons-svg|cssinjs|cssinjs-utils|colors|fast-color|react-slick)|@rc-component|rc-[^/]+|@babel\/runtime|@emotion|dayjs|classnames|throttle-debounce|compute-scroll-into-view|scroll-into-view-if-needed|stylis|json2mq|string-convert|copy-to-clipboard|toggle-selection|resize-observer-polyfill)\//.test(id)
            ) {
              return 'antd-vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
