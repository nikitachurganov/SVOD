import { useState } from 'react';
import { Button, Card, Empty, Modal, Popover } from 'antd';
import { EditOutlined, EyeOutlined, QuestionCircleOutlined } from '@ant-design/icons';

import type { SurveyDetail } from '../../api/surveys.api';
import type { CreateFormFieldPayload } from '../../api/forms.api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MethodologySummaryCard } from './MethodologySummaryCard';
import { answerKindLabel } from './surveyFormat';

/** Plain-words state of the collection, matching what the public link really does */
const COLLECTION_STATE: Record<SurveyDetail['status'], string> = {
  draft: 'ещё не начат',
  open: 'открыт',
  closed: 'остановлен',
  archived: 'остановлен (опрос в архиве)',
};

const pluralizeQuestions = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} вопроса`;
  return `${n} вопросов`;
};

const optionLabel = (option: NonNullable<CreateFormFieldPayload['options']>[number]): string =>
  typeof option === 'string' ? option : option.label;

/**
 * The type of the answer. For a question with options it opens the list of them (hover, click,
 * Enter or a tap) — so they can be read without going to the editor.
 */
const TypeTag = ({ field }: { field: CreateFormFieldPayload }) => {
  const label = answerKindLabel(field.type, field.config);
  const options = (field.options ?? []).map(optionLabel);
  if (options.length === 0) return <span className="survey-type-tag">{label}</span>;
  return (
    <Popover
      trigger={['hover', 'click']}
      placement="left"
      title={`Варианты ответа (${options.length})`}
      content={
        <ol className="survey-options-list">
          {options.map((option, index) => (
            <li key={index}>{option}</li>
          ))}
        </ol>
      }
    >
      <button
        type="button"
        className="survey-type-tag"
        aria-haspopup="dialog"
        aria-label={`${label}: показать варианты ответа (${options.length})`}
      >
        {label}
        <QuestionCircleOutlined style={{ fontSize: 12 }} aria-hidden="true" />
      </button>
    </Popover>
  );
};

const ROW_STYLE = {
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr) auto',
  gap: 12,
  alignItems: 'start',
  padding: '14px 0',
  borderTop: '1px solid var(--app-border-secondary)',
} as const;

const QuestionRow = ({ field, number }: { field: CreateFormFieldPayload; number: string }) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  // A phone is too narrow for a third column: the type tag goes under the question text
  const numberColumn = isMobile ? '28px' : '32px';
  if (field.children?.length) {
    return (
      <>
        <li style={{ ...ROW_STYLE, gridTemplateColumns: `${numberColumn} minmax(0, 1fr)` }}>
          <span style={{ color: 'var(--app-text-secondary)', textAlign: 'right' }}>{number}</span>
          <strong style={{ wordBreak: 'break-word' }}>{field.label}</strong>
        </li>
        {field.children.map((child, index) => (
          <QuestionRow key={child.id ?? index} field={child} number={`${number}${index + 1}.`} />
        ))}
      </>
    );
  }
  return (
    <li
      style={
        isMobile ? { ...ROW_STYLE, gridTemplateColumns: `${numberColumn} minmax(0, 1fr)`, rowGap: 8 } : ROW_STYLE
      }
    >
      <span style={{ color: 'var(--app-text-secondary)', textAlign: 'right' }}>{number}</span>
      <span style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>{field.label}</span>
      <div style={isMobile ? { gridColumn: 2 } : undefined}>
        <TypeTag field={field} />
      </div>
    </li>
  );
};

/** «Текст без вопроса» is content, not a question: it gets no number and does not shift the others */
const numberQuestions = (
  fields: CreateFormFieldPayload[],
): { field: CreateFormFieldPayload; number: number | null }[] => {
  let next = 0;
  return fields.map((field) =>
    field.type === 'textBlock' ? { field, number: null } : { field, number: ++next },
  );
};

const TextBlockRow = ({ field }: { field: CreateFormFieldPayload }) => (
  <li
    style={{
      ...ROW_STYLE,
      gridTemplateColumns: 'minmax(0, 1fr)',
      color: 'var(--app-text-secondary)',
      fontSize: 13,
    }}
  >
    <span style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>
      <em>Текст без вопроса</em>
      {field.label ? ` · ${field.label}` : ''}
    </span>
  </li>
);

interface SurveyFormTabProps {
  survey: SurveyDetail;
  onEdit: () => void;
  onPreview: () => void;
  onOpenReport: () => void;
}

/** What the respondent is asked: the questions of the form, plus the way to change or preview them */
export const SurveyFormTab = ({ survey, onEdit, onPreview, onOpenReport }: SurveyFormTabProps) => {
  const [warningOpen, setWarningOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const archived = survey.status === 'archived';
  const hasQuestions = survey.questions_count > 0 && survey.pages.some((page) => page.fields.length > 0);
  const hasResponses = survey.responses_count > 0;

  // The limits on editing a form that already has answers are explained when the researcher
  // is about to edit it, not as a permanent banner above the questions
  const startEditing = () => (hasResponses ? setWarningOpen(true) : onEdit());

  const params = [
    `Приём ответов: ${COLLECTION_STATE[survey.status]}`,
    `Анонимность: ${survey.anonymous ? 'включена' : 'выключена'}`,
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card styles={{ body: { padding: isMobile ? '16px' : '20px 24px' } }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Форма опроса</h2>
            <span style={{ color: 'var(--app-text-secondary)' }}>{pluralizeQuestions(survey.questions_count)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasQuestions && (
              <Button icon={<EyeOutlined />} onClick={onPreview}>
                Предпросмотр
              </Button>
            )}
            <Button type="primary" icon={<EditOutlined />} onClick={startEditing} disabled={archived}>
              Редактировать форму
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--app-text-secondary)' }}>
          {params.join(' · ')}
        </div>

        {hasQuestions ? (
          <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
            {survey.pages.flatMap((page, pageIndex) => [
              survey.pages.length > 1 && page.fields.length > 0 ? (
                <li
                  key={`page-${page.id ?? pageIndex}`}
                  style={{ padding: '18px 0 6px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--app-text-secondary)' }}
                >
                  {page.title || `Страница ${pageIndex + 1}`}
                </li>
              ) : null,
              ...numberQuestions(page.fields).map(({ field, number }, index) =>
                number === null ? (
                  <TextBlockRow key={field.id ?? `${pageIndex}-${index}`} field={field} />
                ) : (
                  <QuestionRow key={field.id ?? `${pageIndex}-${index}`} field={field} number={`${number}.`} />
                ),
              ),
            ])}
          </ol>
        ) : (
          <Empty
            style={{ margin: '24px 0 8px' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="В опросе пока нет вопросов. Добавьте их в редакторе — тогда форму можно будет посмотреть глазами респондента."
          >
            {!archived && (
              <Button type="primary" icon={<EditOutlined />} onClick={startEditing}>
                Добавить вопросы
              </Button>
            )}
          </Empty>
        )}
      </Card>

      {survey.methodology_summary && (
        <MethodologySummaryCard summary={survey.methodology_summary} onOpenReport={onOpenReport} surface="white" />
      )}

      <Modal
        open={warningOpen}
        title="По опросу уже есть ответы"
        okText="Открыть редактор"
        cancelText="Отмена"
        onCancel={() => setWarningOpen(false)}
        onOk={() => {
          setWarningOpen(false);
          onEdit();
        }}
      >
        <p style={{ marginTop: 0 }}>
          Менять формулировки, добавлять вопросы и варианты можно. Удалять вопросы, менять их тип и
          удалять варианты нельзя — иначе старые ответы потеряют смысл.
        </p>
        <p style={{ marginBottom: 0 }}>
          Каждый ответ хранит форму в том виде, в каком её видел респондент, поэтому уже полученные
          ответы не изменятся.
        </p>
      </Modal>
    </div>
  );
};
