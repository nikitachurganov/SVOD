import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Switch } from 'antd';
import { IS_CLASSIC, switchDesign } from '../../shared/config/design';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useThemeMode, type ThemePreference } from '../../shared/context/theme.context';
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
  const { themeMode, toggleTheme, themePreference, setThemePreference } = useThemeMode();
  const isAdmin = profile?.role === 'admin';
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
    navigate('/settings?tab=plans');
  };

  const handleOpenAdmin = () => {
    onClose();
    navigate('/admin');
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

      {showCreateOrg && (
        <button
          type="button"
          className="app-profile-dropdown__item"
          onClick={handleCreateOrg}
        >
          Создать команду
        </button>
      )}

      <hr className="app-profile-dropdown__divider" />

      {IS_CLASSIC ? (
        // The production design: the dark theme is one switch, as it was
        <div className="app-profile-dropdown__item app-profile-dropdown__item--switch">
          <span className="app-profile-dropdown__label">Темная тема</span>
          <Switch size="small" checked={themeMode === 'dark'} onChange={toggleTheme} />
        </div>
      ) : (
      <div className="app-profile-dropdown__item app-profile-dropdown__item--switch">
        <span className="app-profile-dropdown__label" id="profile-theme-label">Тема</span>
        <div className="profile-theme-control" role="group" aria-labelledby="profile-theme-label">
          {([
            ['light', 'Светлая', 'light-mode'],
            ['dark', 'Тёмная', 'dark-mode'],
            ['system', 'Системная', 'desktop-windows'],
          ] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              className="profile-theme-control__option"
              aria-label={`${label} тема`}
              aria-pressed={themePreference === value}
              title={`${label} тема`}
              onClick={() => setThemePreference(value as ThemePreference)}
            >
              <Icon icon={`material-symbols:${icon}-rounded`} width={18} height={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      )}

      {isAdmin && (
        // Administrators only: try the new design on real data and come back (src/shared/config/design.ts)
        <div className="app-profile-dropdown__item app-profile-dropdown__item--switch">
          <span className="app-profile-dropdown__label">Новый дизайн</span>
          <Switch
            size="small"
            checked={!IS_CLASSIC}
            onChange={(on) => switchDesign(on ? 'new' : 'classic')}
            aria-label="Новый дизайн"
          />
        </div>
      )}

      <hr className="app-profile-dropdown__divider" />

      {IS_SURVEYS_APP && isAdmin && (
        <button type="button" className="app-profile-dropdown__item" onClick={handleOpenAdmin}>
          Админка
        </button>
      )}

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
