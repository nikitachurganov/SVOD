import { Alert, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type { CrosstabGroup, CrosstabResult } from '../../api/surveys.api';
import { GroupMeansChart } from './SurveyCharts';
import { formatNumber, formatP } from './surveyFormat';

/** Five steps like a contribution graph: 0 is an empty tile, 1-4 are growing shares of the row */
const heatLevel = (percent: number): 0 | 1 | 2 | 3 | 4 =>
  percent <= 0 ? 0 : percent <= 25 ? 1 : percent <= 50 ? 2 : percent <= 75 ? 3 : 4;

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
  const share = `${70 / Math.max(1, result.col_labels.length)}%`;
  const columns: ColumnsType<Row> = [
    {
      title: result.row_label,
      dataIndex: 'label',
      key: 'label',
      fixed: 'left',
      width: '30%',
      className: 'survey-crosstab__label',
    },
    {
      title: result.col_label,
      key: 'cols',
      align: 'left',
      className: 'survey-crosstab__group',
      children: result.col_labels.map((colLabel, j) => ({
        title: colLabel,
        key: colLabel,
        width: share,
        align: 'left' as const,
        className: 'survey-heat-cell',
        render: (_: unknown, row: Row) => {
          const count = row.cells[j] ?? 0;
          const percent = row.percents[j] ?? 0;
          return (
            <div
              className={`survey-heat survey-heat--${heatLevel(percent)}`}
              title={`Ответов: ${count} (${formatNumber(percent)}% строки)`}
            >
              <strong>{count}</strong>
              <span>{formatNumber(percent)}%</span>
            </div>
          );
        },
      })),
    },
  ];
  return (
    <>
      {/* Fixed layout: the label column is 30% and the answer columns share the other 70%, whatever
          the length of the texts; with many columns the table scrolls instead of squeezing them */}
      <Table<Row>
        className="survey-crosstab"
        rowKey="key"
        size="small"
        tableLayout="fixed"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: `calc(260px + ${result.col_labels.length} * 110px)` }}
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
