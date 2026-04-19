import { Button, Tag } from '@carbon/react';
import type { Field } from '../../types/form';
import type { AIRequestAnalysis } from '../../types/request';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  missing_info: 'Не хватает данных',
  ambiguity: 'Неясная формулировка',
  contradiction: 'Противоречие в ответах',
  weak_goal: 'Цель или ожидаемый результат не ясны',
  missing_context: 'Недостаточно контекста',
  missing_constraints: 'Нет ограничений (бюджет, объём, правила)',
  missing_deadline: 'Не указан срок',
  missing_artifacts: 'Не описан ожидаемый результат или артефакт',
};

const STATUS_LABELS: Record<string, string> = {
  ready: 'Готова к обработке',
  needs_clarification: 'Нужны уточнения',
  not_ready: 'Не готова к обработке',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Низкая важность',
  medium: 'Средняя важность',
  high: 'Высокая важность',
};

export const fieldLabelForId = (fields: Field[], fieldId: string): string | null => {
  if (!fieldId || fieldId === 'general') return null;
  const f = fields.find((x) => x.id === fieldId);
  return f?.label?.trim() || fieldId;
};

const statusTagType = (s: string): 'green' | 'blue' | 'red' | 'warm-gray' => {
  if (s === 'ready') return 'green';
  if (s === 'not_ready') return 'red';
  return 'warm-gray';
};

const severityTagType = (s: string): 'red' | 'warm-gray' | 'blue' => {
  if (s === 'high') return 'red';
  if (s === 'low') return 'blue';
  return 'warm-gray';
};

export type AiAnalysisPanelProps = {
  analysis: AIRequestAnalysis | null | undefined;
  fields: Field[];
  running: boolean;
  onAnalyze: () => void;
};

export function AiAnalysisPanel({ analysis, fields, running, onAnalyze }: AiAnalysisPanelProps) {
  if (!analysis) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ color: 'var(--cds-text-secondary)', fontSize: 14, lineHeight: 1.45 }}>
          Проверка качества заявки: пустые обязательные поля, срок, бюджет, ясность цели, противоречия
          и другие моменты, которые мешают передать заявку в работу.
        </span>
        <div>
          <Button kind="primary" size="sm" disabled={running} onClick={onAnalyze}>
            {running ? 'Анализ…' : 'Проанализировать заявку'}
          </Button>
        </div>
      </div>
    );
  }

  const statusKey = analysis.status ?? 'needs_clarification';
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey;
  const score = analysis.completeness_score ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>Статус</span>
        <Tag type={statusTagType(statusKey)}>{statusLabel}</Tag>
        <span style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>
          В работу «как есть»
        </span>
        {analysis.ready_for_processing ? (
          <Tag type="green">Да</Tag>
        ) : (
          <Tag type="red">Нет</Tag>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>
            Оценка полноты (0–100)
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{score} / 100</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 8,
            borderRadius: 4,
            background: 'var(--cds-border-subtle)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, score))}%`,
              background: 'var(--cds-interactive)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      </div>

      {analysis.strengths && analysis.strengths.length > 0 ? (
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
            Сильные стороны
          </span>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 14,
            }}
          >
            {analysis.strengths.map((s, idx) => (
              <li key={`strength-${idx}`}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.issues.length > 0 ? (
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
            Что исправить или уточнить
          </span>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {analysis.issues.map((issue, idx) => {
              const typeLabel = ISSUE_TYPE_LABELS[issue.type] ?? 'Замечание';
              const sev = issue.severity ?? 'medium';
              const sevLabel = SEVERITY_LABELS[sev] ?? sev;
              const fl = fieldLabelForId(fields, issue.field);
              return (
                <li key={`${issue.type}-${issue.field}-${idx}`} style={{ fontSize: 14 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <Tag type="blue" size="sm">
                      {typeLabel}
                    </Tag>
                    <Tag type={severityTagType(sev)} size="sm">
                      {sevLabel}
                    </Tag>
                    {fl ? (
                      <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>{fl}</span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 4 }}>{issue.message}</div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <span style={{ fontSize: 14, color: 'var(--cds-text-secondary)' }}>
          Системных замечаний нет — заявка выглядит согласованной по проверке.
        </span>
      )}

      <div>
        <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Итоговая рекомендация
        </span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{analysis.recommendation}</p>
      </div>

      <div>
        <Button kind="secondary" size="sm" disabled={running} onClick={onAnalyze}>
          {running ? 'Обновление…' : 'Обновить анализ'}
        </Button>
      </div>
    </div>
  );
}
