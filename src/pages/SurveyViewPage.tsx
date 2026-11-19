import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Dropdown, Empty, Grid, Modal, Spin, Switch, Tabs, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  InboxOutlined,
  MoreOutlined,
  ShareAltOutlined,
  ThunderboltOutlined,
  RobotOutlined,
} from '../shared/ui/materialIcons';
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
import { useOrganization } from '../shared/hooks/organization.hooks';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import { AiConsentModal } from '../shared/ui/survey/AiConsentModal';
import { hasAiConsent, rememberAiConsent } from '../shared/ui/survey/aiConsent';
import { MethodologyReportModal } from '../shared/ui/survey/MethodologyReportModal';
import { ShareSurveyModal } from '../shared/ui/survey/ShareSurveyModal';
import { SurveyAiChatPanel } from '../shared/ui/survey/SurveyAiChatPanel';
import { SurveyAnalyticsTab } from '../shared/ui/survey/SurveyAnalyticsTab';
import { SurveyFormTab } from '../shared/ui/survey/SurveyFormTab';
import { SurveyOverviewTab } from '../shared/ui/survey/SurveyOverviewTab';
import { SurveyResponsesTab } from '../shared/ui/survey/SurveyResponsesTab';
import { SurveyPublicationTab } from '../shared/ui/survey/SurveyPublicationTab';
import { researchRoute, researchViewPath, type ResearchView } from '../shared/utils/researchNavigation';
import { PublicFormSkeleton, SurveyViewSkeleton } from '../shared/ui/skeletons/PageSkeletons';
import { SURVEY_STATUS_COLOR, SURVEY_STATUS_LABEL } from './surveyStatus';
import './SurveyViewPage.glass.css';

// Test skin from docs/prototypes/agent-ui.html: ?glass=1 turns it on (and is remembered), ?glass=0 turns it off
const GLASS_KEY = 'svod-survey-glass';

const useSurveyGlass = (search: string): boolean => {
  const flag = new URLSearchParams(search).get('glass');
  useEffect(() => {
    try {
      if (flag === '1') localStorage.setItem(GLASS_KEY, '1');
      else if (flag === '0') localStorage.removeItem(GLASS_KEY);
    } catch {
      /* private mode: the flag then lives only in the address */
    }
  }, [flag]);
  if (flag === '1') return true;
  if (flag === '0') return false;
  try {
    return localStorage.getItem(GLASS_KEY) === '1';
  } catch {
    return false;
  }
};

// The respondent form (and its form runtime) is needed only when the author opens the preview
const PublicSurveyPage = lazy(() => import('./PublicSurveyPage').then((m) => ({ default: m.PublicSurveyPage })));

const TAB_ORDER: ResearchView[] = ['overview', 'form', 'publication', 'responses', 'analytics', 'insights'];

