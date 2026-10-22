import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Progress, Select, Switch, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { CalendarOutlined, FormOutlined, InfoCircleOutlined, MailOutlined, MessageOutlined, RobotOutlined, SaveOutlined } from '@ant-design/icons';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import {
  deleteOrganization,
  getMembers,
  transferOrganizationOwnership,
  updateOrganization,
} from '../../shared/api/organizations.api';
import type { MemberResponse } from '../../types/organization';
import { buildDisplayName } from '../../shared/utils/userName';
import { TelegramIntegrationCard } from './TelegramIntegrationCard';

function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { detail?: unknown } } }).response?.data;
    const d = data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  }
  if (err instanceof Error) return err.message;
  return 'Произошла ошибка';
}

const TRANSFER_ERROR_RU: Record<string, string> = {
  'New owner must be an existing member of the organization':
    'Новый владелец должен быть участником организации.',
  'You are already the owner': 'Вы уже владелец этой организации.',
  'Invalid new_owner_user_id': 'Некорректный идентификатор пользователя.',
  'Only the organization owner can perform this action':
    'Только владелец организации может выполнить это действие.',
};

function mapTransferError(detail: string): string {
  return TRANSFER_ERROR_RU[detail] ?? detail;
}

interface Props {
  /** Called after successful org deletion (e.g. navigate away). */
  onAfterDelete?: () => void;
}

interface OrganizationFormValues {
  name: string;
  description?: string;
}

