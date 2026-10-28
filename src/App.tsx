import { useEffect, useState } from 'react';

import { useMediaQuery } from './shared/hooks/useMediaQuery';

import { Spin } from 'antd';

import { GlobalScrollbarStyles } from './shared/ui/GlobalScrollbarStyles';

import {

  Navigate,

  Outlet,

  RouterProvider,

  createBrowserRouter,

  type RouteObject,

  useLocation,

  useNavigate,

} from 'react-router-dom';

import { useAuth } from './shared/hooks/auth.hooks';

import { HOME_PATH, IS_SURVEYS_APP } from './shared/config/appMode';

import { AppShellPanelsProvider } from './shared/context/appShellPanels.context';

import { NotificationsProvider } from './shared/context/notifications.context';

import { useOrganization } from './shared/hooks/organization.hooks';

import { AppSidebar } from './components/layout/AppSidebar';
import { NAV_ITEMS } from './components/layout/navItems';

import { AppContentHeader } from './components/layout/AppContentHeader';

import { getBreadcrumbsForPath, withStandaloneRoot } from './components/layout/appBreadcrumbs';

import { BreadcrumbProvider, useBreadcrumbEntity } from './shared/context/breadcrumb.context';

import { buildDisplayName } from './shared/utils/userName';

import { CreateFormPage } from './pages/CreateFormPage';

import { EditFormPage } from './pages/EditFormPage';

import { ParticipantsPage } from './pages/ParticipantsPage';

import { OrganizationSettingsPage } from './pages/OrganizationSettingsPage';

import { FormViewPage } from './pages/FormViewPage';

import { FormsPage } from './pages/FormsPage';
import { SurveysPage } from './pages/SurveysPage';
import { ProjectSurveysPage } from './pages/ProjectSurveysPage';
import { CreateSurveyPage } from './pages/CreateSurveyPage';
import { EditSurveyPage } from './pages/EditSurveyPage';
import { SurveyViewPage } from './pages/SurveyViewPage';
import { PublicSurveyPage } from './pages/PublicSurveyPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { PlansPage } from './pages/PlansPage';
import { LegalPage } from './pages/LegalPage';
import { PublicLegalLayout } from './components/legal/PublicLegalLayout';
import { PaywallModalHost } from './components/billing/PaywallModalHost';
import { SubscriptionProvider } from './shared/context/subscription.provider';
import { OnboardingGate } from './components/onboarding/OnboardingGate';
import { EmailVerificationBanner } from './components/layout/EmailVerificationBanner';
import { TourProvider } from './components/tour/TourProvider';

import { RequestsPage } from './pages/RequestsPage';

import { CreateRequestPage } from './pages/CreateRequestPage';

import { RequestViewPage } from './pages/RequestViewPage';

import { AuthPage } from './pages/AuthPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ActivateAccountPage } from './pages/ActivateAccountPage';
import { JoinOrganizationPage } from './pages/JoinOrganizationPage';

import { PublicFormFillPage } from './pages/PublicFormFillPage';

import { PublicFormLandingPage } from './pages/PublicFormLandingPage';

import { PublicFormFlowProvider } from './shared/context/publicFormFlow.provider';

import { PublicRequestLegacyRedirect } from './pages/PublicRequestLegacyRedirect';

import { FormilyBuilderPage } from './dev/formily/FormilyBuilderPage';

import { CreateOrganizationModal } from './components/layout/CreateOrganizationModal';
import { NoOrganizationState } from './components/layout/NoOrganizationState';
import { WorkspaceUnavailableState } from './components/layout/WorkspaceUnavailableState';



const SIDEBAR_COLLAPSED_STORAGE_KEY = 'app.sidebar.collapsed';



const getSelectedMenuKey = (pathname: string): string => {

  const matched = NAV_ITEMS.find((item) => pathname.startsWith(item.path));

  return matched?.key ?? NAV_ITEMS[0]?.key ?? 'requests';

};



