import { useState } from 'react';
import { Modal, TextInput, TextArea } from '@carbon/react';
import { useOrganization } from '../../shared/context/organization.context';

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
      modalHeading="Создать организацию"
      primaryButtonText={loading ? 'Создание…' : 'Создать'}
      secondaryButtonText="Отмена"
      primaryButtonDisabled={loading}
      onRequestClose={() => { reset(); onClose(); }}
      onRequestSubmit={() => void handleSubmit()}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <TextInput
          id="org-name"
          labelText="Название"
          placeholder="Название организации"
          value={name}
          maxLength={255}
          invalid={!!nameError}
          invalidText={nameError}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError('');
          }}
        />
        <TextArea
          id="org-description"
          labelText="Описание"
          placeholder="Описание (необязательно)"
          value={description}
          maxCount={1000}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
};
