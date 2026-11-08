import { IS_SURVEYS_APP } from '../../shared/config/appMode';
import type { AssignableRole } from '../../types/organization';

export const CONTACT_KIND_LABELS: Record<string, string> = {
  phone: 'Телефон',
  email: 'Почта',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  other: 'Другое',
};

/** The free role that only looks: «Наблюдатель» in the surveys service, «Читатель» in the requests one */
const READER_LABEL = IS_SURVEYS_APP ? 'Наблюдатель' : 'Читатель';

/** Roles of a team; the old tag "member" (before the tariffs) is an editor */
export const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  editor: 'Редактор',
  member: 'Редактор',
  reader: READER_LABEL,
};

export const ROLE_HINTS: Record<string, string> = {
  admin: 'Всё, кроме оплаты: участники, роли, личные лимиты. Занимает платное место.',
  editor: 'Создаёт и правит опросы, запускает сбор, пользуется ИИ. Занимает платное место.',
  reader: 'Только смотрит опросы и результаты. Бесплатно, место не занимает (до 10 в команде).',
};

/** Roles a person can be given (the owner changes only by handing the team over) */
export const ASSIGNABLE_ROLE_OPTIONS = (['editor', 'reader', 'admin'] as const).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

/** An admin can give editor and reader; only the owner can make another admin */
export const roleOptionsFor = (canAssignAdmin: boolean) =>
  canAssignAdmin ? ASSIGNABLE_ROLE_OPTIONS : ASSIGNABLE_ROLE_OPTIONS.filter((o) => o.value !== 'admin');

/** Every role but the reader is paid for with a seat (same rule as team_roles.takes_seat on the server) */
export const takesSeat = (role: string | null | undefined): boolean => role !== 'reader';

/** «Редактор · место», «Наблюдатель · бесплатно»: the role together with what it costs */
export const roleWithSeat = (role: string): string =>
  role === 'owner'
    ? 'Владелец · место'
    : `${ROLE_LABELS[role] ?? 'Участник'} · ${takesSeat(role) ? 'место' : 'бесплатно'}`;

/**
 * The choice «платное место или наблюдатель», with the role inside the paid group. ``freeSeats`` is the
 * number of paid seats nobody holds (null: no limit, billing is off); it is shown in the group's title.
 */
export const seatOptionsFor = (canAssignAdmin: boolean, freeSeats: number | null) => [
  {
    label: freeSeats === null ? 'Платное место' : `Платное место · свободно ${freeSeats}`,
    title: 'paid',
    options: [
      { value: 'editor' as AssignableRole, label: ROLE_LABELS.editor },
      ...(canAssignAdmin ? [{ value: 'admin' as AssignableRole, label: ROLE_LABELS.admin }] : []),
    ],
  },
  {
    label: 'Бесплатно',
    title: 'free',
    options: [{ value: 'reader' as AssignableRole, label: READER_LABEL }],
  },
];

/** A part of a whole as a percent: the number for a bar and the text («37 %», «<1 %» for a little above 0) */
export const sharePercent = (part: number, whole: number): { value: number; text: string } => {
  if (whole <= 0 || part <= 0) return { value: 0, text: '0 %' };
  const exact = (part / whole) * 100;
  const value = Math.min(Math.round(exact), 100);
  return { value, text: exact < 1 ? '<1 %' : `${value} %` };
};

/** The answer of the server when a paid role does not fit: 402 limit_reached for the seats */
export const isNoFreeSeat = (err: unknown): boolean => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as
    | { code?: string; limit?: string }
    | string
    | undefined;
  return typeof detail === 'object' && detail?.code === 'limit_reached' && detail.limit !== 'readers';
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
