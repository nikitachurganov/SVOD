import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, Check, ChevronDown, ChevronUp, CircleArrowUp, ClipboardList, Folder, Home, LogOut,
  Monitor, Moon, PanelLeft, PanelLeftClose, Plus, Search, Settings, ShieldCheck, Sun, Undo2, User, Users,
} from 'lucide-react';
import { switchDesign } from '../../shared/config/design';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useThemeMode, type ThemePreference } from '../../shared/context/theme.context';
import { BEFORE_WORKSPACE_CHANGE } from '../../shared/hooks/useResearchUnsavedChanges';
import { useTour } from '../tour/useTour';
import { buildDisplayName } from '../../shared/utils/userName';
import { SurveySearchDialog } from './SurveySearchDialog';
import { SidebarNotifications } from './SidebarNotifications';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  isDesktop: boolean;
  isMobileOpen: boolean;
  onNavigate: (path: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCreateOrg: () => void;
}

const THEMES: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Светлая', Icon: Sun },
  { value: 'system', label: 'Авто', Icon: Monitor },
  { value: 'dark', label: 'Тёмная', Icon: Moon },
];

const itemClass = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium';
const rowBase = 'flex h-10 items-center rounded-xl text-xs font-medium transition-colors cursor-pointer';
const rowIdle = 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10';

/** Icons and badges share one 20px slot, so every icon sits on the same vertical axis */
const Slot = ({ children }: { children: React.ReactNode }) => <div className="flex w-5 shrink-0 items-center justify-center">{children}</div>;

