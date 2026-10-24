import { useEffect, useState } from 'react';
import { Alert, Input, Modal, Radio, Select } from 'antd';
import axios from 'axios';

import { createSurveyProject, type SurveyProject } from '../../api/surveys.api';
import { FOLDER_COLORS } from '../../lib/folderColors';

const NAME_MAX = 200;

type Target = 'existing' | 'new';

interface CreateSurveyModalProps {
  open: boolean;
  organizationId: string | null;
  projects: SurveyProject[];
  /** Called with the project the survey will be created in (an existing or a just created one) */
  onContinue: (project: SurveyProject, created: boolean) => void;
  onClose: () => void;
}

const errorText = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return 'Не удалось создать проект. Попробуйте ещё раз.';
};

/** Where to put a new survey: pick an existing project or make a new one first */
export const CreateSurveyModal = ({
  open,
  organizationId,
  projects,
  onContinue,
  onClose,
}: CreateSurveyModalProps) => {
  const [target, setTarget] = useState<Target>('existing');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(projects.length > 0 ? 'existing' : 'new');
    setProjectId(projects[0]?.id);
    setName('');
    setError(null);
  }, [open, projects]);

  const trimmed = name.trim();
  const canContinue = target === 'existing' ? !!projectId : trimmed.length > 0 && !!organizationId;

  const submit = async () => {
    if (!canContinue) return;
    if (target === 'existing') {
      const project = projects.find((p) => p.id === projectId);
      if (project) onContinue(project, false);
      return;
    }
    if (!organizationId) return;
    setSaving(true);
    setError(null);
    try {
      const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)].key;
      const project = await createSurveyProject(organizationId, { name: trimmed, color });
      onContinue(project, true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Создать опрос"
      okText="Продолжить"
      cancelText="Отмена"
      okButtonProps={{ disabled: !canContinue }}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={onClose}
      maskClosable={!saving}
      destroyOnHidden
    >
      <p style={{ marginTop: 12, color: 'var(--app-text-secondary)' }}>
        Опрос создаётся внутри проекта. Выберите существующий или начните с нового — после этого
        откроется конструктор формы.
      </p>
      <Radio.Group
        value={target}
        onChange={(event) => setTarget(event.target.value as Target)}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <Radio value="existing" disabled={projects.length === 0}>
          Использовать существующий проект
        </Radio>
        {target === 'existing' && projects.length > 0 && (
          <Select
            value={projectId}
            onChange={setProjectId}
            aria-label="Проект"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
        )}
        <Radio value="new">Создать новый проект</Radio>
        {target === 'new' && (
          <Input
            autoFocus
            value={name}
            maxLength={NAME_MAX}
            placeholder="Название проекта"
            aria-label="Название нового проекта"
            onChange={(event) => setName(event.target.value)}
            onPressEnter={() => void submit()}
          />
        )}
      </Radio.Group>
      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}
    </Modal>
  );
};
