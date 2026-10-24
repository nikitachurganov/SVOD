import { useState } from 'react';
import { CloseOutlined } from '@ant-design/icons';

import folderArt from '../../assets/beta-folder.webp';

const STORAGE_KEY = 'svod.betaBanner.dismissed';

const isDismissed = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

interface BetaBannerProps {
  onCreateSurvey: () => void;
}

/** Beta notice with the free paid-analysis offer; the close button hides it for good */
export const BetaBanner = ({ onCreateSurvey }: BetaBannerProps) => {
  const [hidden, setHidden] = useState(isDismissed);
  if (hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* the banner just comes back next time */
    }
  };

  return (
    <aside className="beta-banner" aria-label="Бета-версия">
      <div className="beta-banner__art" aria-hidden>
        <img src={folderArt} alt="" width={140} height={140} />
      </div>
      <div className="beta-banner__body">
        <p className="beta-banner__text">
          Сервис находится в бета. До 6 ноября новые пользователи могут бесплатно воспользоваться платным
          анализом трёх своих опросов.
        </p>
        <button type="button" className="beta-banner__link" onClick={onCreateSurvey}>
          Создать опрос
        </button>
      </div>
      <button type="button" className="beta-banner__close" aria-label="Закрыть" onClick={close}>
        <CloseOutlined />
      </button>
    </aside>
  );
};
