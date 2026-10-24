import axios from 'axios';
import api from '../lib/api';
import type { AuthorPreview } from '../../types/author';
import type { CreateFormPagePayload } from './forms.api';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

// Respondents are not authenticated: no token interceptor and no redirect to /auth on 401
const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface MethodologyItem {
  id: string;
  name: string;
  summary: string;
  questions_count: number;
  survey_level: boolean;
}

export interface MethodologyWarning {
  rule: string;
  field: string;
  message: string;
}

export interface MethodologySummary {
  category_id: string | null;
  category_name: string | null;
  goals: string[];
  methodologies: MethodologyItem[];
  warnings: MethodologyWarning[];
  standards_note: string;
}

/** Stored with the survey; produced by the AI builder, passed back unchanged */
export type MethodologyMeta = Record<string, unknown>;

export interface MethodologyCatalog {
  version: string;
  categories: Array<{ id: string; name: string; goal: string }>;
  methodologies: Array<{
    id: string;
    category_id: string;
    name: string;
    summary: string;
    when_to_use: string;
  }>;
}

export interface MethodologyReport {
  title: string;
  markdown: string;
  bibliography: string[];
  has_unverified_sources: boolean;
}

export interface SurveyListItem {
  id: string;
  name: string;
  description: string;
  status: SurveyStatus;
  organization_id: string;
  project_id: string;
  project_name: string;
  author: AuthorPreview | null;
  category_id: string | null;
  category_name: string | null;
  methodology_names: string[];
  questions_count: number;
  responses_count: number;
  last_response_at: string | null;
  public_token: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyDetail extends SurveyListItem {
  pages: CreateFormPagePayload[];
  anonymous: boolean;
  closes_at: string | null;
  methodology_meta: MethodologyMeta | null;
  methodology_summary: MethodologySummary | null;
}

export interface SurveysCounts {
  all: number;
  mine: number;
  open: number;
  draft: number;
  closed: number;
  archived: number;
}

export interface SurveyProject {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  /** Palette key; null — the client derives a colour from the id */
  color: string | null;
  /** Without archived surveys */
  surveys_count: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyProjectPayload {
  name: string;
  description?: string | null;
  color?: string | null;
}

export interface SurveyPayload {
  name: string;
  description?: string | null;
  pages: CreateFormPagePayload[];
  methodology_meta?: MethodologyMeta | null;
  anonymous?: boolean;
  closes_at?: string | null;
}

/** ok — no remarks; review — only weak signals; flagged — a strong signal (left out of analytics) */
export type QualityStatus = 'ok' | 'review' | 'flagged';

export interface QualityReason {
  code: string;
  severity: 'strong' | 'weak';
  title: string;
  explanation: string;
  /** Questions the reason is about; empty when it concerns the response as a whole */
  field_ids: string[];
}

/** A short piece of a response for the list: a quote from a text answer or one short answer */
export interface ResponsePreview {
  label: string;
  text: string;
  kind: 'text' | 'value';
}

export interface SurveyResponseItem {
  id: string;
  /** Ordinal in the order of arrival: "Ответ №12" */
  number: number;
  submitted_at: string;
  duration_seconds: number | null;
  quality_flags: Record<string, boolean> | null;
  quality_status: QualityStatus;
  answers: Record<string, unknown>;
  preview: ResponsePreview[];
}

export interface SurveyResponsesPage {
  total: number;
  flagged: number;
  items: SurveyResponseItem[];
}

/** A question as the respondent saw it (from the form snapshot stored with the response) */
export interface SurveyQuestion {
  id: string;
  type: string;
  label: string;
  options: Array<{ id: string; label: string }>;
  methodology: string | null;
}

export interface SurveyResponseDetail {
  id: string;
  number: number;
  total: number;
  submitted_at: string;
  duration_seconds: number | null;
  quality_flags: Record<string, boolean> | null;
  quality_status: QualityStatus;
  quality_reasons: QualityReason[];
  answers: Record<string, unknown>;
  questions: SurveyQuestion[];
  /** Received just before / just after this one */
  prev_id: string | null;
  next_id: string | null;
}

export interface ResponsesDay {
  /** YYYY-MM-DD, UTC */
  date: string;
  count: number;
}

export interface QuestionOptionStat {
  label: string;
  count: number;
  percent: number;
}

export interface QuestionStat {
  field_id: string;
  label: string;
  type: string;
  methodology: string | null;
  kind: 'choice' | 'scale' | 'text';
  answered: number;
  options: QuestionOptionStat[];
  mean: number | null;
  median: number | null;
  mode: number | null;
  std: number | null;
  distribution: { value: number; count: number }[];
  samples: string[];
}

export interface MetricResult {
  id: string;
  name: string;
  value: number;
  unit: string;
  n: number;
  details: Record<string, number>;
  interpretation: string;
}

export interface SurveyResults {
  total: number;
  used: number;
  excluded: number;
  exclude_flagged: boolean;
  median_duration_seconds: number | null;
  mean_duration_seconds: number | null;
  /** Average share of answered questions per response, % */
  completion_rate: number | null;
  first_response_at: string | null;
  last_response_at: string | null;
  responses_by_day: ResponsesDay[];
  metrics: MetricResult[];
  questions: QuestionStat[];
}

export interface CrosstabGroup {
  label: string;
  n: number;
  mean: number | null;
  median: number | null;
  std: number | null;
}

export interface CrosstabResult {
  /** "table": counts of two categorical questions; "means": a numeric question per group */
  kind: 'table' | 'means';
  row_field_id: string;
  row_label: string;
  col_field_id: string;
  col_label: string;
  n: number;
  row_labels: string[];
  col_labels: string[];
  counts: number[][];
  row_percent: number[][];
  chi2: number | null;
  dof: number | null;
  p_value: number | null;
  cramers_v: number | null;
  low_expected_share: number | null;
  note: string | null;
  groups: CrosstabGroup[];
}

export interface SurveyAiSummary {
  bullets: string[];
  /** Per bullet: ids of the questions it rests on */
  evidence: string[][];
  generated_at: string;
  responses_used: number;
  exclude_flagged: boolean;
  /** Responses arrived after the summary was generated */
  stale: boolean;
}

export interface SurveyAiQuote {
  text: string;
  question: string;
}

export interface SurveyAnalysisChatResponse {
  reply: string;
  quotes: SurveyAiQuote[];
  crosstab: CrosstabResult | null;
}

export interface PublicSurvey {
  name: string;
  description: string;
  pages: CreateFormPagePayload[];
  organization_name: string | null;
  anonymous: boolean;
}

// ─── Surveys ──────────────────────────────────────────────────────────────────

export const getSurveys = async (
  organizationId: string,
  filters: { status?: SurveyStatus; mine?: boolean; projectId?: string } = {},
): Promise<SurveyListItem[]> => {
  const params: Record<string, string | boolean> = { organization_id: organizationId };
  if (filters.status) params.status = filters.status;
  if (filters.mine) params.mine = true;
  if (filters.projectId) params.project_id = filters.projectId;
  const { data } = await api.get<SurveyListItem[]>('/surveys', { params });
  return data;
};

export const getSurveysCounts = async (
  organizationId: string,
  projectId?: string,
): Promise<SurveysCounts> => {
  const { data } = await api.get<SurveysCounts>('/surveys/counts', {
    params: { organization_id: organizationId, ...(projectId ? { project_id: projectId } : {}) },
  });
  return data;
};

// ─── Projects ─────────────────────────────────────────────────────────────────

export const getSurveyProjects = async (organizationId: string): Promise<SurveyProject[]> => {
  const { data } = await api.get<SurveyProject[]>('/survey-projects', {
    params: { organization_id: organizationId },
  });
  return data;
};

export const getSurveyProject = async (id: string): Promise<SurveyProject> => {
  const { data } = await api.get<SurveyProject>(`/survey-projects/${id}`);
  return data;
};

export const createSurveyProject = async (
  organizationId: string,
  payload: SurveyProjectPayload,
): Promise<SurveyProject> => {
  const { data } = await api.post<SurveyProject>('/survey-projects', {
    organization_id: organizationId,
    name: payload.name,
    description: payload.description ?? null,
    color: payload.color ?? null,
  });
  return data;
};

export const updateSurveyProject = async (
  id: string,
  payload: SurveyProjectPayload,
): Promise<SurveyProject> => {
  const { data } = await api.put<SurveyProject>(`/survey-projects/${id}`, {
    name: payload.name,
    description: payload.description ?? null,
    color: payload.color ?? null,
  });
  return data;
};

/** Only an empty project can be deleted; otherwise the server answers 409 `project_not_empty` */
export const deleteSurveyProject = async (id: string): Promise<void> => {
  await api.delete(`/survey-projects/${id}`);
};

export const moveSurveyToProject = async (
  surveyId: string,
  projectId: string,
): Promise<SurveyDetail> => {
  const { data } = await api.patch<SurveyDetail>(`/surveys/${surveyId}/project`, {
    project_id: projectId,
  });
  return data;
};

export const getSurveyById = async (id: string): Promise<SurveyDetail> => {
  const { data } = await api.get<SurveyDetail>(`/surveys/${id}`);
  return data;
};

export const createSurvey = async (
  organizationId: string,
  payload: SurveyPayload,
  projectId?: string | null,
): Promise<SurveyDetail> => {
  const { data } = await api.post<SurveyDetail>('/surveys', {
    organization_id: organizationId,
    project_id: projectId ?? null,
    name: payload.name,
    description: payload.description ?? null,
    pages: payload.pages,
    methodology_meta: payload.methodology_meta ?? null,
    anonymous: payload.anonymous ?? true,
  });
  return data;
};

export const updateSurvey = async (id: string, payload: SurveyPayload): Promise<SurveyDetail> => {
  const { data } = await api.put<SurveyDetail>(`/surveys/${id}`, {
    name: payload.name,
    description: payload.description ?? null,
    pages: payload.pages,
    methodology_meta: payload.methodology_meta ?? null,
    anonymous: payload.anonymous ?? true,
    closes_at: payload.closes_at ?? null,
  });
  return data;
};

export const setSurveyStatus = async (
  id: string,
  status: Exclude<SurveyStatus, 'archived'>,
): Promise<SurveyDetail> => {
  const { data } = await api.patch<SurveyDetail>(`/surveys/${id}/status`, { status });
  return data;
};

export const archiveSurvey = async (id: string): Promise<void> => {
  await api.delete(`/surveys/${id}`);
};

export interface SurveyResponsesParams {
  limit?: number;
  offset?: number;
  /** true — only responses with quality flags, false — only without */
  flagged?: boolean;
  order?: 'newest' | 'oldest';
}

export const getSurveyResponses = async (
  id: string,
  params: SurveyResponsesParams = {},
): Promise<SurveyResponsesPage> => {
  const { data } = await api.get<SurveyResponsesPage>(`/surveys/${id}/responses`, { params });
  return data;
};

export interface QuestionAnswerItem {
  response_id: string;
  number: number;
  submitted_at: string;
  text: string;
}

export interface QuestionAnswersPage {
  field_id: string;
  label: string;
  total: number;
  items: QuestionAnswerItem[];
}

/** Every answer given to one open question, each linked to its response */
export const getQuestionAnswers = async (
  id: string,
  fieldId: string,
  params: { limit?: number; offset?: number; excludeFlagged?: boolean } = {},
): Promise<QuestionAnswersPage> => {
  const { data } = await api.get<QuestionAnswersPage>(`/surveys/${id}/questions/${fieldId}/answers`, {
    params: {
      limit: params.limit,
      offset: params.offset,
      exclude_flagged: params.excludeFlagged ?? true,
    },
  });
  return data;
};

export const getSurveyResponseDetail = async (
  id: string,
  responseId: string,
): Promise<SurveyResponseDetail> => {
  const { data } = await api.get<SurveyResponseDetail>(`/surveys/${id}/responses/${responseId}`);
  return data;
};

export const getSurveyResults = async (
  id: string,
  excludeFlagged = true,
): Promise<SurveyResults> => {
  const { data } = await api.get<SurveyResults>(`/surveys/${id}/results`, {
    params: { exclude_flagged: excludeFlagged },
  });
  return data;
};

export const getSurveyCrosstab = async (
  id: string,
  row: string,
  col: string,
  excludeFlagged = true,
): Promise<CrosstabResult> => {
  const { data } = await api.get<CrosstabResult>(`/surveys/${id}/crosstab`, {
    params: { row, col, exclude_flagged: excludeFlagged },
  });
  return data;
};

export const getSurveyAiSummary = async (id: string): Promise<SurveyAiSummary | null> => {
  const { data } = await api.get<SurveyAiSummary | null>(`/surveys/${id}/ai-summary`);
  return data;
};

export const generateSurveyAiSummary = async (
  id: string,
  options: { excludeFlagged?: boolean; force?: boolean } = {},
): Promise<SurveyAiSummary> => {
  const { data } = await api.post<SurveyAiSummary>(
    `/surveys/${id}/ai-summary`,
    { exclude_flagged: options.excludeFlagged ?? true, force: options.force ?? false },
    { timeout: 120_000 },
  );
  return data;
};

export const askSurveyAnalysisChat = async (
  id: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  excludeFlagged = true,
): Promise<SurveyAnalysisChatResponse> => {
  const { data } = await api.post<SurveyAnalysisChatResponse>(
    `/surveys/${id}/ai-chat`,
    { messages, exclude_flagged: excludeFlagged },
    { timeout: 190_000 },
  );
  return data;
};

/** Downloads the responses as CSV through the authorised client */
export const downloadSurveyResponsesCsv = async (id: string, name: string): Promise<void> => {
  const { data } = await api.get<Blob>(`/surveys/${id}/responses/export.csv`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.slice(0, 80) || 'survey'}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// ─── Methodologies ────────────────────────────────────────────────────────────

export const getMethodologyCatalog = async (): Promise<MethodologyCatalog> => {
  const { data } = await api.get<MethodologyCatalog>('/methodologies');
  return data;
};

/** Report for the survey as it is in the editor (may be unsaved) */
export const buildMethodologyReport = async (payload: {
  name: string;
  methodology_meta: MethodologyMeta | null;
  pages: CreateFormPagePayload[];
}): Promise<MethodologyReport> => {
  const { data } = await api.post<MethodologyReport>('/methodologies/report', payload);
  return data;
};

// ─── AI builder ───────────────────────────────────────────────────────────────

export interface SurveyAiBuildPayload {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  title: string;
  pages: CreateFormPagePayload[];
  methodology_meta?: MethodologyMeta | null;
  methodology_ids?: string[];
}

export interface SurveyAiBuildResponse {
  reply: string;
  title: string | null;
  pages: Array<{ title: string; fields: CreateFormPagePayload['fields'] }> | null;
  methodology_meta: MethodologyMeta | null;
  methodology_summary: MethodologySummary | null;
}

export const buildSurveyWithAi = async (
  payload: SurveyAiBuildPayload,
): Promise<SurveyAiBuildResponse> => {
  const { data } = await api.post<SurveyAiBuildResponse>('/surveys/ai-builder', payload, {
    timeout: 190_000,
  });
  return data;
};

// ─── Respondent (public) ──────────────────────────────────────────────────────

export type PublicSurveyErrorCode = 'not_found' | 'closed' | 'rate_limited' | 'unknown';

export class PublicSurveyError extends Error {
  code: PublicSurveyErrorCode;
  missing: string[];

  constructor(code: PublicSurveyErrorCode, message: string, missing: string[] = []) {
    super(message);
    this.code = code;
    this.missing = missing;
  }
}

const mapPublicError = (err: unknown): PublicSurveyError => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    if (status === 404) {
      return new PublicSurveyError('not_found', 'Опрос не найден или ещё не опубликован.');
    }
    if (status === 410) {
      return new PublicSurveyError('closed', 'Приём ответов на этот опрос завершён.');
    }
    if (status === 429) {
      return new PublicSurveyError(
        'rate_limited',
        typeof detail === 'string' ? detail : 'Слишком много запросов. Подождите и попробуйте снова.',
      );
    }
    if (status === 422 && detail && typeof detail === 'object') {
      const missing = Array.isArray(detail.missing) ? (detail.missing as string[]) : [];
      return new PublicSurveyError(
        'unknown',
        missing.length
          ? `Ответьте на обязательные вопросы: ${missing.join(', ')}`
          : 'Проверьте ответы и попробуйте ещё раз.',
        missing,
      );
    }
  }
  return new PublicSurveyError('unknown', 'Не удалось выполнить запрос. Попробуйте ещё раз.');
};

export const getPublicSurvey = async (token: string): Promise<PublicSurvey> => {
  try {
    const { data } = await publicApi.get<PublicSurvey>(`/public/surveys/${token}`);
    return data;
  } catch (err) {
    throw mapPublicError(err);
  }
};

export const submitPublicSurvey = async (
  token: string,
  payload: { answers: Record<string, unknown>; duration_seconds?: number },
): Promise<void> => {
  try {
    await publicApi.post(`/public/surveys/${token}/responses`, payload);
  } catch (err) {
    throw mapPublicError(err);
  }
};

export const buildPublicSurveyUrl = (token: string): string =>
  `${window.location.origin}/survey/${token}`;
