import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal } from 'antd';
import axios from 'axios';

import type { SurveyProject, SurveyProjectPayload } from '../../api/surveys.api';

const NAME_MAX = 200;
const DESCRIPTION_MAX = 1000;

interface ProjectFormModalProps {
  open: boolean;
  /** Set to rename; empty — a new project is created */
  project?: SurveyProject | null;
  onSubmit: (payload: SurveyProjectPayload) => Promise<void>;
  onClose: () => void;
}

const errorText = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg;
  }
  return 'Не удалось сохранить проект. Попробуйте ещё раз.';
};

/** Create / rename a project. A failed save keeps the modal open with the typed text. */
export const ProjectFormModal = ({ open, project, onSubmit, onClose }: ProjectFormModalProps) => {
  const [form] = Form.useForm<SurveyProjectPayload>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ name: project?.name ?? '', description: project?.description ?? '' });
    setError(null);
  }, [open, project, form]);

  const submit = async () => {
    let values: SurveyProjectPayload;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: values.name.trim(), description: values.description?.trim() || null });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={project ? 'Переименовать проект' : 'Новый проект'}
      okText={project ? 'Сохранить' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={onClose}
      maskClosable={!saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="Название"
          rules={[
            { required: true, whitespace: true, message: 'Укажите название проекта' },
            { max: NAME_MAX, message: `Не длиннее ${NAME_MAX} символов` },
          ]}
        >
          <Input
            autoFocus
            maxLength={NAME_MAX + 50}
            placeholder="Например, «Удовлетворённость обучением»"
            onPressEnter={() => void submit()}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label="Описание (необязательно)"
          rules={[{ max: DESCRIPTION_MAX, message: `Не длиннее ${DESCRIPTION_MAX} символов` }]}
        >
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder="О чём это исследование"
          />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} />}
      </Form>
    </Modal>
  );
};
