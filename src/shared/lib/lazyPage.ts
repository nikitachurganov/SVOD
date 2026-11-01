import { lazy, type ComponentType } from 'react';

const RELOADED_KEY = 'app.chunk-reload';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

/**
 * After a deploy the old chunk names are gone and the import fails in a tab opened earlier:
 * the page is reloaded once to pick up the new build instead of showing an error.
 */
const reloadOnceOnChunkError = <M>(load: () => Promise<M>): Promise<M> =>
  load().then(
    (module) => {
      try {
        sessionStorage.removeItem(RELOADED_KEY);
      } catch {
        // ignore storage errors
      }
      return module;
    },
    (error: unknown) => {
      let reloaded = true;
      try {
        reloaded = sessionStorage.getItem(RELOADED_KEY) === '1';
        if (!reloaded) sessionStorage.setItem(RELOADED_KEY, '1');
      } catch {
        // without storage there is no guard against a reload loop: show the error
      }
      if (reloaded) throw error;
      window.location.reload();
      return new Promise<M>(() => {});
    },
  );

/**
 * A page loaded on demand from its own chunk. `preload()` fetches the chunk ahead of time,
 * so the transition is instant when the user does open the page.
 */
export const lazyPage = <K extends string, M extends Record<K, AnyComponent>>(
  load: () => Promise<M>,
  name: K,
) => {
  const Page = lazy(() => reloadOnceOnChunkError(load).then((module) => ({ default: module[name] })));
  return Object.assign(Page, { preload: load });
};

/** Fetches the chunks of the pages the user is likely to open next, once the browser is idle */
export const preloadWhenIdle = (pages: Array<{ preload: () => Promise<unknown> }>): (() => void) => {
  const run = () => pages.forEach((page) => void page.preload().catch(() => {}));
  // Safari has no requestIdleCallback
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 2000);
  return () => clearTimeout(id);
};
