export const CONTACT_KIND_LABELS: Record<string, string> = {
  phone: 'Телефон',
  email: 'Почта',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  other: 'Другое',
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
