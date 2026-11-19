import { useRef, useState } from 'react';
import { FileText, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { archiveSurvey, moveSurveyToProject, type SurveyListItem } from '../../api/surveys.api';
import { useOrganization } from '../../hooks/organization.hooks';
import { useNotifications } from '../../context/notifications.context';
import { MoveSurveyModal } from './MoveSurveyModal';
import { SURVEY_STATUS_LABEL } from '../../../pages/surveyStatus';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  surveys: SurveyListItem[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  variant?: 'table' | 'rows';
}

export const ResearchList = ({ surveys, loading, failed, onRetry, variant = 'table' }: Props) => {
  const { activeOrganization, canEdit } = useOrganization();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [archiving, setArchiving] = useState<SurveyListItem | null>(null);
  const [moving, setMoving] = useState<SurveyListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [archiveError, setArchiveError] = useState(false);
  const archive = async () => {
    if (!archiving || saving.current || !canEdit) return;
    saving.current = true;
    setBusy(true);
    try {
      await archiveSurvey(archiving.id);
      setArchiving(null);
      notifySuccess('Исследование в архиве');
    } catch { setArchiveError(true); }
    finally { saving.current = false; setBusy(false); }
  };

  if (loading) return <div role="status" aria-label="Загрузка исследований" className="app-research-state space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>;
  if (failed) return <div role="alert" className="app-research-state flex items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4 text-sm text-destructive"><span>Не удалось загрузить исследования</span><Button variant="outline" size="sm" onClick={onRetry}>Повторить</Button></div>;
  if (!surveys.length) return <p className="app-research-state py-10 text-center text-sm text-muted-foreground">Исследований пока нет или они не соответствуют фильтрам</p>;

  const actions = (survey: SurveyListItem, className = '') => <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`size-7 text-muted-foreground ${className}`} aria-label={`Действия с исследованием «${survey.name}»`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52 text-xs">
      <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate(`/surveys/${survey.id}`)}>Открыть</DropdownMenuItem>
      {canEdit && survey.status !== 'archived' && <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate(`/surveys/${survey.id}/edit`)}>Редактировать</DropdownMenuItem>}
      {canEdit && <DropdownMenuItem className="cursor-pointer" onSelect={() => setMoving(survey)}>Переместить в проект</DropdownMenuItem>}
      {canEdit && survey.status !== 'archived' && <DropdownMenuItem variant="destructive" className="cursor-pointer" onSelect={() => { setArchiveError(false); setArchiving(survey); }}>Архивировать</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;

  return <>
    {variant === 'rows' ? <ul className="app-research-rows space-y-2.5" aria-label="Исследования">{surveys.map((survey) => {
      const author = survey.author ? [survey.author.first_name, survey.author.last_name].filter(Boolean).join(' ') : 'Автор неизвестен';
      return <li key={survey.id} title={`${survey.project_name} · ${author}`} className="app-research-row group relative flex h-11 items-center justify-between rounded-xl border border-border/70 bg-card px-5 shadow-2xs transition-colors hover:bg-muted/40 sm:h-12 sm:rounded-2xl sm:px-6 dark:border-border/50">
        <div className="min-w-0 flex-1 truncate pr-4"><Link to={`/surveys/${survey.id}`} className="text-[13px] font-medium text-foreground after:absolute after:inset-0 after:content-[''] sm:text-sm">{survey.name}</Link></div>
        <span className="app-research-status-text shrink-0 text-right text-xs font-normal text-muted-foreground transition-[margin] group-focus-within:mr-8 group-hover:mr-8 pointer-coarse:mr-8 sm:text-[13px]">{SURVEY_STATUS_LABEL[survey.status]}{survey.responses_count > 0 && ` · ${survey.responses_count} отв.`}</span>
        {actions(survey, 'absolute right-3 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100')}
      </li>;
    })}</ul> : <div className={`app-research-table-wrap app-research-table-wrap--${variant}`}>
      <table className="app-research-table" aria-label="Исследования">
        <thead><tr>{['Название исследования', 'Статус', 'Проект', 'Ответы', 'Создатель'].map((label) => <th key={label} scope="col">{label}</th>)}<th scope="col"><span className="sr-only">Действия</span></th></tr></thead>
        <tbody>{surveys.map((survey) => {
          const author = survey.author ? [survey.author.first_name, survey.author.last_name].filter(Boolean).join(' ') : 'Автор неизвестен';
          const initials = survey.author ? `${survey.author.first_name?.[0] ?? ''}${survey.author.last_name?.[0] ?? ''}` : '?';
          return <tr key={survey.id}>
            <td data-label="Название"><div className="app-research-name"><Link to={`/surveys/${survey.id}`}>{survey.name}</Link><span className="app-research-icon" aria-hidden="true" title="Опрос"><FileText className="size-3.5" /></span></div></td>
            <td data-label="Статус"><span className={`app-research-status app-research-status--${survey.status}`}>{SURVEY_STATUS_LABEL[survey.status]}</span></td>
            <td data-label="Проект"><Link to={`/surveys/projects/${survey.project_id}`}>{survey.project_name}</Link></td>
            <td data-label="Ответы">{survey.responses_count}</td>
            <td data-label="Создатель"><span className="app-research-author" title={author}><span aria-hidden="true">{initials}</span><span>{author}</span></span></td>
            <td data-label="Действия">{actions(survey)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <AlertDialog open={!!archiving} onOpenChange={(next) => { if (!next && !busy) setArchiving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Архивировать исследование?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">«{archiving?.name}» будет перенесено в архив. Сбор ответов прекратится; существующие ответы сохранятся.</AlertDialogDescription>
        </AlertDialogHeader>
        {archiveError && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-xs text-destructive">Не удалось архивировать исследование. Повторите попытку.</div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy} onClick={(event) => { event.preventDefault(); void archive(); }}>Архивировать</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <MoveSurveyModal open={!!moving} organizationId={activeOrganization?.id ?? null} surveyName={moving?.name ?? ''} currentProjectId={moving?.project_id ?? ''} onClose={() => setMoving(null)} onMove={async (project) => {
      if (!moving || !canEdit) return;
      try { await moveSurveyToProject(moving.id, project.id); setMoving(null); notifySuccess('Исследование перемещено'); }
      catch (error) { notifyError('Не удалось переместить исследование'); throw error; }
    }} />
  </>;
};
