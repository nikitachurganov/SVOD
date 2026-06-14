import { useState } from 'react';
import { Switch } from 'antd';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useThemeMode } from '../../shared/context/theme.context';

export interface HeaderProfileMenuContentProps {
  onClose: () => void;
  onCreateOrg: () => void;
}

export const HeaderProfileMenuContent = ({
  onClose,
  onCreateOrg,
}: HeaderProfileMenuContentProps) => {
  const { signOut } = useAuth();
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

  return (
    <div className="app-profile-dropdown">
      <button
        type="button"
        className="app-profile-dropdown__item"
        onClick={handleCreateOrg}
      >
        Создать организацию
      </button>

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
