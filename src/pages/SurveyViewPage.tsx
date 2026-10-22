import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Spin, Table, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  EditOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

import {
  archiveSurvey,
  buildPublicSurveyUrl,
  downloadSurveyResponsesCsv,
  generateSurveyAiSummary,
  getSurveyAiSummary,
  getSurveyById,
  getSurveyResponses,
  getSurveyResults,
  setSurveyStatus,
  type SurveyAiSummary,
  type SurveyDetail,
  type SurveyResponseItem,
  type SurveyResponsesPage,
  type SurveyResults,
} from '../shared/api/surveys.api';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { useNotifications } from '../shared/context/notifications.context';
import { buildDisplayName } from '../shared/utils/userName';
import { MethodologySummaryCard } from '../shared/ui/survey/MethodologySummaryCard';
import { MethodologyReportModal } from '../shared/ui/survey/MethodologyReportModal';
import { SurveyAiChatPanel } from '../shared/ui/survey/SurveyAiChatPanel';
import { SurveyOverviewTab } from '../shared/ui/survey/SurveyOverviewTab';
import { SurveyQuantTab } from '../shared/ui/survey/SurveyQuantTab';
import { SurveySummaryBar } from '../shared/ui/survey/SurveySummaryBar';
import { formatDuration } from '../shared/ui/survey/surveyFormat';
import {
  SURVEY_STATUS_COLOR,
  SURVEY_STATUS_LABEL,
  formatSurveyDate,
} from './surveyStatus';

const FLAG_LABEL: Record<string, string> = {
  failed_attention_check: 'Не прошёл проверку внимания',
  too_fast: 'Слишком быстро',
};

