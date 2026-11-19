import { Suspense, useEffect, useState, type ReactNode } from 'react';

import { useMediaQuery } from './shared/hooks/useMediaQuery';

import { Button, Spin } from 'antd';
import { MenuUnfoldOutlined } from '@ant-design/icons';

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
import { SurveysSidebar } from './components/layout/SurveysSidebar';
import { SurveysSidebarClassic } from './components/layout/SurveysSidebar.classic';
import { getSurveysNavKey } from './components/layout/surveysNavItems';
import { IS_CLASSIC, switchDesign } from './shared/config/design';
import { NAV_ITEMS } from './components/layout/navItems';

import { AppContentHeader } from './components/layout/AppContentHeader';
import { AppContentHeaderClassic } from './components/layout/AppContentHeader.classic';

import { getBreadcrumbsForPath, getTeamBreadcrumbs, withStandaloneRoot } from './components/layout/appBreadcrumbs';

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
import './research-platform.css';
import './survey-home.css';

/** Only administrators may keep the new design: anybody else who has it (a shared browser) goes back */
const DesignGuard = () => {
  const { profile } = useAuth();
  useEffect(() => {
    if (!IS_CLASSIC && profile && profile.role !== 'admin') switchDesign('classic');
  }, [profile]);
  return null;
};

// The top bar of the production design keeps the account menu and the notifications in it
const ContentHeader = IS_CLASSIC ? AppContentHeaderClassic : AppContentHeader;

// Every page is a separate chunk: the first screen downloads only the shell and the page it shows

const CreateFormPage = lazyPage(() => import('./pages/CreateFormPage'), 'CreateFormPage');
const EditFormPage = lazyPage(() => import('./pages/EditFormPage'), 'EditFormPage');
const ParticipantsPage = lazyPage(() => import('./pages/ParticipantsPage'), 'ParticipantsPage');
const OrganizationSettingsPage = lazyPage(() => import('./pages/OrganizationSettingsPage'), 'OrganizationSettingsPage');
const FormViewPage = lazyPage(() => import('./pages/FormViewPage'), 'FormViewPage');
const FormsPage = lazyPage(() => import('./pages/FormsPage'), 'FormsPage');
const SurveysPage = lazyPage(() => import('./pages/SurveysPage'), 'SurveysPage');
// The production design (IS_CLASSIC) shows the screens as they were before the redesign
const SurveysPageClassic = lazyPage(() => import('./pages/SurveysPage.classic'), 'SurveysPageClassic');
const SurveyHomePage = lazyPage(() => import('./pages/SurveyHomePage'), 'SurveyHomePage');
const SurveyTestingResultsPage = lazyPage(() => import('./pages/SurveyTestingResultsPage'), 'SurveyTestingResultsPage');
const SurveyStudiesPage = lazyPage(() => import('./pages/SurveyStudiesPage'), 'SurveyStudiesPage');
const SurveyProjectsPage = lazyPage(() => import('./pages/SurveyProjectsPage'), 'SurveyProjectsPage');
const SurveyTemplatesPage = lazyPage(() => import('./pages/SurveyTemplatesPage'), 'SurveyTemplatesPage');
const SurveyResourcePage = lazyPage(() => import('./pages/SurveyResourcePage'), 'SurveyResourcePage');
const ProjectSurveysPage = lazyPage(() => import('./pages/ProjectSurveysPage'), 'ProjectSurveysPage');
const CreateSurveyPage = IS_CLASSIC
  ? lazyPage(() => import('./pages/CreateSurveyPage.classic'), 'CreateSurveyPageClassic')
  : lazyPage(() => import('./pages/CreateSurveyPage'), 'CreateSurveyPage');
const EditSurveyPage = IS_CLASSIC
  ? lazyPage(() => import('./pages/EditSurveyPage.classic'), 'EditSurveyPageClassic')
  : lazyPage(() => import('./pages/EditSurveyPage'), 'EditSurveyPage');
const SurveyViewPage = IS_CLASSIC
  ? lazyPage(() => import('./pages/SurveyViewPage.classic'), 'SurveyViewPageClassic')
  : lazyPage(() => import('./pages/SurveyViewPage'), 'SurveyViewPage');
