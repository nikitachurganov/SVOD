import api from '../lib/api';
import { SURVEYS_CHANGED_EVENT, type SurveyDetail, type MethodologyMeta } from './surveys.api';
import type { CreateFormPagePayload } from './forms.api';

export interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  methodology_id: string;
  questions_count: number;
}

export interface SurveyTemplateDetail extends SurveyTemplate {
  pages: CreateFormPagePayload[];
  methodology_meta: MethodologyMeta;
}

export const getSurveyTemplates = async () =>
  (await api.get<SurveyTemplate[]>('/survey-templates')).data;

export const getSurveyTemplate = async (id: string) =>
  (await api.get<SurveyTemplateDetail>(`/survey-templates/${encodeURIComponent(id)}`)).data;

export const createSurveyFromTemplate = async (payload: {
  template_id: string; organization_id: string; project_id?: string; name: string;
}) => {
  const { data } = await api.post<SurveyDetail>('/surveys/from-template', payload);
  window.dispatchEvent(new Event(SURVEYS_CHANGED_EVENT));
  return data;
};
