import {
  MailOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { ComponentType, CSSProperties } from 'react';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  Icon: ComponentType<{ style?: CSSProperties }>;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'requests', label: 'Заявки', path: '/requests', Icon: MailOutlined },
  { key: 'forms', label: 'Формы', path: '/forms', Icon: FileTextOutlined },
  { key: 'participants', label: 'Участники', path: '/participants', Icon: TeamOutlined },
  {
    key: 'organization-settings',
    label: 'Настройки',
    path: '/settings/organization',
    Icon: SettingOutlined,
  },
];
