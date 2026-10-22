import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Dropdown, Empty, Modal, Spin, Switch, Tabs, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  MessageOutlined,
  MoreOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  archiveSurvey,
  downloadSurveyResponsesCsv,
  generateSurveyAiSummary,
  getSurveyAiSummary,
  getSurveyById,
  getSurveyResults,
  setSurveyStatus,
  type SurveyAiSummary,
  type SurveyDetail,
  type SurveyResults,
} from '../shared/api/surveys.api';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { useNotifications } from '../shared/context/notifications.context';
import { buildDisplayName } from '../shared/utils/userName';
import { MethodologyReportModal } from '../shared/ui/survey/MethodologyReportModal';
import { ShareSurveyModal } from '../shared/ui/survey/ShareSurveyModal';
import { SurveyAiChatPanel } from '../shared/ui/survey/SurveyAiChatPanel';
import { SurveyAnalyticsTab } from '../shared/ui/survey/SurveyAnalyticsTab';
import { SurveyFormTab } from '../shared/ui/survey/SurveyFormTab';
import { SurveyOverviewTab, type SurveyTabKey } from '../shared/ui/survey/SurveyOverviewTab';
import { SurveyResponsesTab } from '../shared/ui/survey/SurveyResponsesTab';
import { SURVEY_STATUS_COLOR, SURVEY_STATUS_LABEL } from './surveyStatus';

const TAB_SEGMENTS: SurveyTabKey[] = ['form', 'responses', 'analytics'];

const aiErrorMessage = (err: unknown): string => {
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
  const { setEntityTitle } = useBreadcrumbEntity();
  const { notifySuccess, notifyError } = useNotifications();

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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

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
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    setEntityTitle(survey?.name ?? null);
  }, [survey?.name, setEntityTitle]);

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

  const handleArchive = async () => {
    if (!survey) return;
    setBusy(true);
    try {
      await archiveSurvey(survey.id);
      notifySuccess('Опрос перемещён в архив');
      navigate('/surveys');
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
    <label
      style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}
    >
      Исключать ответы с замечаниями
      <Switch
        size="small"
        checked={excludeFlagged}
        onChange={(value) => void changeExcludeFlagged(value)}
        disabled={resultsLoading}
      />
    </label>
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            aria-label="Вернуться к списку опросов"
            onClick={() => navigate('/surveys')}
          />
          <h1 style={{ margin: 0, fontSize: 22, wordBreak: 'break-word' }}>{survey.name}</h1>
          <Tag color={SURVEY_STATUS_COLOR[survey.status]} style={{ margin: 0 }}>
            {SURVEY_STATUS_LABEL[survey.status]}
          </Tag>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!isArchived && (
              <Button type="primary" icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)}>
                Поделиться
              </Button>
            )}
            <Button icon={<MessageOutlined />} onClick={() => setChatOpen(true)}>
              Спросить ИИ
            </Button>
            <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']} placement="bottomRight">
              <Button icon={<MoreOutlined />} aria-label="Другие действия" loading={busy} />
            </Dropdown>
          </div>
        </div>
        <div style={{ marginTop: 4, marginLeft: 44, fontSize: 12, color: 'var(--app-text-secondary)' }}>
          {survey.anonymous ? 'Анонимный опрос' : 'Опрос не анонимный'} · Автор:{' '}
          {survey.author ? buildDisplayName(survey.author) : 'неизвестен'}
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => navigate(tabPath(key as SurveyTabKey))}
        items={[
          {
            key: 'overview',
            label: 'Обзор',
            children: results ? (
              <SurveyOverviewTab
                survey={survey}
                results={results}
                onShare={() => setShareOpen(true)}
                onOpenTab={(tab) => navigate(tabPath(tab))}
              />
            ) : null,
          },
          {
            key: 'form',
            label: 'Форма',
            children: (
              <SurveyFormTab
                survey={survey}
                onEdit={() => navigate(`${base}/edit`)}
                onOpenReport={() => setReportOpen(true)}
              />
            ),
          },
          {
            key: 'responses',
            label: `Ответы (${totalResponses})`,
            children: (
              <SurveyResponsesTab
                surveyId={survey.id}
                pages={survey.pages}
                selectedId={selectedResponseId}
                onOpen={(responseId) => navigate(`${base}/responses/${responseId}`)}
                onCloseDetail={() => navigate(`${base}/responses`)}
                onDownloadCsv={() => void downloadCsv()}
              />
            ),
          },
          {
            key: 'analytics',
            label: 'Аналитика',
            children: !results ? null : results.total === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Аналитика появится после первых ответов"
              />
            ) : (
              <Spin spinning={resultsLoading}>
                {qualityFilter}
                <SurveyAnalyticsTab
                  surveyId={survey.id}
                  results={results}
                  excludeFlagged={excludeFlagged}
                  aiSummary={aiSummary}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  onGenerateAiSummary={(force) => void generateAiSummary(force)}
                />
              </Spin>
            ),
          },
        ]}
      />

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
      />

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
