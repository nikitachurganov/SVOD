import { Icon } from '@iconify/react';
import type { HTMLAttributes } from 'react';

type IconProps = HTMLAttributes<HTMLSpanElement>;

const materialIcon = (icon: string, spin = false) => {
  const MaterialIcon = ({ className, ...props }: IconProps) => (
    <span {...props} className={['anticon', spin && 'anticon-spin', className].filter(Boolean).join(' ')}>
      <Icon icon={`material-symbols:${icon}-rounded`} width="1em" height="1em" aria-hidden="true" />
    </span>
  );
  return MaterialIcon;
};

export const ApartmentOutlined = materialIcon('account-tree');
export const AutoAwesomeOutlined = materialIcon('auto-awesome');
export const ApiOutlined = materialIcon('api');
export const ArrowDownOutlined = materialIcon('arrow-downward');
export const ArrowLeftOutlined = materialIcon('arrow-back');
export const ArrowRightOutlined = materialIcon('arrow-forward');
export const ArrowUpOutlined = materialIcon('arrow-upward');
export const BankOutlined = materialIcon('account-balance');
export const BellOutlined = materialIcon('notifications');
export const BookOutlined = materialIcon('menu-book');
export const BranchesOutlined = materialIcon('account-tree');
export const CalendarOutlined = materialIcon('calendar-month');
export const CheckCircleFilled = materialIcon('check-circle');
export const CheckCircleOutlined = materialIcon('check-circle');
export const CheckOutlined = materialIcon('check');
export const CloseCircleFilled = materialIcon('cancel');
export const CloseOutlined = materialIcon('close');
export const CopyOutlined = materialIcon('content-copy');
export const CreditCardOutlined = materialIcon('credit-card');
export const DeleteOutlined = materialIcon('delete');
export const DownOutlined = materialIcon('keyboard-arrow-down');
export const DownloadOutlined = materialIcon('download');
export const EditOutlined = materialIcon('edit');
export const ExclamationCircleOutlined = materialIcon('error');
export const ExclamationOutlined = materialIcon('priority-high');
export const ExportOutlined = materialIcon('open-in-new');
export const EyeOutlined = materialIcon('visibility');
export const FileOutlined = materialIcon('description');
export const FileTextOutlined = materialIcon('description');
export const FolderOutlined = materialIcon('folder');
export const FormOutlined = materialIcon('edit-square');
export const HolderOutlined = materialIcon('drag-indicator');
export const InboxOutlined = materialIcon('archive');
export const InfoCircleOutlined = materialIcon('info');
export const LeftOutlined = materialIcon('chevron-left');
export const LinkOutlined = materialIcon('link');
export const LoadingOutlined = materialIcon('progress-activity', true);
export const LockOutlined = materialIcon('lock');
export const MailOutlined = materialIcon('mail');
export const MenuFoldOutlined = materialIcon('menu-open');
export const MenuUnfoldOutlined = materialIcon('menu');
export const MessageOutlined = materialIcon('chat');
export const MinusOutlined = materialIcon('remove');
export const MoonOutlined = materialIcon('dark-mode');
export const MoreOutlined = materialIcon('more-vert');
export const PlayCircleOutlined = materialIcon('play-circle');
export const PlusOutlined = materialIcon('add');
export const QuestionCircleOutlined = materialIcon('help');
export const ReadOutlined = materialIcon('menu-book');
export const ReloadOutlined = materialIcon('refresh');
export const RightOutlined = materialIcon('chevron-right');
export const RobotOutlined = materialIcon('smart-toy');
export const SaveOutlined = materialIcon('save');
export const SearchOutlined = materialIcon('search');
export const SendOutlined = materialIcon('send');
export const SettingOutlined = materialIcon('settings');
export const ShareAltOutlined = materialIcon('share');
export const SolutionOutlined = materialIcon('badge');
export const SunOutlined = materialIcon('light-mode');
export const SwapOutlined = materialIcon('swap-horiz');
export const TeamOutlined = materialIcon('group');
export const ThunderboltOutlined = materialIcon('bolt');
export const UndoOutlined = materialIcon('undo');
export const UnlockOutlined = materialIcon('lock-open');
export const UpOutlined = materialIcon('keyboard-arrow-up');
export const UploadOutlined = materialIcon('upload');
export const UserAddOutlined = materialIcon('person-add');
export const UserOutlined = materialIcon('person');
export const UserSwitchOutlined = materialIcon('manage-accounts');