const PublicSurveyPage = lazyPage(() => import('./pages/PublicSurveyPage'), 'PublicSurveyPage');
const SurveyFromDemoPage = lazyPage(() => import('./pages/DemoDraftPage'), 'SurveyFromDemoPage');
const DemoDraftEntryPage = lazyPage(() => import('./pages/DemoDraftPage'), 'DemoDraftEntryPage');
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'), 'ProfilePage');
const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage');
const PlansPage = lazyPage(() => import('./pages/PlansPage'), 'PlansPage');
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage');
const UpgradeFlowPage = lazyPage(() => import('./pages/UpgradeFlowPage'), 'UpgradeFlowPage');
const LegalPage = lazyPage(() => import('./pages/LegalPage'), 'LegalPage');
const RequestsPage = lazyPage(() => import('./pages/RequestsPage'), 'RequestsPage');
const CreateRequestPage = lazyPage(() => import('./pages/CreateRequestPage'), 'CreateRequestPage');
const RequestViewPage = lazyPage(() => import('./pages/RequestViewPage'), 'RequestViewPage');
const AuthPage = IS_CLASSIC
  ? lazyPage(() => import('./pages/AuthPage.classic'), 'AuthPageClassic')
  : lazyPage(() => import('./pages/AuthPage'), 'AuthPage');
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



  const { organizations, activeOrganization, isLoading: isOrgLoading, refreshOrganizations } = useOrganization();

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



  // The production design keeps its own side panel and always shows the top bar (src/shared/config/design.ts)
  const showResearchSidebar = IS_SURVEYS_APP && !IS_CLASSIC;
  const isSurveyHome = IS_SURVEYS_APP && !IS_CLASSIC && location.pathname === '/surveys';
  // Pages with their own title row have no breadcrumb bar on desktop; it stays where the sidebar is hidden.
  // Only a research's own pages (editor, results) keep the bar: it carries the breadcrumb trail and the create button there.
  const isResearchPage = /^\/surveys\/(?!studies(?:\/|$)|projects(?:\/|$)|templates(?:\/|$)|resources(?:\/|$)|create(?:\/|$)|from-demo(?:\/|$))[^/]+/.test(location.pathname);
  const hideContentHeader = !IS_CLASSIC && (isSurveyHome || (IS_SURVEYS_APP && isDesktop && !isResearchPage));

  const shellClass = (IS_CLASSIC ? [
    'app-shell-grid',
    !IS_SURVEYS_APP && isDesktop && isSidebarCollapsed ? 'app-shell-grid--collapsed' : '',
  ] : [

    'app-shell-grid',
    IS_SURVEYS_APP ? 'app-surveys-shell' : '',
    isSurveyHome ? 'app-surveys-shell--home' : '',

    IS_SURVEYS_APP && !showResearchSidebar ? 'research-shell--without-sidebar' : '',
    (!IS_SURVEYS_APP || showResearchSidebar) && isDesktop && isSidebarCollapsed ? 'app-shell-grid--collapsed' : '',

  ])

    .filter(Boolean)

    .join(' ');



  return (

    <>

      <GlobalScrollbarStyles />

      <OnboardingGate />

      <DesignGuard />

      {IS_SURVEYS_APP && <PaywallModalHost />}



      <div className={shellClass}>
        {!IS_CLASSIC && <a className="research-skip-link" href="#main-content">Перейти к содержимому</a>}

        {IS_SURVEYS_APP && IS_CLASSIC ? (
          <SurveysSidebarClassic
            selectedKey={getSurveysNavKey(location.pathname)}
            isDesktop={isDesktop}
            isMobileOpen={mobileSidebarOpen}
            onNavigate={handleNav}
            onCreateTeam={openCreateOrg}
          />
        ) : IS_SURVEYS_APP ? (

          showResearchSidebar ? <SurveysSidebar
            isDesktop={isDesktop}
            isMobileOpen={mobileSidebarOpen}
            onNavigate={handleNav}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onCreateOrg={openCreateOrg}
          /> : null

        ) : (

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



        {!isDesktop && mobileSidebarOpen && (!IS_SURVEYS_APP || IS_CLASSIC || showResearchSidebar) && (

          <button

            type="button"

            className="app-mobile-sidebar-backdrop"

            aria-label="Закрыть боковую навигацию"

            onClick={() => setMobileSidebarOpen(false)}

          />

        )}



        <div className="app-shell-main" inert={IS_SURVEYS_APP && !IS_CLASSIC && !isDesktop && mobileSidebarOpen}>

          {!hideContentHeader && <ContentHeader

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

            showMobileMenu={!isDesktop && (!IS_SURVEYS_APP || IS_CLASSIC || showResearchSidebar)}
            showBrand={IS_SURVEYS_APP && !IS_CLASSIC && !showResearchSidebar}

            onMobileMenuClick={toggleSidebar}

          />}



          {isSurveyHome && !isDesktop && <Button className="app-home-mobile-menu" icon={<MenuUnfoldOutlined />} aria-label="Открыть боковую навигацию" onClick={toggleSidebar}>Меню</Button>}
          <EmailVerificationBanner />

          <main id="main-content" tabIndex={-1} className="app-shell-content">

            {isProfileRoute ? (

              // The account settings do not depend on an organization: a person without one can still change the password
              <Suspense fallback={<RouteSkeleton />}>
                <Outlet key={activeOrganization?.id} />
              </Suspense>

            ) : isOrgLoading ? (

              <RouteSkeleton />

            ) : !hasOrganizations ? (

              // The surveys service has no organizations: the first team is created by the server
              IS_SURVEYS_APP ? (

                <WorkspaceUnavailableState onRetry={() => void refreshOrganizations()} />

              ) : (

                <NoOrganizationState onCreateClick={openCreateOrg} />

              )

            ) : (

              <Suspense fallback={<RouteSkeleton />}>
                <Outlet key={activeOrganization?.id} />
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



// The way to a paid plan is a full-page flow without the side panel; a guest is sent to sign in first
const UpgradeRoute = () => {
  const { user, isAuthLoading } = useAuth();
  const location = useLocation();

  if (isAuthLoading) return <FullPageLoader />;

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return (
    <NotificationsProvider>
      <UpgradeFlowPage />
    </NotificationsProvider>
  );
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

  { path: 'surveys', element: IS_SURVEYS_APP ? (IS_CLASSIC ? <SurveysPageClassic /> : <SurveyHomePage />) : <SurveysPage /> },
  // The production design has no research home, studies, templates or resources: they lead to the list
  ...(IS_SURVEYS_APP && IS_CLASSIC ? [
    { path: 'surveys/studies', element: <Navigate to="/surveys" replace /> },
    { path: 'surveys/projects', element: <Navigate to="/surveys" replace /> },
    { path: 'surveys/templates', element: <Navigate to="/surveys" replace /> },
    { path: 'surveys/resources/:slug', element: <Navigate to="/surveys" replace /> },
  ] : []),
  ...(IS_SURVEYS_APP && !IS_CLASSIC ? [
    { path: 'surveys/studies', element: <SurveyStudiesPage /> },
    { path: 'surveys/projects', element: <SurveyProjectsPage /> },
    { path: 'surveys/templates', element: <SurveyTemplatesPage /> },
    { path: 'surveys/resources/:slug', element: <SurveyResourcePage /> },
  ] : []),

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

  { path: '/testing-results', element: <SurveyTestingResultsPage /> },

  // Buying a plan: full-page steps outside the shell (one or a team, seats, payment)
  { path: '/upgrade/:step', element: <UpgradeRoute /> },

  {

    path: '/',

    element: <ProtectedLayout />,

    children: [

      { index: true, element: <Navigate to={HOME_PATH} replace /> },

      ...surveyRoutes,

      { path: 'profile', element: <ProfilePage /> },

      // The plans are a tab of the settings
      { path: 'plans', element: <Navigate to="/settings?tab=plans" replace /> },

      { path: 'participants', element: <ParticipantsPage /> },

      // The team's settings and the plans: one section
      { path: 'settings', element: <SettingsPage /> },

      { path: 'settings/organization', element: <Navigate to="/settings" replace /> },

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

