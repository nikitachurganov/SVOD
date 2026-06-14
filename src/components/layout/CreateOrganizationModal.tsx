import { useState } from 'react';
import { Modal, Input, Form } from 'antd';
import { useOrganization } from '../../shared/hooks/organization.hooks';

const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CreateOrganizationModal = ({ open, onClose }: Props) => {
  const { createOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setNameError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError('Введите название организации');
      return;
    }
    if (name.trim().length > 255) {
      setNameError('Не более 255 символов');
      return;
    }

    setLoading(true);
    try {
      await createOrganization({
        name: name.trim(),
        description: description.trim() || null,
      });
      reset();
      onClose();
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Создать организацию"
      okText={loading ? 'Создание…' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={() => { reset(); onClose(); }}
      onOk={() => void handleSubmit()}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <Form.Item
          label="Название"
          validateStatus={nameError ? 'error' : undefined}
          help={nameError || undefined}
        >
          <Input
            id="org-name"
            placeholder="Название организации"
            value={name}
            maxLength={255}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
          />
        </Form.Item>
        <Form.Item label="Описание">
          <TextArea
            id="org-description"
            placeholder="Описание (необязательно)"
            value={description}
            maxLength={1000}
            showCount
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Form.Item>
      </div>
    </Modal>
  );
};
