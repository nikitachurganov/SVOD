import { useCallback, useEffect, useState } from 'react';
import { Button } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { getTelegramStatus, type TelegramStatus } from '../../shared/api/telegram.api';
import { TelegramLinkModal } from '../layout/TelegramLinkModal';

const describe = (status: TelegramStatus | null, failed: boolean): string => {
  if (failed) return 'Не удалось загрузить статус';
  if (!status) return 'Загрузка…';
  if (!status.enabled) return 'Бот не настроен на сервере';
  if (status.linked) {
    const account = status.username ? `@${status.username}` : status.display_name || 'аккаунт Telegram';
    return `Подключён: ${account}`;
  }
  return 'Не подключён';
};

/** Integration tile of the settings page: real Telegram state + connect / disconnect flow */
export const TelegramIntegrationCard = () => {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(() => {
    getTelegramStatus()
      .then((data) => {
        setStatus(data);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const closeModal = () => {
    setModalOpen(false);
    refresh();
  };

  return (
    <article className="org-settings__integration-card">
      <span className="org-settings__integration-icon org-settings__integration-icon--blue">
        <MessageOutlined />
      </span>
      <div>
        <h4>Telegram</h4>
        <p>{describe(status, failed)}</p>
      </div>
      {failed ? (
        <Button size="small" onClick={refresh}>
          Повторить
        </Button>
      ) : status?.enabled ? (
        <Button size="small" type={status.linked ? 'default' : 'primary'} onClick={() => setModalOpen(true)}>
          {status.linked ? 'Управлять' : 'Подключить'}
        </Button>
      ) : null}
      <TelegramLinkModal open={modalOpen} onClose={closeModal} />
    </article>
  );
};
