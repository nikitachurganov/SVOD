import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Grid,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteRequest,
  getRequests,
  type RequestResponse,
} from '../shared/api/requests.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/context/organization.context';

const { Title } = Typography;

const statusView: Record<RequestResponse['status'], { color: string; label: string }> = {
  open: { color: 'processing', label: 'Открыта' },
  closed: { color: 'error', label: 'Закрыта' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const RequestsPage = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { notification } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const contentPadding = isMobile ? token.paddingSM : screens.lg ? token.paddingLG : token.paddingMD;
  const { activeOrganization } = useOrganization();

  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRequests = useCallback(() => {
    setLoading(true);
    getRequests(activeOrganization?.id)
      .then((data) => {
        setRequests(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить заявки');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeOrganization?.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteRequest(id);
        setRequests((prev) => prev.filter((r) => r.id !== id));
        notification.success({ title: 'Заявка удалена' });
      } catch (err) {
        notification.error({
          title: 'Ошибка удаления',
          description: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
        });
      } finally {
        setDeletingId(null);
      }
    },
    [notification],
  );

  const columns = useMemo<TableProps<RequestResponse>['columns']>(
    () => [
      {
        title: 'Название заявки',
        dataIndex: 'title',
        key: 'title',
        minWidth: 260,
        render: (_: unknown, record: RequestResponse) => (
          <Link to={`/requests/${record.id}`} style={{ fontWeight: 500 }}>
            {record.title}
          </Link>
        ),
      },
      {
        title: 'Описание',
        dataIndex: 'ai_summary',
        key: 'ai_summary',
        width: 350,
        responsive: ['md'],
        render: (value: RequestResponse['ai_summary']) => {
          const text = value?.summary;
          return text ? (
            <Tooltip title={text}>
              <span
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {text}
              </span>
            </Tooltip>
          ) : (
            <Typography.Text type="secondary">Нет описания</Typography.Text>
          );
        },
      },
      {
        title: 'Номер заявки',
        dataIndex: 'id',
        key: 'id',
        width: 160,
        responsive: ['md'],
      },
      {
        title: 'Дата создания',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 200,
        responsive: ['lg'],
        sorter: (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Автор',
        key: 'author',
        width: 220,
        responsive: ['md'],
        render: (_: unknown, record: RequestResponse) =>
          record.author ? buildDisplayName(record.author) : 'Неизвестный автор',
      },
      {
        title: 'Дата изменения',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 200,
        responsive: ['xl'],
        sorter: (a, b) =>
          new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (status: RequestResponse['status']) => {
          const view = statusView[status];
          return <Tag color={view.color}>{view.label}</Tag>;
        },
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 200,
        render: (_: unknown, record: RequestResponse) => (
          <Space size="small">
            <Button
              type="link"
              size="small"
              onClick={() => navigate(`/requests/${record.id}`)}
            >
              Открыть
            </Button>
            <Popconfirm
              title="Удалить заявку?"
              description="Это действие нельзя отменить."
              okText="Удалить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(record.id)}
            >
              <Button
                type="link"
                size="small"
                danger
                loading={deletingId === record.id}
              >
                Удалить
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [navigate, handleDelete, deletingId],
  );

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          padding: `${token.paddingSM}px ${contentPadding}px ${token.padding}px`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: token.marginSM,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Реестр заявок
          </Title>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/requests/create')}
            block={isMobile}
          >
            Создать заявку
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: contentPadding,
          background: token.colorBgLayout,
        }}
      >
        {error ? (
          <Alert
            type="error"
            showIcon
            message="Ошибка загрузки"
            description={error}
            action={
              <Button size="small" onClick={loadRequests}>
                Повторить
              </Button>
            }
          />
        ) : (
          <>
            {isMobile ? (
              loading ? (
                <Table<RequestResponse> rowKey="id" loading dataSource={[]} columns={columns} pagination={false} />
              ) : requests.length === 0 ? (
                <Empty description="Заявок пока нет. Создайте первую!" />
              ) : (
                <Space direction="vertical" size={token.marginSM} style={{ width: '100%' }}>
                  {requests.map((record) => (
                    <Card key={record.id} size="small" title={record.title}>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Typography.Text type="secondary">№ {record.id}</Typography.Text>
                        <Typography.Paragraph
                          type="secondary"
                          ellipsis={{ rows: 2 }}
                          style={{ margin: 0 }}
                        >
                          {record.ai_summary?.summary || 'Нет описания'}
                        </Typography.Paragraph>
                        <Typography.Text>
                          Автор:{' '}
                          {record.author
                            ? buildDisplayName(record.author)
                            : 'Неизвестный автор'}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Создано: {formatDate(record.created_at)}
                        </Typography.Text>
                        <Tag color={statusView[record.status].color}>
                          {statusView[record.status].label}
                        </Tag>
                        <Space>
                          <Button size="small" onClick={() => navigate(`/requests/${record.id}`)}>
                            Открыть
                          </Button>
                          <Popconfirm
                            title="Удалить заявку?"
                            description="Это действие нельзя отменить."
                            okText="Удалить"
                            cancelText="Отмена"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => handleDelete(record.id)}
                          >
                            <Button size="small" danger loading={deletingId === record.id}>
                              Удалить
                            </Button>
                          </Popconfirm>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                </Space>
              )
            ) : (
              <Table<RequestResponse>
                rowKey="id"
                loading={loading}
                dataSource={requests}
                columns={columns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                style={{ width: '100%' }}
                locale={{ emptyText: 'Заявок пока нет. Создайте первую!' }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
