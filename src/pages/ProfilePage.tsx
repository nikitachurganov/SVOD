import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Form, Input, Modal } from 'antd';
import {
  CreditCardOutlined,
  DeleteOutlined,
  LockOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { changeMyPassword, deleteMyAccount } from '../shared/api/auth.api';
import { updateMyProfile } from '../shared/api/profiles.api';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useNotifications } from '../shared/context/notifications.context';
import { passwordRules, requiredRule } from '../shared/utils/formRules';
import { ProfileAvatarCard } from '../components/profile/ProfileAvatarCard';
import { ProfileAiTab, ProfileTelegramTab } from '../components/profile/ProfileFutureTabs';
import { ProfileSubscriptionTab } from '../components/profile/ProfileSubscriptionTab';
import './ProfilePage.css';

interface NameFormValues {
  lastName: string;
  firstName: string;
  middleName?: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}

interface DeleteAccountFormValues {
  password: string;
}

const NAME_MAX_LENGTH = 100;

const SECTIONS: readonly { key: string; label: string; icon: ReactNode }[] = [
  { key: 'profile', label: 'Профиль', icon: <UserOutlined /> },
  { key: 'security', label: 'Безопасность', icon: <LockOutlined /> },
  { key: 'ai', label: 'ИИ', icon: <RobotOutlined /> },
  { key: 'telegram', label: 'Telegram', icon: <SendOutlined /> },
  { key: 'subscription', label: 'Подписка', icon: <CreditCardOutlined /> },
];

const DEFAULT_SECTION = 'profile';

/** The server explains the problem in Russian (wrong current password, too many attempts); anything else is generic */
const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && /[а-яё]/i.test(detail) ? detail : fallback;
};

const nameRules = (label: string) => [
  requiredRule(`Укажите ${label}`),
  { min: 2, message: 'Не менее 2 символов' },
  { max: NAME_MAX_LENGTH, message: `Не более ${NAME_MAX_LENGTH} символов` },
];