const AppLayoutContent = () => {

  const location = useLocation();

  const navigate = useNavigate();

  const isDesktop = useMediaQuery('(min-width: 1056px)');

  const { entityTitle, entityParent } = useBreadcrumbEntity();

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



  const { organizations, isLoading: isOrgLoading, refreshOrganizations } = useOrganization();

  const hasOrganizations = organizations.length > 0;

  const showOrgSidebarBlock = hasOrganizations && !isOrgLoading;

  const isProfileRoute = location.pathname === '/profile';



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

    IS_SURVEYS_APP ? 'app-shell-grid--no-sidebar' : '',

    isDesktop && isSidebarCollapsed ? 'app-shell-grid--collapsed' : '',

  ]

    .filter(Boolean)

    .join(' ');



  return (

    <>

      <GlobalScrollbarStyles />

      <OnboardingGate />

      {IS_SURVEYS_APP && <PaywallModalHost />}



      <div className={shellClass}>

        {!IS_SURVEYS_APP && (

          <AppSidebar

            selectedKey={selectedKey}

            isCollapsed={isSidebarCollapsed}

            isDesktop={isDesktop}

            isMobileOpen={mobileSidebarOpen}

            showOrgBlock={showOrgSidebarBlock}

            onNavigate={handleNav}

            onToggleCollapse={toggleSidebar}

          />

        )}



        {!IS_SURVEYS_APP && !isDesktop && mobileSidebarOpen && (

          <button

            type="button"

            className="app-mobile-sidebar-backdrop"

            aria-label="Закрыть боковую навигацию"

            onClick={() => setMobileSidebarOpen(false)}

          />

        )}



        <div className="app-shell-main">

          <AppContentHeader

            breadcrumbs={
              IS_SURVEYS_APP
                ? withStandaloneRoot(getBreadcrumbsForPath(location.pathname, entityTitle, entityParent))
                : getBreadcrumbsForPath(location.pathname, entityTitle, entityParent)
            }

            notificationsOpen={headerNotificationsOpen}

            onNotificationsOpenChange={setHeaderNotificationsOpen}

            profileOpen={isProfileOpen}

            onProfileOpenChange={setIsProfileOpen}

            initials={initials}

            avatarUrl={profile?.avatarUrl}

            resolvedName={resolvedName}

            resolvedEmail={resolvedEmail}

            onCreateOrg={openCreateOrg}

            showNotifications={!IS_SURVEYS_APP}

            standalone={IS_SURVEYS_APP}

            showMobileMenu={!IS_SURVEYS_APP && !isDesktop}

            onMobileMenuClick={toggleSidebar}

          />



          <EmailVerificationBanner />

          <main id="main-content" className="app-shell-content">

            {isProfileRoute ? (

              // The account settings do not depend on an organization: a person without one can still change the password
              <Outlet />

            ) : isOrgLoading ? (

              <div className="app-shell-loading">

                <Spin size="large" />

              </div>

            ) : !hasOrganizations ? (

              // The surveys service has no organizations: the personal workspace is created by the server
              IS_SURVEYS_APP ? (

                <WorkspaceUnavailableState onRetry={() => void refreshOrganizations()} />

              ) : (

                <NoOrganizationState onCreateClick={openCreateOrg} />

              )

            ) : (

              <Outlet />

            )}

          </main>

        </div>

      </div>



      {!IS_SURVEYS_APP && (

        <CreateOrganizationModal

          open={createOrgOpen}

          onClose={() => setCreateOrgOpen(false)}

        />

      )}

    </>

  );

};



const AppLayout = () => (

  <NotificationsProvider>

    <AppShellPanelsProvider>

      <BreadcrumbProvider>

        <TourProvider>

          <SubscriptionProvider>

            <AppLayoutContent />

          </SubscriptionProvider>

        </TourProvider>

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

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <AppLayout />;

};



// Administrator pages: anybody else is sent home. The server checks the role again on every request,
// so this only spares a normal user a page that would answer 403.
const AdminRoute = () => {
  const { profile, isAuthLoading } = useAuth();

  if (isAuthLoading || !profile) return <FullPageLoader />;

  if (profile.role !== 'admin') return <Navigate to={HOME_PATH} replace />;

  return <AdminPage />;

};



