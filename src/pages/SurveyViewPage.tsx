import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Dropdown, Empty, Grid, Modal, Spin, Switch, Tabs, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  MessageOutlined,
  MoreOutlined,
  ShareAltOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  archiveSurvey,
  downloadSurveyResponsesCsv,
  generateDemoResponses,
  generateSurveyAiSummary,
  getSurveyAiSummary,
  getSurveyById,
  getSurveyResults,
  setSurveyStatus,
  type SurveyAiSummary,
  type SurveyDetail,
  type SurveyResults,
} from '../shared/api/surveys.api';
import { useSubscription } from '../shared/hooks/subscription.hooks';
import { billingErrorMessage } from '../shared/lib/billingErrors';
import { useTour } from '../components/tour/useTour';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { useNotifications } from '../shared/context/notifications.context';
import { AiConsentModal } from '../shared/ui/survey/AiConsentModal';
import { hasAiConsent, rememberAiConsent } from '../shared/ui/survey/aiConsent';
import { MethodologyReportModal } from '../shared/ui/survey/MethodologyReportModal';
import { ShareSurveyModal } from '../shared/ui/survey/ShareSurveyModal';
import { SurveyAiChatPanel } from '../shared/ui/survey/SurveyAiChatPanel';
import { SurveyAnalyticsTab } from '../shared/ui/survey/SurveyAnalyticsTab';
import { SurveyFormTab } from '../shared/ui/survey/SurveyFormTab';
import { SurveyOverviewTab, type SurveyTabKey } from '../shared/ui/survey/SurveyOverviewTab';
import { SurveyResponsesTab } from '../shared/ui/survey/SurveyResponsesTab';
import { SURVEY_STATUS_COLOR, SURVEY_STATUS_LABEL } from './surveyStatus';

const TAB_SEGMENTS: SurveyTabKey[] = ['form', 'responses', 'analytics'];
const TAB_ORDER: SurveyTabKey[] = ['overview', 'form', 'responses', 'analytics'];

/** Starter questions for «Спросить ИИ» that fit the tab the user is looking at */
const AI_SUGGESTIONS: Record<SurveyTabKey, string[]> = {
  overview: [
    'Какие главные выводы по результатам опроса?',
    'Какие выводы можно сделать, а какие пока нельзя?',
    'Какие вопросы чаще всего пропускали?',
  ],
  form: [
    'Помоги улучшить формулировки вопросов этой анкеты',
    'Нет ли в анкете наводящих или двойных вопросов?',
    'Каких вопросов не хватает, чтобы ответить на цель исследования?',
  ],
  responses: [
    'Какие вопросы чаще всего пропускали?',
    'Покажи основные проблемы из текстовых ответов',
    'Чем различаются ответы разных групп респондентов?',
  ],
  analytics: [
    'Какие главные выводы по результатам опроса?',
    'Чем различаются ответы разных групп респондентов?',
    'Что чаще всего критикуют в открытых ответах? Приведи цитаты',
  ],
};

const aiErrorMessage = (err: unknown): string => {
  const billing = billingErrorMessage(err);
  if (billing) return billing;
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (detail === 'no_responses') return 'Пока нет ответов для анализа.';
    if (typeof detail === 'string') return detail;
    if (err.code === 'ECONNABORTED') return 'ИИ отвечает слишком долго. Попробуйте ещё раз.';
  }
  return 'Не удалось получить ответ ИИ. Попробуйте ещё раз.';
};

