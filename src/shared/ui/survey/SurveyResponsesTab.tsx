import { Fragment, useEffect, useState } from 'react';
import { Button, Empty, Grid, Pagination, Segmented, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, InfoCircleOutlined, RightOutlined } from '@ant-design/icons';

import {
  getSurveyResponses,
  type SurveyResponseItem,
  type SurveyResponsesPage,
} from '../../api/surveys.api';
import { ResponseCard } from './ResponseCard';
import { SurveyResponseDrawer } from './SurveyResponseDrawer';
import {
  QUALITY_STATUS_COLOR,
  QUALITY_STATUS_LABEL,
  dayHeading,
  dayKey,
  formatDateTime,
  formatDuration,
  formatRelative,
} from './surveyFormat';

const PAGE_SIZES = [20, 50, 100];

const shorten = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

type FlagFilter = 'all' | 'flagged' | 'clean';
type Order = 'newest' | 'oldest';

interface SurveyResponsesTabProps {
  surveyId: string;
  /** All responses of the survey, whatever the filter (for the counters of the filter) */
  totalCount: number;
  /** Response opened in the side view (kept in the address bar) */
  selectedId: string | null;
  onOpen: (responseId: string) => void;
  onCloseDetail: () => void;
  onDownloadCsv: () => void;
}

const FilterLabel = ({ text, count }: { text: string; count: number }) => (
  <span className="survey-filter__label">
    {text}
    <span className="survey-filter__count">{count}</span>
  </span>
);

