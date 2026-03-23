import { useState } from 'react';
import { Modal, TextInput } from '@carbon/react';
import { inviteUser } from '../../shared/api/organizations.api';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

const API_ERROR_MESSAGES: Record<string, string> = {
  'User not found': 'Пользователь с такой почтой не найден',
  'User is already a member of this organization': 'Пользователь уже состоит в организации',
  'Pending invitation already exists for this user': 'Приглашение уже отправлено',
  'You cannot invite yourself': 'Нельзя пригласить самого себя',
};

export const InviteMemberModal = ({ open, onClose, organizationId }: Props) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const reset = () => {
    setEmail('');
    setEmailError('');
  };

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setEmailError('Введите email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Некорректный формат email');
      return;
    }

    setLoading(true);
    try {
      await inviteUser(organizationId, trimmed);
      reset();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEmailError(API_ERROR_MESSAGES[detail ?? ''] ?? 'Не удалось отправить приглашение');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading="Пригласить пользователя"
      primaryButtonText={loading ? 'Отправка…' : 'Пригласить'}
      secondaryButtonText="Отмена"
      primaryButtonDisabled={loading}
      onRequestClose={() => { reset(); onClose(); }}
      onRequestSubmit={() => void handleSubmit()}
    >
      <div style={{ paddingTop: 8 }}>
        <TextInput
          id="invite-email"
          labelText="Email пользователя"
          placeholder="user@example.com"
          value={email}
          invalid={!!emailError}
          invalidText={emailError}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError('');
          }}
        />
      </div>
    </Modal>
  );
};