export const SurveyViewPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const { setEntityTitle, setEntityParent } = useBreadcrumbEntity();
  const { notifySuccess, notifyError } = useNotifications();
  const { step: tourStep, next: tourNext } = useTour();
  const [demoBusy, setDemoBusy] = useState(false);

  // /surveys/:id[/form|/responses[/:responseId]|/analytics] — the tab lives in the address
  const [, , , tabSegment, responseSegment] = pathname.split('/');
  const tabIsKnown = !tabSegment || (TAB_SEGMENTS as string[]).includes(tabSegment);
  const activeTab: SurveyTabKey = tabIsKnown && tabSegment ? (tabSegment as SurveyTabKey) : 'overview';
  const selectedResponseId = activeTab === 'responses' && responseSegment ? responseSegment : null;

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [excludeFlagged, setExcludeFlagged] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<SurveyAiSummary | null>(null);
  const { refresh: refreshSubscription } = useSubscription();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  // Tabs opened at least once stay mounted (hidden), keeping their filters and paging
  const [visitedTabs, setVisitedTabs] = useState<Set<SurveyTabKey>>(() => new Set([activeTab]));
  if (!visitedTabs.has(activeTab)) setVisitedTabs(new Set(visitedTabs).add(activeTab));
  // An action that needs the researcher's OK to send the survey data to the external AI
  const [pendingAi, setPendingAi] = useState<(() => void) | null>(null);
  const isMobile = Grid.useBreakpoint().md === false;
  const controlSize = isMobile ? 'large' : 'middle';

  const withAiConsent = (action: () => void) => {
    if (id && hasAiConsent(id)) action();
    else setPendingAi(() => action);
  };

  const confirmAi = () => {
    if (id) rememberAiConsent(id);
    pendingAi?.();
    setPendingAi(null);
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [detail, aggregated, summary] = await Promise.all([
        getSurveyById(id),
        getSurveyResults(id, true),
        // A missing summary is not an error — it just was not generated yet
        getSurveyAiSummary(id).catch(() => null),
      ]);
      setSurvey(detail);
      setResults(aggregated);
      setAiSummary(summary);
      setExcludeFlagged(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить опрос');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const changeExcludeFlagged = async (value: boolean) => {
    if (!id) return;
    setExcludeFlagged(value);
    setResultsLoading(true);
    try {
      setResults(await getSurveyResults(id, value));
    } catch {
      setExcludeFlagged(!value);
      notifyError('Не удалось обновить результаты');
    } finally {
      setResultsLoading(false);
    }
  };

  const generateAiSummary = async (force: boolean) => {
    if (!survey) return;
    setAiLoading(true);
    setAiError(null);
    try {
      setAiSummary(await generateSurveyAiSummary(survey.id, { excludeFlagged, force }));
    } catch (err) {
      setAiError(aiErrorMessage(err));
    } finally {
      setAiLoading(false);
      void refreshSubscription();
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    setEntityTitle(survey?.name ?? null);
  }, [survey?.name, setEntityTitle]);

  const projectId = survey?.project_id;
  const projectName = survey?.project_name;
  useEffect(() => {
    setEntityParent(
      projectId && projectName
        ? { title: projectName, path: `/surveys/projects/${projectId}` }
        : null,
    );
  }, [projectId, projectName, setEntityParent]);

  const changeStatus = async (status: 'draft' | 'open' | 'closed') => {
    if (!survey) return;
    setBusy(true);
    try {
      const updated = await setSurveyStatus(survey.id, status);
      setSurvey(updated);
      notifySuccess(
        status === 'open'
          ? 'Опрос опубликован'
          : status === 'closed'
            ? 'Приём ответов остановлен'
            : 'Опрос возвращён в черновики',
      );
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      notifyError(
        'Не удалось изменить статус',
        detail === 'survey_has_no_questions' ? 'В опросе нет вопросов.' : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  /** Guided tour only: test answers, so that the person has something to analyse right away */
  const generateDemo = async () => {
    if (!survey) return;
    setDemoBusy(true);
    try {
      await generateDemoResponses(survey.id);
      await load();
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      if (detail === 'survey_has_responses') {
        // Real answers are never mixed with test ones: carry on with what the survey already has
        notifySuccess('В опросе уже есть ответы', 'Продолжим с ними');
        tourNext();
      } else {
        notifyError(
          'Не удалось создать тестовые ответы',
          detail === 'survey_not_published' ? 'Сначала опубликуйте опрос.' : undefined,
        );
      }
    } finally {
      setDemoBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!survey) return;
    setBusy(true);
    try {
      await archiveSurvey(survey.id);
      notifySuccess('Опрос перемещён в архив');
      navigate(`/surveys/projects/${survey.project_id}`);
    } catch {
      notifyError('Не удалось переместить опрос в архив');
      setBusy(false);
    }
  };

  const downloadCsv = async () => {
    if (!survey) return;
    try {
      await downloadSurveyResponsesCsv(survey.id, survey.name);
    } catch {
      notifyError('Не удалось скачать ответы');
    }
  };

  if (!tabIsKnown) return <Navigate to={`/surveys/${id}`} replace />;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error ?? 'Опрос не найден'} />
      </div>
    );
  }

  const isArchived = survey.status === 'archived';
  const base = `/surveys/${survey.id}`;
  const tabPath = (tab: SurveyTabKey) => (tab === 'overview' ? base : `${base}/${tab}`);
  const totalResponses = results?.total ?? survey.responses_count;

  const statusAction: { key: string; label: string; status: 'draft' | 'open' | 'closed' } | null =
    survey.status === 'open'
      ? { key: 'close', label: 'Остановить приём', status: 'closed' }
      : survey.status === 'closed'
        ? { key: 'reopen', label: 'Открыть снова', status: 'open' }
        : survey.status === 'draft'
          ? { key: 'publish', label: 'Опубликовать', status: 'open' }
          : null;

  const menuItems: MenuProps['items'] = [
    ...(statusAction ? [{ key: statusAction.key, label: statusAction.label }] : []),
    { key: 'csv', label: 'Скачать ответы (CSV)', disabled: totalResponses === 0 },
    ...(isArchived ? [] : [{ type: 'divider' as const }, { key: 'archive', label: 'В архив', danger: true }]),
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'archive') setArchiveOpen(true);
    else if (key === 'csv') void downloadCsv();
    else if (statusAction && key === statusAction.key) void changeStatus(statusAction.status);
  };

  const qualityFilter = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      Исключать ответы с серьёзными замечаниями
      <Switch
        size="small"
        checked={excludeFlagged}
        onChange={(value) => void changeExcludeFlagged(value)}
        disabled={resultsLoading}
      />
    </label>
  );

  const tabItems = [
    { key: 'overview', label: 'Обзор' },
    { key: 'form', label: 'Вопросы' },
    { key: 'responses', label: <span data-tour="tab-responses">{`Ответы (${totalResponses})`}</span> },
    { key: 'analytics', label: <span data-tour="tab-analytics">Аналитика</span> },
  ];

  const panels: Record<SurveyTabKey, ReactNode> = {
    overview: results ? (
      <SurveyOverviewTab
        survey={survey}
        results={results}
        onShare={() => setShareOpen(true)}
        onOpenTab={(tab) => navigate(tabPath(tab))}
      />
    ) : null,
    form: (
      <SurveyFormTab
        survey={survey}
        onEdit={() => navigate(`${base}/edit`)}
        onPreview={() => navigate(`${base}/preview`)}
        onOpenReport={() => setReportOpen(true)}
      />
    ),
    responses: (
      <SurveyResponsesTab
        surveyId={survey.id}
        totalCount={totalResponses}
        selectedId={selectedResponseId}
        onOpen={(responseId) => navigate(`${base}/responses/${responseId}`)}
        onCloseDetail={() => navigate(`${base}/responses`)}
        onDownloadCsv={() => void downloadCsv()}
      />
    ),
    analytics: !results ? null : results.total === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Аналитика появится после первых ответов" />
    ) : (
      <Spin spinning={resultsLoading}>
        <SurveyAnalyticsTab
          qualityControl={qualityFilter}
          surveyId={survey.id}
          results={results}
          excludeFlagged={excludeFlagged}
          aiSummary={aiSummary}
          aiLoading={aiLoading}
          aiError={aiError}
          onGenerateAiSummary={(force) => withAiConsent(() => void generateAiSummary(force))}
          onOpenResponse={(responseId) => navigate(`${base}/responses/${responseId}`)}
        />
      </Spin>
    ),
  };

  return (
    <div className="survey-page">
      <header className="survey-page__header">
        <div className="survey-page__container">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            aria-label="Вернуться к проекту"
            onClick={() => navigate(`/surveys/projects/${survey.project_id}`)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '0 1 auto' }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.3, wordBreak: 'break-word', color: 'var(--app-text)' }}>{survey.name}</h1>
            <Tag
              color={SURVEY_STATUS_COLOR[survey.status]}
              style={{ margin: 0, flex: 'none', lineHeight: '22px' }}
            >
              {SURVEY_STATUS_LABEL[survey.status]}
            </Tag>
          </div>
          <div
            style={{
              marginLeft: isMobile ? 0 : 'auto',
              width: isMobile ? '100%' : undefined,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {tourStep === 'demo' && (
              <Button
                type="primary"
                size={controlSize}
                icon={<ThunderboltOutlined />}
                data-tour="demo-responses"
                loading={demoBusy}
                onClick={() => void generateDemo()}
              >
                Сгенерировать тестовые ответы
              </Button>
            )}
            {!isArchived && (
              <Button
                type="primary"
                size={controlSize}
                icon={<ShareAltOutlined />}
                data-tour="share-survey"
                onClick={() => setShareOpen(true)}
              >
                Поделиться
              </Button>
            )}
            <Button
              size={controlSize}
              icon={<MessageOutlined />}
              onClick={() => withAiConsent(() => setChatOpen(true))}
            >
              Спросить ИИ
            </Button>
            <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']} placement="bottomRight">
              <Button size={controlSize} icon={<MoreOutlined />} aria-label="Другие действия" loading={busy} />
            </Dropdown>
          </div>
        </div>
        </div>

        {/* The tab bar lives in the header (like the registry pages); the panels are below */}
        <div className="survey-page__container">
          <Tabs
            className="survey-page__tabs"
            activeKey={activeTab}
            onChange={(key) => navigate(tabPath(key as SurveyTabKey))}
            items={tabItems}
          />
        </div>
      </header>

      <div className="survey-page__body">
        <div className="survey-page__container">
          {/* Visited tabs stay mounted, so filters and pages survive a switch of tabs */}
          {TAB_ORDER.filter((key) => visitedTabs.has(key)).map((key) => (
            <div key={key} style={key === activeTab ? undefined : { display: 'none' }}>
              {panels[key]}
            </div>
          ))}
        </div>
      </div>

      <ShareSurveyModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        publicToken={survey.public_token}
        status={survey.status}
        onPublish={() => void changeStatus('open')}
        publishing={busy}
      />

      <SurveyAiChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        surveyId={survey.id}
        excludeFlagged={excludeFlagged}
        suggestions={AI_SUGGESTIONS[activeTab]}
      />

      <AiConsentModal open={pendingAi !== null} onConfirm={confirmAi} onCancel={() => setPendingAi(null)} />

      {reportOpen && (
        <MethodologyReportModal
          open
          onClose={() => setReportOpen(false)}
          surveyName={survey.name}
          methodologyMeta={survey.methodology_meta}
          pages={survey.pages}
        />
      )}

      <Modal
        open={archiveOpen}
        title="Переместить в архив?"
        okText="В архив"
        cancelText="Отмена"
        okButtonProps={{ danger: true, loading: busy, icon: <InboxOutlined /> }}
        onCancel={() => setArchiveOpen(false)}
        onOk={() => void handleArchive()}
      >
        <p>
          Опрос перестанет принимать ответы, ссылка для респондентов перестанет работать.
          Собранные ответы сохранятся.
        </p>
      </Modal>
    </div>
  );
};
