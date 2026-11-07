import { IS_SURVEYS_APP } from '../config/appMode';

/**
 * The server builds invitation links on the address of the main web app (APP_PUBLIC_URL). The surveys service
 * lives on its own address and serves the same /join and /activate pages, so what the owner copies there
 * must point to the page they are looking at.
 */
export const localizeAppLink = (url: string | null | undefined): string => {
  if (!url) return '';
  if (!IS_SURVEYS_APP) return url;
  try {
    const parsed = new URL(url);
    return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
};
