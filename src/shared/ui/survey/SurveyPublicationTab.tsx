import { useState } from 'react';
import { Alert, Button, Input, Modal } from 'antd';
import { CopyOutlined, EyeOutlined } from '../materialIcons';
import { buildPublicSurveyUrl, type SurveyDetail } from '../../api/surveys.api';

interface Props {
  survey: SurveyDetail;
  canEdit: boolean;
  busy: boolean;
  onPreview: () => void;
  onChangeStatus: (status: 'open' | 'closed') => void;
}

/** Publication controls reflect the server's real status and structure-lock rules. */
export const SurveyPublicationTab = ({ survey, canEdit, busy, onPreview, onChangeStatus }: Props) => {
  const [stopOpen, setStopOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const link = buildPublicSurveyUrl(survey.public_token);
  const archived = survey.status === 'archived';
  const open = survey.status === 'open';
  const hasQuestions = survey.questions_count > 0;
  const publishLabel = survey.status === 'closed' ? 'Открыть приём снова' : 'Опубликовать опрос';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };

  return (
    <section className="research-publication" aria-label="Публикация исследования">
      <div><h2>Подготовьте опрос к встрече с аудиторией</h2><p>Проверьте вопросы в режиме респондента, затем откройте приём ответов.</p></div>
      <Alert type={open ? 'success' : 'info'} showIcon message={open ? 'Опрос доступен респондентам' : archived ? 'Исследование в архиве' : survey.status === 'closed' ? 'Приём ответов остановлен' : 'Черновик — ответы пока не принимаются'} description={open && survey.closes_at ? `Сбор запланирован до ${new Date(survey.closes_at).toLocaleString('ru-RU')}.` : undefined} />
      <div className="research-publication__checklist">
        <h3>Перед публикацией</h3>
        <ul><li>{hasQuestions ? `Вопросов в опросе: ${survey.questions_count}` : 'Добавьте хотя бы один вопрос в конструкторе'}</li><li>{survey.anonymous ? 'Анонимное прохождение' : 'Настройки анонимности: отключена'}</li><li>Регистрация респондента не требуется</li></ul>
        <Button icon={<EyeOutlined />} onClick={onPreview}>Предпросмотр опроса</Button>
      </div>
      <Alert type="warning" showIcon message="Сохраняйте сопоставимость ответов" description="После появления ответов система ограничивает удаление и изменение структуры вопросов. Для другой гипотезы создайте отдельное исследование. Остановка приёма не снимает эти ограничения." />
      {survey.status !== 'draft' && <div className="research-publication__link"><label htmlFor="research-public-link">Ссылка для респондентов</label><div><Input id="research-public-link" value={link} readOnly onFocus={(event) => event.target.select()} /><Button icon={<CopyOutlined />} onClick={() => void copy()}>{copied ? 'Скопировано' : 'Скопировать'}</Button></div>{copyError && <p role="alert">Не удалось скопировать. Выделите ссылку и скопируйте вручную.</p>}</div>}
      {canEdit && !archived && <div>{open ? <Button aria-label="Остановить приём ответов" aria-busy={busy} loading={busy} onClick={() => setStopOpen(true)}>Остановить приём ответов</Button> : <Button type="primary" aria-label={publishLabel} aria-busy={busy} loading={busy} disabled={!hasQuestions} onClick={() => onChangeStatus('open')}>{publishLabel}</Button>}</div>}
      {!canEdit && <p>Публикацией управляют владелец и редакторы команды.</p>}
      <Modal open={stopOpen} title="Остановить приём ответов?" okText="Остановить приём" cancelText="Продолжить сбор" confirmLoading={busy} onCancel={() => setStopOpen(false)} onOk={() => { setStopOpen(false); onChangeStatus('closed'); }}><p>Новые ответы по ссылке перестанут приниматься. Собранные данные сохранятся. Приём можно открыть снова.</p></Modal>
    </section>
  );
};
