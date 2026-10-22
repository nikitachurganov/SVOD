import { useNavigate } from 'react-router-dom';
import { OrganizationSettingsSection } from '../components/organization/OrganizationSettingsSection';

export const OrganizationSettingsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="org-settings-page">
      <div className="org-settings-page__header">
        <h2 className="org-settings-page__title">Настройки</h2>
      </div>

      <OrganizationSettingsSection onAfterDelete={() => navigate('/requests')} />
    </div>
  );
};
