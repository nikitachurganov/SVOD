import { useEffect, useState } from 'react';

/**
 * Subscribes to `window.matchMedia(query)`. SSR-safe initial state.
 * Initial sync after mount is deferred so strict lint rules on synchronous setState in effects are satisfied.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    const frameId = requestAnimationFrame(() => setMatches(mql.matches));
    return () => {
      cancelAnimationFrame(frameId);
      mql.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}
