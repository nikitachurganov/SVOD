import { useMemo, useState } from 'react';
import { Button, Card, Empty, Modal, Popover } from 'antd';
import { EditOutlined, EyeOutlined, QuestionCircleOutlined } from '@ant-design/icons';

import type { SurveyDetail } from '../../api/surveys.api';
import type { CreateFormFieldPayload } from '../../api/forms.api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MethodologySummaryCard } from './MethodologySummaryCard';
import { answerKindLabel } from './surveyFormat';

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

type OutlineItem =
  | { kind: 'question'; field: CreateFormFieldPayload; number: number }
  | { kind: 'text'; field: CreateFormFieldPayload }
  | { kind: 'group'; field: CreateFormFieldPayload; children: OutlineItem[] };

/**
 * Questions are numbered through the whole form, as the respondent counts them. A group is a heading,
 * not a question, and «Текст без вопроса» is content: neither takes a number.
 */
const buildOutline = (fields: CreateFormFieldPayload[], counter: { n: number }): OutlineItem[] =>
  fields.map((field) => {
    if (field.children?.length) {
      return { kind: 'group', field, children: buildOutline(field.children, counter) };
    }
    if (field.type === 'textBlock') return { kind: 'text', field };
    counter.n += 1;
    return { kind: 'question', field, number: counter.n };
  });

const countQuestions = (items: OutlineItem[]): number =>
  items.reduce(
    (sum, item) =>
      sum + (item.kind === 'question' ? 1 : item.kind === 'group' ? countQuestions(item.children) : 0),
    0,
  );

const OutlineRows = ({ items }: { items: OutlineItem[] }) => (
  <>
    {items.map((item, index) => {
      const key = item.field.id ?? index;
      if (item.kind === 'group') {
        return (
          <li key={key} className="survey-form-outline__group">
            <div className="survey-form-outline__group-title">{item.field.label}</div>
            <ol className="survey-form-outline__sublist">
              <OutlineRows items={item.children} />
            </ol>
          </li>
        );
      }
      if (item.kind === 'text') {
        return (
          <li key={key} className="survey-form-outline__row survey-form-outline__row--text">
            <span className="survey-form-outline__num" aria-hidden="true" />
            <span className="survey-form-outline__label">{item.field.label || 'Текст без вопроса'}</span>
            <span className="survey-type-tag">Текст</span>
          </li>
        );
      }
      return (
        <li key={key} className="survey-form-outline__row">
          <span className="survey-form-outline__num">{item.number}</span>
          <span className="survey-form-outline__label">{item.field.label}</span>
          <TypeTag field={item.field} />
        </li>
      );
    })}
  </>
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

  const outline = useMemo(() => {
    const counter = { n: 0 };
    return survey.pages.map((page) => ({ page, items: buildOutline(page.fields, counter) }));
  }, [survey.pages]);

  // The limits on editing a form that already has answers are explained when the researcher
  // is about to edit it, not as a permanent banner above the questions
  const startEditing = () => (hasResponses ? setWarningOpen(true) : onEdit());

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
              Редактировать
            </Button>
          </div>
        </div>

        {hasQuestions ? (
          <div className="survey-form-outline">
            {outline.map(({ page, items }, pageIndex) =>
              items.length === 0 ? null : (
                <section key={page.id ?? pageIndex} className="survey-form-outline__page">
                  {outline.length > 1 && (
                    <header className="survey-form-outline__page-head">
                      <span className="survey-form-outline__page-title">
                        {page.title || `Страница ${pageIndex + 1}`}
                      </span>
                      <span className="survey-form-outline__page-count">
                        {pluralizeQuestions(countQuestions(items))}
                      </span>
                    </header>
                  )}
                  <ol className="survey-form-outline__list">
                    <OutlineRows items={items} />
                  </ol>
                </section>
              ),
            )}
          </div>
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
