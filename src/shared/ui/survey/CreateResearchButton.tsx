import { LayoutGrid, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrganization } from '../../hooks/organization.hooks';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ITEMS = [
  { path: '/surveys/create', label: 'С помощью ИИ' },
  { path: '/surveys/create?mode=manual', label: 'Вручную' },
  { path: '/surveys/templates', label: 'Из шаблона' },
];

export const CreateResearchButton = ({ compact = false }: { compact?: boolean }) => {
  const navigate = useNavigate();
  const { canEdit, activeOrganization } = useOrganization();
  if (!canEdit || !activeOrganization) return null;
  const menu = <DropdownMenuContent align="end" className="w-44 rounded-xl text-xs">
    {ITEMS.map((item) => <DropdownMenuItem key={item.path} className="cursor-pointer" onSelect={() => navigate(item.path)}>{item.label}</DropdownMenuItem>)}
  </DropdownMenuContent>;
  if (!compact) return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button className="h-8 rounded-lg px-3.5 text-xs font-semibold shadow-xs">Новое исследование</Button></DropdownMenuTrigger>
    {menu}
  </DropdownMenu>;
  return <div className="flex items-center gap-2 sm:gap-3">
    <Link to="/surveys/templates" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 sm:text-sm"><LayoutGrid className="h-4 w-4 shrink-0 text-foreground/80" aria-hidden="true" />Начать с шаблона</Link>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" aria-label="Новое исследование" title="Новое исследование" className="size-8 rounded-full shadow-xs"><Plus className="size-4 stroke-[2.5]" /></Button></DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  </div>;
};
