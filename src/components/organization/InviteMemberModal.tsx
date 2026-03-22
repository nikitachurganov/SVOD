import { useState } from 'react';
import { App as AntApp, Form, Input, Modal } from 'antd';
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
  const [form] = Form.useForm<{ email: string }>();
  const { notification } = AntApp.useApp();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await inviteUser(organizationId, values.email.trim().toLowerCase());
      notification.success({ message: 'Приглашение отправлено' });
      form.resetFields();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notification.error({
        message: API_ERROR_MESSAGES[detail ?? ''] ?? 'Не удалось отправить приглашение',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Пригласить пользователя"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Пригласить"
      cancelText="Отмена"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="email"
          label="Email пользователя"
          rules={[
            { required: true, message: 'Введите email' },
            { type: 'email', message: 'Некорректный формат email' },
          ]}
        >
          <Input placeholder="user@example.com" autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