export const ProfilePage = () => {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const { notifySuccess } = useNotifications();
  const [searchParams] = useSearchParams();

  // The section lives in the address (?tab=telegram), so it can be linked to
  const requested = searchParams.get('tab');
  const activeSection = SECTIONS.some((section) => section.key === requested)
    ? (requested as string)
    : DEFAULT_SECTION;

  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [deleteForm] = Form.useForm<DeleteAccountFormValues>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const email = profile?.email ?? user?.email ?? '';

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeleteError(null);
    deleteForm.resetFields();
  };

  const handleDeleteAccount = async (values: DeleteAccountFormValues) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMyAccount(values.password);
    } catch (err) {
      setDeleteError(errorDetail(err, 'Не удалось удалить аккаунт. Попробуйте ещё раз'));
      setDeleting(false);
      return;
    }
    // The account is gone: drop the token and let the app return to the sign-in page
    await signOut();
  };

  const handleSaveName = async (values: NameFormValues) => {
    setNameSaving(true);
    setNameError(null);
    try {
      await updateMyProfile({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        middleName: values.middleName,
      });
      await refreshProfile();
      notifySuccess('Данные сохранены');
    } catch (err) {
      setNameError(errorDetail(err, 'Не удалось сохранить данные. Попробуйте ещё раз'));
    } finally {
      setNameSaving(false);
    }
  };

  const handleChangePassword = async (values: PasswordFormValues) => {
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await changeMyPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.resetFields();
      notifySuccess('Пароль изменён', 'Используйте новый пароль при следующем входе');
    } catch (err) {
      setPasswordError(errorDetail(err, 'Не удалось изменить пароль. Попробуйте ещё раз'));
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <h2 className="profile-page__title">Профиль</h2>

      <div className="profile-page__layout">
        <nav className="profile-page__nav" aria-label="Разделы профиля">
          {SECTIONS.map((section) => (
            <Link
              key={section.key}
              to={{ search: `?tab=${section.key}` }}
              replace
              className={`profile-page__nav-item${section.key === activeSection ? ' profile-page__nav-item--active' : ''}`}
              aria-current={section.key === activeSection ? 'page' : undefined}
            >
              <span className="profile-page__nav-icon" aria-hidden="true">
                {section.icon}
              </span>
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="profile-page__content">
          {activeSection === 'profile' ? (
            <section className="profile-page__panel" aria-label="Профиль">
              <ProfileAvatarCard />

              <div className="profile-page__section">
                <h3 className="profile-page__section-title">Личные данные</h3>

                {nameError ? (
                  <Alert
                    type="error"
                    showIcon
                    message={nameError}
                    closable
                    onClose={() => setNameError(null)}
                    className="profile-page__alert"
                  />
                ) : null}

                {/* Keyed by the saved name: the fields refill from the server once the profile is loaded or saved */}
                <Form
                  key={`${profile?.lastName}|${profile?.firstName}|${profile?.middleName}`}
                  layout="vertical"
                  requiredMark={false}
                  initialValues={{
                    lastName: profile?.lastName ?? '',
                    firstName: profile?.firstName ?? '',
                    middleName: profile?.middleName ?? '',
                  }}
                  onFinish={(values) => void handleSaveName(values)}
                  className="profile-page__form"
                >
                  <div className="profile-page__fields">
                    <Form.Item name="lastName" label="Фамилия" rules={nameRules('фамилию')}>
                      <Input autoComplete="family-name" maxLength={NAME_MAX_LENGTH} />
                    </Form.Item>
                    <Form.Item name="firstName" label="Имя" rules={nameRules('имя')}>
                      <Input autoComplete="given-name" maxLength={NAME_MAX_LENGTH} />
                    </Form.Item>
                    <Form.Item
                      name="middleName"
                      label="Отчество"
                      rules={[{ max: NAME_MAX_LENGTH, message: `Не более ${NAME_MAX_LENGTH} символов` }]}
                    >
                      <Input
                        autoComplete="additional-name"
                        maxLength={NAME_MAX_LENGTH}
                        placeholder="Необязательно"
                      />
                    </Form.Item>
                  </div>
                  <Button type="primary" htmlType="submit" loading={nameSaving}>
                    Сохранить
                  </Button>
                </Form>
              </div>

              <div className="profile-page__section">
                <h3 className="profile-page__section-title">Почта</h3>
                <div className="profile-page__value">
                  <span className="profile-page__value-text">{email}</span>
                  {profile?.emailVerificationAvailable ? (
                    <span
                      className={`profile-page__status${profile.emailVerified ? ' profile-page__status--ok' : ' profile-page__status--warn'}`}
                    >
                      {profile.emailVerified ? 'Подтверждена' : 'Не подтверждена'}
                    </span>
                  ) : null}
                </div>
                {profile?.emailVerificationAvailable && !profile.emailVerified ? (
                  <p className="profile-page__hint">Ссылка для подтверждения отправлена в письме.</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeSection === 'security' ? (
            <section className="profile-page__panel" aria-label="Безопасность">
              <div className="profile-page__section">
                <h3 className="profile-page__section-title">Смена пароля</h3>

                {passwordError ? (
                  <Alert
                    type="error"
                    showIcon
                    message={passwordError}
                    closable
                    onClose={() => setPasswordError(null)}
                    className="profile-page__alert"
                  />
                ) : null}

                <Form
                  form={passwordForm}
                  layout="vertical"
                  requiredMark={false}
                  onFinish={(values) => void handleChangePassword(values)}
                  className="profile-page__form"
                >
                  <Form.Item
                    name="currentPassword"
                    label="Текущий пароль"
                    rules={[requiredRule('Введите текущий пароль')]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <div className="profile-page__fields">
                    <Form.Item name="newPassword" label="Новый пароль" rules={passwordRules()} hasFeedback>
                      <Input.Password autoComplete="new-password" placeholder="Не менее 8 символов" />
                    </Form.Item>
                    <Form.Item
                      name="newPasswordConfirm"
                      label="Повторите новый пароль"
                      dependencies={['newPassword']}
                      hasFeedback
                      rules={[
                        requiredRule('Повторите новый пароль'),
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                            return Promise.reject(new Error('Пароли не совпадают'));
                          },
                        }),
                      ]}
                    >
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                  </div>
                  <Button type="primary" htmlType="submit" loading={passwordSaving}>
                    Изменить пароль
                  </Button>
                </Form>
              </div>

              <div className="profile-page__section profile-page__section--danger">
                <div className="profile-page__row">
                  <div className="profile-page__row-label">
                    <h3 id="profile-delete-title">Удаление аккаунта</h3>
                    <p>
                      Аккаунт и все ваши данные будут удалены без возможности восстановления: личное
                      пространство, опросы с ответами, заявки, формы и файлы. Если вы владелец организации
                      с другими участниками, сначала передайте владение или удалите её.
                    </p>
                  </div>
                  <div className="profile-page__row-control">
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      aria-describedby="profile-delete-title"
                      onClick={() => setDeleteOpen(true)}
                    >
                      Удалить аккаунт
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === 'ai' ? <ProfileAiTab /> : null}
          {activeSection === 'telegram' ? <ProfileTelegramTab /> : null}
          {activeSection === 'subscription' ? <ProfileSubscriptionTab /> : null}
        </div>
      </div>

      <Modal
        open={deleteOpen}
        title="Удалить аккаунт навсегда?"
        okText="Удалить навсегда"
        okButtonProps={{ danger: true, loading: deleting }}
        cancelText="Отмена"
        cancelButtonProps={{ disabled: deleting }}
        onOk={() => deleteForm.submit()}
        onCancel={closeDeleteDialog}
        maskClosable={!deleting}
        closable={!deleting}
        destroyOnClose
      >
        <p>Это действие нельзя отменить. Для подтверждения введите ваш пароль.</p>
        {deleteError ? (
          <Alert type="error" showIcon message={deleteError} className="profile-page__alert" />
        ) : null}
        <Form
          form={deleteForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void handleDeleteAccount(values)}
        >
          <Form.Item name="password" label="Пароль" rules={[requiredRule('Введите пароль')]}>
            <Input.Password autoComplete="current-password" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
