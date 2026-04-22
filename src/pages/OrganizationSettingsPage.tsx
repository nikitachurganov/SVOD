import { useNavigate } from 'react-router-dom';
import { OrganizationSettingsSection } from '../components/organization/OrganizationSettingsSection';

export const OrganizationSettingsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="org-settings-page">
      <div className="org-settings-page__header">
        <h2 className="org-settings-page__title">Настройки организации</h2>
        <p className="org-settings-page__subtitle">
          Смена владельца и удаление организации
        </p>
      </div>

      <OrganizationSettingsSection onAfterDelete={() => navigate('/requests')} />
    </div>
  );
};
