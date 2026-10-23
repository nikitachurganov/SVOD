import { useEffect, useState } from 'react';
import { Alert, Modal, Select } from 'antd';

import { getSurveyProjects, type SurveyProject } from '../../api/surveys.api';

interface MoveSurveyModalProps {
  open: boolean;
  organizationId: string | null;
  surveyName: string;
  currentProjectId: string;
  onMove: (project: SurveyProject) => Promise<void>;
  onClose: () => void;
}

/** Pick the project to move a survey to. The id, public link and answers do not change. */
export const MoveSurveyModal = ({
  open,
  organizationId,
  surveyName,
  currentProjectId,
  onMove,
  onClose,
}: MoveSurveyModalProps) => {
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    setSelected(null);
    setError(null);
    setLoadFailed(false);
    setLoading(true);
    getSurveyProjects(organizationId)
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const submit = async () => {
    const target = projects.find((project) => project.id === selected);
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await onMove(target);
    } catch {
      setError('Не удалось переместить опрос. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Переместить в проект"
      okText="Переместить"
      cancelText="Отмена"
      okButtonProps={{ disabled: !selected || loadFailed }}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={onClose}
      maskClosable={!saving}
      destroyOnHidden
    >
      <p style={{ marginTop: 16, wordBreak: 'break-word' }}>
        Опрос «{surveyName}» переедет в выбранный проект. Ссылка для респондентов, ответы и
        аналитика останутся прежними.
      </p>
      <Select
        style={{ width: '100%' }}
        size="large"
        loading={loading}
        placeholder="Выберите проект"
        aria-label="Проект назначения"
        value={selected}
        onChange={setSelected}
        showSearch
        optionFilterProp="label"
        options={projects.map((project) => ({
          value: project.id,
          label: project.id === currentProjectId ? `${project.name} (текущий)` : project.name,
          disabled: project.id === currentProjectId,
        }))}
        notFoundContent={loading ? 'Загрузка…' : 'Проектов нет'}
      />
      {loadFailed && (
        <Alert
          style={{ marginTop: 12 }}
          type="error"
          showIcon
          message="Не удалось загрузить список проектов"
        />
      )}
      {error && <Alert style={{ marginTop: 12 }} type="error" showIcon message={error} />}
    </Modal>
  );
};
