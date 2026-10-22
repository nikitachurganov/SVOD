import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, Popconfirm, Spin, Switch, Typography, message } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  getJoinLink,
  regenerateJoinLink,
  setJoinLinkEnabled,
} from '../../shared/api/organizations.api';
import type { JoinLinkResponse } from '../../types/organization';
import { copyToClipboard } from './participants.utils';

interface Props {
  open: boolean;
  organizationId: string;
  onClose: () => void;
}

/** Owner: the reusable "join organization" link — copy, turn on/off, regenerate */
export const JoinLinkModal = ({ open, organizationId, onClose }: Props) => {
  const [link, setLink] = useState<JoinLinkResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    getJoinLink(organizationId)
      .then((data) => {
        if (!cancelled) setLink(data);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить ссылку');
      });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const run = async (action: () => Promise<JoinLinkResponse>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      setLink(await action());
      if (success) message.success(success);
    } catch {
      setError('Не удалось изменить ссылку');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Пригласить по ссылке"
      onCancel={onClose}
      footer={<Button type="primary" onClick={onClose}>Готово</Button>}
      width={560}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Отправьте ссылку коллегам в чат или рассылку. По ней человек зарегистрируется (или войдёт)
        и подаст заявку — она появится на вкладке «Заявки на вступление», и вы решите, принять ли её.
      </Typography.Paragraph>

      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

      {!link ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <Switch
              checked={link.enabled}
              loading={busy}
              onChange={(checked) => void run(() => setJoinLinkEnabled(organizationId, checked))}
            />
            <span>{link.enabled ? 'Ссылка работает' : 'Ссылка выключена'}</span>
          </label>

          {link.enabled && link.url ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={link.url} readOnly onFocus={(e) => e.target.select()} aria-label="Ссылка-приглашение" />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    const ok = await copyToClipboard(link.url ?? '');
                    if (ok) message.success('Ссылка скопирована');
                    else message.error('Не удалось скопировать ссылку');
                  }}
                >
                  Копировать
                </Button>
              </div>
              <Popconfirm
                title="Перевыпустить ссылку?"
                description="Старая ссылка сразу перестанет работать."
                okText="Перевыпустить"
                cancelText="Отмена"
                onConfirm={() => run(() => regenerateJoinLink(organizationId), 'Новая ссылка готова')}
              >
                <Button icon={<ReloadOutlined />} disabled={busy} style={{ justifySelf: 'start' }}>
                  Перевыпустить ссылку
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Typography.Text type="secondary">
              Включите ссылку, чтобы по ней можно было подать заявку на вступление.
            </Typography.Text>
          )}
        </div>
      )}
    </Modal>
  );
};
