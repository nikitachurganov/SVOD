/**
 * Which design the interface is drawn in: `classic` (the one in production before the redesign) or `new`
 * (the Gemini tokens, the shadcn sidebar, the research home). Everybody sees `classic`; an administrator
 * may switch to `new` from the account menu to try it on real data.
 *
 * The choice is read once, before the first render, and written to `<html data-design>`: the stylesheets
 * of each design are scoped by that attribute (see the `designScope` plugin in vite.config.ts) and the
 * screens that differ pick their version by IS_CLASSIC. Switching stores the choice and reloads the page,
 * so no screen has to follow a change in the middle of its life.
 */

export type DesignMode = 'classic' | 'new';

const STORAGE_KEY = 'svod.design';

const readStored = (): DesignMode => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'new' ? 'new' : 'classic';
  } catch {
    return 'classic';
  }
};

export const DESIGN: DesignMode = readStored();
export const IS_CLASSIC = DESIGN === 'classic';

document.documentElement.dataset.design = DESIGN;

/** Remember the design and reload the page in it */
export const switchDesign = (mode: DesignMode): void => {
  try {
    if (mode === 'new') window.localStorage.setItem(STORAGE_KEY, 'new');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the choice cannot be kept: stay where we are
    return;
  }
  if (mode !== DESIGN) window.location.reload();
};
