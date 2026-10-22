import { useEffect, useState } from 'react';
import { Alert, Button, Card, Grid, Pagination, Segmented, Select, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';

import {
  getSurveyResponses,
  type SurveyResponseItem,
  type SurveyResponsesPage,
} from '../../api/surveys.api';
import { SurveyResponseDrawer } from './SurveyResponseDrawer';
import {
  QUALITY_STATUS_COLOR,
  QUALITY_STATUS_LABEL,
  formatDateTime,
  formatDuration,
} from './surveyFormat';

const PAGE_SIZES = [20, 50, 100];

type FlagFilter = 'all' | 'flagged' | 'clean';
type Order = 'newest' | 'oldest';

const QualityTag = ({ status }: { status: SurveyResponseItem['quality_status'] }) => (
  <Tag color={QUALITY_STATUS_COLOR[status]} style={{ margin: 0 }}>
    {QUALITY_STATUS_LABEL[status]}
  </Tag>
);

interface SurveyResponsesTabProps {
  surveyId: string;
  /** Response opened in the side view (kept in the address bar) */
  selectedId: string | null;
  onOpen: (responseId: string) => void;
  onCloseDetail: () => void;
  onDownloadCsv: () => void;
}

/** The list holds only what describes a submission; every answer is read in the side view */
export const SurveyResponsesTab = ({
  surveyId,
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
  // Rows of the previous page stay visible while the next one loads
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

  const columns: ColumnsType<SurveyResponseItem> = [
    {
      title: 'Ответ',
      dataIndex: 'number',
      key: 'number',
      width: 110,
      render: (value: number) => <strong>№{value}</strong>,
    },
    {
      title: 'Получен',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Время заполнения',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (value: number | null) => formatDuration(value),
    },
    {
      title: 'Качество',
      dataIndex: 'quality_status',
      key: 'quality_status',
      render: (status: SurveyResponseItem['quality_status']) => <QualityTag status={status} />,
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      align: 'right',
      render: (_: unknown, record) => (
        <Button
          size="small"
          aria-label={`Посмотреть ответ №${record.number}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(record.id);
          }}
        >
          Посмотреть
        </Button>
      ),
    },
  ];

  const changePaging = (nextPage: number, nextSize: number) => {
    setPage(nextSize !== pageSize ? 1 : nextPage);
    setPageSize(nextSize);
  };

  const pagination = (
    <Pagination
      current={page}
      pageSize={pageSize}
      total={shown?.total ?? 0}
      pageSizeOptions={PAGE_SIZES}
      showSizeChanger
      hideOnSinglePage
      showTotal={(total, [min, max]) => `${min}–${max} из ${total}`}
      onChange={changePaging}
      style={{ marginTop: 12, textAlign: 'right' }}
    />
  );

  const emptyText = filter === 'all' ? 'Ответов пока нет.' : 'Нет ответов под этот фильтр.';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmented<FlagFilter>
            className="survey-filter"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              { label: 'Все ответы', value: 'all' },
              { label: 'С замечаниями', value: 'flagged' },
              { label: 'Без замечаний', value: 'clean' },
            ]}
            aria-label="Фильтр по замечаниям качества"
          />
          <Select<Order>
            value={order}
            onChange={(value) => {
              setOrder(value);
              setPage(1);
            }}
            style={{ minWidth: 170 }}
            aria-label="Порядок ответов"
            options={[
              { label: 'Сначала новые', value: 'newest' },
              { label: 'Сначала старые', value: 'oldest' },
            ]}
          />
        </div>
        <Button icon={<DownloadOutlined />} onClick={onDownloadCsv} disabled={!shown?.total && filter === 'all'}>
          Скачать CSV
        </Button>
      </div>
      {shown && shown.flagged > 0 && filter === 'all' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Ответов с замечаниями: ${shown.flagged}`}
          description="Не пройденная проверка внимания и слишком быстрое заполнение исключают ответ из аналитики по умолчанию; однообразные ответы в шкале только отмечают ответ для проверки. Причины видны в карточке ответа, сами ответы не удаляются."
        />
      )}
      {failed && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Не удалось загрузить ответы" />}

      {isMobile ? (
        <Spin spinning={loading}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shown?.items.length === 0 && (
              <span style={{ color: 'var(--app-text-secondary)' }}>{emptyText}</span>
            )}
            {shown?.items.map((record) => (
              <Card key={record.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>Ответ №{record.number}</strong>
                  <span style={{ color: 'var(--app-text-secondary)', fontSize: 12 }}>
                    {formatDateTime(record.submitted_at)}
                  </span>
                </div>
                <div style={{ margin: '8px 0 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <span>{formatDuration(record.duration_seconds)}</span>
                  <QualityTag status={record.quality_status} />
                </div>
                <Button
                  block
                  size="large"
                  aria-label={`Посмотреть ответ №${record.number}`}
                  onClick={() => onOpen(record.id)}
                >
                  Посмотреть
                </Button>
              </Card>
            ))}
          </div>
          {pagination}
        </Spin>
      ) : (
        <>
          <Table<SurveyResponseItem>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={shown?.items ?? []}
            loading={loading}
            onRow={(record) => ({
              onClick: () => onOpen(record.id),
              style: { cursor: 'pointer' },
            })}
            rowClassName={(record) => (record.id === selectedId ? 'ant-table-row-selected' : '')}
            locale={{ emptyText }}
            pagination={false}
          />
          {pagination}
        </>
      )}

      <SurveyResponseDrawer
        surveyId={surveyId}
        responseId={selectedId}
        onClose={onCloseDetail}
        onNavigate={onOpen}
      />
    </>
  );
};
