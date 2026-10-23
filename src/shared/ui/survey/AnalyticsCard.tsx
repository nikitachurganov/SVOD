import type { ReactNode } from 'react';

interface AnalyticsCardProps {
  /** Anchor for "see the data" links */
  id?: string;
  /** The question or the name of the block; long text wraps */
  title: ReactNode;
  /** At the bottom of the card, under the data: how many answered, how many skipped */
  meta?: ReactNode;
  /** Top right, next to the title (a view switch); wraps below it on a narrow card */
  actions?: ReactNode;
  /** Takes both columns of the grid */
  wide?: boolean;
  children: ReactNode;
}

/** One template for every block of the analytics: the question, what it is based on, the data */
export const AnalyticsCard = ({ id, title, meta, actions, wide = false, children }: AnalyticsCardProps) => (
  <section id={id} className={`survey-analytics-card${wide ? ' survey-chart-grid__wide' : ''}`}>
    <header className="survey-analytics-card__head">
      <h4 className="survey-analytics-card__title">{title}</h4>
      {actions && <div className="survey-analytics-card__actions">{actions}</div>}
    </header>
    {children}
    {meta && <footer className="survey-analytics-card__meta">{meta}</footer>}
  </section>
);
