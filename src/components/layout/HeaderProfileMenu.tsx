import { Popover, PopoverContent } from '@carbon/react';
import { HeaderProfileMenuContent } from './ProfileBlock';

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
  return (
    <Popover
      open={open}
      onRequestClose={() => onOpenChange(false)}
      align="bottom-end"
      autoAlign
      caret={false}
      dropShadow
    >
      <button
        type="button"
        className="app-profile-trigger"
        aria-label={
          open ? 'Закрыть меню профиля' : 'Открыть меню профиля'
        }
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          closeNotifications();
          onOpenChange(!open);
        }}
      >
        <span className="app-profile-avatar">{initials}</span>
        <span className="app-profile-text">
          <span className="app-profile-name">{resolvedName}</span>
          <span className="app-profile-email">{resolvedEmail}</span>
        </span>
      </button>
      <PopoverContent className="app-header-profile-popover-content">
        <HeaderProfileMenuContent onClose={() => onOpenChange(false)} onCreateOrg={onCreateOrg} />
      </PopoverContent>
    </Popover>
  );
};
