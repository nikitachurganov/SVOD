import { useState } from 'react';
import { Form, Input, Modal } from 'antd';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { organizationNameRules } from '../../shared/utils/formRules';

const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface CreateOrgFormValues {
  name: string;
  description?: string;
}

export const CreateOrganizationModal = ({ open, onClose }: Props) => {
  const { createOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<CreateOrgFormValues>();

  const reset = () => {
    form.resetFields();
  };

  const handleSubmit = async (values: CreateOrgFormValues) => {
    setLoading(true);
    try {
      await createOrganization({
        name: values.name.trim(),
        description: values.description?.trim() || null,
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
        <Form.Item name="name" label="Название" rules={organizationNameRules()}>
          <Input placeholder="Название организации" maxLength={255} />
        </Form.Item>
        <Form.Item name="description" label="Описание">
          <TextArea
            placeholder="Описание (необязательно)"
            maxLength={1000}
            showCount
            rows={3}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
