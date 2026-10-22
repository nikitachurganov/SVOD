import { useState } from 'react';
import { Popover } from 'antd';
import { HeaderProfileMenuContent } from './ProfileBlock';
import { TelegramLinkModal } from './TelegramLinkModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeNotifications: () => void;
  initials: string;
  resolvedName: string;
  resolvedEmail: string;
  onCreateOrg: () => void;
}

export const HeaderProfileMenu = ({
  open,
  onOpenChange,
  closeNotifications,
  initials,
  resolvedName,
  resolvedEmail,
  onCreateOrg,
}: Props) => {
  const [telegramOpen, setTelegramOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      closeNotifications();
    }
    onOpenChange(next);
  };

  const toggle = () => {
    handleOpenChange(!open);
  };

  return (
    <div className="app-profile-menu-wrap">
      <Popover
        classNames={{ root: 'app-profile-dropdown-popover' }}
        open={open}
        onOpenChange={handleOpenChange}
        trigger="click"
        placement="bottomRight"
        align={{ offset: [0, 0] }}
        arrow={false}
        destroyOnHidden
        content={
          <HeaderProfileMenuContent
            onClose={() => onOpenChange(false)}
            onCreateOrg={onCreateOrg}
            onOpenTelegram={() => setTelegramOpen(true)}
          />
        }
      >
        <button
          type="button"
          className={`app-profile-trigger${open ? ' app-profile-trigger--open' : ''}`}
          aria-label={open ? 'Закрыть меню профиля' : 'Открыть меню профиля'}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={toggle}
        >
          <span className="app-profile-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="app-profile-text">
            <span className="app-profile-name">{resolvedName}</span>
            <span className="app-profile-email">{resolvedEmail}</span>
          </span>
        </button>
      </Popover>
      {/* Outside the popover: its content is destroyed when the menu closes */}
      <TelegramLinkModal open={telegramOpen} onClose={() => setTelegramOpen(false)} />
    </div>
  );
};
