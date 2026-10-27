import { useState } from 'react';
import { Switch } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTour } from '../tour/useTour';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useThemeMode } from '../../shared/context/theme.context';
import { IS_SURVEYS_APP } from '../../shared/config/appMode';

export interface HeaderProfileMenuContentProps {
  onClose: () => void;
  onCreateOrg: () => void;
  showCreateOrg?: boolean;
}

export const HeaderProfileMenuContent = ({
  onClose,
  onCreateOrg,
  showCreateOrg = true,
}: HeaderProfileMenuContentProps) => {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const { start: startTour } = useTour();
  const { themeMode, toggleTheme } = useThemeMode();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleCreateOrg = () => {
    onClose();
    onCreateOrg();
  };

  const handleLogout = () => {
    onClose();
    void handleSignOut();
  };

  const handleOpenProfile = () => {
    onClose();
    navigate('/profile');
  };

  const handleOpenPlans = () => {
    onClose();
    navigate('/plans');
  };

  const handleOpenAdmin = () => {
    onClose();
    navigate('/admin');
  };

  const handleStartTour = () => {
    onClose();
    void startTour();
  };

  return (
    <div className="app-profile-dropdown">
      <button
        type="button"
        className="app-profile-dropdown__item"
        onClick={handleOpenProfile}
      >
        Профиль
      </button>

      {IS_SURVEYS_APP && (
        <button
          type="button"
          className="app-profile-dropdown__item"
          onClick={handleOpenPlans}
        >
          Тарифы
        </button>
      )}

      {IS_SURVEYS_APP && profile?.role === 'admin' && (
        <button
          type="button"
          className="app-profile-dropdown__item"
          onClick={handleOpenAdmin}
        >
          Администрирование
        </button>
      )}

      <button
        type="button"
        className="app-profile-dropdown__item"
        onClick={handleStartTour}
      >
        Пройти обучение
      </button>

      {showCreateOrg && (
        <button
          type="button"
          className="app-profile-dropdown__item"
          onClick={handleCreateOrg}
        >
          Создать организацию
        </button>
      )}

      <div className="app-profile-dropdown__item app-profile-dropdown__item--switch">
        <span className="app-profile-dropdown__label">Темная тема</span>
        <Switch
          size="small"
          checked={themeMode === 'dark'}
          onChange={toggleTheme}
        />
      </div>

      <hr className="app-profile-dropdown__divider" />

      <button
        type="button"
        className="app-profile-dropdown__item app-profile-dropdown__item--danger"
        onClick={handleLogout}
        disabled={isSigningOut}
      >
        {isSigningOut ? 'Выход из системы…' : 'Выйти из системы'}
      </button>
    </div>
  );
};
