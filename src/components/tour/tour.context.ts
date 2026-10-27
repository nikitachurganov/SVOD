import { createContext } from 'react';
import type { TourData, TourStepId } from './tourSteps';

export interface TourContextValue {
  /** The step being shown; null while there is no tour going on */
  step: TourStepId | null;
  data: TourData;
  /** Starts the tour from the first step and leads the person to the projects */
  start: () => Promise<void>;
  /** Moves on to the next step (the last one finishes the tour) */
  next: () => void;
  /** Leaves the tour; it can be started again from the menu */
  exit: () => void;
  finish: () => Promise<void>;
  /** The last step: finishes the tour and removes the test responses made for it */
  finishAndRemoveDemo: () => Promise<void>;
}

export const TourContext = createContext<TourContextValue | null>(null);
