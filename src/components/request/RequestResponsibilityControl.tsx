import { useState } from 'react';
import { Button, Modal, Select } from 'antd';
import { UserSwitchOutlined } from '@ant-design/icons';
import type { AuthorPreview } from '../../types/author';
import type { MemberResponse } from '../../types/organization';
import { getMembers } from '../../shared/api/organizations.api';
import { assignRequestResponsible } from '../../shared/api/requests.api';
import { buildDisplayName } from '../../shared/utils/userName';

type Props = {
  requestId: string;
  organizationId?: string | null;
  responsible?: AuthorPreview | null;
  canAssign: boolean;
  onUpdated: () => Promise<void>;
  /** Render only the change button + modal (the name is shown by the caller) */
  buttonOnly?: boolean;
};

export function RequestResponsibilityControl({
  requestId,
  organizationId,
  responsible,
  canAssign,
  onUpdated,
  buttonOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [selected, setSelected] = useState<string | undefined>(responsible?.id);
  const [busy, setBusy] = useState(false);

  const show = async () => {
    if (!organizationId) return;
    setBusy(true);
    try {
      setMembers(await getMembers(organizationId));
      setSelected(responsible?.id);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await assignRequestResponsible(requestId, selected);
      setOpen(false);
      await onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const changeButton = canAssign ? (
    <Button
      type="text"
      size="small"
      icon={<UserSwitchOutlined />}
      loading={busy}
      aria-label={responsible ? 'Сменить ответственного' : 'Назначить ответственного'}
      title={responsible ? 'Сменить ответственного' : 'Назначить ответственного'}
      onClick={() => void show()}
    >
      {buttonOnly ? null : 'Изменить'}
    </Button>
  ) : null;

  const modal = (
      <Modal
        open={open}
        title="Назначить ответственного"
        okText="Назначить"
        cancelText="Отмена"
        confirmLoading={busy}
        okButtonProps={{ disabled: !selected }}
        onOk={() => void save()}
        onCancel={() => !busy && setOpen(false)}
      >
        <Select
          value={selected}
          onChange={setSelected}
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          options={members.map((member) => ({
            value: member.user.id,
            label: buildDisplayName(member.user) || member.user.email,
          }))}
        />
      </Modal>
  );

  if (buttonOnly) {
    return (
      <>
        {changeButton}
        {modal}
      </>
    );
  }

  return (
    <div className="request-responsibility">
      <div>
        <span>Ответственный</span>
        <strong>{responsible ? buildDisplayName(responsible) : 'Не назначен'}</strong>
      </div>
      {changeButton}
      {modal}
    </div>
  );
}

