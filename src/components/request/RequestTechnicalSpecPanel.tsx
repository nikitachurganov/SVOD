import { useState, type ReactNode } from 'react';
import {
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
  Tile,
} from '@carbon/react';
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
      <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--cds-text-primary)' }}>{children}</div>
    </div>
  );
}

function ListBlock({ items }: { items: string[] }) {
  if (!items.length) {
    return <span style={{ color: 'var(--cds-text-secondary)' }}>—</span>;
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
      <InlineNotification
        kind="info"
        title="ТЗ недоступно"
        subtitle="У заявки не указана организация."
        lowContrast
        hideCloseButton
      />
    );
  }

  if (!tz) {
    return (
      <Tile style={{ padding: 16 }}>
        <p style={{ margin: '0 0 12px', color: 'var(--cds-text-secondary)' }}>
          Техническое задание для исполнителя ещё не сформировано. Рекомендуется иметь ИИ-резюме и анализ
          заявки для более точного результата.
        </p>
        <Button kind="primary" disabled={busy} onClick={() => run(async () => generateRequestTZ(requestId))}>
          {busy ? 'Генерация…' : 'Сгенерировать ТЗ'}
        </Button>
        {error && (
          <InlineNotification kind="error" title="Ошибка" subtitle={error} lowContrast hideCloseButton />
        )}
      </Tile>
    );
  }

  const s = tz.sections;

  return (
    <Tile style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>Статус ТЗ:</span>
        {tz.status === 'confirmed' ? (
          <Tag type="green">Подтверждено</Tag>
        ) : (
          <Tag type="blue">Черновик</Tag>
        )}
        <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
          Обновлено: {tz.generated_at ? new Date(tz.generated_at).toLocaleString('ru-RU') : '—'}
          {tz.confirmed_at && ` · Подтверждено: ${new Date(tz.confirmed_at).toLocaleString('ru-RU')}`}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Button kind="secondary" disabled={busy} onClick={() => run(async () => generateRequestTZ(requestId))}>
          Обновить ТЗ
        </Button>
        {tz.status !== 'confirmed' && (
          <Button kind="primary" disabled={busy} onClick={() => run(async () => patchRequestTZ(requestId, { status: 'confirmed' }))}>
            Подтвердить ТЗ
          </Button>
        )}
      </div>

      <InlineNotification
        kind="info"
        title="Передача исполнителю"
        subtitle="При отправке ТЗ контакту из блока «Подбор исполнителя» в лог попадёт текст подтверждённого или чернового ТЗ (рекомендуется подтвердить)."
        lowContrast
        hideCloseButton
        style={{ marginBottom: 16 }}
      />

      {error && (
        <InlineNotification kind="error" title="Ошибка" subtitle={error} lowContrast hideCloseButton />
      )}

      {busy && (
        <div style={{ marginBottom: 12 }}>
          <InlineLoading description="Выполняется…" />
        </div>
      )}

      <Section title="Название задачи">{s.title || '—'}</Section>
      <Section title="Краткое описание">{s.short_description || '—'}</Section>
      <Section title="Цель">{s.goal || '—'}</Section>
      <Section title="Что нужно сделать">
        <ListBlock items={s.tasks} />
      </Section>
      <Section title="Ожидаемый результат">{s.expected_result || '—'}</Section>
      <Section title="Входные данные / материалы">
        <ListBlock items={s.inputs} />
      </Section>
      <Section title="Ограничения">
        <ListBlock items={s.constraints} />
      </Section>
      <Section title="Сроки">{s.deadline || <span style={{ color: 'var(--cds-text-secondary)' }}>Не указано</span>}</Section>
      <Section title="Критерии готовности">
        <ListBlock items={s.acceptance_criteria} />
      </Section>
      <Section title="Уточнения и риски">
        <ListBlock items={s.clarifications_and_risks} />
      </Section>
      <Section title="Не определено / недостает данных">
        <ListBlock items={s.missing_or_unclear} />
      </Section>
    </Tile>
  );
}
