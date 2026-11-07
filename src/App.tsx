import { Suspense, useEffect, useState, type ReactNode } from 'react';

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

  useParams,

} from 'react-router-dom';

import { useAuth } from './shared/hooks/auth.hooks';

import { HOME_PATH, IS_SURVEYS_APP } from './shared/config/appMode';

import { AppShellPanelsProvider } from './shared/context/appShellPanels.context';

import { NotificationsProvider } from './shared/context/notifications.context';

import { useOrganization } from './shared/hooks/organization.hooks';

import { AppSidebar } from './components/layout/AppSidebar';
import { NAV_ITEMS } from './components/layout/navItems';

import { AppContentHeader } from './components/layout/AppContentHeader';

import { getBreadcrumbsForPath, getTeamBreadcrumbs, withStandaloneRoot } from './components/layout/appBreadcrumbs';
import { PersonalWorkspaceNotice } from './components/layout/PersonalWorkspaceNotice';

import { BreadcrumbProvider, useBreadcrumbEntity } from './shared/context/breadcrumb.context';

import { buildDisplayName } from './shared/utils/userName';

import { PublicLegalLayout } from './components/legal/PublicLegalLayout';
import { PaywallModalHost } from './components/billing/PaywallModalHost';
import { SubscriptionProvider } from './shared/context/subscription.provider';
import { OnboardingGate } from './components/onboarding/OnboardingGate';
import { EmailVerificationBanner } from './components/layout/EmailVerificationBanner';
import { TourProvider } from './components/tour/TourProvider';

import { PublicFormFlowProvider } from './shared/context/publicFormFlow.provider';

import { CreateOrganizationModal } from './components/layout/CreateOrganizationModal';
import { NoOrganizationState } from './components/layout/NoOrganizationState';
import { WorkspaceUnavailableState } from './components/layout/WorkspaceUnavailableState';
import { lazyPage, preloadWhenIdle } from './shared/lib/lazyPage';
import { AppShellSkeleton, PublicFormSkeleton, RouteSkeleton } from './shared/ui/skeletons/PageSkeletons';

// Every page is a separate chunk: the first screen downloads only the shell and the page it shows

const CreateFormPage = lazyPage(() => import('./pages/CreateFormPage'), 'CreateFormPage');
const EditFormPage = lazyPage(() => import('./pages/EditFormPage'), 'EditFormPage');
const ParticipantsPage = lazyPage(() => import('./pages/ParticipantsPage'), 'ParticipantsPage');
const OrganizationSettingsPage = lazyPage(() => import('./pages/OrganizationSettingsPage'), 'OrganizationSettingsPage');
const FormViewPage = lazyPage(() => import('./pages/FormViewPage'), 'FormViewPage');
const FormsPage = lazyPage(() => import('./pages/FormsPage'), 'FormsPage');
const SurveysPage = lazyPage(() => import('./pages/SurveysPage'), 'SurveysPage');
const ProjectSurveysPage = lazyPage(() => import('./pages/ProjectSurveysPage'), 'ProjectSurveysPage');
const CreateSurveyPage = lazyPage(() => import('./pages/CreateSurveyPage'), 'CreateSurveyPage');
const EditSurveyPage = lazyPage(() => import('./pages/EditSurveyPage'), 'EditSurveyPage');
const SurveyViewPage = lazyPage(() => import('./pages/SurveyViewPage'), 'SurveyViewPage');
const PublicSurveyPage = lazyPage(() => import('./pages/PublicSurveyPage'), 'PublicSurveyPage');
const SurveyFromDemoPage = lazyPage(() => import('./pages/DemoDraftPage'), 'SurveyFromDemoPage');
const DemoDraftEntryPage = lazyPage(() => import('./pages/DemoDraftPage'), 'DemoDraftEntryPage');
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'), 'ProfilePage');
const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage');
const PlansPage = lazyPage(() => import('./pages/PlansPage'), 'PlansPage');
const LegalPage = lazyPage(() => import('./pages/LegalPage'), 'LegalPage');
const RequestsPage = lazyPage(() => import('./pages/RequestsPage'), 'RequestsPage');
const CreateRequestPage = lazyPage(() => import('./pages/CreateRequestPage'), 'CreateRequestPage');
const RequestViewPage = lazyPage(() => import('./pages/RequestViewPage'), 'RequestViewPage');
const AuthPage = lazyPage(() => import('./pages/AuthPage'), 'AuthPage');
const ResetPasswordPage = lazyPage(() => import('./pages/ResetPasswordPage'), 'ResetPasswordPage');
const VerifyEmailPage = lazyPage(() => import('./pages/VerifyEmailPage'), 'VerifyEmailPage');
const OAuthCallbackPage = lazyPage(() => import('./pages/OAuthCallbackPage'), 'OAuthCallbackPage');
const ActivateAccountPage = lazyPage(() => import('./pages/ActivateAccountPage'), 'ActivateAccountPage');
const JoinOrganizationPage = lazyPage(() => import('./pages/JoinOrganizationPage'), 'JoinOrganizationPage');
const PublicFormFillPage = lazyPage(() => import('./pages/PublicFormFillPage'), 'PublicFormFillPage');
const PublicFormLandingPage = lazyPage(() => import('./pages/PublicFormLandingPage'), 'PublicFormLandingPage');
const PublicRequestLegacyRedirect = lazyPage(() => import('./pages/PublicRequestLegacyRedirect'), 'PublicRequestLegacyRedirect');
const FormilyBuilderPage = lazyPage(() => import('./dev/formily/FormilyBuilderPage'), 'FormilyBuilderPage');

