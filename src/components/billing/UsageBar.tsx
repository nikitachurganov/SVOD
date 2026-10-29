import { Progress } from 'antd';
import type { UsageMetric } from '../../types/billing';
import { formatNumber, isUnlimited } from './billingFormat';
import './billing.css';

interface Props {
  label: string;
  metric: UsageMetric;
  /** How a number is written; AI tokens are big and use the short form */
  format?: (value: number) => string;
}

/** One limit of the plan: how much of it is used; a limit that does not exist has no bar */
export const UsageBar = ({ label, metric, format = formatNumber }: Props) => {
  const unlimited = isUnlimited(metric.max);
  const percent = metric.max > 0 ? Math.min(100, Math.round((metric.used / metric.max) * 100)) : 0;
  return (
    <div className="billing-usage">
      <div className="billing-usage__head">
        <span>{label}</span>
        <span>
          {unlimited ? `${format(metric.used)}, без ограничений` : `${format(metric.used)} из ${format(metric.max)}`}
        </span>
      </div>
      {unlimited ? null : (
        <Progress
          percent={percent}
          showInfo={false}
          size="small"
          status={metric.max > 0 && metric.used >= metric.max ? 'exception' : 'normal'}
        />
      )}
    </div>
  );
};