/** Responses as a feed of respondents: newest first, grouped by day, each with what they said */
export const SurveyResponsesTab = ({
  surveyId,
  totalCount,
  selectedId,
  onOpen,
  onCloseDetail,
  onDownloadCsv,
}: SurveyResponsesTabProps) => {
  const isMobile = Grid.useBreakpoint().md === false;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [filter, setFilter] = useState<FlagFilter>('all');
  const [order, setOrder] = useState<Order>('newest');
  const requestKey = `${surveyId}|${page}|${pageSize}|${filter}|${order}`;
  const [answer, setAnswer] = useState<{
    key: string;
    data: SurveyResponsesPage | null;
  } | null>(null);
  // Cards of the previous page stay visible while the next one loads
  const [shown, setShown] = useState<SurveyResponsesPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSurveyResponses(surveyId, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      flagged: filter === 'all' ? undefined : filter === 'flagged',
      order,
    })
      .then((data) => {
        if (cancelled) return;
        setAnswer({ key: requestKey, data });
        setShown(data);
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key: requestKey, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, surveyId, page, pageSize, filter, order]);

  const current = answer?.key === requestKey ? answer : null;
  const loading = current === null;
  const failed = current !== null && current.data === null;
  const flaggedCount = shown?.flagged ?? 0;

  // Consecutive responses of one day go under one heading
  const days: Array<{ key: string; heading: string; items: SurveyResponsesPage['items'] }> = [];
  for (const item of shown?.items ?? []) {
    const key = dayKey(item.submitted_at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, heading: dayHeading(item.submitted_at), items: [item] });
  }

  const columns: ColumnsType<SurveyResponseItem> = [
    {
      title: 'Ответ',
      key: 'number',
      width: 190,
      render: (_: unknown, record) => (
        <div className="survey-resp-who">
          <span
            className={`survey-response__avatar survey-status survey-status--${record.quality_status}`}
            aria-hidden="true"
          >
            {record.number}
          </span>
          <div>
            <strong>№{record.number}</strong>
            <div className="survey-resp-who__meta" title={formatDateTime(record.submitted_at)}>
              {formatRelative(record.submitted_at)}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Что ответил',
      key: 'preview',
      render: (_: unknown, record) => {
        const quote = record.preview.find((item) => item.kind === 'text');
        const values = record.preview.filter((item) => item.kind === 'value');
        if (!quote && values.length === 0) {
          return <span className="survey-resp-empty">Нет заполненных вопросов</span>;
        }
        return (
          <div className="survey-resp-answer">
            {quote && (
              <p className="survey-resp-answer__quote" title={`${quote.label}: ${quote.text}`}>
                «{quote.text}»
              </p>
            )}
            {values.length > 0 && (
              <ul className="survey-response__chips">
                {values.map((item) => (
                  <li key={item.label} title={`${item.label}: ${item.text}`}>
                    <span>{shorten(item.label, 24)}</span>
                    <strong>{shorten(item.text, 36)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      },
    },
    {
      title: 'Получен',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Заполнение',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      width: 130,
      render: (value: number | null) => formatDuration(value),
    },
    {
      title: 'Качество',
      dataIndex: 'quality_status',
      key: 'quality_status',
      width: 160,
      render: (status: SurveyResponseItem['quality_status']) => (
        <Tag color={QUALITY_STATUS_COLOR[status]} style={{ margin: 0 }}>
          {QUALITY_STATUS_LABEL[status]}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'open',
      width: 44,
      align: 'right',
      render: () => <RightOutlined className="survey-resp-chevron" aria-hidden="true" />,
    },
  ];

  const emptyText =
    filter === 'all'
      ? 'Пока никто не ответил. Когда респонденты начнут отвечать, здесь появятся их ответы — отправьте им ссылку через кнопку «Поделиться».'
      : 'Под этот фильтр ответов нет.';

  const changePaging = (nextPage: number, nextSize: number) => {
    setPage(nextSize !== pageSize ? 1 : nextPage);
    setPageSize(nextSize);
  };

  return (
    <div className="survey-feed">
      <div className="survey-feed__toolbar">
        <Segmented<FlagFilter>
          className="survey-filter"
          block={isMobile}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          options={[
            { label: <FilterLabel text="Все" count={totalCount} />, value: 'all' },
            { label: <FilterLabel text="С замечаниями" count={flaggedCount} />, value: 'flagged' },
            {
              label: <FilterLabel text="Без замечаний" count={Math.max(0, totalCount - flaggedCount)} />,
              value: 'clean',
            },
          ]}
          aria-label="Фильтр по замечаниям качества"
        />
        <div className="survey-feed__tools">
          <Select<Order>
            value={order}
            onChange={(value) => {
              setOrder(value);
              setPage(1);
            }}
            style={{ minWidth: 160 }}
            aria-label="Порядок ответов"
            options={[
              { label: 'Сначала новые', value: 'newest' },
              { label: 'Сначала старые', value: 'oldest' },
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={onDownloadCsv} disabled={totalCount === 0}>
            Скачать CSV
          </Button>
        </div>
      </div>

      {flaggedCount > 0 && filter === 'all' && (
        <p className="survey-feed__note">
          <InfoCircleOutlined aria-hidden="true" />
          <span>
            Ответов с замечаниями: <strong>{flaggedCount}</strong>. Серьёзные не попадают в аналитику, но
            остаются здесь — откройте ответ, чтобы увидеть причину.
          </span>
        </p>
      )}

      {failed && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Не удалось загрузить ответы. Обновите страницу и попробуйте ещё раз."
        />
      )}

      {!failed && !isMobile && (
        <Table<SurveyResponseItem>
          className="survey-resp-table"
          rowKey="id"
          columns={columns}
          dataSource={shown?.items ?? []}
          loading={loading}
          pagination={false}
          locale={{ emptyText }}
          onRow={(record) => ({
            onClick: () => onOpen(record.id),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(record.id);
              }
            },
            tabIndex: 0,
            'aria-label': `Открыть ответ №${record.number}`,
          })}
          rowClassName={(record) =>
            `survey-resp-row survey-resp-row--${record.quality_status}${record.id === selectedId ? ' is-selected' : ''}`
          }
        />
      )}

      {!failed && isMobile && shown === null && (
        <div className="survey-feed__grid" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="survey-response survey-response--skeleton">
              <Skeleton active avatar paragraph={{ rows: 2 }} title={false} />
            </div>
          ))}
        </div>
      )}

      {isMobile && shown && shown.items.length === 0 && !failed && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      )}

      {isMobile && shown && shown.items.length > 0 && (
        <div className={loading ? 'survey-feed__days is-loading' : 'survey-feed__days'}>
          {days.map((day) => (
            <Fragment key={day.key}>
              <h3 className="survey-feed__day">
                {day.heading}
                <span>{day.items.length}</span>
              </h3>
              <div className="survey-feed__grid">
                {day.items.map((item) => (
                  <ResponseCard key={item.id} response={item} selected={item.id === selectedId} onOpen={onOpen} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}

      <Pagination
        className="survey-feed__pager"
        current={page}
        pageSize={pageSize}
        total={shown?.total ?? 0}
        pageSizeOptions={PAGE_SIZES}
        showSizeChanger
        hideOnSinglePage
        showTotal={(total, [min, max]) => `${min}–${max} из ${total}`}
        onChange={changePaging}
      />

      <SurveyResponseDrawer
        surveyId={surveyId}
        responseId={selectedId}
        onClose={onCloseDetail}
        onNavigate={onOpen}
      />
    </div>
  );
};
