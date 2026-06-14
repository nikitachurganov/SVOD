import { useState, type ReactNode } from 'react';
import { Alert, Button, Card, Spin, Tag } from 'antd';
import { generateRequestTZ, patchRequestTZ } from '../../shared/api/requests.api';
import type { RequestTechnicalSpecEnvelope } from '../../types/technicalSpec';

export type RequestTechnicalSpecPanelProps = {
  requestId: string;
  tz: RequestTechnicalSpecEnvelope | null | undefined;
  organizationId: string | null | undefined;
  onUpdated: () => Promise<void>;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h5 style={{ margin: '0 0 8px', fontSize: '0.875rem', fontWeight: 600 }}>{title}</h5>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--app-text)' }}>{children}</div>
    </div>
  );
}

function ListBlock({ items }: { items: string[] }) {
  if (!items.length) {
    return <span style={{ color: 'var(--app-text-secondary)' }}>—</span>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function RequestTechnicalSpecPanel({
  requestId,
  tz,
  organizationId,
  onUpdated,
}: RequestTechnicalSpecPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Операция не удалась');
    } finally {
      setBusy(false);
    }
  };

  if (!organizationId) {
    return (
      <Alert
        type="info"
        message="ТЗ недоступно"
        description="У заявки не указана организация."
        showIcon
        closable={false}
      />
    );
  }

  if (!tz) {
    return (
      <Card styles={{ body: { padding: 16 } }}>
        <p style={{ margin: '0 0 12px', color: 'var(--app-text-secondary)' }}>
          Техническое задание для исполнителя ещё не сформировано. Рекомендуется иметь ИИ-резюме и анализ
          заявки для более точного результата.
        </p>
        <Button type="primary" disabled={busy} onClick={() => run(async () => generateRequestTZ(requestId))}>
          {busy ? 'Генерация…' : 'Сгенерировать ТЗ'}
        </Button>
        {error && (
          <Alert type="error" message="Ошибка" description={error} showIcon closable={false} style={{ marginTop: 12 }} />
        )}
      </Card>
    );
  }

  const s = tz.sections;

  return (
    <Card styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>Статус ТЗ:</span>
        {tz.status === 'confirmed' ? (
          <Tag color="success">Подтверждено</Tag>
        ) : (
          <Tag color="blue">Черновик</Tag>
        )}
        <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Обновлено: {tz.generated_at ? new Date(tz.generated_at).toLocaleString('ru-RU') : '—'}
          {tz.confirmed_at && ` · Подтверждено: ${new Date(tz.confirmed_at).toLocaleString('ru-RU')}`}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Button disabled={busy} onClick={() => run(async () => generateRequestTZ(requestId))}>
          Обновить ТЗ
        </Button>
        {tz.status !== 'confirmed' && (
          <Button type="primary" disabled={busy} onClick={() => run(async () => patchRequestTZ(requestId, { status: 'confirmed' }))}>
            Подтвердить ТЗ
          </Button>
        )}
      </div>

      <Alert
        type="info"
        message="Передача исполнителю"
        description="При отправке ТЗ контакту из блока «Подбор исполнителя» в лог попадёт текст подтверждённого или чернового ТЗ (рекомендуется подтвердить)."
        showIcon
        closable={false}
        style={{ marginBottom: 16 }}
      />

      {error && (
        <Alert type="error" message="Ошибка" description={error} showIcon closable={false} style={{ marginBottom: 12 }} />
      )}

      {busy && (
        <div style={{ marginBottom: 12 }}>
          <Spin tip="Выполняется…" />
        </div>
      )}

      <Section title="Техническое задание">{s.title || '—'}</Section>
      <Section title="Цель">{s.goal || '—'}</Section>
      <Section title="Что нужно сделать">
        <ListBlock items={s.tasks} />
      </Section>
      <Section title="Исходные данные">
        <ListBlock items={s.inputs} />
      </Section>
      <Section title="Требования к результату">{s.expected_result || '—'}</Section>
      <Section title="Ограничения и условия">
        <ListBlock items={s.constraints} />
      </Section>
      <Section title="Срок">
        {s.deadline || <span style={{ color: 'var(--app-text-secondary)' }}>Не указано</span>}
      </Section>
      <Section title="Критерии приёмки">
        <ListBlock items={s.acceptance_criteria} />
      </Section>
      <Section title="Риски и уточнения">
        <ListBlock items={s.clarifications_and_risks} />
      </Section>
      <Section title="Не определено в данных">
        <ListBlock items={s.missing_or_unclear} />
      </Section>
      <Section title="Резюме для исполнителя">{s.short_description || '—'}</Section>
    </Card>
  );
}
