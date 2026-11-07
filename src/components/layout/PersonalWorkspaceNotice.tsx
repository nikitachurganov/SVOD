import { useState } from 'react';
import { Button, Result } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { CreateOrganizationModal } from './CreateOrganizationModal';

/** Shown instead of the people and settings pages while the person is in their own workspace */
export const PersonalWorkspaceNotice = () => {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Result
        icon={<TeamOutlined />}
        title="Это ваше личное пространство"
        subTitle="Оно только ваше: пригласить в него людей нельзя. Чтобы работать над опросами вместе, создайте команду, пригласите коллег и выдайте им роли."
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            Создать команду
          </Button>
        }
      />
      <CreateOrganizationModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
};
