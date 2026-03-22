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
  Typography,
  theme,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { deleteForm, getForms, type FormResponse } from '../shared/api/forms.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/context/organization.context';

const { Title } = Typography;

// ─── Date formatter ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const FormsPage = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { notification } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const contentPadding = isMobile ? token.paddingSM : screens.lg ? token.paddingLG : token.paddingMD;
  const { activeOrganization } = useOrganization();

  const [forms, setForms] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadForms = useCallback(() => {
    setLoading(true);
    getForms(activeOrganization?.id)
      .then((data) => {
        setForms(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить формы');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeOrganization?.id]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteForm(id);
        setForms((prev) => prev.filter((f) => f.id !== id));
        notification.success({ title: 'Форма удалена' });
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

  const columns = useMemo<TableProps<FormResponse>['columns']>(
    () => [
      {
        title: 'Название',
        dataIndex: 'name',
        key: 'name',
        minWidth: 260,
        render: (_: unknown, record: FormResponse) => (
          <Link to={`/forms/${record.id}`} style={{ fontWeight: 500 }}>
            {record.name}
          </Link>
        ),
      },
      {
        title: 'Автор',
        key: 'author',
        width: 220,
        responsive: ['md'],
        render: (_: unknown, record: FormResponse) =>
          record.author ? buildDisplayName(record.author) : 'Неизвестный автор',
      },
      {
        title: 'Дата создания',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        responsive: ['lg'],
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 160,
        render: (_: unknown, record: FormResponse) => (
          <Space size="small">
            <Button
              type="link"
              size="small"
              onClick={() => navigate(`/forms/${record.id}/edit`)}
            >
              Изменить
            </Button>
            <Popconfirm
              title="Удалить форму?"
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
            Реестр форм
          </Title>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/forms/create')}
            block={isMobile}
          >
            Создать форму
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
              <Button size="small" onClick={loadForms}>
                Повторить
              </Button>
            }
          />
        ) : (
          <>
            {isMobile ? (
              loading ? (
                <Table<FormResponse> rowKey="id" loading dataSource={[]} columns={columns} pagination={false} />
              ) : forms.length === 0 ? (
                <Empty description="Форм пока нет. Создайте первую!" />
              ) : (
                <Space direction="vertical" size={token.marginSM} style={{ width: '100%' }}>
                  {forms.map((record) => (
                    <Card key={record.id} size="small" title={record.name}>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Typography.Text type="secondary">
                          Автор:{' '}
                          {record.author
                            ? buildDisplayName(record.author)
                            : 'Неизвестный автор'}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Создано: {formatDate(record.created_at)}
                        </Typography.Text>
                        <Space>
                          <Button size="small" onClick={() => navigate(`/forms/${record.id}`)}>
                            Открыть
                          </Button>
                          <Button size="small" onClick={() => navigate(`/forms/${record.id}/edit`)}>
                            Изменить
                          </Button>
                          <Popconfirm
                            title="Удалить форму?"
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
              <Table<FormResponse>
                rowKey="id"
                loading={loading}
                dataSource={forms}
                columns={columns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                style={{ width: '100%' }}
                locale={{ emptyText: 'Форм пока нет. Создайте первую!' }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
