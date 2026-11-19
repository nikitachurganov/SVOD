import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSurveyFromTemplate, getSurveyTemplate, getSurveyTemplates, type SurveyTemplate, type SurveyTemplateDetail } from '../../api/surveyTemplates.api';
import { getSurveyProjects, type SurveyProject } from '../../api/surveys.api';
import type { CreateFormFieldPayload } from '../../api/forms.api';
import { useOrganization } from '../../hooks/organization.hooks';
import { useNotifications } from '../../context/notifications.context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_PROJECT = '__default';

type MockTone = 'orange' | 'emerald' | 'amber' | 'purple';
const TONES: MockTone[] = ['orange', 'emerald', 'amber', 'purple'];
const TONE_BY_TEMPLATE: Record<string, MockTone> = { usability: 'orange', insights: 'emerald', cta: 'amber', nps: 'purple', csat: 'emerald', ces: 'amber', sus: 'orange', ueq: 'purple', needs: 'orange', purchase: 'emerald', brand: 'purple', event: 'amber', employee: 'orange', course: 'emerald', price: 'amber' };

/** Coloured card illustrations of the home page: orange flow, emerald bars, amber CTA, purple NPS. */
const TemplateMock = ({ tone }: { tone: MockTone }) => {
  if (tone === 'orange') return <div className="flex size-full select-none flex-col items-center justify-center gap-2 rounded-md border border-orange-200/40 bg-orange-50/50 p-2 dark:border-orange-900/40 dark:bg-orange-950/20" aria-hidden="true">
    <div className="flex h-2 w-4/5 items-center rounded-full bg-orange-200/60 px-0.5 dark:bg-orange-900/50"><div className="size-2.5 rounded-full bg-[#fc8507] shadow-xs" /></div>
    <div className="mt-1 flex items-center gap-2">
      <div className="flex h-6 w-8 items-center justify-center rounded-md border border-[#fc8507]/60 bg-orange-100/60 dark:bg-orange-900/40"><div className="h-1 w-4 rounded-xs bg-[#fc8507]" /></div>
      <div className="h-0.5 w-3 bg-[#fc8507]/50" />
      <div className="flex h-6 w-8 items-center justify-center rounded-md border border-[#fc8507]/60 bg-orange-100/60 dark:bg-orange-900/40"><div className="h-1 w-4 rounded-xs bg-[#fc8507]" /></div>
    </div>
  </div>;
  if (tone === 'emerald') return <div className="flex size-full select-none flex-col justify-between rounded-md border border-emerald-200/40 bg-emerald-50/50 p-2 dark:border-emerald-900/40 dark:bg-emerald-950/20" aria-hidden="true">
    <div className="h-1.5 w-10 rounded-xs bg-emerald-500/60" />
    <div className="flex h-10 items-end justify-center gap-1.5 py-1">
      <div className="h-5 w-2.5 rounded-t-xs bg-emerald-400/80" /><div className="h-8 w-2.5 rounded-t-xs bg-emerald-500" /><div className="h-4 w-2.5 rounded-t-xs bg-emerald-300/80" /><div className="h-6 w-2.5 rounded-t-xs bg-emerald-400" />
    </div>
    <div className="flex items-center justify-center gap-1.5">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="size-1.5 rounded-full bg-emerald-500" />)}</div>
  </div>;
  if (tone === 'amber') return <div className="flex size-full select-none flex-col justify-between rounded-md border border-amber-200/40 bg-amber-50/50 p-2 dark:border-amber-900/40 dark:bg-amber-950/20" aria-hidden="true">
    <div className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-400" /><div className="h-1 w-8 rounded-xs bg-amber-300" /></div>
    <div className="my-auto flex justify-center"><div className="flex h-6 items-center justify-center rounded-md bg-amber-400 px-4 shadow-xs"><span className="text-[9px] font-bold uppercase tracking-wider text-amber-950">CTA</span></div></div>
    <div className="h-1 w-full rounded-xs bg-amber-200 dark:bg-amber-900/60" />
  </div>;
  return <div className="flex size-full select-none flex-col justify-between rounded-md border border-purple-200/40 bg-purple-50/50 p-2 dark:border-purple-900/40 dark:bg-purple-950/20" aria-hidden="true">
    <div className="h-1.5 w-12 rounded-xs bg-purple-400" />
    <div className="my-auto space-y-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-950/80"><div className="h-full w-4/5 rounded-full bg-purple-500" /></div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-950/80"><div className="h-full w-3/5 rounded-full bg-purple-400" /></div>
    </div>
    <div className="flex items-center justify-between text-[8px] font-semibold text-purple-600 dark:text-purple-300"><span>0</span><span>NPS</span><span>10</span></div>
  </div>;
};

