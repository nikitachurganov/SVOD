import { Alert, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type { CrosstabGroup, CrosstabResult } from '../../api/surveys.api';
import { GroupMeansChart } from './SurveyCharts';
import { formatNumber, formatP } from './surveyFormat';

const heat = (percent: number): string =>
  `color-mix(in srgb, var(--app-primary) ${Math.round(percent * 0.35)}%, transparent)`;

const MeansTable = ({ result }: { result: CrosstabResult }) => {
  const columns: ColumnsType<CrosstabGroup> = [
    { title: result.col_label, dataIndex: 'label', key: 'label' },
    { title: 'n', dataIndex: 'n', key: 'n', align: 'right' },
    {
      title: 'Среднее',
      dataIndex: 'mean',
      key: 'mean',
      align: 'right',
      render: (v: number | null) => (v === null ? '—' : formatNumber(v)),
    },
    {
      title: 'Медиана',
      dataIndex: 'median',
      key: 'median',
      align: 'right',
      render: (v: number | null) => (v === null ? '—' : formatNumber(v)),
    },
    {
      title: 'σ',
      dataIndex: 'std',
      key: 'std',
      align: 'right',
      render: (v: number | null) => (v === null ? '—' : formatNumber(v)),
    },
  ];
  return (
    <>
      <div style={{ marginBottom: 8, fontSize: 13 }}>
        Среднее значение «<strong>{result.row_label}</strong>» по группам «{result.col_label}»
        (респондентов: {result.n})
      </div>
      <Table<CrosstabGroup>
        rowKey="label"
        size="small"
        columns={columns}
        dataSource={result.groups}
        pagination={false}
      />
      <div style={{ marginTop: 12 }}>
        <GroupMeansChart groups={result.groups} />
      </div>
    </>
  );
};

type Row = { key: string; label: string; cells: number[]; percents: number[] };

const CountsTable = ({ result }: { result: CrosstabResult }) => {
  const rows: Row[] = result.row_labels.map((label, i) => ({
    key: label,
    label,
    cells: result.counts[i] ?? [],
    percents: result.row_percent[i] ?? [],
  }));
  const columns: ColumnsType<Row> = [
    {
      title: `${result.row_label} ↓ / ${result.col_label} →`,
      dataIndex: 'label',
      key: 'label',
      fixed: 'left',
    },
    ...result.col_labels.map((colLabel, j) => ({
      title: colLabel,
      key: colLabel,
      align: 'center' as const,
      onCell: (row: Row) => ({ style: { background: heat(row.percents[j] ?? 0) } }),
      render: (_: unknown, row: Row) => (
        <>
          <strong>{row.cells[j] ?? 0}</strong>{' '}
          <span style={{ color: 'var(--app-text-secondary)', fontSize: 12 }}>
            ({formatNumber(row.percents[j] ?? 0)}%)
          </span>
        </>
      ),
    })),
  ];
  return (
    <>
      <div style={{ marginBottom: 8, fontSize: 13 }}>
        Респондентов: {result.n}. В скобках — доля внутри строки.
      </div>
      <Table<Row>
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
      {result.chi2 !== null && result.p_value !== null && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>
            χ²({result.dof}) = {formatNumber(result.chi2)}, p = {formatP(result.p_value)}
            {result.cramers_v !== null && <>, V Крамера = {formatNumber(result.cramers_v)}</>}
          </span>
          {result.p_value < 0.05 ? (
            <Tag color="green" style={{ margin: 0 }}>
              Различия статистически значимы (p &lt; 0,05)
            </Tag>
          ) : (
            <Tag style={{ margin: 0 }}>Значимых различий не выявлено</Tag>
          )}
        </div>
      )}
    </>
  );
};

export const CrosstabView = ({ result }: { result: CrosstabResult }) => (
  <div>
    {result.kind === 'means' ? <MeansTable result={result} /> : <CountsTable result={result} />}
    {result.note && (
      <Alert type="warning" showIcon style={{ marginTop: 10 }} message={result.note} />
    )}
  </div>
);