// The pages one usually goes to from the start page: fetched in the background once it has rendered
const LIKELY_NEXT_PAGES = IS_SURVEYS_APP
  ? [SurveysPage, ProjectSurveysPage, SurveyViewPage, CreateSurveyPage, EditSurveyPage, ProfilePage]
  : [RequestsPage, RequestViewPage, FormsPage, SurveysPage, ProjectSurveysPage, SurveyViewPage, ProfilePage];

const withSkeleton = (element: ReactNode, fallback: ReactNode = <PublicFormSkeleton />) => (
  <Suspense fallback={fallback}>{element}</Suspense>
);



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



  useEffect(() => preloadWhenIdle(LIKELY_NEXT_PAGES), []);

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
                ? withStandaloneRoot(
                    getBreadcrumbsForPath(location.pathname, entityTitle, entityParent) ??
                      getTeamBreadcrumbs(location.pathname),
                  )
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

            showNotifications

            standalone={IS_SURVEYS_APP}

            showMobileMenu={!IS_SURVEYS_APP && !isDesktop}

            onMobileMenuClick={toggleSidebar}

          />



          <EmailVerificationBanner />

          <main id="main-content" className="app-shell-content">

            {isProfileRoute ? (

              // The account settings do not depend on an organization: a person without one can still change the password
              <Suspense fallback={<RouteSkeleton />}>
                <Outlet />
              </Suspense>

            ) : isOrgLoading ? (

              <RouteSkeleton />

            ) : !hasOrganizations ? (

              // The surveys service has no organizations: the personal workspace is created by the server
              IS_SURVEYS_APP ? (

                <WorkspaceUnavailableState onRetry={() => void refreshOrganizations()} />

              ) : (

                <NoOrganizationState onCreateClick={openCreateOrg} />

              )

            ) : (

              <Suspense fallback={<RouteSkeleton />}>
                <Outlet />
              </Suspense>

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

  if (isAuthLoading) return <AppShellSkeleton />;

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <AppLayout />;

};



// Administrator pages: anybody else is sent home. The server checks the role again on every request,
// so this only spares a normal user a page that would answer 403.
const AdminRoute = () => {
  const { profile, isAuthLoading } = useAuth();

  if (isAuthLoading || !profile) return <RouteSkeleton />;

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
  { path: '/survey/:token', element: withSkeleton(<PublicSurveyPage />) },

  // Author's preview of a survey: the same respondent form, nothing is saved
  { path: '/surveys/:id/preview', element: withSkeleton(<PublicSurveyPage preview />) },

];

// A reader of a team looks at surveys and results, he does not create or change them:
// the address of such a page leads him back to where he can look
const EditorOnly = ({ to, children }: { to: string; children: ReactNode }) => {
  const { canEdit } = useOrganization();

  if (!canEdit) return <Navigate to={to} replace />;

  return <>{children}</>;
};

const EditSurveyRoute = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <EditorOnly to={id ? `/surveys/${id}` : '/surveys'}>
      <EditSurveyPage />
    </EditorOnly>
  );
};