const HOME_CARD = 'group flex flex-col rounded-xl border border-border bg-card p-2.5 text-left transition-all hover:border-[#fc8507]/50';

const AllTemplatesStack = ({ label }: { label: string }) => <div className="relative flex size-full select-none items-center justify-center py-1" aria-hidden="true">
  <div className="relative flex h-16 w-24 items-center justify-center">
    <div className="absolute inset-x-3 -bottom-2 h-full rounded-xl border border-border/40 bg-card shadow-xs transition-transform group-hover:translate-y-0.5 dark:bg-muted/30" />
    <div className="absolute inset-x-1.5 -bottom-1 h-full rounded-xl border border-border/60 bg-card shadow-xs transition-transform group-hover:translate-y-0.5 dark:bg-muted/50" />
    <div className="relative flex size-full items-center justify-center rounded-xl border border-border/80 bg-card shadow-xs transition-transform group-hover:-translate-y-0.5 dark:bg-muted/70"><span className="text-lg font-bold tracking-tight text-foreground/90">{label}</span></div>
  </div>
</div>;

const PreviewQuestions = ({ fields }: { fields: CreateFormFieldPayload[] }) => <ol className="app-template-questions">{fields.map((field, index) => <li key={field.id ?? index}>
  <p>{field.label}{field.required && <span aria-label="Обязательный вопрос"> *</span>}</p>
  {field.children ? <PreviewQuestions fields={field.children} /> : <>
    {field.options && <ul>{field.options.map((option, i) => <li key={typeof option === 'string' ? i : option.id}>{typeof option === 'string' ? option : option.label}</li>)}</ul>}
    {field.type === 'rating' && <small>Шкала от {String(field.config?.min ?? 0)} до {String(field.config?.max ?? 10)}{field.config?.leftLabel ? ` · ${String(field.config.leftLabel)} — ${String(field.config.rightLabel ?? '')}` : ''}</small>}
    {field.type === 'longText' && <small>Развёрнутый ответ</small>}
  </>}
</li>)}</ol>;

