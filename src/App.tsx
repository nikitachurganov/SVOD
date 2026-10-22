import { useEffect, useState } from 'react';

import { useMediaQuery } from './shared/hooks/useMediaQuery';

import { Spin } from 'antd';

import { GlobalScrollbarStyles } from './shared/ui/GlobalScrollbarStyles';

import {

  Navigate,

  Outlet,

  RouterProvider,

  createBrowserRouter,

  useLocation,

  useNavigate,

} from 'react-router-dom';

import { useAuth } from './shared/hooks/auth.hooks';

import { AppShellPanelsProvider } from './shared/context/appShellPanels.context';

import { NotificationsProvider } from './shared/context/notifications.context';

import { useOrganization } from './shared/hooks/organization.hooks';

import { AppSidebar } from './components/layout/AppSidebar';
import { NAV_ITEMS } from './components/layout/navItems';

import { AppContentHeader } from './components/layout/AppContentHeader';

import { getBreadcrumbsForPath } from './components/layout/appBreadcrumbs';

import { BreadcrumbProvider, useBreadcrumbEntity } from './shared/context/breadcrumb.context';

import { buildDisplayName } from './shared/utils/userName';

import { CreateFormPage } from './pages/CreateFormPage';

import { EditFormPage } from './pages/EditFormPage';

import { ParticipantsPage } from './pages/ParticipantsPage';

import { OrganizationSettingsPage } from './pages/OrganizationSettingsPage';

import { FormViewPage } from './pages/FormViewPage';

import { FormsPage } from './pages/FormsPage';
import { SurveysPage } from './pages/SurveysPage';
import { CreateSurveyPage } from './pages/CreateSurveyPage';
import { EditSurveyPage } from './pages/EditSurveyPage';
import { SurveyViewPage } from './pages/SurveyViewPage';
import { PublicSurveyPage } from './pages/PublicSurveyPage';

import { RequestsPage } from './pages/RequestsPage';

import { CreateRequestPage } from './pages/CreateRequestPage';

import { RequestViewPage } from './pages/RequestViewPage';

import { AuthPage } from './pages/AuthPage';
import { ActivateAccountPage } from './pages/ActivateAccountPage';
import { JoinOrganizationPage } from './pages/JoinOrganizationPage';

import { PublicFormFillPage } from './pages/PublicFormFillPage';

import { PublicFormLandingPage } from './pages/PublicFormLandingPage';

import { PublicFormFlowProvider } from './shared/context/publicFormFlow.provider';

import { PublicRequestLegacyRedirect } from './pages/PublicRequestLegacyRedirect';

import { FormilyBuilderPage } from './dev/formily/FormilyBuilderPage';

import { CreateOrganizationModal } from './components/layout/CreateOrganizationModal';
import { NoOrganizationState } from './components/layout/NoOrganizationState';



const SIDEBAR_COLLAPSED_STORAGE_KEY = 'app.sidebar.collapsed';



const getSelectedMenuKey = (pathname: string): string => {

  const matched = NAV_ITEMS.find((item) => pathname.startsWith(item.path));

  return matched?.key ?? 'requests';

};



