import { useContext } from 'react';
import { TourContext, type TourContextValue } from './tour.context';

/** What a screen sees outside the tour (or before it mounts): no step, nothing to do */
const NO_TOUR: TourContextValue = {
  step: null,
  data: {},
  start: async () => undefined,
  next: () => undefined,
  exit: () => undefined,
  finish: async () => undefined,
  finishAndRemoveDemo: async () => undefined,
};

export const useTour = (): TourContextValue => useContext(TourContext) ?? NO_TOUR;
