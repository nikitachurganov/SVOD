import { useState } from 'react';
import { Button, Card, Empty, Modal, Tag } from 'antd';
import { EditOutlined, EyeOutlined } from '@ant-design/icons';

import type { SurveyDetail } from '../../api/surveys.api';
import type { CreateFormFieldPayload } from '../../api/forms.api';
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

const QuestionRow = ({
  field,
  number,
  nested,
}: {
  field: CreateFormFieldPayload;
  number: string;
  nested?: boolean;
}) => {
  if (field.children?.length) {
    return (
      <>
        <li style={{ padding: '12px 0 4px', fontWeight: 600, wordBreak: 'break-word' }}>
          {number} {field.label}
        </li>
        {field.children.map((child, index) => (
          <QuestionRow key={child.id ?? index} field={child} number={`${number}${index + 1}.`} nested />
        ))}
      </>
    );
  }
  return (
    <li
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '10px 0',
        paddingLeft: nested ? 24 : 0,
        borderTop: '1px solid var(--app-border-secondary)',
      }}
    >
      <span style={{ wordBreak: 'break-word' }}>
        <span style={{ color: 'var(--app-text-secondary)', marginRight: 8 }}>{number}</span>
        {field.label}
      </span>
      <Tag style={{ margin: 0, flexShrink: 0 }}>{answerKindLabel(field.type, field.config)}</Tag>
    </li>
  );
};

interface SurveyFormTabProps {
  survey: SurveyDetail;
  onEdit: () => void;
  onPreview: () => void;
  onOpenReport: () => void;
}

/** What the respondent is asked: the questions of the form, plus the way to change or preview them */
export const SurveyFormTab = ({ survey, onEdit, onPreview, onOpenReport }: SurveyFormTabProps) => {
  const [warningOpen, setWarningOpen] = useState(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small">
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

        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--app-text-secondary)' }}>
          {params.join(' · ')}
        </div>

        {hasQuestions ? (
          <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
            {survey.pages.flatMap((page, pageIndex) => [
              survey.pages.length > 1 && page.fields.length > 0 ? (
                <li
                  key={`page-${page.id ?? pageIndex}`}
                  style={{ padding: '14px 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--app-text-secondary)' }}
                >
                  {page.title || `Страница ${pageIndex + 1}`}
                </li>
              ) : null,
              ...page.fields.map((field, index) => (
                <QuestionRow key={field.id ?? `${pageIndex}-${index}`} field={field} number={`${index + 1}.`} />
              )),
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
        <MethodologySummaryCard summary={survey.methodology_summary} onOpenReport={onOpenReport} />
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