type AnalysisTab = 'overview' | 'quant' | 'responses';

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
  const { setEntityTitle } = useBreadcrumbEntity();
  const { notifySuccess, notifyError } = useNotifications();

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [responses, setResponses] = useState<SurveyResponsesPage | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [excludeFlagged, setExcludeFlagged] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
  const [aiSummary, setAiSummary] = useState<SurveyAiSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [detail, page, aggregated, summary] = await Promise.all([
        getSurveyById(id),
        getSurveyResponses(id, { limit: 50 }),
        getSurveyResults(id, true),
        // A missing summary is not an error — it just was not generated yet
        getSurveyAiSummary(id).catch(() => null),
      ]);
      setSurvey(detail);
      setResponses(page);
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

  const generateAiReport = () => {
    setActiveTab('overview');
    void generateAiSummary(false);
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

  const copyLink = async () => {
    if (!survey) return;
    try {
      await navigator.clipboard.writeText(buildPublicSurveyUrl(survey.public_token));
      notifySuccess('Ссылка скопирована');
    } catch {
      notifyError('Не удалось скопировать ссылку');
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
  const link = buildPublicSurveyUrl(survey.public_token);
  const responsesCount = responses?.total ?? 0;

  const columns: ColumnsType<SurveyResponseItem> = [
    {
      title: 'Получен',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      render: (value: string) => formatSurveyDate(value),
    },
    {
      title: 'Время заполнения',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (value: number | null) => formatDuration(value),
    },
    {
      title: 'Качество',
      dataIndex: 'quality_flags',
      key: 'quality_flags',
      render: (flags: SurveyResponseItem['quality_flags']) => {
        const active = Object.entries(flags ?? {}).filter(([, v]) => v);
        return active.length === 0 ? (
          <Tag color="green">Без замечаний</Tag>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {active.map(([key]) => (
              <Tag key={key} color="orange">
                {FLAG_LABEL[key] ?? key}
              </Tag>
            ))}
          </div>
        );
      },
    },
  ];

  const responsesContent = (
    <>
      {responses && responses.flagged > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Ответов с замечаниями по качеству: ${responses.flagged}`}
          description="Проверка внимания или слишком быстрое заполнение. В анализе такие ответы исключены, пока включён переключатель; флаги есть в выгрузке CSV."
        />
      )}
      <Table<SurveyResponseItem>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={responses?.items ?? []}
        locale={{ emptyText: 'Ответов пока нет.' }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
      />
      {responses && responses.total > responses.items.length && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Показаны последние {responses.items.length} ответов. Все ответы — в выгрузке CSV.
        </div>
      )}
    </>
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          aria-label="Вернуться к списку опросов"
          onClick={() => navigate('/surveys')}
        />
        <h1 style={{ margin: 0, fontSize: 22 }}>{survey.name}</h1>
        <Tag color={SURVEY_STATUS_COLOR[survey.status]}>{SURVEY_STATUS_LABEL[survey.status]}</Tag>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isArchived && (
            <>
              <Button
                icon={<EditOutlined />}
                onClick={() => navigate(`/surveys/${survey.id}/edit`)}
                disabled={busy}
              >
                Изменить
              </Button>
              {survey.status === 'open' ? (
                <Button onClick={() => void changeStatus('closed')} loading={busy}>
                  Остановить приём
                </Button>
              ) : (
                <Button type="primary" onClick={() => void changeStatus('open')} loading={busy}>
                  {survey.status === 'closed' ? 'Открыть снова' : 'Опубликовать'}
                </Button>
              )}
              <Button
                icon={<InboxOutlined />}
                aria-label="В архив"
                title="Переместить в архив"
                onClick={() => setArchiveOpen(true)}
                disabled={busy}
              />
            </>
          )}
        </div>
      </div>

      <Card size="small" title="Ссылка для респондентов">
        {survey.status === 'open' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={link} readOnly aria-label="Ссылка на опрос" />
            <Button icon={<CopyOutlined />} onClick={() => void copyLink()}>
              Копировать
            </Button>
          </div>
        ) : (
          <span style={{ color: 'var(--app-text-secondary)' }}>
            {survey.status === 'draft'
              ? 'Опубликуйте опрос, чтобы получить рабочую ссылку.'
              : survey.status === 'closed'
                ? 'Приём ответов остановлен — ссылка не принимает новые ответы.'
                : 'Опрос в архиве.'}
          </span>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
          {survey.anonymous
            ? 'Опрос анонимный: данные о респонденте не сохраняются.'
            : 'Опрос не анонимный: сохраняются технические данные браузера.'}{' '}
          Автор: {survey.author ? buildDisplayName(survey.author) : 'неизвестен'}.
        </div>
      </Card>

      {survey.methodology_summary && (
        <MethodologySummaryCard
          summary={survey.methodology_summary}
          onOpenReport={() => setReportOpen(true)}
        />
      )}

      <SurveySummaryBar
        survey={survey}
        results={results}
        resultsLoading={resultsLoading}
        excludeFlagged={excludeFlagged}
        onExcludeFlaggedChange={(value) => void changeExcludeFlagged(value)}
        aiLoading={aiLoading}
        onCopyLink={() => void copyLink()}
        onDownloadCsv={() => void downloadCsv()}
        onGenerateAiReport={generateAiReport}
        onOpenChat={() => setChatOpen(true)}
      />

      <Card size="small" title="Анализ результатов">
        {!results ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Spin />
          </div>
        ) : results.total === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ответов пока нет" />
        ) : (
          <Spin spinning={resultsLoading}>
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as AnalysisTab)}
              items={[
                {
                  key: 'overview',
                  label: 'Обзор',
                  children: (
                    <SurveyOverviewTab
                      results={results}
                      aiSummary={aiSummary}
                      aiLoading={aiLoading}
                      aiError={aiError}
                      onGenerateAiSummary={(force) => void generateAiSummary(force)}
                    />
                  ),
                },
                {
                  key: 'quant',
                  label: 'Количественный анализ',
                  children: (
                    <SurveyQuantTab
                      surveyId={survey.id}
                      results={results}
                      excludeFlagged={excludeFlagged}
                    />
                  ),
                },
                {
                  key: 'responses',
                  label: `Ответы (${responsesCount})`,
                  children: responsesContent,
                },
              ]}
            />
          </Spin>
        )}
      </Card>

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
        okButtonProps={{ danger: true, loading: busy }}
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
