import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Avatar,
  Button,
  List,
  Modal,
  Popconfirm,
  Spin,
  Tag,
} from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { getMembers, removeMember } from '../../shared/api/organizations.api';
import type { MemberResponse } from '../../types/organization';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  currentUserId: string;
}

export const MembersModal = ({
  open,
  onClose,
  organizationId,
  currentUserId,
}: Props) => {
  const { notification } = AntApp.useApp();
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getMembers(organizationId);
      setMembers(data);
    } catch {
      notification.error({ message: 'Не удалось загрузить участников' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, organizationId]);

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    try {
      await removeMember(organizationId, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      notification.success({ message: 'Участник удалён' });
    } catch {
      notification.error({ message: 'Не удалось удалить участника' });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Modal
      title="Участники организации"
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : (
        <List
          dataSource={members}
          renderItem={(member) => {
            const isCurrentUser = member.user.id === currentUserId;
            const isOwner = member.role_tag === 'owner';
            const name = `${member.user.first_name} ${member.user.last_name}`;
            const canRemove = !isOwner && !isCurrentUser;

            return (
              <List.Item
                actions={[
                  canRemove ? (
                    <Popconfirm
                      key="remove"
                      title={`Удалить ${name} из организации?`}
                      okText="Удалить"
                      cancelText="Отмена"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void handleRemove(member.user.id)}
                    >
                      <Button
                        size="small"
                        danger
                        loading={removingId === member.user.id}
                      >
                        Удалить
                      </Button>
                    </Popconfirm>
                  ) : null,
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} />}
                  title={
                    <span>
                      {name}
                      {isCurrentUser && (
                        <Tag style={{ marginLeft: 8 }}>Вы</Tag>
                      )}
                    </span>
                  }
                  description={member.user.email}
                />
                <Tag color={isOwner ? 'gold' : 'blue'}>
                  {isOwner ? 'Владелец' : 'Участник'}
                </Tag>
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
};
