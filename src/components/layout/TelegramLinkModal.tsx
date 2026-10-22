import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Popconfirm, Spin, Typography, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import {
  createTelegramLink,
  getTelegramStatus,
  unlinkTelegram,
  type TelegramLink,
  type TelegramStatus,
} from '../../shared/api/telegram.api';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_POLL_MS = 3000;

/** Link the current account to the SVOD Telegram bot via a one-time t.me deep link */
export const TelegramLinkModal = ({ open, onClose }: Props) => {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus(null);
    setLink(null);
    setError(null);
    getTelegramStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить статус Telegram');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // While the user confirms in Telegram, wait for the bot to bind the account
  useEffect(() => {
    if (!open || !link || status?.linked) return;
    const timer = window.setInterval(() => {
      getTelegramStatus()
        .then((data) => {
          if (data.linked) {
            setStatus(data);
            setLink(null);
            message.success('Telegram подключён');
          }
        })
        .catch(() => undefined);
    }, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, link, status?.linked]);

  const handleCreateLink = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await createTelegramLink());
    } catch {
      setError('Не удалось получить ссылку для подключения');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlinkTelegram();
      setStatus(await getTelegramStatus());
      message.success('Telegram отключён');
    } catch {
      setError('Не удалось отключить Telegram');
    } finally {
      setBusy(false);
    }
  };

  const renderBody = () => {
    if (!status) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spin />
        </div>
      );
    }
    if (!status.enabled) {
      return <Alert type="info" showIcon message="Telegram-бот пока не настроен на сервере" />;
    }
    if (status.linked) {
      const account = status.username ? `@${status.username}` : status.display_name || 'аккаунт Telegram';
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <Typography.Text>
            Подключён: <Typography.Text strong>{account}</Typography.Text>
          </Typography.Text>
          <Popconfirm
            title="Отключить Telegram?"
            description="Уведомления перестанут приходить в Telegram."
            okText="Отключить"
            cancelText="Отмена"
            onConfirm={handleUnlink}
          >
            <Button danger disabled={busy} style={{ justifySelf: 'start' }}>
              Отключить
            </Button>
          </Popconfirm>
        </div>
      );
    }
    if (link) {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <Button
            type="primary"
            icon={<SendOutlined />}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ justifySelf: 'start' }}
          >
            Открыть Telegram
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            В Telegram нажмите «Запустить» — окно обновится само. Ссылка одноразовая и действует
            10 минут.
          </Typography.Text>
        </div>
      );
    }
    return (
      <Button
        type="primary"
        icon={<SendOutlined />}
        loading={busy}
        onClick={() => void handleCreateLink()}
        style={{ justifySelf: 'start' }}
      >
        Подключить Telegram
      </Button>
    );
  };

  return (
    <Modal
      open={open}
      title="Telegram"
      onCancel={onClose}
      footer={<Button onClick={onClose}>Закрыть</Button>}
      width={520}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        {status?.bot_username ? `Бот @${status.bot_username} присылает` : 'Бот присылает'} уведомления
        по вашим заявкам: новые заявки, назначения, этапы, смену статуса — с кнопками быстрых
        действий.
      </Typography.Paragraph>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      {renderBody()}
    </Modal>
  );
};