const TemplatePreview = ({ template, organizationId, onClose }: { template: SurveyTemplate; organizationId: string; onClose: () => void }) => {
  const { canEdit } = useOrganization();
  const { notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SurveyTemplateDetail>();
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [projectsReady, setProjectsReady] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(template.name);
  const [nameError, setNameError] = useState('');
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT);
  const saving = useRef(false);
  const current = useRef(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    current.current = true;
    let active = true;
    getSurveyTemplate(template.id).then((data) => { if (active) { setDetail(data); setDetailFailed(false); } }, () => { if (active) setDetailFailed(true); });
    getSurveyProjects(organizationId).then((data) => { if (active) { setProjects(data); setProjectsReady(true); setProjectsFailed(false); } }, () => { if (active) setProjectsFailed(true); });
    return () => { active = false; current.current = false; };
  }, [template.id, organizationId, revision]);
  const create = async () => {
    if (saving.current || !canEdit || !detail || !projectsReady || projectsFailed) return;
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Укажите название'); return; }
    setNameError('');
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const survey = await createSurveyFromTemplate({ name: trimmed, project_id: projectId === DEFAULT_PROJECT ? undefined : projectId, template_id: template.id, organization_id: organizationId });
      if (current.current) { notifySuccess('Черновик создан'); navigate(`/surveys/${survey.id}/edit`); }
    } catch { if (current.current) setError('Не удалось создать черновик. Проверьте подключение и доступные лимиты, затем повторите попытку.'); }
    finally { saving.current = false; if (current.current) setBusy(false); }
  };
  const blocked = busy || !detail || !projectsReady || projectsFailed || detailFailed;
  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent className="sv-ui max-h-[90vh] overflow-y-auto sm:max-w-[720px]" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">{template.name}</DialogTitle>
        <DialogDescription className="text-xs">{template.description}</DialogDescription>
      </DialogHeader>
      {canEdit && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <div className="space-y-1.5">
          <Label htmlFor="template-name" className="text-xs font-medium">Название исследования</Label>
          <Input id="template-name" maxLength={500} value={name} disabled={busy} aria-invalid={!!nameError} className="h-9 text-sm" onChange={(event) => setName(event.target.value)} />
          {nameError && <p role="alert" className="text-xs text-destructive">{nameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Проект</Label>
          <Select value={projectId} onValueChange={setProjectId} disabled={busy || !projectsReady || projectsFailed}>
            <SelectTrigger aria-label="Проект" className="h-9 w-full text-sm"><SelectValue placeholder="Проект по умолчанию" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_PROJECT}>Проект по умолчанию</SelectItem>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </form>}
      {(detailFailed || projectsFailed) && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 p-3 text-xs text-destructive"><span>Не удалось загрузить анкету или список проектов</span><Button variant="outline" size="sm" onClick={() => setRevision((v) => v + 1)}>Повторить</Button></div>}
      {!detail && !detailFailed && <div className="space-y-2" role="status" aria-label="Загрузка анкеты"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>}
      {detail?.pages.map((page) => <section key={page.id}><h3 className="mb-1 text-sm font-semibold">{page.title}</h3><PreviewQuestions fields={page.fields} /></section>)}
      {(template.id === 'sus' || template.id === 'ueq') && <p className="text-xs text-muted-foreground">Перед публикацией результатов проверьте соответствие формулировок валидированной русской версии {template.id.toUpperCase()}.</p>}
      {error && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-xs text-destructive">{error}</div>}
      <DialogFooter>
        {canEdit ? <>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>Отмена</Button>
          <Button type="button" size="sm" aria-label="Создать черновик" aria-busy={busy} disabled={blocked} onClick={() => void create()}>Создать черновик</Button>
        </> : <Button type="button" variant="outline" size="sm" onClick={onClose}>Закрыть</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};

export const TemplateGallery = ({ home = false }: { home?: boolean }) => {
  const { activeOrganization } = useOrganization();
  const [templates, setTemplates] = useState<SurveyTemplate[]>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<SurveyTemplate>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    let active = true;
    getSurveyTemplates().then((data) => { if (active) { setTemplates(data); setFailed(false); } }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [revision]);
  return <>
    {failed ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4 text-sm text-destructive"><span>Не удалось загрузить готовые анкеты</span><Button variant="outline" size="sm" onClick={() => setRevision((v) => v + 1)}>Повторить</Button></div> : !templates ? <div className="space-y-3" role="status" aria-label="Загрузка анкет"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-2/3" /></div> : <div className="@container"><div className="grid grid-cols-1 gap-3.5 @[480px]:grid-cols-2 @[680px]:grid-cols-3 @[880px]:grid-cols-5">
      {templates.slice(0, home ? 4 : undefined).map((template, index) => <button type="button" className={HOME_CARD} key={template.id} onClick={(event) => { trigger.current = event.currentTarget; setSelected(template); }}>
        <span className="relative flex h-28 w-full items-center justify-center p-3"><TemplateMock tone={TONE_BY_TEMPLATE[template.id] ?? TONES[index % TONES.length]} /></span>
        <span className="line-clamp-2 px-1 pt-2 text-xs font-medium leading-snug text-foreground">{template.name}</span>
        {!home && <span className="px-1 pt-1 text-[11px] leading-snug text-muted-foreground">{template.description} · {template.questions_count} вопр.</span>}
      </button>)}
      {home && <Link to="/surveys/templates" className={HOME_CARD}>
        <span className="relative flex h-28 w-full items-center justify-center p-3"><AllTemplatesStack label={templates.length > 4 ? `+${templates.length - 4}` : '→'} /></span>
        <span className="line-clamp-2 px-1 pt-2 text-xs font-medium leading-snug text-foreground">Все шаблоны</span>
      </Link>}
    </div></div>}
    {selected && activeOrganization && <TemplatePreview key={`${activeOrganization.id}:${selected.id}`} template={selected} organizationId={activeOrganization.id} onClose={() => { setSelected(undefined); requestAnimationFrame(() => trigger.current?.focus()); }} />}
  </>;
};
