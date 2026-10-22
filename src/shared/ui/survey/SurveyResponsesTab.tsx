import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';

import {
  getSurveyResponses,
  type SurveyResponseItem,
  type SurveyResponsesPage,
} from '../../api/surveys.api';
import type { CreateFormFieldPayload, CreateFormPagePayload } from '../../api/forms.api';
import { SurveyResponseDrawer } from './SurveyResponseDrawer';
import { formatAnswer, formatDateTime, formatDuration } from './surveyFormat';

const PAGE_SIZES = [20, 50, 100];
const FILE_TYPES = new Set(['file_vector', 'file_image', 'file_document']);
/** Items of SUS / UEQ are 10–26 near-identical columns; they are read in the response view */
const BULKY_METHODOLOGIES = new Set(['sus', 'ueq']);

const FLAG_LABEL: Record<string, string> = {
  failed_attention_check: 'Не прошёл проверку внимания',
  too_fast: 'Слишком быстро',
};

const flattenFields = (pages: CreateFormPagePayload[]): CreateFormFieldPayload[] => {
  const result: CreateFormFieldPayload[] = [];
  const walk = (fields: CreateFormFieldPayload[]) => {
    for (const field of fields) {
      if (field.children?.length) walk(field.children);
      else if (field.id && !FILE_TYPES.has(field.type)) result.push(field);
    }
  };
  pages.forEach((page) => walk(page.fields));
  return result;
};

const optionLabels = (field: CreateFormFieldPayload): Map<string, string> => {
  const map = new Map<string, string>();
  for (const option of field.options ?? []) {
    if (typeof option !== 'string') map.set(option.id, option.label);
  }
  return map;
};

const Skipped = () => <span style={{ color: 'var(--app-text-secondary)' }}>—</span>;

const QualityTags = ({ flags }: { flags: SurveyResponseItem['quality_flags'] }) => {
  const active = Object.entries(flags ?? {}).filter(([, v]) => v);
  if (active.length === 0) return <Skipped />;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {active.map(([key]) => (
        <Tag key={key} color="orange">
          {FLAG_LABEL[key] ?? key}
        </Tag>
      ))}
    </div>
  );
};

interface SurveyResponsesTabProps {
  surveyId: string;
  pages: CreateFormPagePayload[];
  /** Response opened in the side view (kept in the address bar) */
  selectedId: string | null;
  onOpen: (responseId: string) => void;
  onCloseDetail: () => void;
  onDownloadCsv: () => void;
}

export const SurveyResponsesTab = ({
  surveyId,
  pages,
  selectedId,
  onOpen,
  onCloseDetail,
  onDownloadCsv,
}: SurveyResponsesTabProps) => {
  const fields = useMemo(() => flattenFields(pages), [pages]);
  const labelsById = useMemo(
    () => new Map(fields.map((field) => [field.id as string, optionLabels(field)])),
    [fields],
  );
  const columnFields = useMemo(
    () =>
      fields.filter((field) => {
        const methodology = field.config?.methodology;
        return !(typeof methodology === 'string' && BULKY_METHODOLOGIES.has(methodology));
      }),
    [fields],
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const requestKey = `${surveyId}|${page}|${pageSize}`;
  const [answer, setAnswer] = useState<{
    key: string;
    data: SurveyResponsesPage | null;
  } | null>(null);
  // Rows of the previous page stay visible while the next one loads
  const [shown, setShown] = useState<SurveyResponsesPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSurveyResponses(surveyId, { limit: pageSize, offset: (page - 1) * pageSize })
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
  }, [requestKey, surveyId, page, pageSize]);

  const current = answer?.key === requestKey ? answer : null;
  const loading = current === null;
  const failed = current !== null && current.data === null;

  const renderCell = (fieldId: string, record: SurveyResponseItem): ReactNode => {
    const text = formatAnswer(labelsById.get(fieldId) ?? new Map(), record.answers[fieldId]);
    return text === null ? <Skipped /> : text;
  };

  const answeredCount = (record: SurveyResponseItem): number =>
    fields.filter((field) => formatAnswer(new Map(), record.answers[field.id as string]) !== null).length;

  const columns: ColumnsType<SurveyResponseItem> = [
    {
      title: 'Ответ',
      dataIndex: 'number',
      key: 'number',
      fixed: 'left',
      width: 100,
      render: (value: number, record) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          aria-label={`Открыть ответ №${value}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(record.id);
          }}
        >
          №{value}
        </Button>
      ),
    },
    {
      title: 'Получен',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    ...columnFields.map((field) => ({
      title: field.label,
      key: field.id as string,
      width: 200,
      ellipsis: true,
      render: (_: unknown, record: SurveyResponseItem) => renderCell(field.id as string, record),
    })),
    {
      title: 'Заполнено',
      key: 'filled',
      width: 110,
      render: (_: unknown, record: SurveyResponseItem) =>
        fields.length === 0 ? <Skipped /> : `${answeredCount(record)} из ${fields.length}`,
    },
    {
      title: 'Время',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      width: 110,
      render: (value: number | null) => formatDuration(value),
    },
    {
      title: 'Замечания',
      dataIndex: 'quality_flags',
      key: 'quality_flags',
      width: 190,
      render: (flags: SurveyResponseItem['quality_flags']) => <QualityTags flags={flags} />,
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--app-text-secondary)', fontSize: 13 }}>
          Нажмите на строку, чтобы прочитать все ответы респондента.
        </span>
        <Button icon={<DownloadOutlined />} onClick={onDownloadCsv} disabled={!shown?.total}>
          Скачать CSV
        </Button>
      </div>
      {shown && shown.flagged > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Ответов с замечаниями по качеству: ${shown.flagged}`}
          description="Проверка внимания или слишком быстрое заполнение. В аналитике такие ответы исключены, пока включён переключатель."
        />
      )}
      {failed && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Не удалось загрузить ответы" />}
      <Table<SurveyResponseItem>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={shown?.items ?? []}
        loading={loading}
        scroll={{ x: 'max-content' }}
        onRow={(record) => ({
          onClick: () => onOpen(record.id),
          style: { cursor: 'pointer' },
        })}
        rowClassName={(record) => (record.id === selectedId ? 'ant-table-row-selected' : '')}
        locale={{ emptyText: 'Ответов пока нет.' }}
        pagination={{
          current: page,
          pageSize,
          total: shown?.total ?? 0,
          pageSizeOptions: PAGE_SIZES,
          showSizeChanger: true,
          hideOnSinglePage: true,
          showTotal: (total, [min, max]) => `${min}–${max} из ${total}`,
          onChange: (nextPage, nextSize) => {
            setPage(nextSize !== pageSize ? 1 : nextPage);
            setPageSize(nextSize);
          },
        }}
      />
      <SurveyResponseDrawer
        surveyId={surveyId}
        responseId={selectedId}
        onClose={onCloseDetail}
        onNavigate={onOpen}
      />
    </>
  );
};
