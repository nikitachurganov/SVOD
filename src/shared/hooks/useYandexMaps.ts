import { useEffect, useState } from 'react';
import type { YMapsApi } from '../types/yandex-maps';

const getYmapsScriptUrl = (): string => {
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY as string | undefined;
  const params = new URLSearchParams({ lang: 'ru_RU' });
  if (apiKey?.trim()) {
    params.set('apikey', apiKey.trim());
  }
  return `https://api-maps.yandex.ru/2.1/?${params.toString()}`;
};

let ymapsLoadPromise: Promise<YMapsApi | null> | null = null;
let ymapsScriptUrl: string | null = null;

const getWindowYmaps = (): YMapsApi | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.ymaps;
};

const loadYandexMaps = (): Promise<YMapsApi | null> => {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const scriptUrl = getYmapsScriptUrl();

  const existingYmaps = getWindowYmaps();
  if (existingYmaps && typeof existingYmaps.ready === 'function' && ymapsScriptUrl === scriptUrl) {
    return new Promise((resolve) => {
      existingYmaps.ready(() => resolve(getWindowYmaps() ?? null));
    });
  }

  if (ymapsLoadPromise && ymapsScriptUrl === scriptUrl) return ymapsLoadPromise;

  ymapsScriptUrl = scriptUrl;
  ymapsLoadPromise = new Promise<YMapsApi | null>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://api-maps.yandex.ru/2.1/"]',
    );

    const handleReady = () => {
      const ymaps = getWindowYmaps();
      if (ymaps && typeof ymaps.ready === 'function') {
        ymaps.ready(() => resolve(getWindowYmaps() ?? null));
      } else {
        resolve(ymaps ?? null);
      }
    };

    if (existing) {
      existing.remove();
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.addEventListener('load', handleReady, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Yandex Maps script failed to load')),
      { once: true },
    );

    document.head.appendChild(script);
  });

  return ymapsLoadPromise;
};

export const useYandexMaps = () => {
  const [ymaps, setYmaps] = useState<YMapsApi | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isLoading = ymaps === null && error === null && typeof window !== 'undefined';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    loadYandexMaps()
      .then((api) => {
        if (!isMounted) return;
        setYmaps(api);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err : new Error('Yandex Maps load error'));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { ymaps, isLoading, error };
};
