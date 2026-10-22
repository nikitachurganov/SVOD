import { useState } from 'react';
import { Button, Tag } from 'antd';
import {
  BookOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  UpOutlined,
} from '@ant-design/icons';

import type { MethodologySummary } from '../../api/surveys.api';

export interface MethodologySummaryCardProps {
  summary: MethodologySummary;
  onOpenReport: () => void;
  onEditSet?: () => void;
  disabled?: boolean;
}

export const MethodologySummaryCard = ({
  summary,
  onOpenReport,
  onEditSet,
  disabled,
}: MethodologySummaryCardProps) => {
  const [showWarnings, setShowWarnings] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        padding: 12,
        background: 'var(--app-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600 }}>Использованные методики</div>

      {summary.category_name && (
        <div style={{ color: 'var(--app-text-secondary)' }}>{summary.category_name}</div>
      )}

      {summary.goals.length > 0 && (
        <div>
          <span style={{ color: 'var(--app-text-secondary)' }}>Цель: </span>
          {summary.goals.join('; ')}
        </div>
      )}

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {summary.methodologies.map((item) => (
          <li key={item.id}>
            <span style={{ fontWeight: 500 }}>{item.name}</span>
            <span style={{ color: 'var(--app-text-secondary)' }}>
              {' — '}
              {item.summary}
              {item.questions_count > 0 ? ` (вопросов: ${item.questions_count})` : ''}
            </span>
          </li>
        ))}
      </ul>

      {summary.standards_note && (
        <div style={{ color: 'var(--app-text-secondary)', fontSize: 12 }}>
          {summary.standards_note}
        </div>
      )}

      {summary.warnings.length > 0 && (
        <div>
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', color: 'var(--app-text-warning, #d48806)' }}
            icon={<ExclamationCircleOutlined />}
            onClick={() => setShowWarnings((prev) => !prev)}
          >
            Замечания к формулировкам: {summary.warnings.length}{' '}
            {showWarnings ? <UpOutlined /> : <DownOutlined />}
          </Button>
          {showWarnings && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {summary.warnings.map((warning, index) => (
                <li key={`${warning.rule}-${index}`} style={{ marginBottom: 4 }}>
                  {warning.field && <Tag style={{ marginRight: 4 }}>{warning.field}</Tag>}
                  {warning.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" icon={<BookOutlined />} onClick={onOpenReport} disabled={disabled}>
          Подробный обзор методик
        </Button>
        {onEditSet && (
          <Button size="small" icon={<EditOutlined />} onClick={onEditSet} disabled={disabled}>
            Изменить набор
          </Button>
        )}
      </div>
    </div>
  );
};
