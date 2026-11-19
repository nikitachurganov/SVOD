import { Icon } from '@iconify/react';
import type { ComponentType, HTMLAttributes } from 'react';
import * as Ant from '@ant-design/icons';
import { IS_CLASSIC } from '../config/design';

type IconProps = HTMLAttributes<HTMLSpanElement>;

// The production design (IS_CLASSIC) keeps the antd icons it had; the new one draws Material Symbols
const materialIcon = (icon: string, spin = false, classic?: unknown) => {
  if (IS_CLASSIC && classic) return classic as ComponentType<IconProps>;
  const MaterialIcon =({ className, ...props }: IconProps) => (
    <span {...props} className={['anticon', spin && 'anticon-spin', className].filter(Boolean).join(' ')}>
      <Icon icon={`material-symbols:${icon}-rounded`} width="1em" height="1em" aria-hidden="true" />
    </span>
  );
  return MaterialIcon;
};

export const ApartmentOutlined = materialIcon('account-tree', false, Ant.ApartmentOutlined);
export const AutoAwesomeOutlined = materialIcon('auto-awesome');
export const ApiOutlined = materialIcon('api', false, Ant.ApiOutlined);
export const ArrowDownOutlined = materialIcon('arrow-downward', false, Ant.ArrowDownOutlined);
export const ArrowLeftOutlined = materialIcon('arrow-back', false, Ant.ArrowLeftOutlined);
export const ArrowRightOutlined = materialIcon('arrow-forward', false, Ant.ArrowRightOutlined);
export const ArrowUpOutlined = materialIcon('arrow-upward', false, Ant.ArrowUpOutlined);
export const BankOutlined = materialIcon('account-balance', false, Ant.BankOutlined);
export const BellOutlined = materialIcon('notifications', false, Ant.BellOutlined);
export const BookOutlined = materialIcon('menu-book', false, Ant.BookOutlined);
export const BranchesOutlined = materialIcon('account-tree', false, Ant.BranchesOutlined);
export const CalendarOutlined = materialIcon('calendar-month', false, Ant.CalendarOutlined);
export const CheckCircleFilled = materialIcon('check-circle', false, Ant.CheckCircleFilled);
export const CheckCircleOutlined = materialIcon('check-circle', false, Ant.CheckCircleOutlined);
export const CheckOutlined = materialIcon('check', false, Ant.CheckOutlined);
export const CloseCircleFilled = materialIcon('cancel', false, Ant.CloseCircleFilled);
export const CloseOutlined = materialIcon('close', false, Ant.CloseOutlined);
export const CopyOutlined = materialIcon('content-copy', false, Ant.CopyOutlined);
export const CreditCardOutlined = materialIcon('credit-card', false, Ant.CreditCardOutlined);
export const DeleteOutlined = materialIcon('delete', false, Ant.DeleteOutlined);
export const DownOutlined = materialIcon('keyboard-arrow-down', false, Ant.DownOutlined);
export const DownloadOutlined = materialIcon('download', false, Ant.DownloadOutlined);
export const EditOutlined = materialIcon('edit', false, Ant.EditOutlined);
export const ExclamationCircleOutlined = materialIcon('error', false, Ant.ExclamationCircleOutlined);
export const ExclamationOutlined = materialIcon('priority-high', false, Ant.ExclamationOutlined);
export const ExportOutlined = materialIcon('open-in-new', false, Ant.ExportOutlined);
export const EyeOutlined = materialIcon('visibility', false, Ant.EyeOutlined);
export const FileOutlined = materialIcon('description', false, Ant.FileOutlined);
export const FileTextOutlined = materialIcon('description', false, Ant.FileTextOutlined);
export const FolderOutlined = materialIcon('folder', false, Ant.FolderOutlined);
export const FormOutlined = materialIcon('edit-square', false, Ant.FormOutlined);
export const HolderOutlined = materialIcon('drag-indicator', false, Ant.HolderOutlined);
export const InboxOutlined = materialIcon('archive', false, Ant.InboxOutlined);
export const InfoCircleOutlined = materialIcon('info', false, Ant.InfoCircleOutlined);
export const LeftOutlined = materialIcon('chevron-left', false, Ant.LeftOutlined);
export const LinkOutlined = materialIcon('link', false, Ant.LinkOutlined);
export const LoadingOutlined = materialIcon('progress-activity', true, Ant.LoadingOutlined);
export const LockOutlined = materialIcon('lock', false, Ant.LockOutlined);
export const MailOutlined = materialIcon('mail', false, Ant.MailOutlined);
export const MenuFoldOutlined = materialIcon('menu-open', false, Ant.MenuFoldOutlined);
export const MenuUnfoldOutlined = materialIcon('menu', false, Ant.MenuUnfoldOutlined);
export const MessageOutlined = materialIcon('chat', false, Ant.MessageOutlined);
export const MinusOutlined = materialIcon('remove', false, Ant.MinusOutlined);
export const MoonOutlined = materialIcon('dark-mode', false, Ant.MoonOutlined);
export const MoreOutlined = materialIcon('more-vert', false, Ant.MoreOutlined);
export const PlayCircleOutlined = materialIcon('play-circle', false, Ant.PlayCircleOutlined);
export const PlusOutlined = materialIcon('add', false, Ant.PlusOutlined);
export const QuestionCircleOutlined = materialIcon('help', false, Ant.QuestionCircleOutlined);
export const ReadOutlined = materialIcon('menu-book', false, Ant.ReadOutlined);
export const ReloadOutlined = materialIcon('refresh', false, Ant.ReloadOutlined);
export const RightOutlined = materialIcon('chevron-right', false, Ant.RightOutlined);
export const RobotOutlined = materialIcon('smart-toy', false, Ant.RobotOutlined);
export const SaveOutlined = materialIcon('save', false, Ant.SaveOutlined);
export const SearchOutlined = materialIcon('search', false, Ant.SearchOutlined);
export const SendOutlined = materialIcon('send', false, Ant.SendOutlined);
export const SettingOutlined = materialIcon('settings', false, Ant.SettingOutlined);
export const ShareAltOutlined = materialIcon('share', false, Ant.ShareAltOutlined);
export const SolutionOutlined = materialIcon('badge', false, Ant.SolutionOutlined);
export const SunOutlined = materialIcon('light-mode', false, Ant.SunOutlined);
export const SwapOutlined = materialIcon('swap-horiz', false, Ant.SwapOutlined);
export const TeamOutlined = materialIcon('group', false, Ant.TeamOutlined);
export const ThunderboltOutlined = materialIcon('bolt', false, Ant.ThunderboltOutlined);
export const UndoOutlined = materialIcon('undo', false, Ant.UndoOutlined);
export const UnlockOutlined = materialIcon('lock-open', false, Ant.UnlockOutlined);
export const UpOutlined = materialIcon('keyboard-arrow-up', false, Ant.UpOutlined);
export const UploadOutlined = materialIcon('upload', false, Ant.UploadOutlined);
export const UserAddOutlined = materialIcon('person-add', false, Ant.UserAddOutlined);
export const UserOutlined = materialIcon('person', false, Ant.UserOutlined);
export const UserSwitchOutlined = materialIcon('manage-accounts', false, Ant.UserSwitchOutlined);
