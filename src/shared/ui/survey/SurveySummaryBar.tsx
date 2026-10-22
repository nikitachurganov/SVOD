import { Button, Card, Switch, Tag } from 'antd';
import {
  DownloadOutlined,
  LinkOutlined,
  MessageOutlined,
  RobotOutlined,
} from '@ant-design/icons';

import type { SurveyDetail, SurveyResults } from '../../api/surveys.api';
import { formatDateTime } from './surveyFormat';

interface SurveySummaryBarProps {
  survey: SurveyDetail;
  results: SurveyResults | null;
  resultsLoading: boolean;
  excludeFlagged: boolean;
  onExcludeFlaggedChange: (value: boolean) => void;
  aiLoading: boolean;
  onCopyLink: () => void;
  onDownloadCsv: () => void;
  onGenerateAiReport: () => void;
  onOpenChat: () => void;
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
    <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>{label}</span>
    <strong style={{ fontSize: 14 }}>{value}</strong>
  </div>
);

export const SurveySummaryBar = ({
  survey,
  results,
  resultsLoading,
  excludeFlagged,
  onExcludeFlaggedChange,
  aiLoading,
  onCopyLink,
  onDownloadCsv,
  onGenerateAiReport,
  onOpenChat,
}: SurveySummaryBarProps) => {
  const hasResponses = (results?.total ?? 0) > 0;
  return (
    <Card size="small">
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <Fact label="Начало сбора" value={formatDateTime(results?.first_response_at ?? null)} />
        <Fact label="Последний ответ" value={formatDateTime(results?.last_response_at ?? null)} />
        <Fact label="Ответов" value={String(results?.total ?? survey.responses_count)} />
        {results && results.excluded > 0 && excludeFlagged && (
          <Tag color="orange" style={{ margin: 0 }}>
            Исключено по качеству: {results.excluded}
          </Tag>
        )}
        <label
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}
        >
          Исключать ответы с замечаниями
          <Switch
            size="small"
            checked={excludeFlagged}
            onChange={onExcludeFlaggedChange}
            disabled={resultsLoading}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Button
          icon={<LinkOutlined />}
          onClick={onCopyLink}
          disabled={survey.status !== 'open'}
          title={survey.status === 'open' ? undefined : 'Ссылка работает только у открытого опроса'}
        >
          Поделиться ссылкой
        </Button>
        <Button icon={<DownloadOutlined />} onClick={onDownloadCsv} disabled={!hasResponses}>
          Экспортировать данные (CSV)
        </Button>
        <Button
          type="primary"
          icon={<RobotOutlined />}
          onClick={onGenerateAiReport}
          loading={aiLoading}
          disabled={!hasResponses}
        >
          Сгенерировать AI-отчёт
        </Button>
        <Button icon={<MessageOutlined />} onClick={onOpenChat} disabled={!hasResponses}>
          Спросить ИИ
        </Button>
      </div>
    </Card>
  );
};