// Author's surveys section (children of the protected layout)
const surveyRoutes: RouteObject[] = [

  { path: 'surveys', element: <SurveysPage /> },

  { path: 'surveys/create', element: <EditorOnly to="/surveys"><CreateSurveyPage /></EditorOnly> },

  // The survey the AI built on svodservice.ru, taken into the account after signing in
  { path: 'surveys/from-demo/:token', element: <EditorOnly to="/surveys"><SurveyFromDemoPage /></EditorOnly> },

  { path: 'surveys/projects/:projectId', element: <ProjectSurveysPage /> },

  // One route for the survey page and its tabs (/form, /responses[/:responseId], /analytics)
  { path: 'surveys/:id/*', element: <SurveyViewPage /> },

  { path: 'surveys/:id/edit', element: <EditSurveyRoute /> },

];

const platformRoutes: RouteObject[] = [

  { path: '/auth', element: <PublicOnlyAuthPage /> },

  // Public: the return from Yandex ID carries the token in the URL fragment
  { path: '/auth/oauth', element: <OAuthCallbackPage /> },

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
      { index: true, element: withSkeleton(<PublicFormLandingPage />) },
      { path: 'fill/:formId', element: withSkeleton(<PublicFormFillPage />) },
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

// The people and settings of a team have nothing to show in the person's own workspace: it is not shared
const TeamOnly = ({ children }: { children: ReactNode }) => {
  const { activeOrganization } = useOrganization();

  if (activeOrganization?.is_personal) return <PersonalWorkspaceNotice />;

  return <>{children}</>;
};

// Standalone surveys service: sign-in, the surveys section, teams and respondent pages only
const surveysRoutes: RouteObject[] = [

  { path: '/verify-email/:token', element: <VerifyEmailPage /> },

  // Public: join a team by its link, and activate an account the team's owner created
  { path: '/join/:token', element: <JoinOrganizationPage /> },

  { path: '/activate/:token', element: <ActivateAccountPage /> },

  // «Continue in the service» on svodservice.ru: a guest signs up (or in) first, then gets the survey
  { path: '/demo/:token', element: <DemoDraftEntryPage /> },

  { path: '/auth', element: <PublicOnlyAuthPage /> },

  { path: '/auth/oauth', element: <OAuthCallbackPage /> },

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

      { path: 'participants', element: <TeamOnly><ParticipantsPage /></TeamOnly> },

      { path: 'settings/organization', element: <TeamOnly><OrganizationSettingsPage /></TeamOnly> },

      { path: 'admin', element: <AdminRoute /> },

      // Anything else (including other modules' old links) leads back to the surveys start page
      { path: '*', element: <Navigate to={HOME_PATH} replace /> },

    ],

  },

];

const router = createBrowserRouter(IS_SURVEYS_APP ? surveysRoutes : platformRoutes);



// Public pages outside the shell (sign-in, links from emails, the documents) wait for their chunk here
const App = () => (
  <Suspense fallback={<FullPageLoader />}>
    <RouterProvider router={router} />
  </Suspense>
);

export default App;