/** Starter questions for «Спросить ИИ» that fit the tab the user is looking at */
const AI_SUGGESTIONS: Partial<Record<ResearchView, string[]>> = {
  overview: [
    'Какие главные выводы по результатам опроса?',
    'Какие выводы можно сделать, а какие пока нельзя?',
    'Какие вопросы чаще всего пропускали?',
  ],
  form: [
    'Какие главные выводы по результатам опроса?',
    'Какие вопросы чаще всего пропускали?',
    'Чем различаются ответы разных групп респондентов?',
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
  const { id } = useParams<{ id: string }>();
  const { activeOrganization } = useOrganization();
  return <SurveyViewContent key={`${activeOrganization?.id}:${id}`} />;
};

const SurveyViewContent = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { pathname, search, hash } = useLocation();
  const glass = useSurveyGlass(search);
  const { setEntityTitle, setEntityParent } = useBreadcrumbEntity();
  const { notifySuccess, notifyError } = useNotifications();
  const { canEdit, activeOrganization } = useOrganization();
  const { step: tourStep, next: tourNext } = useTour();
  const [demoBusy, setDemoBusy] = useState(false);

  // /surveys/:id[/form|/responses[/:responseId]|/analytics] — the tab lives in the address
  const route = researchRoute(pathname);
  const activeTab = route.view;
  const selectedResponseId = route.responseId ?? null;

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<SurveyAiSummary | null>(null);
  const { refresh: refreshSubscription } = useSubscription();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  // Tabs opened at least once stay mounted (hidden), keeping their filters and paging
  const [visitedTabs, setVisitedTabs] = useState<Set<ResearchView>>(() => new Set([activeTab]));
  if (!visitedTabs.has(activeTab)) setVisitedTabs(new Set(visitedTabs).add(activeTab));
  // An action that needs the researcher's OK to send the survey data to the external AI
  const [pendingAi, setPendingAi] = useState<(() => void) | null>(null);
  const isMobile = Grid.useBreakpoint().md === false;
  const controlSize = isMobile ? 'large' : 'middle';
  useEffect(() => {
    if (activeTab !== 'analytics' || !hash || loading) return;
    let target: string;
    try { target = decodeURIComponent(hash.slice(1)); } catch { return; }
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [activeTab, hash, loading, results]);

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
        getSurveyResults(id, true).catch(() => null),
        // A missing summary is not an error — it just was not generated yet
        getSurveyAiSummary(id).catch(() => null),
      ]);
      setSurvey(detail);
      setResults(aggregated);
      setAiSummary(summary);
      setExcludeFlagged(true);
      setError(null);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403 || status === 404
          ? 'Опрос недоступен: он удалён или принадлежит другому аккаунту.'
          : err instanceof Error
            ? err.message
            : 'Не удалось загрузить опрос',
      );
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

  if (!route.known) return <Navigate to={`/surveys/${id}`} replace />;

  if (loading) return <SurveyViewSkeleton />;

  if (error || !survey) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error ?? 'Опрос не найден'} action={<Button onClick={() => { setLoading(true); void load(); }}>Повторить</Button>} />
      </div>
    );
  }
  if (survey.organization_id !== activeOrganization?.id) return <Alert type="warning" showIcon message="Исследование находится в другом пространстве" description="Выберите нужную команду или вернитесь к проектам текущего пространства." action={<Button onClick={() => navigate(IS_SURVEYS_APP ? '/surveys/projects' : '/surveys')}>К проектам</Button>} />;

  const isArchived = survey.status === 'archived';
  const base = `/surveys/${survey.id}`;
  // A reader looks at the survey and its results: no changes, no AI
  const canChange = canEdit;
  const tabPath = (tab: ResearchView) => researchViewPath(survey.id, tab);
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
    ...(statusAction && canChange ? [{ key: 'publication', label: 'Управление публикацией' }] : []),
    { key: 'csv', label: 'Скачать ответы (CSV)', disabled: totalResponses === 0 },
    ...(isArchived || !canChange
      ? []
      : [{ type: 'divider' as const }, { key: 'archive', label: 'В архив', danger: true }]),
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'archive') setArchiveOpen(true);
    else if (key === 'csv') void downloadCsv();
    else if (key === 'publication') navigate(tabPath('publication'));
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
    { key: 'analytics', label: <span data-tour="tab-analytics">Вопросы</span> },
    { key: 'responses', label: <span data-tour="tab-responses">{`Ответы (${totalResponses})`}</span> },
    { key: 'insights', label: 'ИИ-инсайты' },
  ];

  const resultError = <Alert type="error" showIcon message="Не удалось загрузить результаты" action={<Button onClick={() => void load()}>Повторить</Button>} />;
  const openQuestion = (questionId: string) => {
    navigate(`${tabPath('analytics')}#question-${encodeURIComponent(questionId)}`);
  };
  const analyticsPanel = (view: 'questions' | 'insights') => !results ? resultError : results.total === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Результаты появятся после первых ответов" /> : (
    <Spin spinning={resultsLoading}><SurveyAnalyticsTab view={view} readOnly={!canChange} onOpenQuestion={openQuestion} qualityControl={qualityFilter} surveyId={survey.id} results={results} excludeFlagged={excludeFlagged} aiSummary={aiSummary} aiLoading={aiLoading} aiError={aiError} onGenerateAiSummary={(force) => withAiConsent(() => void generateAiSummary(force))} onOpenResponse={(responseId) => navigate(`${tabPath('responses')}/${responseId}`)} /></Spin>
  );
  const panels: Record<ResearchView, ReactNode> = {
    overview: results ? (
      <SurveyOverviewTab
        survey={survey}
        results={results}
        onShare={() => setShareOpen(true)}
        onOpenTab={(tab) => navigate(tabPath(tab))}
      />
    ) : resultError,
    publication: <SurveyPublicationTab key={survey.id} survey={survey} canEdit={canChange} busy={busy} onPreview={() => setPreviewOpen(true)} onChangeStatus={(status) => void changeStatus(status)} />,
    form: (
      <SurveyFormTab
        survey={survey}
        onEdit={() => navigate(`${base}/edit`)}
        readOnly={!canChange}
        onPreview={() => setPreviewOpen(true)}
        onOpenReport={() => setReportOpen(true)}
      />
    ),
    responses: (
      <SurveyResponsesTab
        surveyId={survey.id}
        totalCount={totalResponses}
        selectedId={selectedResponseId}
        onOpen={(responseId) => navigate(`${tabPath('responses')}/${responseId}`)}
        onCloseDetail={() => navigate(tabPath('responses'))}
        onDownloadCsv={() => void downloadCsv()}
      />
    ),
    analytics: analyticsPanel('questions'),
    insights: analyticsPanel('insights'),
  };

  const backToProject = (
      <Button type="text" className="survey-page__back-link" onClick={() => navigate(`/surveys/projects/${survey.project_id}`)}>
        Вернуться к проекту
      </Button>
  );
  const surveyStatus = (
      <Tag color={SURVEY_STATUS_COLOR[survey.status]} className={`survey-page__status survey-page__status--${survey.status}`}>
        {SURVEY_STATUS_LABEL[survey.status]}
      </Tag>
  );
  const surveyActions = (
    <div className="survey-page__actions">
      {tourStep === 'demo' && <Button type="primary" size={controlSize} icon={<ThunderboltOutlined />} data-tour="demo-responses" loading={demoBusy} onClick={() => void generateDemo()}>Сгенерировать тестовые ответы</Button>}
      {canChange && <Button icon={<RobotOutlined />} aria-pressed={aiOpen} onClick={() => setAiOpen((value) => !value)}>{aiOpen ? 'Скрыть ИИ' : 'Спросить ИИ'}</Button>}
      {!isArchived && <Button type="primary" size={controlSize} icon={<ShareAltOutlined />} data-tour="share-survey" onClick={() => setShareOpen(true)}>Поделиться</Button>}
      <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']} placement="bottomRight">
        <Button size={controlSize} icon={<MoreOutlined />} aria-label="Другие действия" loading={busy} />
      </Dropdown>
    </div>
  );

  return (
    <div className={`survey-page survey-page--agent-layout research-workspace${glass ? ' survey-page--glass' : ''}`}>
      {glass && (
        <div className="sg-aurora" aria-hidden="true">
          <i className="sg-aurora__beam" />
          <i className="sg-aurora__streak" />
          <i className="sg-aurora__core" />
          <i className="sg-aurora__floor" />
        </div>
      )}
      <div className="survey-page__main">
      <header className="survey-page__header">
        <div className="research-workspace__heading survey-page__container">
          {backToProject}
          <h1>{survey.name}</h1>
          {surveyStatus}
          {surveyActions}
        </div>

        {/* The tab bar lives in the header (like the registry pages); the panels are below */}
        <div className="survey-page__container">
          <Tabs activeKey={route.section} onChange={(section) => navigate(section === 'builder' ? tabPath('form') : section === 'publication' ? tabPath('publication') : tabPath('overview'))} items={[{ key: 'builder', label: 'Конструктор' }, { key: 'publication', label: 'Публикация' }, { key: 'results', label: 'Результаты' }]} />
          {route.section === 'results' &&
          <Tabs
            className="survey-page__tabs"
            activeKey={activeTab}
            onChange={(key) => navigate(tabPath(key as ResearchView))}
            items={tabItems}
          />}
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
      </div>

      {canChange && <SurveyAiChatPanel
        key={survey.id}
        dock={!isMobile}
        agentContext={{
          name: survey.name,
          meta: [
            SURVEY_STATUS_LABEL[survey.status],
            `${survey.questions_count} вопр.`,
            survey.methodology_names?.join(' + '),
          ]
            .filter(Boolean)
            .join(' · '),
        }}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        requestConsent={withAiConsent}
        surveyId={survey.id}
        excludeFlagged={excludeFlagged}
        suggestions={AI_SUGGESTIONS[activeTab]}
      />}

      <Modal
        open={previewOpen}
        footer={null}
        centered
        destroyOnClose
        width={1000}
        className="survey-preview-modal"
        title={null}
        closable={false}
        styles={{ container: { padding: 0, overflow: 'hidden' }, body: { padding: 0 } }}
        onCancel={() => setPreviewOpen(false)}
      >
        <Suspense fallback={<PublicFormSkeleton embedded />}>
          <PublicSurveyPage preview surveyId={survey.id} onClose={() => setPreviewOpen(false)} />
        </Suspense>
      </Modal>
      <ShareSurveyModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        publicToken={survey.public_token}
        status={survey.status}
        onPublish={() => void changeStatus('open')}
        publishing={busy}
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
