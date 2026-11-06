export const CONTACT_KIND_LABELS: Record<string, string> = {
  phone: 'Телефон',
  email: 'Почта',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  other: 'Другое',
};

/** Roles of a team; the old tag "member" (before the tariffs) is an editor */
export const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  editor: 'Редактор',
  member: 'Редактор',
  reader: 'Читатель',
};

export const ROLE_HINTS: Record<string, string> = {
  admin: 'Всё, кроме оплаты: участники, роли, личные лимиты. Занимает место.',
  editor: 'Создаёт и правит опросы, запускает сбор, пользуется ИИ. Занимает место.',
  reader: 'Только смотрит опросы и результаты. Бесплатно, место не занимает (до 10 в команде).',
};

/** Roles a person can be given (the owner changes only by handing the team over) */
export const ASSIGNABLE_ROLE_OPTIONS = (['editor', 'reader', 'admin'] as const).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
