import type { CheckoutResponse } from '../../types/billing';

/**
 * Starts a payment and sends the person to the provider's page.
 *
 * The tab is opened right in the click: a window opened after the request would be taken for a pop-up
 * and blocked. It is sent to the payment page once the address is known. Returns true if a new tab was
 * used, false if pop-ups are blocked and this page itself was sent to the payment (nothing runs after that).
 * A failed request closes the tab and throws.
 */
export const payInNewTab = async (start: () => Promise<CheckoutResponse>): Promise<boolean> => {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const { confirmation_url: url } = await start();
    if (tab) {
      tab.location.href = url;
      return true;
    }
    window.location.assign(url);
    return false;
  } catch (err) {
    tab?.close();
    throw err;
  }
};
