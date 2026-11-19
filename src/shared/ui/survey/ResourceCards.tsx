import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Users } from 'lucide-react';
import { SURVEY_RESOURCES } from '../../data/surveyResources';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const report = SURVEY_RESOURCES.find((resource) => resource.slug === 'results') ?? SURVEY_RESOURCES[1];
const guides = SURVEY_RESOURCES.filter((resource) => resource.slug !== report.slug).slice(0, 3);

export const ResourceCards = () => <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
  <article className="relative flex select-none flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 opacity-75">
    <Badge variant="outline" className="absolute right-4 top-4 border-border/80 bg-muted/40 text-[10px] font-medium text-muted-foreground">Скоро</Badge>
    <div>
      <span className="mb-3 flex size-8 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground" aria-hidden="true"><Users className="size-4" /></span>
      <h3 className="text-sm font-bold text-foreground/90">Панель респондентов</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Привлекайте целевых участников из проверенной базы респондентов</p>
    </div>
    <div className="pt-4"><Button variant="outline" size="sm" disabled className="h-8 cursor-not-allowed rounded-lg px-3.5 text-xs font-medium opacity-60">Скоро появится</Button></div>
  </article>
  <article className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border/80">
    <div>
      <span className="mb-3 flex size-8 items-center justify-center rounded-full border border-emerald-200/40 bg-emerald-50 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-950/70 dark:text-emerald-400" aria-hidden="true"><BarChart3 className="size-4" /></span>
      <h3 className="text-sm font-bold text-foreground">Примеры отчётов</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Результаты исследований автоматически анализируются и визуализируются</p>
    </div>
    <div className="pt-4"><Button variant="outline" size="sm" asChild className="h-8 rounded-lg px-3.5 text-xs font-medium"><Link to={`/surveys/resources/${report.slug}`}>Смотреть отчёты</Link></Button></div>
  </article>
  <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-2">
    {guides.map((resource, index) => <div key={resource.slug} className="flex flex-1 flex-col">
      {index > 0 && <div className="my-[2px] h-px shrink-0 bg-border/60" />}
      <Link to={`/surveys/resources/${resource.slug}`} className="flex flex-1 items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50">
        <span><span className="block text-xs font-semibold text-foreground">{resource.title}</span><span className="block text-[11px] text-muted-foreground">{resource.description}</span></span>
        <ArrowUpRight className="ml-2 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>)}
  </div>
</div>;
