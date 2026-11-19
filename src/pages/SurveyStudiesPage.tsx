import { SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useSurveyCatalog } from '../shared/hooks/useSurveyCatalog';
import { readResearchFilters, selectResearch } from '../shared/utils/surveyCatalog';
import { CreateResearchButton } from '../shared/ui/survey/CreateResearchButton';
import { ResearchList } from '../shared/ui/survey/ResearchList';
import { SURVEY_STATUS_LABEL } from './surveyStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAGE_SIZE = 20;
const ALL_PROJECTS = '__all';

export const SurveyStudiesPage = () => {
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const catalog = useSurveyCatalog(activeOrganization?.id ?? null);
  const [params, setParams] = useSearchParams();
  const filters = readResearchFilters(params);
  const list = selectResearch(catalog.surveys, user?.id, filters);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(Math.floor(Number(params.get('page')) || 1), pages));
  const filtered = filters.scope !== 'mine' || !!filters.query || !!filters.project || filters.status !== 'all';
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    return next;
  });
  const go = (value: number) => (event: React.MouseEvent) => { event.preventDefault(); if (value >= 1 && value <= pages && value !== page) update('page', String(value)); };
  return <div className="app-dashboard-page sv-ui">
    <div className="mx-auto w-full max-w-5xl space-y-3.5">
      <header className="flex items-center justify-between pb-1 pt-1">
        <h1 className="text-base font-bold tracking-tight text-foreground sm:text-lg">Исследования</h1>
        <div className="flex items-center gap-1 sm:gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative size-8 text-foreground/80" aria-label={filtered ? 'Фильтры (применены)' : 'Фильтры'} title="Фильтры">
                <SlidersHorizontal className="size-4" />
                {filtered && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="sv-ui w-80 space-y-3">
              <Segmented aria-label="Чьи исследования" value={filters.scope} onChange={(value) => update('scope', value)} options={[{ label: 'Мои', value: 'mine' }, { label: 'Команда', value: 'team' }]} />
              <Input aria-label="Поиск исследования по названию" placeholder="Поиск по названию" value={filters.query} onChange={(e) => update('q', e.target.value)} className="h-9 text-sm" />
              <Select value={filters.project || ALL_PROJECTS} onValueChange={(value) => update('project', value === ALL_PROJECTS ? '' : value)}>
                <SelectTrigger aria-label="Фильтр по проекту" className="h-9 w-full text-sm"><SelectValue placeholder="Все проекты" /></SelectTrigger>
                <SelectContent><SelectItem value={ALL_PROJECTS}>Все проекты</SelectItem>{catalog.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(value) => update('status', value)}>
                <SelectTrigger aria-label="Фильтр по статусу" className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Все, кроме архива</SelectItem>{Object.entries(SURVEY_STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </PopoverContent>
          </Popover>
          <CreateResearchButton compact />
        </div>
      </header>
      {catalog.projectsFailed && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"><span>Не удалось загрузить проекты для фильтра</span><Button variant="outline" size="sm" onClick={catalog.refresh}>Повторить</Button></div>}
      <ResearchList variant="rows" surveys={list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} loading={catalog.surveysLoading} failed={catalog.surveysFailed} onRetry={catalog.refresh} />
      {list.length > PAGE_SIZE && <Pagination className="pt-3" aria-label="Страницы списка">
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} onClick={go(page - 1)} /></PaginationItem>
          {Array.from({ length: pages }, (_, index) => index + 1).map((value) => <PaginationItem key={value}><PaginationLink href="#" isActive={value === page} onClick={go(value)}>{value}</PaginationLink></PaginationItem>)}
          <PaginationItem><PaginationNext href="#" aria-disabled={page === pages} onClick={go(page + 1)} /></PaginationItem>
        </PaginationContent>
      </Pagination>}
    </div>
  </div>;
};
