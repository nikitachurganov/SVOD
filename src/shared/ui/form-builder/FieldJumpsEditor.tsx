import { useState } from 'react';
import { Button, Select } from 'antd';
import { BranchesOutlined, DownOutlined, UpOutlined } from '../materialIcons';

import type { FormFieldInstance } from '../../types/form-builder.types';
import { fieldOptions, jumpsOf } from '../../survey-logic/surveyLogic';
import { canHaveJumps, targetOptions, withJump } from '../../survey-logic/surveyLogicEditor';
import { useSurveyLogic } from './SurveyLogicContext';

const NEXT_IN_ORDER = '';

interface FieldJumpsEditorProps {
  field: FormFieldInstance;
  onChange: (changes: Partial<FormFieldInstance>) => void;
}

/** «Переходы по ответам» on a one-answer question: each option can lead to its own page */
export const FieldJumpsEditor = ({ field, onChange }: FieldJumpsEditorProps) => {
  const logic = useSurveyLogic();
  const jumps = jumpsOf(field);
  const jumpCount = Object.keys(jumps).length;
  const [open, setOpen] = useState(jumpCount > 0);

  if (!logic || !canHaveJumps(field)) return null;
  const options = fieldOptions(field);
  if (options.length === 0) return null;

  const targets = [
    { value: NEXT_IN_ORDER, label: 'Дальше по порядку' },
    ...targetOptions(logic.pages, logic.pageIndex),
  ];
  const known = new Set(targets.map((t) => t.value));

  return (
    <div style={{ marginTop: 12 }}>
      <Button
        type="link"
        size="small"
        icon={<BranchesOutlined />}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ paddingInline: 0 }}
      >
        Переходы по ответам{jumpCount > 0 ? ` · ${jumpCount}` : ''}{' '}
        {open ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
      </Button>
      {open && (
        <div
          style={{
            marginTop: 6,
            padding: '10px 12px',
            borderRadius: 6,
            background: 'var(--app-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
            Куда попадёт респондент после этой страницы, если выберет ответ
          </span>
          {options.map((option) => {
            const value = jumps[option.id] ?? NEXT_IN_ORDER;
            return (
              <div
                key={option.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <span
                  style={{
                    flex: '1 1 140px',
                    minWidth: 0,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={option.label}
                >
                  {option.label || 'Без названия'}
                </span>
                <Select
                  size="small"
                  value={known.has(value) ? value : NEXT_IN_ORDER}
                  status={known.has(value) ? undefined : 'warning'}
                  options={targets}
                  popupMatchSelectWidth={false}
                  aria-label={`Переход для ответа «${option.label}»`}
                  style={{ flex: '1 1 220px', minWidth: 0 }}
                  onChange={(next: string) =>
                    onChange({ config: withJump(field, option.id, next || null) })
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
