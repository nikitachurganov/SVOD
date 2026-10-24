/**
 * The same code base is built in two modes:
 * - `platform` (default): the whole product — requests, forms, surveys, participants, settings;
 * - `surveys`: a standalone surveys service (`npm run dev:surveys` / `npm run build:surveys`).
 * The mode is fixed at build time (see vite.config.ts), so the other modules are not reachable by route.
 */
export const IS_SURVEYS_APP = import.meta.env.VITE_APP_MODE === 'surveys';

/** Where the user lands after signing in and from the logo */
export const HOME_PATH = IS_SURVEYS_APP ? '/surveys' : '/requests';
