import { Link } from 'react-router-dom';
import { HOME_PATH } from '../../shared/config/appMode';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { SidebarPlanCard } from './SidebarPlanCard';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { SURVEYS_NAV_ITEMS } from './surveysNavItems';
import logoUrl from '../../assets/logo.svg';

interface Props {
  selectedKey: string | null;
  isDesktop: boolean;
  isMobileOpen: boolean;
  onNavigate: (path: string) => void;
  onCreateTeam: () => void;
}

/**
 * Standalone surveys service: the brand, the sections and, at the bottom, the workspace (own or a team's)
 * live in the side panel; the top bar keeps the trail, the notifications, the tour and the account.
 */
export const SurveysSidebar = ({
  selectedKey,
  isDesktop,
  isMobileOpen,
  onNavigate,
  onCreateTeam,
}: Props) => {
  const { activeOrganization } = useOrganization();
  const inTeam = Boolean(activeOrganization && !activeOrganization.is_personal);
  const items = SURVEYS_NAV_ITEMS.filter((item) => !item.teamOnly || inTeam);

  const sidebarClass = ['app-sidebar', !isDesktop && isMobileOpen ? 'app-sidebar--mobile-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={sidebarClass} aria-label="Боковая навигация">
      <div className="app-sidebar__brand">
        <Link
          to={HOME_PATH}
          className="app-sidebar__brand-link"
          aria-label="СВОД Опросы — на главную"
          onClick={() => onNavigate(HOME_PATH)}
        >
          <img src={logoUrl} alt="СВОД" className="app-sidebar__logo-image app-sidebar__brand-logo" />
          <span className="app-sidebar__brand-name">Опросы</span>
        </Link>
      </div>

      <nav className="app-sidebar__nav" aria-label="Разделы">
        {items.map((item) => {
          const isActive = selectedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              data-nav={item.key}
              className={`app-sidebar__nav-item${isActive ? ' app-sidebar__nav-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.path)}
            >
              <item.Icon style={{ fontSize: 14 }} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="app-sidebar__workspace">
        <SidebarPlanCard onNavigate={onNavigate} />
        <WorkspaceSwitcher onCreateTeam={onCreateTeam} placement="topLeft" block />
      </div>
    </aside>
  );
};
