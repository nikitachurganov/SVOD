import { FormOutlined, SettingOutlined, TeamOutlined } from '../../shared/ui/materialIcons';
import type { ComponentType, CSSProperties } from 'react';

export interface SurveysNavItem {
  key: string;
  label: string;
  path: string;
  Icon: ComponentType<{ style?: CSSProperties }>;
}

export const SURVEYS_NAV_ITEMS: SurveysNavItem[] = [
  { key: 'surveys', label: 'Опросы', path: '/surveys', Icon: FormOutlined },
  { key: 'participants', label: 'Участники', path: '/participants', Icon: TeamOutlined },
  { key: 'settings', label: 'Настройки', path: '/settings', Icon: SettingOutlined },
];

/** Which section the address belongs to; null for pages outside the menu (the profile, the admin area) */
export const getSurveysNavKey = (pathname: string): string | null => {
  const matched = SURVEYS_NAV_ITEMS.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  return matched?.key ?? null;
};
