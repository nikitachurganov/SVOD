import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReturnedPaymentNotice } from '../components/billing/ReturnedPaymentNotice';
import { OrganizationSettingsSection } from '../components/organization/OrganizationSettingsSection';
import { HOME_PATH } from '../shared/config/appMode';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { PlansPage } from './PlansPage';

type SettingsTabKey = 'team' | 'plans';

const TAB_LABELS: Record<SettingsTabKey, string> = {
  team: 'Команда',
  plans: 'Тарифы',
};

/**
 * Standalone surveys service: the team's settings and the plans in one place.
 * The plan belongs to the person, so «Тарифы» is there in their own workspace too; «Команда» only in a team.
 */
export const SettingsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabKey[] = activeOrganization ? ['team', 'plans'] : ['plans'];
  const tabParam = searchParams.get('tab') as SettingsTabKey | null;
  const activeTab: SettingsTabKey = tabParam && tabs.includes(tabParam) ? tabParam : tabs[0];
  const setActiveTab = (key: SettingsTabKey) =>
    setSearchParams(key === tabs[0] ? {} : { tab: key }, { replace: true });

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Настройки</h1>
        </div>
        {tabs.length > 1 ? (
          <div className="registry-page__tabs" role="tablist" aria-label="Разделы настроек">
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={`registry-page__tab${activeTab === key ? ' registry-page__tab--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="registry-page__content settings-page__content">
        {activeTab === 'team' ? (
          <OrganizationSettingsSection onAfterDelete={() => navigate(HOME_PATH)} />
        ) : (
          <>
            <ReturnedPaymentNotice />
            <PlansPage />
          </>
        )}
      </div>
    </div>
  );
};
