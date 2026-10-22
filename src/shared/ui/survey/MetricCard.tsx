import { Card, Statistic } from 'antd';

import type { MetricResult } from '../../api/surveys.api';
import { formatNumber } from './surveyFormat';

export const MetricCard = ({ metric }: { metric: MetricResult }) => (
  <Card size="small" style={{ minWidth: 240, flex: '1 1 240px' }}>
    <Statistic
      title={metric.name}
      value={formatNumber(metric.value)}
      suffix={<span style={{ fontSize: 12 }}>{metric.unit}</span>}
    />
    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--app-text-secondary)' }}>
      Ответов в расчёте: {metric.n}
    </div>
    {Object.keys(metric.details).length > 0 && (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
        {Object.entries(metric.details).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
          </div>
        ))}
      </div>
    )}
    {metric.interpretation && (
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
        {metric.interpretation}
      </div>
    )}
  </Card>
);
