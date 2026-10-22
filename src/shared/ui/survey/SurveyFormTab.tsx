import { Alert, Button, Card, Tag } from 'antd';
import { EditOutlined, ExportOutlined } from '@ant-design/icons';

import { buildPublicSurveyUrl, type SurveyDetail } from '../../api/surveys.api';
import type { CreateFormFieldPayload } from '../../api/forms.api';
import { MethodologySummaryCard } from './MethodologySummaryCard';
import { QUESTION_TYPE_LABEL } from './surveyFormat';

const MAX_OPTION_TAGS = 6;

const COLLECTION_STATE: Record<SurveyDetail['status'], string> = {
  draft: 'Черновик: ссылка не работает',
  open: 'Принимает ответы',
  closed: 'Приём ответов остановлен',
  archived: 'В архиве',
};

const optionLabel = (option: NonNullable<CreateFormFieldPayload['options']>[number]): string =>
  typeof option === 'string' ? option : option.label;

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
        <li style={{ padding: '10px 0 4px', fontWeight: 600 }}>
          {number} {field.label} <span style={{ fontWeight: 400, color: 'var(--app-text-secondary)' }}>— группа</span>
        </li>
        {field.children.map((child, index) => (
          <QuestionRow key={child.id ?? index} field={child} number={`${number}.${index + 1}`} nested />
        ))}
      </>
    );
  }
  const options = field.options ?? [];
  return (
    <li
      style={{
        padding: '10px 0',
        paddingLeft: nested ? 20 : 0,
        borderTop: '1px solid var(--app-border)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--app-text-secondary)' }}>{number}</span>
        <strong style={{ wordBreak: 'break-word' }}>{field.label}</strong>
        <Tag style={{ margin: 0 }}>{QUESTION_TYPE_LABEL[field.type] ?? field.type}</Tag>
        {field.required && (
          <Tag color="red" style={{ margin: 0 }}>
            Обязательный
          </Tag>
        )}
      </div>
      {options.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {options.slice(0, MAX_OPTION_TAGS).map((option, index) => (
            <Tag key={index} bordered={false} style={{ margin: 0 }}>
              {optionLabel(option)}
            </Tag>
          ))}
          {options.length > MAX_OPTION_TAGS && (
            <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
              и ещё {options.length - MAX_OPTION_TAGS}
            </span>
          )}
        </div>
      )}
    </li>
  );
};

interface SurveyFormTabProps {
  survey: SurveyDetail;
  onEdit: () => void;
  onOpenReport: () => void;
}

/** What the respondent sees: the questions of the form, and the way to change them */
export const SurveyFormTab = ({ survey, onEdit, onOpenReport }: SurveyFormTabProps) => {
  const archived = survey.status === 'archived';
  const open = survey.status === 'open';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>Вопросов</div>
            <strong>{survey.questions_count}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>Сбор ответов</div>
            <strong>{COLLECTION_STATE[survey.status]}</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>Анонимность</div>
            <strong>{survey.anonymous ? 'Анонимный опрос' : 'Не анонимный'}</strong>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              icon={<ExportOutlined />}
              href={open ? buildPublicSurveyUrl(survey.public_token) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              disabled={!open}
              title={open ? 'Откроется страница, какой её видит респондент' : 'Предпросмотр доступен у открытого опроса'}
            >
              Предпросмотр
            </Button>
            <Button type="primary" icon={<EditOutlined />} onClick={onEdit} disabled={archived}>
              Редактировать форму
            </Button>
          </div>
        </div>
      </Card>

      {survey.responses_count > 0 && !archived && (
        <Alert
          type="info"
          showIcon
          message="По опросу уже есть ответы"
          description="Можно менять формулировки, добавлять вопросы и варианты. Удалять вопросы, менять их тип и удалять варианты нельзя — иначе старые ответы потеряют смысл. Каждый ответ хранит форму в том виде, в каком её видел респондент."
        />
      )}

      {survey.methodology_summary && (
        <MethodologySummaryCard summary={survey.methodology_summary} onOpenReport={onOpenReport} />
      )}

      {survey.pages.length === 0 || survey.questions_count === 0 ? (
        <Alert type="warning" showIcon message="В опросе пока нет вопросов" />
      ) : (
        survey.pages.map((page, pageIndex) => (
          <Card
            key={page.id ?? pageIndex}
            size="small"
            title={survey.pages.length > 1 ? page.title || `Страница ${pageIndex + 1}` : 'Вопросы'}
          >
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {page.fields.map((field, index) => (
                <QuestionRow key={field.id ?? index} field={field} number={`${index + 1}.`} />
              ))}
            </ol>
          </Card>
        ))
      )}
    </div>
  );
};
