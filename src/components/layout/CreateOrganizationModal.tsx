import { useState } from 'react';
import { App as AntApp, Button, Form, Input, Modal } from 'antd';
import { useOrganization } from '../../shared/context/organization.context';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CreateOrganizationModal = ({ open, onClose }: Props) => {
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const { notification } = AntApp.useApp();
  const { createOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await createOrganization({
        name: values.name.trim(),
        description: values.description?.trim() || null,
      });
      notification.success({ message: 'Организация создана', description: 'Вы можете начать работу.' });
      form.resetFields();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      notification.error({ message: 'Не удалось создать организацию' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Создать организацию"
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); onClose(); }}
      okText="Создать"
      cancelText="Отмена"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="Название"
          rules={[
            { required: true, message: 'Введите название организации' },
            { max: 255, message: 'Не более 255 символов' },
          ]}
        >
          <Input placeholder="Название организации" maxLength={255} />
        </Form.Item>
        <Form.Item name="description" label="Описание">
          <Input.TextArea
            placeholder="Описание (необязательно)"
            rows={3}
            maxLength={1000}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
