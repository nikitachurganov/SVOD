import type { QuestionOptionStat } from '../../api/surveys.api';
import { formatNumber } from './surveyFormat';

/**
 * Share of respondents per option as horizontal bars. Drawn in HTML rather than on a canvas, so
 * long options wrap instead of being clipped and every value is plain text (readable without
 * hovering and by screen readers). The bar is the share of those who answered, on a 0-100% scale.
 */
export const DistributionBars = ({ options, label }: { options: QuestionOptionStat[]; label: string }) => (
  <ul className="survey-bars" aria-label={label}>
    {options.map((option) => (
      <li key={option.label} className="survey-bars__row">
        <div className="survey-bars__label">{option.label}</div>
        <div className="survey-bars__line">
          <div className="survey-bars__track" aria-hidden="true">
            <span
              className="survey-bars__fill"
              style={{ width: `${Math.min(100, option.percent)}%`, minWidth: option.count > 0 ? 4 : 0 }}
            />
          </div>
          <div className="survey-bars__value">
            <strong>{formatNumber(option.percent)}%</strong>
            <span title={`Ответов: ${option.count}`}>
              {option.count}
              <span className="survey-sr-only"> ответов</span>
            </span>
          </div>
        </div>
      </li>
    ))}
  </ul>
);
