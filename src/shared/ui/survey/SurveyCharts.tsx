import { useMemo } from 'react';
import { Column, Pie } from '@ant-design/charts';

import type { QuestionOptionStat, QuestionStat, ResponsesDay } from '../../api/surveys.api';
import { useThemeMode } from '../../context/theme.context';

const CHART_HEIGHT = 220;

const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * One colour system for every chart. Slot 1 is the brand colour; the rest follow in a fixed order
 * that was run through the palette validator (lightness band, chroma, colour-blind separation of
 * neighbours, contrast) for each theme. The order never changes and is never cycled: the 8th slot
 * is a neutral grey for "everything else". Single-series charts always use slot 1.
 */
const CATEGORICAL = {
  light: ['#c2410c', '#2a78d6', '#1baf7a', '#eda100', '#6250d6', '#e87ba4', '#008300', '#8b8b86'],
  dark: ['#e8622a', '#3987e5', '#199e70', '#c98500', '#9085e9', '#d55181', '#008300', '#8b8b86'],
};

/** Slots that are too light for white text: their value labels are set in a dark ink */
const DARK_INK_SLOTS = {
  light: new Set([2, 3, 5]),
  dark: new Set([3]),
};

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
    const muted =
      css?.getPropertyValue('--app-text-secondary').trim() || (dark ? '#a3a3a3' : '#6b7280');
    const palette = dark ? CATEGORICAL.dark : CATEGORICAL.light;
    const darkInk = dark ? DARK_INK_SLOTS.dark : DARK_INK_SLOTS.light;
    return {
      muted,
      theme: dark ? ('classicDark' as const) : ('classic' as const),
      palette,
      brand: palette[0],
      /** Value label colour for the segment in slot `index` */
      labelInk: (index: number): string => (darkInk.has(index % palette.length) ? '#1a1206' : '#ffffff'),
      fontFamily: FONT_FAMILY,
    };
  }, [themeMode]);
};

/**
 * The tallest column must not touch the top of the plot: its value label sits above the column,
 * and without room it would land on the column itself and become unreadable.
 */
const withHeadroom = (max: number): number => (max > 0 ? max * 1.2 : 1);

/** Light axes: a thin baseline, faint guide lines, no ticks */
const quietAxis = (muted: string) => ({
  x: { title: false, tick: false, labelFill: muted, lineStroke: muted, lineStrokeOpacity: 0.35 },
  y: {
    title: false,
    tick: false,
    line: false,
    labelFill: muted,
    gridStroke: muted,
    gridStrokeOpacity: 0.15,
    gridLineDash: [0, 0],
    tickMinStep: 1,
  },
});

/** Histogram of a numeric / rating question: the count sits above every column, no hover needed */
export const ScaleHistogram = ({ distribution }: { distribution: QuestionStat['distribution'] }) => {
  const { theme, brand, muted } = useChartStyle();
  const data = distribution.map((b) => ({ value: String(b.value), count: b.count }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="value"
      yField="count"
      height={CHART_HEIGHT}
      autoFit
      style={{ fill: brand, maxWidth: 40, radiusTopLeft: 4, radiusTopRight: 4 }}
      axis={quietAxis(muted)}
      scale={{ y: { domainMin: 0, domainMax: withHeadroom(Math.max(0, ...data.map((d) => d.count))) } }}
      label={{ text: 'count', position: 'top', fill: muted, fontSize: 12 }}
      tooltip={{ title: (d: { value: string }) => `Значение ${d.value}`, items: [{ channel: 'y', name: 'Ответов' }] }}
      legend={false}
    />
  );
};

const pluralizeAnswers = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'ответ';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'ответа';
  return 'ответов';
};

/**
 * Donut chart for a segmentation question (gender, age group, role…). The legend is drawn in HTML
 * under the chart: the canvas legend pages through long labels, here they wrap and keep a tooltip
 * with the whole text.
 */
export const SegmentPieChart = ({ options }: { options: QuestionOptionStat[] }) => {
  const { theme, palette, labelInk } = useChartStyle();
  const data = options.filter((o) => o.count > 0).map((o) => ({ label: o.label, count: o.count }));
  const slotOf = new Map(data.map((item, index) => [item.label, index]));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <div>
      <div className="survey-donut">
        <Pie
          theme={theme}
          data={data}
          angleField="count"
          colorField="label"
          innerRadius={0.64}
          height={CHART_HEIGHT + 20}
          autoFit
          scale={{ color: { range: palette } }}
          // Rounded segments with a gap between them
          style={{ inset: 2, radius: 8 }}
          label={{
            text: 'count',
            position: 'inside',
            fill: (d: { label: string }) => labelInk(slotOf.get(d.label) ?? 0),
            fontWeight: 600,
            fontSize: 13,
          }}
          legend={false}
          tooltip={{ title: (d: { label: string }) => d.label, items: [{ channel: 'y', name: 'Ответов' }] }}
        />
        <div className="survey-donut__center" aria-hidden="true">
          <strong>{total}</strong>
          <span>{pluralizeAnswers(total)}</span>
        </div>
      </div>
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
  const { theme, brand, muted } = useChartStyle();
  const data = groups.filter((g) => g.mean !== null).map((g) => ({ label: g.label, mean: g.mean }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="label"
      yField="mean"
      height={CHART_HEIGHT}
      autoFit
      style={{ fill: brand, maxWidth: 40, radiusTopLeft: 4, radiusTopRight: 4 }}
      axis={{
        ...quietAxis(muted),
        x: { ...quietAxis(muted).x, labelFormatter: (v: string) => shorten(v, 16) },
      }}
      scale={{ y: { domainMin: 0, domainMax: withHeadroom(Math.max(0, ...data.map((d) => d.mean ?? 0))) } }}
      label={{ text: 'mean', position: 'top', fill: muted, fontSize: 12 }}
      tooltip={{ title: (d: { label: string }) => d.label, items: [{ channel: 'y', name: 'Среднее' }] }}
      legend={false}
    />
  );
};
