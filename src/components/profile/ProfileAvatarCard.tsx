import { useState } from 'react';
import { Alert, Avatar, Button, Upload } from 'antd';
import { DeleteOutlined, LoadingOutlined, UploadOutlined } from '@ant-design/icons';
import { deleteMyAvatar, uploadMyAvatar } from '../../shared/api/profiles.api';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useNotifications } from '../../shared/context/notifications.context';
import { buildDisplayName } from '../../shared/utils/userName';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/** The server explains the problem in Russian (format, size, storage unavailable); anything else is generic */
const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && /[а-яё]/i.test(detail) ? detail : fallback;
};

/** Profile photo row: what it is and the limits on the left, the photo with its actions on the right */
export const ProfileAvatarCard = () => {
  const { profile, refreshProfile } = useAuth();
  const { notifySuccess } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = profile
    ? buildDisplayName({
        lastName: profile.lastName,
        firstName: profile.firstName,
        middleName: profile.middleName,
      })
    : '';
  const initials = displayName.charAt(0).toUpperCase();

  const run = async (action: () => Promise<unknown>, failure: string, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshProfile();
      notifySuccess(success);
    } catch (err) {
      setError(errorDetail(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const handleBeforeUpload = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Подходит фото в формате JPEG, PNG или WebP');
    } else if (file.size > MAX_BYTES) {
      setError(`Файл слишком большой: не более ${MAX_BYTES / (1024 * 1024)} МБ`);
    } else {
      void run(() => uploadMyAvatar(file), 'Не удалось загрузить фото. Попробуйте ещё раз', 'Фото обновлено');
    }
    // The file goes through our own request, not antd's
    return false;
  };

  return (
    <div className="profile-page__section">
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError(null)}
          className="profile-page__alert"
        />
      ) : null}

      <div className="profile-page__row">
        <div className="profile-page__row-label">
          <h3 id="profile-photo-title">Фото профиля</h3>
          <p>Нажмите на фото, чтобы загрузить новое. JPEG, PNG или WebP, не более 2 МБ.</p>
        </div>
        <div className="profile-page__row-control profile-page__avatar-control">
          {/* The photo itself is the upload button: the icon appears on hover or focus, a click opens the file picker */}
          <Upload
            accept={ACCEPTED_TYPES.join(',')}
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            disabled={busy}
          >
            <button
              type="button"
              className={`profile-page__avatar-button${busy ? ' profile-page__avatar-button--busy' : ''}`}
              aria-label={profile?.avatarUrl ? 'Заменить фото профиля' : 'Загрузить фото профиля'}
              aria-busy={busy}
              disabled={busy}
            >
              <Avatar size={72} shape="square" src={profile?.avatarUrl ?? undefined} className="profile-page__avatar">
                {initials}
              </Avatar>
              <span className="profile-page__avatar-overlay" aria-hidden="true">
                {busy ? <LoadingOutlined /> : <UploadOutlined />}
              </span>
            </button>
          </Upload>
          {profile?.avatarUrl ? (
            <Button
              type="text"
              icon={<DeleteOutlined />}
              disabled={busy}
              onClick={() =>
                void run(deleteMyAvatar, 'Не удалось удалить фото. Попробуйте ещё раз', 'Фото удалено')
              }
            >
              Удалить
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
