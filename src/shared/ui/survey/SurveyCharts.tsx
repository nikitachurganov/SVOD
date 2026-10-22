import { useMemo } from 'react';
import { Bar, Column, Pie } from '@ant-design/charts';

import type { QuestionOptionStat, QuestionStat, ResponsesDay } from '../../api/surveys.api';
import { useThemeMode } from '../../context/theme.context';

const CHART_HEIGHT = 220;

const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FALLBACK_BRAND = '#c2410c';

/** Longer labels are cut for the axis and the legend; the tooltip still shows the whole text */
const shorten = (text: string, max = 28): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * Charts draw on a canvas, so CSS cannot reach them: the app's dark mode and the brand colours
 * are read here and passed in explicitly.
 */
const useChartStyle = () => {
  const { themeMode } = useThemeMode();
  return useMemo(() => {
    const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
    const dark = themeMode === 'dark';
    const brand =
      css?.getPropertyValue(dark ? '--brand-400' : '--brand-500').trim() ||
      (dark ? '#ff7a45' : FALLBACK_BRAND);
    return {
      theme: dark ? ('classicDark' as const) : ('classic' as const),
      // The brand colour first, then neutral tones so a pie with many options stays readable
      palette: [brand, '#2f6fed', '#16a34a', '#8b5cf6', '#0891b2', '#d97706', '#db2777', '#64748b'],
      fontFamily: FONT_FAMILY,
      brand,
    };
  }, [themeMode]);
};

/** Horizontal bars: share of respondents per option */
export const OptionsBarChart = ({ options }: { options: QuestionOptionStat[] }) => {
  const { theme, brand, fontFamily } = useChartStyle();
  const data = options.map((o) => ({ label: o.label, percent: o.percent, count: o.count }));
  return (
    <Bar
      theme={theme}
      data={data}
      xField="label"
      yField="percent"
      height={Math.max(120, data.length * 38 + 48)}
      autoFit
      paddingRight={72}
      style={{ fill: brand, maxWidth: 22 }}
      axis={{
        x: { title: false, labelFormatter: (v: string) => shorten(v), labelFontFamily: fontFamily },
        y: { title: false, labelFormatter: (v: number) => `${v}%`, labelFontFamily: fontFamily },
      }}
      scale={{ y: { domainMin: 0, domainMax: 100 } }}
      label={{
        text: (d: { percent: number; count: number }) => `${d.percent}% (${d.count})`,
        position: 'right',
        textAlign: 'start',
        dx: 6,
        fontFamily,
        fontSize: 12,
      }}
      tooltip={{ title: (d: { label: string }) => d.label, items: [{ channel: 'y', name: 'Доля, %' }] }}
      legend={false}
    />
  );
};

/** Histogram of a numeric / rating question */
export const ScaleHistogram = ({ distribution }: { distribution: QuestionStat['distribution'] }) => {
  const { theme, brand } = useChartStyle();
  const data = distribution.map((b) => ({ value: String(b.value), count: b.count }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="value"
      yField="count"
      height={CHART_HEIGHT}
      autoFit
      style={{ fill: brand, maxWidth: 48 }}
      axis={{ x: { title: false }, y: { title: false } }}
      label={{ text: 'count', position: 'top' }}
      tooltip={{ items: [{ channel: 'y', name: 'Ответов' }] }}
      legend={false}
    />
  );
};

/**
 * Donut chart for a segmentation question (gender, age group, role…). The legend is drawn in HTML
 * under the chart: the canvas legend pages through long labels, here they wrap and keep a tooltip
 * with the whole text.
 */
export const SegmentPieChart = ({ options }: { options: QuestionOptionStat[] }) => {
  const { theme, palette } = useChartStyle();
  const data = options.filter((o) => o.count > 0).map((o) => ({ label: o.label, count: o.count }));
  return (
    <div>
      <Pie
        theme={theme}
        data={data}
        angleField="count"
        colorField="label"
        innerRadius={0.58}
        height={CHART_HEIGHT}
        autoFit
        scale={{ color: { range: palette } }}
        label={{ text: 'count', position: 'inside', fill: '#fff', fontWeight: 600 }}
        legend={false}
        tooltip={{ title: (d: { label: string }) => d.label, items: [{ channel: 'y', name: 'Ответов' }] }}
      />
      <ul className="survey-chart-legend">
        {data.map((item, index) => (
          <li key={item.label} title={item.label}>
            <span
              className="survey-chart-legend__dot"
              style={{ background: palette[index % palette.length] }}
              aria-hidden="true"
            />
            <span className="survey-chart-legend__text">{item.label}</span>
            <span className="survey-chart-legend__count">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Responses received per day */
export const DailyResponsesChart = ({ days }: { days: ResponsesDay[] }) => {
  const { theme } = useChartStyle();
  const data = days.map((d) => ({
    day: new Date(`${d.date}T00:00:00Z`).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    }),
    count: d.count,
  }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="day"
      yField="count"
      height={CHART_HEIGHT}
      axis={{ x: { title: false }, y: { title: false, tickMinStep: 1 } }}
      label={{ text: 'count', position: 'top' }}
      tooltip={{ items: [{ channel: 'y', name: 'Ответов' }] }}
      legend={false}
    />
  );
};

/** Column chart of the mean value of a numeric question per group */
export const GroupMeansChart = ({
  groups,
}: {
  groups: Array<{ label: string; mean: number | null }>;
}) => {
  const { theme, brand } = useChartStyle();
  const data = groups.filter((g) => g.mean !== null).map((g) => ({ label: g.label, mean: g.mean }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="label"
      yField="mean"
      height={CHART_HEIGHT}
      autoFit
      style={{ fill: brand, maxWidth: 48 }}
      axis={{ x: { title: false, labelFormatter: (v: string) => shorten(v, 16) }, y: { title: false } }}
      label={{ text: 'mean', position: 'top' }}
      tooltip={{ title: (d: { label: string }) => d.label, items: [{ channel: 'y', name: 'Среднее' }] }}
      legend={false}
    />
  );
};
