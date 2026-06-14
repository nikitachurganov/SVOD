import { lazy } from 'react';

export const LazyFormilyFormRenderer = lazy(
  () => import('./FormilyFormRenderer'),
);
