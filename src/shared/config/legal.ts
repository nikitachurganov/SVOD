/**
 * Who sells the service. The payment provider checks these on the public site before it connects
 * payments: contacts, full name and the tax number of a self-employed person.
 * Personal data is not kept in the code: it is set at build time (`VITE_LEGAL_*`, see docs/ENV.md).
 */
const fromEnv = (value: string | undefined, hint: string): string => {
  const trimmed = value?.trim();
  // An empty value stays visible on the page, so it cannot go to production unnoticed
  return trimmed || `[не заполнено: ${hint}]`;
};

export const LEGAL = {
  serviceName: 'СВОД «Опросы»',
  siteUrl: 'https://surveys.svodservice.ru',
  fullName: fromEnv(import.meta.env.VITE_LEGAL_FULL_NAME, 'VITE_LEGAL_FULL_NAME'),
  inn: fromEnv(import.meta.env.VITE_LEGAL_INN, 'VITE_LEGAL_INN'),
  taxStatus: 'Плательщик налога на профессиональный доход (самозанятый)',
  email: import.meta.env.VITE_LEGAL_EMAIL?.trim() || 'support@svodservice.ru',
  phone: fromEnv(import.meta.env.VITE_LEGAL_PHONE, 'VITE_LEGAL_PHONE'),
  address: fromEnv(import.meta.env.VITE_LEGAL_ADDRESS, 'VITE_LEGAL_ADDRESS'),
  /** Within how many working days a request is answered */
  replyDays: 3,
  /** The date of the current version of the offer */
  offerDate: '28 октября 2026 г.',
} as const;
