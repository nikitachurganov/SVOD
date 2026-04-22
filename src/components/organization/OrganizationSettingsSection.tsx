import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  InlineNotification,
  Modal,
  Tile,
} from '@carbon/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/context/auth.context';
import { useOrganization } from '../../shared/context/organization.context';
import {
  deleteOrganization,
  getMembers,
  transferOrganizationOwnership,
} from '../../shared/api/organizations.api';
import type { MemberResponse } from '../../types/organization';
import { buildDisplayName } from '../../shared/utils/userName';

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

  const isOwner =
    !!activeOrganization && activeOrganization.owner_user_id === user?.id;

  const loadMembers = useCallback(async () => {
    if (!activeOrganization) return;
    setLoadingMembers(true);
    setLoadError(null);
    try {
      const data = await getMembers(activeOrganization.id);
      setMembers(data);
    } catch (e) {
      setLoadError(apiErrorMessage(e));
    } finally {
      setLoadingMembers(false);
    }
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (activeOrganization) void loadMembers();
  }, [activeOrganization?.id, loadMembers]);

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

  if (!activeOrganization) {
    return (
      <InlineNotification
        kind="info"
        title="Нет активной организации"
        subtitle="Выберите организацию в боковой панели."
        lowContrast
        hideCloseButton
      />
    );
  }

  return (
    <>
      <div className="org-settings">
        <p className="org-settings__org-name">{activeOrganization.name}</p>

        {loadError && (
          <InlineNotification
            kind="error"
            title="Не удалось загрузить участников"
            subtitle={loadError}
            lowContrast
            onCloseButtonClick={() => setLoadError(null)}
          />
        )}

        {!isOwner && (
          <InlineNotification
            kind="info"
            title="Доступ ограничен"
            subtitle="Изменение владельца и удаление организации доступны только текущему владельцу."
            lowContrast
            hideCloseButton
          />
        )}

        {isOwner && (
          <>
            <Tile className="org-settings__tile">
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
                    <Dropdown
                      id="org-transfer-owner"
                      titleText="Новый владелец"
                      label="Выберите участника"
                      items={transferCandidates}
                      itemToString={(item) => item?.text ?? ''}
                      selectedItem={selectedNewOwner}
                      onChange={({ selectedItem }) => setSelectedNewOwner(selectedItem ?? null)}
                      disabled={loadingMembers}
                    />
                  </div>
                  <Button
                    kind="secondary"
                    disabled={!selectedNewOwner || loadingMembers}
                    onClick={() => setTransferConfirmOpen(true)}
                  >
                    Передать владение…
                  </Button>
                </>
              )}

              {transferError && (
                <div className="org-settings__alert-wrap">
                  <InlineNotification
                    kind="error"
                    title="Ошибка"
                    subtitle={transferError}
                    lowContrast
                    onCloseButtonClick={() => setTransferError(null)}
                  />
                </div>
              )}
            </Tile>

            <Tile className="org-settings__tile org-settings__tile--danger">
              <h3 className="org-settings__tile-title">Удаление организации</h3>
              <p className="org-settings__tile-description">
                Безвозвратно удалить организацию и связанные данные. Доступно только владельцу.
              </p>
              <Button
                kind="danger"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteModalOpen(true);
                }}
              >
                Удалить организацию…
              </Button>
              {deleteError && (
                <div className="org-settings__alert-wrap">
                  <InlineNotification
                    kind="error"
                    title="Ошибка"
                    subtitle={deleteError}
                    lowContrast
                    onCloseButtonClick={() => setDeleteError(null)}
                  />
                </div>
              )}
            </Tile>
          </>
        )}
      </div>

      <Modal
        open={transferConfirmOpen}
        modalHeading="Передать владение?"
        primaryButtonText="Передать"
        secondaryButtonText="Отмена"
        primaryButtonDisabled={transferBusy || !selectedNewOwner}
        onRequestClose={() => !transferBusy && setTransferConfirmOpen(false)}
        onRequestSubmit={() => void handleTransfer()}
      >
        <p style={{ margin: 0 }}>
          Владельцем организации «{activeOrganization.name}» станет{' '}
          <strong>{selectedNewOwner?.text ?? '—'}</strong>. Продолжить?
        </p>
      </Modal>

      <Modal
        open={deleteModalOpen}
        danger
        modalHeading="Удалить организацию?"
        primaryButtonText="Удалить"
        secondaryButtonText="Отмена"
        primaryButtonDisabled={deleteBusy}
        onRequestClose={() => !deleteBusy && setDeleteModalOpen(false)}
        onRequestSubmit={() => void handleDelete()}
      >
        <p style={{ margin: 0 }}>
          Организация «{activeOrganization.name}» будет удалена без возможности восстановления.
        </p>
      </Modal>
    </>
  );
};
