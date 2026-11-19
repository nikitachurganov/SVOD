import type { SurveyListItem, SurveyStatus } from '../api/surveys.api';

export interface ResearchFilters {
  scope: 'mine' | 'team';
  query: string;
  project: string;
  status: SurveyStatus | 'all';
}

export const readResearchFilters = (params: URLSearchParams): ResearchFilters => {
  const status = params.get('status');
  return {
    scope: params.get('scope') === 'team' ? 'team' : 'mine',
    query: params.get('q') ?? '',
    project: params.get('project') ?? '',
    status: status === 'draft' || status === 'open' || status === 'closed' || status === 'archived' ? status : 'all',
  };
};

export const selectResearch = (surveys: SurveyListItem[], userId: string | undefined, filters: ResearchFilters) => {
  const needle = filters.query.trim().toLocaleLowerCase('ru');
  return surveys.filter((survey) =>
    (filters.scope === 'team' || (!!userId && survey.author?.id === userId)) &&
    (filters.status === 'all' ? survey.status !== 'archived' : survey.status === filters.status) &&
    (!filters.project || survey.project_id === filters.project) &&
    (!needle || survey.name.toLocaleLowerCase('ru').includes(needle)),
  ).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
};
