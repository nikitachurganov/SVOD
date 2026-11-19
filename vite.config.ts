import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// ─── Two designs in one build (src/shared/config/design.ts) ────────────────────────────────────────
// The stylesheets the redesign rewrote exist twice: the new one at its usual path and the production one
// as `*.classic.css`. Every rule of the new set is limited to `html[data-design="new"]` and every rule of
// the classic set to `html[data-design="classic"]`, so the two never mix whatever order they load in.
const NEW_DESIGN_STYLES = [
  'src/brand-tokens.css',
  'src/index.css',
  'src/research-platform.css',
  'src/survey-home.css',
  'src/pages/AuthPage.css',
  'src/pages/SurveyViewPage.glass.css',
  'src/components/billing/billing.css',
  'src/components/billing/upgrade-flow.css',
  'src/components/billing/upgrade-modal.css',
  'src/components/organization/team-quota.css',
];

type CssRule = { selectors: string[]; parent?: { type: string; name?: string } | null };
type CssRoot = { source?: { input?: { file?: string } }; walkRules: (cb: (rule: CssRule) => void) => void };

const scopeSelector = (selector: string, attr: string): string => {
  const s = selector.trim();
  if (s.startsWith(':root')) return `:root${attr}${s.slice(5)}`;
  if (/^html(?![\w-])/.test(s)) return `html${attr}${s.slice(4)}`;
  return `html${attr} ${s}`;
};

const designScope = () => ({
  postcssPlugin: 'svod-design-scope',
  Once(root: CssRoot) {
    const file = (root.source?.input?.file ?? '').replace(/\\/g, '/');
    const design = /\.classic\.css$/.test(file)
      ? 'classic'
      : NEW_DESIGN_STYLES.some((path) => file.endsWith(`/${path}`))
        ? 'new'
        : null;
    if (!design) return;
    const attr = `[data-design="${design}"]`;
    root.walkRules((rule) => {
      // Frames of an animation are not selectors
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name ?? '')) return;
      rule.selectors = rule.selectors.map((selector) => scopeSelector(selector, attr));
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `--mode surveys` (or VITE_APP_MODE=surveys, e.g. a Docker build arg) builds the standalone surveys service
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const appMode = mode === 'surveys' || env.VITE_APP_MODE === 'surveys' ? 'surveys' : 'platform';

  return {
    plugins: [react(), tailwindcss()],
    css: { postcss: { plugins: [designScope()] } },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
