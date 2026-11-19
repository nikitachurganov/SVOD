import { Alert, Select, Switch, Tag, Tooltip } from 'antd';

import type { FormPageInstance } from '../../types/form-builder.types';
import { isEnding } from '../../survey-logic/surveyLogic';
import {
  incomingJumps,
  pageLabel,
  targetOptions,
  type LogicProblem,
} from '../../survey-logic/surveyLogicEditor';

const NEXT_IN_ORDER = '';

interface PageLogicBarProps {
  pages: FormPageInstance[];
  pageIndex: number;
  problems: LogicProblem[];
  onChange: (changes: Partial<FormPageInstance>) => void;
}

/** Above the questions of a survey page: where it leads, what leads here, ending screen switch */
export const PageLogicBar = ({ pages, pageIndex, problems, onChange }: PageLogicBarProps) => {
  const page = pages[pageIndex];
  if (!page) return null;
  const ending = isEnding(page);
  const incoming = incomingJumps(pages, page.id);
  const targets = [
    { value: NEXT_IN_ORDER, label: 'Следующая по порядку' },
    ...targetOptions(pages, pageIndex),
  ];
  const known = new Set(targets.map((t) => t.value));
  const next = page.next ?? NEXT_IN_ORDER;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 16px',
          padding: '10px 16px',
          borderRadius: 'var(--app-radius-md)',
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border-secondary)',
          fontSize: 13,
        }}
      >
        {!ending && (
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', minWidth: 0 }}
          >
            <span style={{ whiteSpace: 'nowrap', color: 'var(--app-text-secondary)' }}>
              После этой страницы
            </span>
            <Select
              size="small"
              value={known.has(next) ? next : NEXT_IN_ORDER}
              status={known.has(next) ? undefined : 'warning'}
              options={targets}
              popupMatchSelectWidth={false}
              style={{ flex: 1, minWidth: 0 }}
              onChange={(value: string) => onChange({ next: value || undefined })}
            />
          </label>
        )}
        <Tooltip title="Страница с текстом, которую увидят после отправки ответов. На неё попадают только по переходу: при обычном порядке она пропускается.">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch
              size="small"
              checked={ending}
              onChange={(checked) =>
                onChange(checked ? { ending: true, next: undefined } : { ending: undefined })
              }
            />
            Экран завершения
          </label>
        </Tooltip>
        {incoming.length > 0 && (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, flexBasis: '100%' }}
          >
            <span style={{ color: 'var(--app-text-secondary)' }}>Сюда ведут:</span>
            {incoming.map((item, i) => (
              <Tag key={i} style={{ marginInlineEnd: 0, maxWidth: '100%', whiteSpace: 'normal' }}>
                {pageLabel(pages, item.fromPage).split(' — ')[0]}: {item.text}
              </Tag>
            ))}
          </div>
        )}
      </div>
      {ending && (
        <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Добавьте сюда «Текст без вопроса»: заголовок и текст заменят стандартное «Спасибо за участие».
        </span>
      )}
      {problems.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={problems.length === 1 ? 'Переходы: одна проблема' : `Переходы: проблем — ${problems.length}`}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {problems.map((problem, i) => (
                <li key={i}>{problem.message}</li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
};
