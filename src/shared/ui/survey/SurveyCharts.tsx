import { Bar, Column, Pie } from '@ant-design/charts';

import type { QuestionOptionStat, QuestionStat } from '../../api/surveys.api';
import { useThemeMode } from '../../context/theme.context';

const CHART_HEIGHT = 220;

/** Charts draw on a canvas, so the app's dark mode has to be passed to them explicitly */
const useChartTheme = (): 'classic' | 'classicDark' =>
  useThemeMode().themeMode === 'dark' ? 'classicDark' : 'classic';

/** Horizontal bars: share of respondents per option */
export const OptionsBarChart = ({ options }: { options: QuestionOptionStat[] }) => {
  const theme = useChartTheme();
  const data = options.map((o) => ({ label: o.label, percent: o.percent, count: o.count }));
  return (
    <Bar
      theme={theme}
      data={data}
      xField="label"
      yField="percent"
      height={Math.max(120, data.length * 34 + 40)}
      axis={{ x: { title: false }, y: { title: false, labelFormatter: (v: number) => `${v}%` } }}
      scale={{ y: { domainMin: 0, domainMax: 100 } }}
      label={{ text: (d: { percent: number; count: number }) => `${d.percent}% (${d.count})`, position: 'right' }}
      tooltip={{ items: [{ channel: 'y', name: 'Доля, %' }] }}
      legend={false}
    />
  );
};

/** Histogram of a numeric / rating question */
export const ScaleHistogram = ({ distribution }: { distribution: QuestionStat['distribution'] }) => {
  const theme = useChartTheme();
  const data = distribution.map((b) => ({ value: String(b.value), count: b.count }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="value"
      yField="count"
      height={CHART_HEIGHT}
      axis={{ x: { title: false }, y: { title: false } }}
      label={{ text: 'count', position: 'top' }}
      tooltip={{ items: [{ channel: 'y', name: 'Ответов' }] }}
      legend={false}
    />
  );
};

/** Donut chart for a segmentation question (gender, age group, role…) */
export const SegmentPieChart = ({ options }: { options: QuestionOptionStat[] }) => {
  const theme = useChartTheme();
  const data = options.filter((o) => o.count > 0).map((o) => ({ label: o.label, count: o.count }));
  return (
    <Pie
      theme={theme}
      data={data}
      angleField="count"
      colorField="label"
      innerRadius={0.58}
      height={CHART_HEIGHT}
      label={{ text: 'count', position: 'inside' }}
      legend={{ color: { position: 'bottom', layout: { justifyContent: 'center' } } }}
    />
  );
};

/** Column chart of the mean value of a numeric question per group */
export const GroupMeansChart = ({
  groups,
}: {
  groups: Array<{ label: string; mean: number | null }>;
}) => {
  const theme = useChartTheme();
  const data = groups.filter((g) => g.mean !== null).map((g) => ({ label: g.label, mean: g.mean }));
  return (
    <Column
      theme={theme}
      data={data}
      xField="label"
      yField="mean"
      height={CHART_HEIGHT}
      axis={{ x: { title: false }, y: { title: false } }}
      label={{ text: 'mean', position: 'top' }}
      tooltip={{ items: [{ channel: 'y', name: 'Среднее' }] }}
      legend={false}
    />
  );
};
