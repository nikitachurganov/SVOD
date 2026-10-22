import { useEffect, useState } from 'react';
import { Alert, Checkbox, Modal, Spin } from 'antd';

import { getMethodologyCatalog, type MethodologyCatalog } from '../../api/surveys.api';

const MAX_SELECTED = 3;

export interface MethodologyPickerModalProps {
  open: boolean;
  selectedIds: string[];
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}

export const MethodologyPickerModal = ({
  open,
  selectedIds,
  onCancel,
  onConfirm,
}: MethodologyPickerModalProps) => {
  const [catalog, setCatalog] = useState<MethodologyCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The parent remounts the modal on every opening, so the initial value is enough
  const [selected, setSelected] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (!open || catalog) return;
    getMethodologyCatalog()
      .then(setCatalog)
      .catch(() => setError('Не удалось загрузить каталог методик.'));
  }, [open, catalog]);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  return (
    <Modal
      open={open}
      title="Набор методик"
      width={640}
      okText="Применить и перестроить"
      cancelText="Отмена"
      okButtonProps={{ disabled: selected.length === 0 }}
      onCancel={onCancel}
      onOk={() => onConfirm(selected)}
    >
      <p style={{ color: 'var(--app-text-secondary)', fontSize: 13, marginTop: 0 }}>
        Выберите до {MAX_SELECTED} методик. ИИ перестроит опрос с их учётом, текущие вопросы
        сохранятся там, где это возможно.
      </p>
      {error && <Alert type="error" message={error} showIcon />}
      {!catalog && !error && <Spin />}
      {catalog && (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {catalog.categories.map((category) => (
            <div key={category.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{category.name}</div>
              {catalog.methodologies
                .filter((m) => m.category_id === category.id)
                .map((m) => {
                  const checked = selected.includes(m.id);
                  return (
                    <div key={m.id} style={{ marginBottom: 6 }}>
                      <Checkbox
                        checked={checked}
                        disabled={!checked && selected.length >= MAX_SELECTED}
                        onChange={(e) => toggle(m.id, e.target.checked)}
                      >
                        <span style={{ fontWeight: 500 }}>{m.name}</span>
                      </Checkbox>
                      <div
                        style={{
                          marginLeft: 24,
                          fontSize: 12,
                          color: 'var(--app-text-secondary)',
                        }}
                      >
                        {m.when_to_use}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
