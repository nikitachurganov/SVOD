import { useState } from 'react';
import {
  Button,
  Empty,
  Grid,
  Layout,
  Spin,
  Typography,
  theme,
} from 'antd';
import { GlobalScrollbarStyles } from './shared/ui/GlobalScrollbarStyles';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from './shared/context/auth.context';
import { useOrganization } from './shared/context/organization.context';
import { CreateFormPage } from './pages/CreateFormPage';
import { EditFormPage } from './pages/EditFormPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { FormViewPage } from './pages/FormViewPage';
import { FormsPage } from './pages/FormsPage';
import { RequestsPage } from './pages/RequestsPage';
import { CreateRequestPage } from './pages/CreateRequestPage';
import { RequestViewPage } from './pages/RequestViewPage';
import { AuthPage } from './pages/AuthPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { Sidebar, getSelectedMenuKey } from './components/layout/Sidebar';
import { CreateOrganizationModal } from './components/layout/CreateOrganizationModal';

const { Content } = Layout;
const { Text } = Typography;

// ---------------------------------------------------------------------------
// No Organization Empty State
// ---------------------------------------------------------------------------

const NoOrganizationState = ({ onCreateClick }: { onCreateClick: () => void }) => {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: token.paddingLG,
        background: token.colorBgLayout,
      }}
    >
      <Empty description="Для начала работы необходимо создать организацию">
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick}>
          Создать организацию
        </Button>
      </Empty>
    </div>
  );
};

// ---------------------------------------------------------------------------
// App Layout
// ---------------------------------------------------------------------------

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const selectedKey = getSelectedMenuKey(location.pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  const { organizations, isLoading: isOrgLoading } = useOrganization();
  const hasOrganizations = organizations.length > 0;

  const isCompact = !screens.lg;

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const routes: Record<string, string> = {
      requests: '/requests',
      forms: '/forms',
      participants: '/participants',
    };
    if (routes[key]) {
      navigate(routes[key]);
      if (isCompact) setCollapsed(true);
    }
  };

  const openCreateOrg = () => setCreateOrgOpen(true);

  return (
    <>
      <GlobalScrollbarStyles />
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          collapsed={isCompact ? collapsed : false}
          collapsedWidth={isCompact ? 0 : 64}
          selectedKey={selectedKey}
          onMenuClick={handleMenuClick}
          onBreakpoint={(broken) => setCollapsed(broken)}
          onCreateOrg={openCreateOrg}
        />

        <Layout style={{ overflow: 'hidden', minHeight: 0 }}>
          {isCompact && (
            <div
              style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                paddingInline: 16,
                background: token.colorBgContainer,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                flexShrink: 0,
              }}
            >
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((v) => !v)}
                aria-label="Меню"
              />
              <Text strong style={{ marginLeft: 12 }}>Сервис Деск</Text>
            </div>
          )}
          <Content
            style={{
              display: 'flex',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              background: token.colorBgLayout,
            }}
          >
            {isOrgLoading ? (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <Spin />
              </div>
            ) : !hasOrganizations ? (
              <NoOrganizationState onCreateClick={openCreateOrg} />
            ) : (
              <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Outlet />
              </div>
            )}
          </Content>
        </Layout>
      </Layout>

      <CreateOrganizationModal
        open={createOrgOpen}
        onClose={() => setCreateOrgOpen(false)}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Auth guards
// ---------------------------------------------------------------------------

const FullPageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
    <Spin size="large" />
  </div>
);

const ProtectedLayout = () => {
  const { user, isAuthLoading } = useAuth();
  const location = useLocation();

  if (isAuthLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  return <AppLayout />;
};

const PublicOnlyAuthPage = () => {
  const { user, isAuthLoading } = useAuth();

  if (isAuthLoading) return <FullPageLoader />;
  if (user) return <Navigate to="/requests" replace />;

  return <AuthPage />;
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  { path: '/auth/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/auth/reset-password', element: <ResetPasswordPage /> },
  { path: '/auth', element: <PublicOnlyAuthPage /> },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/requests" replace /> },
      { path: 'requests', element: <RequestsPage /> },
      { path: 'requests/create', element: <CreateRequestPage /> },
      { path: 'requests/:id', element: <RequestViewPage /> },
      { path: 'forms', element: <FormsPage /> },
      { path: 'forms/create', element: <CreateFormPage /> },
      { path: 'forms/:id', element: <FormViewPage /> },
      { path: 'forms/:id/edit', element: <EditFormPage /> },
      { path: 'participants', element: <ParticipantsPage /> },
    ],
  },
]);

const App = () => <RouterProvider router={router} />;

export default App;
