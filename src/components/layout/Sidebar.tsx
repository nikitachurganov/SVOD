import { Layout, Menu, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import { SidebarBottomSection } from './SidebarBottomSection';

const { Sider } = Layout;
const { Text } = Typography;

const navigationItems = [
  { key: 'requests', label: 'Заявки', path: '/requests' },
  { key: 'forms', label: 'Формы', path: '/forms' },
  { key: 'participants', label: 'Участники', path: '/participants' },
];

export const menuItems: MenuProps['items'] = navigationItems.map((item) => ({
  key: item.key,
  label: item.label,
}));

export const getSelectedMenuKey = (pathname: string): string => {
  const matched = navigationItems.find((item) => pathname.startsWith(item.path));
  return matched?.key ?? 'requests';
};

interface SidebarProps {
  collapsed: boolean;
  collapsedWidth: number;
  selectedKey: string;
  onMenuClick: MenuProps['onClick'];
  onBreakpoint: (broken: boolean) => void;
  onCreateOrg: () => void;
}

export const Sidebar = ({
  collapsed,
  collapsedWidth,
  selectedKey,
  onMenuClick,
  onBreakpoint,
  onCreateOrg,
}: SidebarProps) => {
  const { token } = theme.useToken();

  return (
    <Sider
      width={240}
      collapsedWidth={collapsedWidth}
      theme="dark"
      collapsible
      collapsed={collapsed}
      trigger={null}
      breakpoint="lg"
      onBreakpoint={onBreakpoint}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            height: 64,
            paddingInline: 16,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <Text strong style={{ color: token.colorTextLightSolid, fontSize: 16 }}>
            Сервис Деск
          </Text>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          selectedKeys={[selectedKey]}
          onClick={onMenuClick}
          style={{ flex: 1, borderInlineEnd: 'none' }}
        />

        <SidebarBottomSection onCreateOrgClick={onCreateOrg} />
      </div>
    </Sider>
  );
};
