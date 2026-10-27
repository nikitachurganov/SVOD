import { Progress } from 'antd';
import type { UsageMetric } from '../../types/billing';
import { formatNumber } from './billingFormat';
import './billing.css';

/** One limit of the plan: how much of it is used */
export const UsageBar = ({ label, metric }: { label: string; metric: UsageMetric }) => {
  const percent = metric.max > 0 ? Math.min(100, Math.round((metric.used / metric.max) * 100)) : 0;
  return (
    <div className="billing-usage">
      <div className="billing-usage__head">
        <span>{label}</span>
        <span>
          {formatNumber(metric.used)} из {formatNumber(metric.max)}
        </span>
      </div>
      <Progress
        percent={percent}
        showInfo={false}
        size="small"
        status={metric.max > 0 && metric.used >= metric.max ? 'exception' : 'normal'}
      />
    </div>
  );
};
