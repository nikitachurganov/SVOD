import { useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Select } from 'antd';
import {
  dismissOnboardingSurvey,
  submitOnboardingSurvey,
  updateTourState,
} from '../../shared/api/onboarding.api';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useNotifications } from '../../shared/context/notifications.context';
import type { TourStatus } from '../../types/profile';
import { useTour } from '../tour/useTour';
import {
  OCCUPATION_OPTIONS,
  OTHER_VALUE,
  PURPOSE_OPTIONS,
  SOURCE_OPTIONS,
} from './onboardingOptions';
import './OnboardingGate.css';

interface SurveyFormValues {
  occupation: string;
  occupationOther?: string;
  purposes: string[];
  purposeOther?: string;
  source: string;
  sourceOther?: string;
}

const OTHER_MAX_LENGTH = 200;

const otherRules = [{ max: OTHER_MAX_LENGTH, message: `Не более ${OTHER_MAX_LENGTH} символов` }];

interface SurveyFormProps {
  dismissible: boolean;
  saving: boolean;
  onSubmit: (values: SurveyFormValues) => void;
  onDismiss: () => void;
}

/** The questionnaire itself; mounted with the modal, so its form instance is always connected */
const SurveyForm = ({ dismissible, saving, onSubmit, onDismiss }: SurveyFormProps) => {
  const [form] = Form.useForm<SurveyFormValues>();
  const occupation = Form.useWatch('occupation', form);
  const purposes = Form.useWatch('purposes', form);
  const source = Form.useWatch('source', form);

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={{ purposes: [] }}
      onFinish={onSubmit}
    >
      <Form.Item
        name="occupation"
        label="Кто вы?"
        rules={[{ required: true, message: 'Выберите вариант' }]}
      >
        <Select options={OCCUPATION_OPTIONS} placeholder="Выберите вариант" />
      </Form.Item>
      {occupation === OTHER_VALUE && (
        <Form.Item name="occupationOther" rules={otherRules}>
          <Input maxLength={OTHER_MAX_LENGTH} placeholder="Уточните, кто вы" />
        </Form.Item>
      )}

      <Form.Item
        name="purposes"
        label="Для каких целей планируете использовать сервис?"
        extra="Можно выбрать несколько вариантов"
        rules={[{ required: true, type: 'array', min: 1, message: 'Выберите хотя бы один вариант' }]}
      >
        <Checkbox.Group options={PURPOSE_OPTIONS} className="onboarding-modal__checks" />
      </Form.Item>
      {purposes?.includes(OTHER_VALUE) && (
        <Form.Item name="purposeOther" rules={otherRules}>
          <Input maxLength={OTHER_MAX_LENGTH} placeholder="Уточните цель" />
        </Form.Item>
      )}

      <Form.Item
        name="source"
        label="Откуда вы о нас узнали?"
        rules={[{ required: true, message: 'Выберите вариант' }]}
      >
        <Select options={SOURCE_OPTIONS} placeholder="Выберите вариант" />
      </Form.Item>
      {source === OTHER_VALUE && (
        <Form.Item name="sourceOther" rules={otherRules}>
          <Input maxLength={OTHER_MAX_LENGTH} placeholder="Уточните источник" />
        </Form.Item>
      )}

      <div className="onboarding-modal__actions">
        {dismissible && (
          <Button onClick={onDismiss} disabled={saving}>
            Заполню позже
          </Button>
        )}
        <Button type="primary" htmlType="submit" loading={saving}>
          Продолжить
        </Button>
      </div>
    </Form>
  );
};

/**
 * First visit: asks who uses the service, what for and where from, then offers the guided tour.
 * A new person has to answer; accounts that predate the questionnaire may close it.
 */
export const OnboardingGate = () => {
  const { profile, refreshProfile } = useAuth();
  const { notifyError } = useNotifications();
  const { start: startTour } = useTour();

  const [phase, setPhase] = useState<'survey' | 'offer' | 'done'>('survey');
  const [saving, setSaving] = useState(false);

  const onboarding = profile?.onboarding;
  const dismissible = onboarding?.dismissible ?? false;
  const surveyOpen = phase === 'survey' && !!onboarding?.needsSurvey;
  const offerOpen = phase === 'offer';

  const handleSubmit = async (values: SurveyFormValues) => {
    setSaving(true);
    try {
      await submitOnboardingSurvey(values);
      // The offer replaces the questionnaire in the same place: no flicker between the two
      setPhase('offer');
      await refreshProfile();
    } catch {
      notifyError('Не удалось сохранить ответы', 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    setSaving(true);
    try {
      await dismissOnboardingSurvey();
      setPhase('done');
      await refreshProfile();
    } catch {
      notifyError('Не удалось закрыть анкету', 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  };

  const handleTourAnswer = async (status: TourStatus) => {
    setPhase('done');
    // «Позже» changes nothing: the tour stays available from the menu
    if (status === 'pending') return;
    if (status === 'accepted') {
      await startTour();
      return;
    }
    try {
      await updateTourState(status);
      await refreshProfile();
    } catch {
      notifyError('Не удалось сохранить выбор', 'Обучение можно запустить позже из меню профиля');
    }
  };

  return (
    <>
      <Modal
        open={surveyOpen}
        title="Расскажите о себе"
        footer={null}
        width={560}
        centered
        closable={dismissible}
        maskClosable={false}
        keyboard={dismissible}
        onCancel={() => void handleDismiss()}
        destroyOnHidden
        className="onboarding-modal"
      >
        <p className="onboarding-modal__lead">
          Три коротких вопроса помогут нам сделать сервис удобнее. Ответы используются только для
          улучшения СВОД и не передаются третьим лицам.
        </p>

        <SurveyForm
          dismissible={dismissible}
          saving={saving}
          onSubmit={(values) => void handleSubmit(values)}
          onDismiss={() => void handleDismiss()}
        />
      </Modal>

      <Modal
        open={offerOpen}
        title="Хотите пройти обучение?"
        footer={null}
        width={480}
        centered
        closable={false}
        maskClosable={false}
        keyboard={false}
        className="onboarding-modal"
      >
        <p className="onboarding-modal__lead">
          За несколько минут покажем весь путь: создадим проект и опрос, опубликуем его, получим
          тестовые ответы и разберём аналитику.
        </p>
        <div className="onboarding-modal__actions">
          <Button onClick={() => void handleTourAnswer('declined')}>Не нужно</Button>
          <Button onClick={() => void handleTourAnswer('pending')}>Позже</Button>
          <Button type="primary" onClick={() => void handleTourAnswer('accepted')}>
            Пройти обучение
          </Button>
        </div>
      </Modal>
    </>
  );
};