export const SurveysSidebar = ({ isDesktop, isMobileOpen, onNavigate, isCollapsed, onToggleCollapse, onCreateOrg }: Props) => {
  const { organizations, activeOrganization, setActiveOrganizationId } = useOrganization();
  const { profile, user, signOut } = useAuth();
  const { themePreference, setThemePreference } = useThemeMode();
  const { start } = useTour();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isDesktop || !isMobileOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, [isDesktop, isMobileOpen]);
  const collapsed = isDesktop && isCollapsed;
  const name = profile ? buildDisplayName({ firstName: profile.firstName, lastName: profile.lastName, middleName: profile.middleName }) || 'Пользователь' : 'Пользователь';
  const initial = name.charAt(0).toUpperCase();
  const teamName = activeOrganization?.name ?? 'Команда';
  const teamLetter = teamName.trim().charAt(0).toUpperCase() || 'К';
  const isOwner = activeOrganization?.owner_user_id === user?.id;
  const links = [
    { label: 'Главная', path: '/surveys', Icon: Home, active: pathname === '/surveys' },
    { label: 'Исследования', path: '/surveys/studies', Icon: ClipboardList, active: pathname === '/surveys/studies' || /^\/surveys\/(?!projects|templates|resources)[^/]+/.test(pathname) },
    { label: 'Проекты', path: '/surveys/projects', Icon: Folder, active: pathname.startsWith('/surveys/projects') },
    { label: 'Участники', path: '/participants', Icon: Users, active: pathname.startsWith('/participants'), divider: true },
    { label: 'Настройки', path: '/settings', Icon: Settings, active: pathname.startsWith('/settings') },
  ];
  const selectTeam = (id: string) => {
    if (id === activeOrganization?.id) return;
    if (!window.dispatchEvent(new Event(BEFORE_WORKSPACE_CHANGE, { cancelable: true }))) return;
    setActiveOrganizationId(id);
    // A page of the previous workspace (a survey, a project) does not exist in the next one
    navigate('/surveys');
  };
  const withTip = (label: string, node: React.ReactElement) => collapsed
    ? <Tooltip><TooltipTrigger asChild>{node}</TooltipTrigger><TooltipContent side="right" sideOffset={8}>{label}</TooltipContent></Tooltip>
    : node;
  // On desktop the sidebar has no background of its own: the shell padding already is the margin
  const edge = isDesktop;
  const menuSide = isDesktop ? 'right' : 'top';

  return <TooltipProvider>
    <aside ref={panel} inert={!isDesktop && !isMobileOpen} onKeyDown={(event) => { if (event.key === 'Escape' && !isDesktop && isMobileOpen && !searchOpen && !menuOpen && !notificationsOpen && !teamOpen) onToggleCollapse(); }} className={`app-sidebar surveys-sidebar app-dashboard-sidebar sv-ui sv-sidebar${isMobileOpen ? ' app-sidebar--mobile-open' : ''}${collapsed ? ' research-sidebar--collapsed' : ''}`} aria-label="Боковая навигация">
      <div className="flex h-full w-full select-none flex-col justify-between overflow-x-hidden bg-sidebar text-sidebar-foreground">
        <div className={cn('flex flex-col gap-2.5', edge ? 'p-0' : 'p-2.5')}>
          {/* Team switcher: 10px around, the badge sits in the icon slot */}
          <div className={cn('flex gap-1.5', collapsed ? 'flex-col items-center' : 'items-center')}>
          {collapsed && <Tooltip><TooltipTrigger asChild>
                <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Развернуть навигацию' : isDesktop ? 'Свернуть навигацию' : 'Закрыть боковую навигацию'} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e8eaed] text-muted-foreground transition-colors hover:bg-[#dfe2e5] dark:bg-white/10 dark:hover:bg-white/15">
                  {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger><TooltipContent side="right" sideOffset={4}>{collapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'}</TooltipContent></Tooltip>}
          <div className={cn('workspace-switcher', !collapsed && 'min-w-0 flex-1')}>
            <DropdownMenu open={teamOpen} onOpenChange={setTeamOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Рабочее пространство" title="Переключить команду" className={cn(rowBase, 'w-full gap-2.5 px-2.5 text-sm hover:bg-muted/60', collapsed && 'mx-auto w-10 justify-center px-0')}>
                  <Slot><span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#fc8507] text-xs font-bold text-white shadow-xs">{teamLetter}</span></Slot>
                  {!collapsed && <><span className="min-w-0 flex-1 truncate text-left font-semibold tracking-tight text-foreground">{teamName}</span><Slot><ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" /></Slot></>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side={menuSide} align="start" sideOffset={12} className="z-[1100] w-72 rounded-2xl border border-border/80 bg-card p-2.5 text-card-foreground shadow-xl">
                <div className="flex flex-col gap-1" role="group" aria-label="Рабочие пространства">
                  {organizations.map((org) => {
                    const selected = org.id === activeOrganization?.id;
                    return <DropdownMenuItem key={org.id} onSelect={() => selectTeam(org.id)} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl p-2.5', selected ? 'bg-orange-50/90 dark:bg-orange-950/50' : '')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold', selected ? 'bg-[#fc8507] text-white' : 'bg-muted text-muted-foreground')}>{org.name.trim().charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={org.name}>{org.name}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-[#fc8507]" aria-label="Текущая команда" />}
                    </DropdownMenuItem>;
                  })}
                </div>
                <DropdownMenuSeparator className="my-2.5" />
                <DropdownMenuItem className={itemClass} onSelect={onCreateOrg}><Plus className="h-4 w-4 text-muted-foreground" />Создать команду</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {!collapsed && <Tooltip><TooltipTrigger asChild>
                <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Развернуть навигацию' : isDesktop ? 'Свернуть навигацию' : 'Закрыть боковую навигацию'} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e8eaed] text-muted-foreground transition-colors hover:bg-[#dfe2e5] dark:bg-white/10 dark:hover:bg-white/15">
                  {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger><TooltipContent side="right" sideOffset={4}>{collapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'}</TooltipContent></Tooltip>}
          </div>

          {withTip('Поиск', <button ref={searchTrigger} type="button" aria-label="Поиск в команде" title="Поиск в команде" onClick={() => setSearchOpen(true)} className={cn(rowBase, 'w-full gap-2.5 bg-[#f0f2f4] px-2.5 text-foreground/70 hover:bg-[#e8eaed] dark:bg-white/[.07] dark:hover:bg-white/10', collapsed && 'mx-auto w-10 justify-center px-0')}>
            <Slot><Search className="h-4 w-4 text-muted-foreground" /></Slot>
            {!collapsed && <span className="flex-1 truncate text-left text-muted-foreground">Поиск</span>}
          </button>)}

          <nav className="flex flex-col gap-1 pt-1" aria-label="Основные разделы">
            {links.map(({ label, path, Icon, active, divider }) => <div key={path}>{divider && <div className="mx-1 mb-2 mt-1 h-px bg-border/70" aria-hidden="true" />}{withTip(label, <Link to={path} aria-label={label} aria-current={active ? 'page' : undefined} onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onNavigate(path); } }} className={cn(rowBase, 'gap-2.5 px-2.5', active ? 'font-semibold text-[#fc8507]' : rowIdle, collapsed && 'mx-auto w-10 justify-center px-0')}>
              <Slot><Icon className="h-4 w-4" /></Slot>
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>)}</div>)}
          </nav>
        </div>

        <div className={cn('flex flex-col', edge ? 'pb-0' : 'pb-3')}>
          {isOwner && <div className={cn('pb-2.5', !edge && 'px-2.5')}>{withTip('Обновить план', <Link to="/settings?tab=plans" aria-label="Обновить план" className={cn(rowBase, 'w-full gap-2.5 px-2.5', rowIdle, collapsed && 'mx-auto w-10 justify-center px-0')}>
            <Slot><CircleArrowUp className="h-4 w-4" /></Slot>
            {!collapsed && <span className="truncate">Обновить план</span>}
          </Link>)}</div>}

          <div className="flex flex-col gap-2 border-t border-border/70 pt-2.5">
            <div className={cn(!edge && 'px-2.5')}>
              {collapsed ? <Tooltip><TooltipTrigger asChild>
                <button type="button" aria-label="Сменить тему оформления" onClick={() => setThemePreference(themePreference === 'light' ? 'dark' : themePreference === 'dark' ? 'system' : 'light')} className={cn(rowBase, 'mx-auto w-10 justify-center', rowIdle)}>
                  {themePreference === 'light' ? <Sun className="h-4 w-4" /> : themePreference === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </button>
              </TooltipTrigger><TooltipContent side="right" sideOffset={8}>Тема: {themePreference === 'light' ? 'светлая' : themePreference === 'dark' ? 'тёмная' : 'авто'}</TooltipContent></Tooltip>
                : <div role="group" aria-label="Тема оформления" className="grid grid-cols-3 rounded-xl bg-[#f0f2f4] p-1 dark:bg-white/[.07]">
                  {THEMES.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={themePreference === value} aria-label={`${label} тема`} title={`${label} тема`} onClick={() => setThemePreference(value)} className={cn('flex items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-all', themePreference === value ? 'bg-white font-semibold text-foreground dark:bg-[#3c3f42] dark:text-white dark:ring-1 dark:ring-white/15' : 'text-foreground/60 hover:text-foreground')}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  </button>)}
                </div>}
            </div>

            <div className={cn('flex w-full', !edge && 'px-2.5', collapsed ? 'flex-col items-center gap-2' : 'items-center justify-between gap-1')}>
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={menuOpen ? 'Закрыть меню профиля' : 'Открыть меню профиля'} title={`Профиль: ${name}`} className={cn(rowBase, 'min-w-0 gap-2.5 px-2.5 hover:bg-muted/60', collapsed && 'mx-auto w-10 justify-center px-0')}>
                    <Slot>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">{initial}</span>}</Slot>
                    {!collapsed && <><span className="truncate text-xs font-medium text-foreground">{name}</span>{menuOpen ? <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}</>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side={collapsed || isDesktop ? 'right' : 'top'} align="end" sideOffset={8} className="z-[1100] w-60 rounded-2xl border border-border/80 bg-card p-1.5 text-card-foreground shadow-xl">
                  <div className="px-3 py-2"><div className="truncate text-xs font-semibold text-foreground">{name}</div><div className="truncate text-[11px] text-muted-foreground">{profile?.email ?? user?.email ?? ''}</div></div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={itemClass} onSelect={() => navigate('/profile')}><User className="h-4 w-4 text-muted-foreground" />Профиль</DropdownMenuItem>
                  <DropdownMenuItem className={itemClass} onSelect={() => navigate('/settings?tab=plans')}><CircleArrowUp className="h-4 w-4 text-muted-foreground" />Тарифы</DropdownMenuItem>
                  <DropdownMenuItem className={itemClass} onSelect={() => void start()}><ClipboardList className="h-4 w-4 text-muted-foreground" />Пройти обучение</DropdownMenuItem>
                  {profile?.role === 'admin' && <>
                    <DropdownMenuSeparator />
                    {/* Administrators only: back to the design everybody else sees (src/shared/config/design.ts) */}
                    <DropdownMenuItem className={itemClass} onSelect={() => switchDesign('classic')}><Undo2 className="h-4 w-4 text-muted-foreground" />Старый дизайн</DropdownMenuItem>
                    <DropdownMenuItem className={itemClass} onSelect={() => navigate('/admin')}><ShieldCheck className="h-4 w-4 text-muted-foreground" />Админка</DropdownMenuItem>
                  </>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={cn(itemClass, 'text-muted-foreground')} onSelect={() => void signOut()}><LogOut className="h-4 w-4" />Выйти</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
                <SidebarNotifications open={notificationsOpen} onOpenChange={setNotificationsOpen} side={isDesktop ? 'right' : 'top'} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
    {searchOpen && <SurveySearchDialog key={activeOrganization?.id ?? 'none'} organizationId={activeOrganization?.id ?? null} onClose={() => { setSearchOpen(false); requestAnimationFrame(() => searchTrigger.current?.focus()); }} />}
  </TooltipProvider>;
};
