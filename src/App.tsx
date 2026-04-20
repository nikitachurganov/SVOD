import { useEffect, useState, type MouseEvent } from 'react';
import { useMediaQuery } from './shared/hooks/useMediaQuery';
import {
  Header,
  HeaderMenuButton,
  HeaderName,
  HeaderGlobalBar,
  SkipToContent,
  Loading,
  Button,
  SideNav,
  SideNavItems,
  SideNavLink,
} from '@carbon/react';
import { Add } from '@carbon/react/icons';
import { GlobalScrollbarStyles } from './shared/ui/GlobalScrollbarStyles';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from './shared/context/auth.context';
import { AppShellPanelsProvider } from './shared/context/appShellPanels.context';
import { useOrganization } from './shared/context/organization.context';
import { HeaderProfileMenu } from './components/layout/HeaderProfileMenu';
import { HeaderNotifications } from './components/layout/HeaderNotifications';
import { OrganizationSwitcher } from './components/layout/OrganizationSwitcher';
import { SidebarOrgActions } from './components/layout/SidebarOrgActions';
import { buildDisplayName } from './shared/utils/userName';
import { CreateFormPage } from './pages/CreateFormPage';
import { EditFormPage } from './pages/EditFormPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { OrganizationSettingsPage } from './pages/OrganizationSettingsPage';
import { FormViewPage } from './pages/FormViewPage';
import { FormsPage } from './pages/FormsPage';
import { RequestsPage } from './pages/RequestsPage';
import { CreateRequestPage } from './pages/CreateRequestPage';
import { RequestViewPage } from './pages/RequestViewPage';
import { AuthPage } from './pages/AuthPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { PublicFormFillPage } from './pages/PublicFormFillPage';
import { PublicFormLandingPage } from './pages/PublicFormLandingPage';
import { PublicRequestLegacyRedirect } from './pages/PublicRequestLegacyRedirect';
import { CreateOrganizationModal } from './components/layout/CreateOrganizationModal';

const NAV_ITEMS = [
  { key: 'requests', label: 'Заявки', path: '/requests' },
  { key: 'forms', label: 'Формы', path: '/forms' },
  { key: 'participants', label: 'Участники', path: '/participants' },
  {
    key: 'organization-settings',
    label: 'Настройки организации',
    path: '/settings/organization',
  },
];

const getSelectedMenuKey = (pathname: string): string => {
  const matched = NAV_ITEMS.find((item) => pathname.startsWith(item.path));
  return matched?.key ?? 'requests';
};

const NoOrganizationState = ({ onCreateClick }: { onCreateClick: () => void }) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 32,
    }}
  >
    <p style={{ color: 'var(--cds-text-secondary)', margin: 0 }}>
      Для начала работы необходимо создать организацию
    </p>
    <Button renderIcon={Add} onClick={onCreateClick}>
      Создать организацию
    </Button>
  </div>
);

const AppLayoutContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1056px)');
  const selectedKey = getSelectedMenuKey(location.pathname);
  const { user, profile } = useAuth();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [headerNotificationsOpen, setHeaderNotificationsOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  const { organizations, isLoading: isOrgLoading } = useOrganization();
  const hasOrganizations = organizations.length > 0;
  const showOrgSidebarBlock = hasOrganizations && !isOrgLoading;

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMobileSidebarOpen(false);
      setIsProfileOpen(false);
      setHeaderNotificationsOpen(false);
    });
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  const displayName =
    profile &&
    buildDisplayName({
      lastName: profile.lastName,
      firstName: profile.firstName,
      middleName: profile.middleName,
    });
  const resolvedName = displayName || 'Пользователь';
  const resolvedEmail = profile?.email ?? user?.email ?? 'Нет email';
  const initials = resolvedName.charAt(0).toUpperCase();

  const handleNav = (path: string) => {
    navigate(path);
    setMobileSidebarOpen(false);
  };

  const openCreateOrg = () => {
    setCreateOrgOpen(true);
    setIsProfileOpen(false);
  };

  return (
    <>
      <GlobalScrollbarStyles />

      <Header aria-label="СВОД">
        <SkipToContent href="#main-content" />
        {!isDesktop && (
          <HeaderMenuButton
            aria-label="Открыть боковую навигацию"
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen((v) => !v)}
            isActive={mobileSidebarOpen}
          />
        )}
        <HeaderName
          href="/"
          prefix=""
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          СВОД
        </HeaderName>

        <HeaderGlobalBar>
          <HeaderNotifications
            open={headerNotificationsOpen}
            onOpenChange={setHeaderNotificationsOpen}
            closeProfile={() => setIsProfileOpen(false)}
          />
          <HeaderProfileMenu
            open={isProfileOpen}
            onOpenChange={setIsProfileOpen}
            closeNotifications={() => setHeaderNotificationsOpen(false)}
            initials={initials}
            resolvedName={resolvedName}
            resolvedEmail={resolvedEmail}
            onCreateOrg={openCreateOrg}
          />
        </HeaderGlobalBar>

      </Header>

      <div className="app-shell-body">
        {!isDesktop && mobileSidebarOpen && (
          <button
            type="button"
            className="app-mobile-sidebar-backdrop"
            aria-label="Закрыть боковую навигацию"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <div className="app-layout-shell">
          <aside
            className={`app-layout-left-sidebar ${!isDesktop && mobileSidebarOpen ? 'app-layout-left-sidebar--open' : ''}`}
            aria-label="Боковая навигация"
          >
            <SideNav
              isFixedNav={false}
              expanded
              isChildOfHeader={false}
              aria-label="Навигация"
              className="app-side-nav"
            >
              <SideNavItems className="app-side-nav-items">
                {NAV_ITEMS.map((item) => (
                  <SideNavLink
                    key={item.key}
                    isActive={selectedKey === item.key}
                    href={item.path}
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      e.preventDefault();
                      handleNav(item.path);
                    }}
                  >
                    {item.label}
                  </SideNavLink>
                ))}
              </SideNavItems>

              {showOrgSidebarBlock && (
                <div className="app-side-nav-org">
                  <div className="app-side-nav-org-inner">
                    <OrganizationSwitcher />
                    <SidebarOrgActions />
                  </div>
                </div>
              )}
            </SideNav>
          </aside>

          <main id="main-content" className="app-layout-main">
            {isOrgLoading ? (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <Loading withOverlay={false} />
              </div>
            ) : !hasOrganizations ? (
              <NoOrganizationState onCreateClick={openCreateOrg} />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  flexDirection: 'column',
                }}
              >
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>

      <CreateOrganizationModal
        open={createOrgOpen}
        onClose={() => setCreateOrgOpen(false)}
      />
    </>
  );
};

const AppLayout = () => (
  <AppShellPanelsProvider>
    <AppLayoutContent />
  </AppShellPanelsProvider>
);

const FullPageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
    <Loading withOverlay={false} />
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

const router = createBrowserRouter([
  { path: '/auth/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/auth/reset-password', element: <ResetPasswordPage /> },
  { path: '/auth', element: <PublicOnlyAuthPage /> },
  { path: '/form/:token', element: <PublicFormLandingPage /> },
  { path: '/form/:token/fill/:formId', element: <PublicFormFillPage /> },
  { path: '/public/request/:token', element: <PublicRequestLegacyRedirect /> },
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
      { path: 'settings/organization', element: <OrganizationSettingsPage /> },
    ],
  },
]);

const App = () => <RouterProvider router={router} />;
export default App;
