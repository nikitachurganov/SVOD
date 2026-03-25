import { useNavigate } from 'react-router-dom';
import { OrganizationSettingsSection } from '../components/organization/OrganizationSettingsSection';

export const OrganizationSettingsPage = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        padding: 24,
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div>
        <h2 style={{ margin: '0 0 8px', fontWeight: 600 }}>Настройки организации</h2>
        <p style={{ margin: 0, color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
          Смена владельца и удаление организации
        </p>
      </div>

      <OrganizationSettingsSection onAfterDelete={() => navigate('/requests')} />
    </div>
  );
};
