import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Badge,
  Button,
  Drawer,
  Empty,
  List,
  Space,
  Spin,
  Typography,
} from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import {
  acceptInvitation,
  declineInvitation,
  getMyInvitations,
} from '../../shared/api/organizations.api';
import type { MyInvitationResponse } from '../../types/organization';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  onAccepted: () => void;
}

export const InvitationsDrawer = ({ open, onClose, onAccepted }: Props) => {
  const { notification } = AntApp.useApp();
  const [invitations, setInvitations] = useState<MyInvitationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getMyInvitations();
      setInvitations(data);
    } catch {
      notification.error({ message: 'Не удалось загрузить приглашения' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const handleAccept = async (id: string) => {
    setActionLoading(id);
    try {
      await acceptInvitation(id);
      notification.success({ message: 'Вы вступили в организацию' });
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      onAccepted();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notification.error({ message: detail ?? 'Не удалось принять приглашение' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (id: string) => {
    setActionLoading(id);
    try {
      await declineInvitation(id);
      notification.success({ message: 'Приглашение отклонено' });
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch {
      notification.error({ message: 'Не удалось отклонить приглашение' });
    } finally {
      setActionLoading(null);
    }
  };

  const title = (
    <Space>
      Приглашения
      {invitations.length > 0 && <Badge count={invitations.length} />}
    </Space>
  );

  return (
    <Drawer title={title} open={open} onClose={onClose} width={400}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : invitations.length === 0 ? (
        <Empty description="Нет входящих приглашений" />
      ) : (
        <List
          dataSource={invitations}
          renderItem={(inv) => {
            const inviterName = inv.invited_by
              ? `${inv.invited_by.first_name} ${inv.invited_by.last_name}`
              : 'Неизвестно';
            const busy = actionLoading === inv.id;

            return (
              <List.Item
                actions={[
                  <Button
                    key="accept"
                    type="primary"
                    size="small"
                    icon={<CheckOutlined />}
                    loading={busy}
                    onClick={() => void handleAccept(inv.id)}
                  >
                    Принять
                  </Button>,
                  <Button
                    key="decline"
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    loading={busy}
                    onClick={() => void handleDecline(inv.id)}
                  >
                    Отклонить
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={inv.organization_name}
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Пригласил: {inviterName}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Drawer>
  );
};
