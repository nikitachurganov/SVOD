import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useSurveyCatalog } from '../shared/hooks/useSurveyCatalog';
import { selectResearch } from '../shared/utils/surveyCatalog';
import { CreateResearchButton } from '../shared/ui/survey/CreateResearchButton';
import { ResearchList } from '../shared/ui/survey/ResearchList';
import { TemplateGallery } from '../shared/ui/survey/TemplateGallery';
import { ResourceCards } from '../shared/ui/survey/ResourceCards';
import { Segmented } from '@/components/ui/segmented';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  return 'Добрый вечер';
};

export const SurveyHomePage = () => {
  const { profile, user } = useAuth();
  const { activeOrganization } = useOrganization();
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const catalog = useSurveyCatalog(activeOrganization?.id ?? null);
  const recent = selectResearch(catalog.surveys, user?.id, { scope, query: '', project: '', status: 'all' }).slice(0, 5);
  const name = profile?.firstName?.trim();
  const greeting = getGreeting();
  return <div className="app-survey-home sv-ui">
    <div className="app-home-banner"><div><h3>{name ? `${greeting}, ${name}!` : greeting}</h3></div></div>
    <div className="app-home-surface">
      <section className="app-home-card" aria-labelledby="app-recent-title">
        <header className="app-dashboard-section-header"><div><h2 id="app-recent-title">Недавние исследования</h2><p>Недавно созданные или обновлённые исследования. <Link to={`/surveys/studies?scope=${scope}`}>Смотреть все</Link></p></div><div className="app-dashboard-actions"><Segmented aria-label="Чьи исследования" value={scope} options={[{ label: 'Ваши', value: 'mine' }, { label: 'Команда', value: 'team' }]} onChange={setScope} /><CreateResearchButton /></div></header>
        <ResearchList surveys={recent} loading={catalog.surveysLoading} failed={catalog.surveysFailed} onRetry={catalog.refresh} />
      </section>
      <section className="space-y-3" aria-labelledby="app-templates-title"><div><h2 id="app-templates-title" className="text-base font-bold text-foreground md:text-lg">Шаблоны исследований</h2><p className="text-xs text-muted-foreground">Выберите готовый шаблон или настройте его под свои задачи</p></div><TemplateGallery home /></section>
      <section className="space-y-3 pt-2" aria-labelledby="app-resources-title"><h2 id="app-resources-title" className="text-base font-bold text-foreground md:text-lg">Возможности платформы</h2><ResourceCards /></section>
    </div>
  </div>;
};