const AppLayoutContent = () => {

  const location = useLocation();

  const navigate = useNavigate();

  const isDesktop = useMediaQuery('(min-width: 1056px)');

  const { entityTitle } = useBreadcrumbEntity();

  const selectedKey = getSelectedMenuKey(location.pathname);

  const { user, profile } = useAuth();



  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {

    if (typeof window === 'undefined') return false;

    try {

      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';

    } catch {

      return false;

    }

  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [headerNotificationsOpen, setHeaderNotificationsOpen] = useState(false);

  const [createOrgOpen, setCreateOrgOpen] = useState(false);



  const { organizations, isLoading: isOrgLoading } = useOrganization();

  const hasOrganizations = organizations.length > 0;

  const showOrgSidebarBlock = hasOrganizations && !isOrgLoading;



  useEffect(() => {

    if (!isDesktop) return;

    try {

      localStorage.setItem(

        SIDEBAR_COLLAPSED_STORAGE_KEY,

        isSidebarCollapsed ? '1' : '0',

      );

    } catch {

      // ignore localStorage errors

    }

  }, [isDesktop, isSidebarCollapsed]);



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



  const toggleSidebar = () => {

    if (isDesktop) {

      setIsSidebarCollapsed((prev) => !prev);

    } else {

      setMobileSidebarOpen((v) => !v);

    }

  };



  const shellClass = [

    'app-shell-grid',

    isDesktop && isSidebarCollapsed ? 'app-shell-grid--collapsed' : '',

  ]

    .filter(Boolean)

    .join(' ');



  return (

    <>

      <GlobalScrollbarStyles />



      <div className={shellClass}>

        <AppSidebar

          selectedKey={selectedKey}

          isCollapsed={isSidebarCollapsed}

          isDesktop={isDesktop}

          isMobileOpen={mobileSidebarOpen}

          showOrgBlock={showOrgSidebarBlock}

          onNavigate={handleNav}

          onToggleCollapse={toggleSidebar}

        />



        {!isDesktop && mobileSidebarOpen && (

          <button

            type="button"

            className="app-mobile-sidebar-backdrop"

            aria-label="Закрыть боковую навигацию"

            onClick={() => setMobileSidebarOpen(false)}

          />

        )}



        <div className="app-shell-main">

          <AppContentHeader

            breadcrumbs={getBreadcrumbsForPath(location.pathname, entityTitle)}

            notificationsOpen={headerNotificationsOpen}

            onNotificationsOpenChange={setHeaderNotificationsOpen}

            profileOpen={isProfileOpen}

            onProfileOpenChange={setIsProfileOpen}

            initials={initials}

            resolvedName={resolvedName}

            resolvedEmail={resolvedEmail}

            onCreateOrg={openCreateOrg}

            showMobileMenu={!isDesktop}

            onMobileMenuClick={toggleSidebar}

          />



          <main id="main-content" className="app-shell-content">

            {isOrgLoading ? (

              <div className="app-shell-loading">

                <Spin size="large" />

              </div>

            ) : !hasOrganizations ? (

              <NoOrganizationState onCreateClick={openCreateOrg} />

            ) : (

              <Outlet />

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

  <NotificationsProvider>

    <AppShellPanelsProvider>

      <BreadcrumbProvider>

        <AppLayoutContent />

      </BreadcrumbProvider>

    </AppShellPanelsProvider>

  </NotificationsProvider>

);



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



const router = createBrowserRouter([

  { path: '/auth', element: <PublicOnlyAuthPage /> },

  // Public: account pre-created by an organization owner, link from the invitation email
  { path: '/activate/:token', element: <ActivateAccountPage /> },

  // Public: join an organization by its link (the owner moderates requests)
  { path: '/join/:token', element: <JoinOrganizationPage /> },

  {
    path: '/form/:token',
    element: <PublicFormFlowProvider />,
    children: [
      { index: true, element: <PublicFormLandingPage /> },
      { path: 'fill/:formId', element: <PublicFormFillPage /> },
    ],
  },

  { path: '/public/request/:token', element: <PublicRequestLegacyRedirect /> },

  // Public: respondent page of a survey
  { path: '/survey/:token', element: <PublicSurveyPage /> },

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

      { path: 'surveys', element: <SurveysPage /> },

      { path: 'surveys/create', element: <CreateSurveyPage /> },

      // One route for the survey page and its tabs (/form, /responses[/:responseId], /analytics)
      { path: 'surveys/:id/*', element: <SurveyViewPage /> },

      { path: 'surveys/:id/edit', element: <EditSurveyPage /> },

      { path: 'participants', element: <ParticipantsPage /> },

      { path: 'settings/organization', element: <OrganizationSettingsPage /> },

      { path: 'dev/formily-builder', element: <FormilyBuilderPage /> },

    ],

  },

]);



const App = () => <RouterProvider router={router} />;

export default App;