const PublicOnlyAuthPage = () => {

  const { user, isAuthLoading } = useAuth();

  const location = useLocation();

  if (isAuthLoading) return <FullPageLoader />;

  // Right after signing in `user` appears before AuthPage navigates: go to the page the guest opened, not home
  const from = (location.state as { from?: unknown } | null)?.from;
  const target = typeof from === 'string' && /^\/(?!\/)/.test(from) ? from : HOME_PATH;
  if (user) return <Navigate to={target} replace />;

  return <AuthPage />;

};



// Respondent-facing routes: no authentication, no author's shell
const publicSurveyRoutes: RouteObject[] = [

  // Public: respondent page of a survey
  { path: '/survey/:token', element: <PublicSurveyPage /> },

  // Author's preview of a survey: the same respondent form, nothing is saved
  { path: '/surveys/:id/preview', element: <PublicSurveyPage preview /> },

];

// Author's surveys section (children of the protected layout)
const surveyRoutes: RouteObject[] = [

  { path: 'surveys', element: <SurveysPage /> },

  { path: 'surveys/create', element: <CreateSurveyPage /> },

  { path: 'surveys/projects/:projectId', element: <ProjectSurveysPage /> },

  // One route for the survey page and its tabs (/form, /responses[/:responseId], /analytics)
  { path: 'surveys/:id/*', element: <SurveyViewPage /> },

  { path: 'surveys/:id/edit', element: <EditSurveyPage /> },

];

const platformRoutes: RouteObject[] = [

  { path: '/auth', element: <PublicOnlyAuthPage /> },

  // Public: confirm the mailbox by the link from the sign-up email
  { path: '/verify-email/:token', element: <VerifyEmailPage /> },

  // Public: new password by the link from the password reset email
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },

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

  ...publicSurveyRoutes,

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

      ...surveyRoutes,

      { path: 'profile', element: <ProfilePage /> },

      { path: 'participants', element: <ParticipantsPage /> },

      { path: 'settings/organization', element: <OrganizationSettingsPage /> },

      { path: 'dev/formily-builder', element: <FormilyBuilderPage /> },

    ],

  },

];

// Open to everyone: prices, the offer, contacts and requisites (the payment provider checks them)
const publicLegalRoutes: RouteObject[] = [

  {
    element: <PublicLegalLayout />,
    children: [
      { path: '/pricing', element: <PlansPage /> },
      // All the documents are one long read with anchors; the old addresses of the separate pages
      // stay valid for the links that were already given out (the payment provider, emails)
      { path: '/legal', element: <LegalPage /> },
      { path: '/offer', element: <Navigate to="/legal#offer" replace /> },
      { path: '/terms', element: <Navigate to="/legal#terms" replace /> },
      { path: '/privacy', element: <Navigate to="/legal#privacy" replace /> },
      { path: '/consent', element: <Navigate to="/legal#consent" replace /> },
      { path: '/refund', element: <Navigate to="/legal#refund" replace /> },
      { path: '/contacts', element: <Navigate to="/legal#contacts" replace /> },
    ],
  },

];

// Standalone surveys service: sign-in, the surveys section and respondent pages only
const surveysRoutes: RouteObject[] = [

  { path: '/verify-email/:token', element: <VerifyEmailPage /> },

  { path: '/auth', element: <PublicOnlyAuthPage /> },

  { path: '/reset-password/:token', element: <ResetPasswordPage /> },

  ...publicLegalRoutes,

  ...publicSurveyRoutes,

  {

    path: '/',

    element: <ProtectedLayout />,

    children: [

      { index: true, element: <Navigate to={HOME_PATH} replace /> },

      ...surveyRoutes,

      { path: 'profile', element: <ProfilePage /> },

      { path: 'plans', element: <PlansPage /> },

      { path: 'admin', element: <AdminRoute /> },

      // Anything else (including other modules' old links) leads back to the surveys start page
      { path: '*', element: <Navigate to={HOME_PATH} replace /> },

    ],

  },

];

const router = createBrowserRouter(IS_SURVEYS_APP ? surveysRoutes : platformRoutes);



const App =() => <RouterProvider router={router} />;

export default App;

