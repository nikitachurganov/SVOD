import { useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSurveyCatalog } from '../../shared/hooks/useSurveyCatalog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const resultClass = 'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60 [overflow-wrap:anywhere]';

export const SurveySearchDialog = ({ organizationId, onClose }: { organizationId: string | null; onClose: () => void }) => {
  const [query, setQuery] = useState('');
  const catalog = useSurveyCatalog(organizationId);
  const navigate = useNavigate();
  const needle = query.trim().toLocaleLowerCase('ru');
  const projects = catalog.projects.filter((p) => p.name.toLocaleLowerCase('ru').includes(needle));
  const surveys = catalog.surveys.filter((s) => s.status !== 'archived' && s.name.toLocaleLowerCase('ru').includes(needle));
  const open = (path: string) => { onClose(); navigate(path); };
  const loading = catalog.surveysLoading || catalog.projectsLoading;
  const failed = catalog.surveysFailed || catalog.projectsFailed;
  return <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="sv-ui gap-4 sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Поиск в команде</DialogTitle>
        <DialogDescription className="sr-only">Поиск проектов и исследований активной команды</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input autoFocus aria-label="Поиск проектов и исследований" placeholder="Название проекта или исследования" className="h-10 pl-9 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!needle ? <p className="text-sm text-muted-foreground">Введите название проекта или исследования.</p> : <div className="max-h-80 space-y-3 overflow-y-auto">
        {loading && <div className="space-y-2" role="status" aria-label="Загрузка"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>}
        {failed && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><span>Часть результатов не удалось загрузить</span><Button variant="outline" size="sm" onClick={catalog.refresh}>Повторить</Button></div>}
        {!loading && !failed && !projects.length && !surveys.length && <p className="py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>}
        {!!projects.length && <section><h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Проекты</h3>{projects.map((project) => <button type="button" key={project.id} className={resultClass} onClick={() => open(`/surveys/projects/${project.id}`)}>{project.name}</button>)}</section>}
        {!!surveys.length && <section><h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Исследования</h3>{surveys.map((survey) => <button type="button" key={survey.id} className={resultClass} onClick={() => open(`/surveys/${survey.id}`)}>{survey.name}<small className="text-xs text-muted-foreground">{survey.project_name}</small></button>)}</section>}
      </div>}
    </DialogContent>
  </Dialog>;
};
