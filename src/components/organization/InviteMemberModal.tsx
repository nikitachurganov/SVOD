import { useState } from 'react';
import { Form, Input, Modal } from 'antd';
import { inviteUser } from '../../shared/api/organizations.api';
import { emailRules, requiredRule } from '../../shared/utils/formRules';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

interface InviteFormValues {
  email: string;
}

const API_ERROR_MESSAGES: Record<string, string> = {
  'User not found': 'Пользователь с такой почтой не найден',
  'User is already a member of this organization': 'Пользователь уже состоит в организации',
  'Pending invitation already exists for this user': 'Приглашение уже отправлено',
  'You cannot invite yourself': 'Нельзя пригласить самого себя',
};

export const InviteMemberModal = ({ open, onClose, organizationId }: Props) => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<InviteFormValues>();

  const reset = () => {
    form.resetFields();
  };

  const handleSubmit = async (values: InviteFormValues) => {
    const trimmed = values.email.trim().toLowerCase();
    setLoading(true);
    try {
      await inviteUser(organizationId, trimmed);
      reset();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      form.setFields([
        {
          name: 'email',
          errors: [API_ERROR_MESSAGES[detail ?? ''] ?? 'Не удалось отправить приглашение'],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Пригласить пользователя"
      okText={loading ? 'Отправка…' : 'Пригласить'}
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={() => {
        reset();
        onClose();
      }}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        style={{ paddingTop: 8 }}
      >
        <Form.Item
          name="email"
          label="Email пользователя"
          rules={[requiredRule('Введите email'), ...emailRules()]}
        >
          <Input placeholder="user@example.com" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
