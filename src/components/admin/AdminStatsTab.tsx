import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button, Card, Skeleton, Statistic } from 'antd';
import { adminErrorText, getAdminStats } from '../../shared/api/admin.api';
import type { AdminStats } from '../../types/admin';
import { formatRub, formatUsd } from './adminLabels';

interface Props {
  refreshKey: number;
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="admin-stats__group">
    <h3 className="admin-section">{title}</h3>
    <div className="admin-stats__grid">{children}</div>
  </section>
);

const Tile = ({ title, value, hint }: { title: string; value: ReactNode; hint?: string }) => (
  <Card size="small" className="admin-stats__tile">
    <Statistic title={title} value={value as string | number} />
    {hint ? <div className="admin-stats__hint">{hint}</div> : null}
  </Card>
);

export const AdminStatsTab = ({ refreshKey }: Props) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdminStats()
      .then((next) => {
        if (cancelled) return;
        setStats(next);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(adminErrorText(err, 'Не удалось загрузить сводку'));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, attempt]);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        title="Ошибка загрузки"
        description={error}
        action={
          <Button size="small" onClick={() => setAttempt((value) => value + 1)}>
            Повторить
          </Button>
        }
      />
    );
  }
  if (!stats) return <Skeleton active paragraph={{ rows: 8 }} />;

  const share = stats.ai_cost_share_of_revenue;

  return (
    <div className="admin-stats">
      <Group title="Пользователи">
        <Tile title="Всего" value={stats.users.total} />
        <Tile title="Новых за 7 дней" value={stats.users.new_7d} />
        <Tile title="Новых за 30 дней" value={stats.users.new_30d} />
        <Tile title="Заходили за 30 дней" value={stats.users.active_30d} />
        <Tile title="Подтвердили почту" value={stats.users.email_verified} />
        <Tile title="Заблокированы" value={stats.users.blocked} />
      </Group>

      <Group title="Тарифы сейчас">
        <Tile title="«Старт»" value={stats.plans.free} />
        <Tile title="Пробный период" value={stats.plans.trial} />
        <Tile title="«Исследователь»" value={stats.plans.paid} />
        <Tile title="Ожидают оплаты" value={stats.plans.past_due} />
        <Tile title="Заявок ждут решения" value={stats.pending_plan_requests} />
      </Group>

      <Group title="Деньги за 30 дней">
        <Tile
          title="Ожидаемая выручка в месяц"
          value={formatRub(stats.expected_monthly_revenue_kopecks)}
          hint="По платным тарифам, которые действуют сейчас; выданные вручную — по цене месяца"
        />
        <Tile
          title="Получено онлайн"
          value={formatRub(stats.received_30d_kopecks)}
          hint="Платежи через ЮKassa за 30 дней, возвраты вычтены, тестовые не считаются"
        />
        <Tile
          title="Расход на ИИ"
          value={formatUsd(stats.ai_cost_usd_30d)}
          hint={`≈ ${formatRub(stats.ai_cost_rub_30d * 100)} по курсу из настроек`}
        />
        <Tile
          title="Доля ИИ в выручке"
          value={share === null ? '—' : `${(share * 100).toFixed(1)} %`}
          hint={share === null ? 'Выручки пока нет' : 'Расход на ИИ за 30 дней к ожидаемой выручке'}
        />
      </Group>
    </div>
  );
};