export const OrganizationSettingsSection = ({ onAfterDelete }: Props) => {
  const { user } = useAuth();
  const { activeOrganization, refreshOrganizations } = useOrganization();

  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedNewOwner, setSelectedNewOwner] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [orgForm] = Form.useForm<OrganizationFormValues>();
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'organization' | 'connections' | 'ai'>('organization');

  const isOwner =
    !!activeOrganization && activeOrganization.owner_user_id === user?.id;

  const activeOrganizationId = activeOrganization?.id;

  const loadMembers = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoadingMembers(true);
    setLoadError(null);
    try {
      const data = await getMembers(activeOrganizationId);
      setMembers(data);
    } catch (e) {
      setLoadError(apiErrorMessage(e));
    } finally {
      setLoadingMembers(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    if (activeOrganizationId) void loadMembers();
  }, [activeOrganizationId, loadMembers]);

  useEffect(() => {
    if (!activeOrganization) return;
    orgForm.setFieldsValue({ name: activeOrganization.name, description: activeOrganization.description ?? '' });
    setSaveError(null);
    setSaveSuccess(false);
  }, [activeOrganization, orgForm]);

  const transferCandidates = useMemo(() => {
    if (!user) return [];
    return members
      .filter((m) => m.user.id !== user.id)
      .map((m) => ({
        id: m.user.id,
        text: buildDisplayName(m.user) || m.user.email || m.user.id,
      }));
  }, [members, user]);

  const handleTransfer = async () => {
    if (!activeOrganization || !selectedNewOwner) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      await transferOrganizationOwnership(activeOrganization.id, selectedNewOwner.id);
      await refreshOrganizations();
      setTransferConfirmOpen(false);
      setSelectedNewOwner(null);
      await loadMembers();
    } catch (e) {
      const raw = apiErrorMessage(e);
      setTransferError(mapTransferError(raw));
    } finally {
      setTransferBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!activeOrganization) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteOrganization(activeOrganization.id);
      setDeleteModalOpen(false);
      await refreshOrganizations();
      onAfterDelete?.();
    } catch (e) {
      setDeleteError(apiErrorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleSave = async (values: OrganizationFormValues) => {
    if (!activeOrganization) return;
    setSaveBusy(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateOrganization(activeOrganization.id, { name: values.name.trim(), description: values.description?.trim() || null });
      await refreshOrganizations();
      setSaveSuccess(true);
    } catch (e) {
      setSaveError(apiErrorMessage(e));
    } finally {
      setSaveBusy(false);
    }
  };

  if (!activeOrganization) {
    return (
      <Alert
        type="info"
        message="Нет активной организации"
        description="Выберите организацию в боковой панели."
        showIcon
        closable={false}
      />
    );
  }

  return (
    <>
      <div className={`org-settings org-settings--${settingsTab}`}>
        <p className="org-settings__org-name">{activeOrganization.name}</p>

        <div className="org-settings__tabs" role="tablist" aria-label="Разделы настроек">
          <button className={`org-settings__tab ${settingsTab === 'organization' ? 'org-settings__tab--active' : ''}`} role="tab" aria-selected={settingsTab === 'organization'} onClick={() => setSettingsTab('organization')}>Организация</button>
          <button className={`org-settings__tab ${settingsTab === 'connections' ? 'org-settings__tab--active' : ''}`} role="tab" aria-selected={settingsTab === 'connections'} onClick={() => setSettingsTab('connections')}>Подключения</button>
          <button className={`org-settings__tab ${settingsTab === 'ai' ? 'org-settings__tab--active' : ''}`} role="tab" aria-selected={settingsTab === 'ai'} onClick={() => setSettingsTab('ai')}>ИИ и лимиты</button>
        </div>

        <section className="org-settings__group org-settings__general-tab" aria-labelledby="org-profile-title"><div className="org-settings__group-heading"><h3 id="org-profile-title">Профиль организации</h3><p>Добавьте описание, чтобы участникам было проще ориентироваться в рабочем пространстве.</p></div><Card className="org-settings__tile" styles={{ body: { padding: 20 } }}><Form className="org-settings__form" form={orgForm} layout="vertical" disabled={!isOwner} onFinish={(values) => void handleSave(values)}><Form.Item name="name" label="Название организации" rules={[{ required: true, whitespace: true, message: 'Введите название организации' }]}><Input maxLength={255} /></Form.Item><Form.Item name="description" label="Описание" extra="Видно всем участникам организации."><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount placeholder="Например, создаём сервисы для автоматизации внутренних процессов." /></Form.Item>{isOwner && <div className="org-settings__form-actions"><Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveBusy}>Сохранить изменения</Button>{saveSuccess && <span className="org-settings__save-status">Изменения сохранены</span>}</div>}{saveError && <Alert type="error" message="Не удалось сохранить изменения" description={saveError} showIcon />}</Form></Card></section>
        {/* @ts-expect-error heterogeneous icon tuples are normalized at render time */}
        <section className="org-settings__group org-settings__future-group org-settings__connections-tab" aria-labelledby="future-integrations"><div className="org-settings__group-heading org-settings__group-heading--split"><div><h3 id="future-integrations">Интеграции</h3><p>Подключайте привычные сервисы, чтобы работать с заявками в одном месте.</p></div></div><Card className="org-settings__tile" styles={{ body: { padding: 20 } }}><div className="org-settings__integration-grid">{[['Yandex Mail', MailOutlined, 'yellow'], ['Telegram', MessageOutlined, 'blue'], ['MAX', MessageOutlined, 'violet'], ['Calendar', CalendarOutlined, 'green'], ['Yandex Forms', FormOutlined, 'red'], ['Google Forms', FormOutlined, 'purple']].map(([name, Icon, tone]) => { if (name === 'Telegram') return <TelegramIntegrationCard key="Telegram" />; const IntegrationIcon = Icon as typeof MailOutlined; return <article className="org-settings__integration-card" key={name as string}><span className={`org-settings__integration-icon org-settings__integration-icon--${tone}`}><IntegrationIcon /></span><div><h4>{name}</h4><p>Скоро будет доступно</p></div><Tag>Скоро</Tag></article>; })}</div></Card></section>
        <section className="org-settings__group org-settings__future-group org-settings__ai-tab" aria-labelledby="future-ai"><div className="org-settings__group-heading"><h3 id="future-ai">Лимиты и ИИ</h3><p>Здесь появятся данные о потреблении ресурсов и управление ИИ-функциями.</p></div><div className="org-settings__resource-grid"><Card className="org-settings__tile" styles={{ body: { padding: 20 } }}><div className="org-settings__card-title-row"><div><h4>Лимиты организации</h4><p>Данные появятся после подключения тарифа.</p></div><Tooltip title="Лимиты будут рассчитываться по активному тарифу."><InfoCircleOutlined className="org-settings__info-icon" /></Tooltip></div><div className="org-settings__limit-value"><span>—</span><small>из — ИИ-запросов</small></div><Progress percent={0} showInfo={false} /><p className="org-settings__placeholder-note">Здесь можно будет следить за остатком запросов и мест в команде.</p></Card><Card className="org-settings__tile" styles={{ body: { padding: 20 } }}><div className="org-settings__card-title-row"><div><h4>ИИ-функции</h4><p>Включайте только нужные сценарии для команды.</p></div><RobotOutlined className="org-settings__ai-icon" /></div><div className="org-settings__ai-options">{['Помощник при создании заявки', 'Краткое резюме заявки', 'Анализ готовности заявки'].map((item) => <div className="org-settings__ai-option" key={item}><span>{item}</span><Switch checked disabled /></div>)}</div><p className="org-settings__placeholder-note">Настройки станут активны после запуска управления ИИ-функциями.</p></Card></div></section>
        {loadError && (
          <Alert
            type="error"
            message="Не удалось загрузить участников"
            description={loadError}
            showIcon
            closable
            onClose={() => setLoadError(null)}
          />
        )}

        {!isOwner && (
          <Alert
            type="info"
            message="Доступ ограничен"
            description="Изменение владельца и удаление организации доступны только текущему владельцу."
            showIcon
            closable={false}
          />
        )}

        {isOwner && (
          <>
            <Card className="org-settings__tile org-settings__general-tab" styles={{ body: { padding: 16 } }}>
              <h3 className="org-settings__tile-title">Смена владельца</h3>
              <p className="org-settings__tile-description">
                Передайте права владельца другому участнику. Вы останетесь участником с ролью
                «Участник». Сначала пригласите пользователей на странице{' '}
                <Link to="/participants">Участники</Link>.
              </p>

              {transferCandidates.length === 0 ? (
                <p className="org-settings__empty-text">
                  Нет других участников для передачи владения.
                </p>
              ) : (
                <>
                  <div className="org-settings__field-wrap">
                    <span style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Новый владелец</span>
                    <Select
                      id="org-transfer-owner"
                      placeholder="Выберите участника"
                      value={selectedNewOwner?.id}
                      onChange={(id) => {
                        const item = transferCandidates.find((c) => c.id === id);
                        setSelectedNewOwner(item ?? null);
                      }}
                      disabled={loadingMembers}
                      options={transferCandidates.map((c) => ({ value: c.id, label: c.text }))}
                      style={{ width: '100%', maxWidth: 400 }}
                    />
                  </div>
                  <Button
                    disabled={!selectedNewOwner || loadingMembers}
                    onClick={() => setTransferConfirmOpen(true)}
                  >
                    Передать владение…
                  </Button>
                </>
              )}

              {transferError && (
                <div className="org-settings__alert-wrap">
                  <Alert
                    type="error"
                    message="Ошибка"
                    description={transferError}
                    showIcon
                    closable
                    onClose={() => setTransferError(null)}
                  />
                </div>
              )}
            </Card>

            <Card className="org-settings__tile org-settings__tile--danger org-settings__general-tab" styles={{ body: { padding: 16 } }}>
              <h3 className="org-settings__tile-title">Удаление организации</h3>
              <p className="org-settings__tile-description">
                Безвозвратно удалить организацию и связанные данные. Доступно только владельцу.
              </p>
              <Button
                danger
                onClick={() => {
                  setDeleteError(null);
                  setDeleteModalOpen(true);
                }}
              >
                Удалить организацию…
              </Button>
              {deleteError && (
                <div className="org-settings__alert-wrap">
                  <Alert
                    type="error"
                    message="Ошибка"
                    description={deleteError}
                    showIcon
                    closable
                    onClose={() => setDeleteError(null)}
                  />
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Modal
        open={transferConfirmOpen}
        title="Передать владение?"
        okText="Передать"
        cancelText="Отмена"
        okButtonProps={{ disabled: transferBusy || !selectedNewOwner, loading: transferBusy }}
        onCancel={() => !transferBusy && setTransferConfirmOpen(false)}
        onOk={() => void handleTransfer()}
      >
        <p style={{ margin: 0 }}>
          Владельцем организации «{activeOrganization.name}» станет{' '}
          <strong>{selectedNewOwner?.text ?? '—'}</strong>. Продолжить?
        </p>
      </Modal>

      <Modal
        open={deleteModalOpen}
        title="Удалить организацию?"
        okText="Удалить"
        cancelText="Отмена"
        okButtonProps={{ danger: true, loading: deleteBusy }}
        onCancel={() => !deleteBusy && setDeleteModalOpen(false)}
        onOk={() => void handleDelete()}
      >
        <p style={{ margin: 0 }}>
          Организация «{activeOrganization.name}» будет удалена без возможности восстановления.
        </p>
      </Modal>
    </>
  );
};
