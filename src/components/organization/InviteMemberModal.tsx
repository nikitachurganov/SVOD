import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Typography } from 'antd';
import { CheckCircleFilled, CopyOutlined, MailOutlined } from '@ant-design/icons';
import { inviteUser, lookupInvitee } from '../../shared/api/organizations.api';
import { useDebouncedCallback } from '../../shared/hooks/useDebouncedCallback';
import { emailRules, phoneRules, requiredRule } from '../../shared/utils/formRules';
import type { InvitationResponse, InviteeLookupResponse } from '../../types/organization';
import { copyToClipboard } from './participants.utils';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

interface InviteFormValues {
  email: string;
  last_name: string;
  first_name: string;
  middle_name?: string;
  phone_number?: string;
  job_title?: string;
  specialization?: string;
}

const API_ERROR_MESSAGES: Record<string, string> = {
  'User is already a member of this organization': 'Этот человек уже состоит в организации',
  'Pending invitation already exists for this user':
    'Приглашение уже отправлено — повторить его можно на вкладке «Приглашения»',
  'You cannot invite yourself': 'Нельзя пригласить самого себя',
};

/** Result of an invitation: was the email sent, and the link to pass on manually */
export const InvitationResult = ({ invitation }: { invitation: InvitationResponse }) => {
  const [copied, setCopied] = useState(false);
  const isNewAccount = invitation.kind === 'new_account';

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {invitation.email_sent ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleFilled />}
          message={`Письмо отправлено на ${invitation.email}`}
          description={
            isNewAccount
              ? 'Человек перейдёт по ссылке, подтвердит данные и задаст пароль.'
              : 'У человека уже есть аккаунт — приглашение появится у него в уведомлениях.'
          }
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Письмо не отправлено"
          description={
            isNewAccount
              ? 'Почта в сервисе не настроена или недоступна. Скопируйте ссылку и отправьте её человеку сами.'
              : 'Почта не настроена. У человека уже есть аккаунт — приглашение появится у него в уведомлениях после входа.'
          }
        />
      )}
      {isNewAccount && invitation.activation_url ? (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Ссылка для активации аккаунта (действует до{' '}
            {invitation.expires_at ? new Date(invitation.expires_at).toLocaleDateString('ru-RU') : '—'})
          </Typography.Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Input value={invitation.activation_url} readOnly onFocus={(e) => e.target.select()} />
            <Button
              icon={<CopyOutlined />}
              onClick={async () => setCopied(await copyToClipboard(invitation.activation_url ?? ''))}
            >
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const InviteMemberModal = ({ open, onClose, organizationId }: Props) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvitationResponse | null>(null);
  const [form] = Form.useForm<InviteFormValues>();
  const email = Form.useWatch('email', form);
  // Account detection by email: null — not checked yet (or email incomplete)
  const [lookup, setLookup] = useState<{ email: string; data: InviteeLookupResponse } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const runLookup = useDebouncedCallback(async (value: string) => {
    try {
      const data = await lookupInvitee(organizationId, value);
      setLookup({ email: value, data });
    } catch {
      setLookup(null);
    } finally {
      setLookupLoading(false);
    }
  }, 400);

  useEffect(() => {
    const value = (email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setLookup(null);
      setLookupLoading(false);
      return;
    }
    setLookupLoading(true);
    runLookup(value);
    // runLookup is stable enough: it always calls the latest callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const currentLookup = lookup && lookup.email === (email ?? '').trim().toLowerCase() ? lookup.data : null;
  const existingAccount = Boolean(currentLookup?.exists);
  const blocked = Boolean(currentLookup?.is_member || currentLookup?.has_pending_invitation);

  const close = () => {
    form.resetFields();
    setResult(null);
    setLookup(null);
    onClose();
  };

  const handleSubmit = async (values: InviteFormValues) => {
    setLoading(true);
    try {
      const invitation = await inviteUser(organizationId, {
        email: values.email.trim().toLowerCase(),
        // A registered person keeps their own name and phone
        last_name: existingAccount ? undefined : values.last_name,
        first_name: existingAccount ? undefined : values.first_name,
        middle_name: existingAccount ? undefined : values.middle_name,
        phone_number: existingAccount ? undefined : values.phone_number,
        job_title: values.job_title,
        specialization: values.specialization,
      });
      setResult(invitation);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const text = typeof detail === 'string' ? detail : '';
      form.setFields([
        { name: 'email', errors: [API_ERROR_MESSAGES[text] ?? (text || 'Не удалось отправить приглашение')] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={result ? 'Участник добавлен' : 'Добавить участника вручную'}
      width={560}
      onCancel={close}
      destroyOnHidden
      footer={
        result
          ? [
              <Button key="more" onClick={() => { form.resetFields(); setResult(null); }}>
                Добавить ещё
              </Button>,
              <Button key="done" type="primary" onClick={close}>
                Готово
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={close}>
                Отмена
              </Button>,
              <Button
                key="submit"
                type="primary"
                icon={<MailOutlined />}
                loading={loading}
                disabled={blocked || lookupLoading}
                onClick={() => form.submit()}
              >
                {existingAccount ? 'Пригласить' : 'Создать аккаунт и пригласить'}
              </Button>,
            ]
      }
    >
      {result ? (
        <InvitationResult invitation={result} />
      ) : (
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          onFinish={(values) => void handleSubmit(values)}
          style={{ paddingTop: 8 }}
        >
          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Введите почту. Если у человека ещё нет аккаунта, вы заполните его данные, а он получит
            письмо: подтвердит аккаунт и задаст пароль. Зарегистрированный пользователь получит
            приглашение в уведомлениях.
          </Typography.Paragraph>
          <Form.Item
            name="email"
            label="Почта"
            rules={emailRules()}
            hasFeedback={lookupLoading}
            validateStatus={lookupLoading ? 'validating' : undefined}
          >
            <Input placeholder="user@example.com" autoComplete="off" />
          </Form.Item>

          {currentLookup?.is_member ? (
            <Alert type="error" showIcon style={{ marginBottom: 16 }} message={`${currentLookup.full_name ?? 'Этот человек'} уже состоит в организации`} />
          ) : currentLookup?.has_pending_invitation ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Приглашение уже отправлено"
              description="Повторить его можно на вкладке «Приглашения»."
            />
          ) : existingAccount ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Аккаунт найден: ${currentLookup?.full_name ?? ''}`}
              description="Человек получит приглашение в уведомлениях и сам решит, вступать ли. Имя и телефон берутся из его аккаунта."
            />
          ) : currentLookup ? (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message="Будет создан новый аккаунт"
              description="Заполните данные — на почту придёт ссылка, чтобы подтвердить аккаунт и задать пароль."
            />
          ) : null}

          {!existingAccount ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 12px' }}>
                <Form.Item name="last_name" label="Фамилия" rules={[requiredRule('Введите фамилию')]}>
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item name="first_name" label="Имя" rules={[requiredRule('Введите имя')]}>
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item name="middle_name" label="Отчество">
                  <Input autoComplete="off" />
                </Form.Item>
              </div>
              <Form.Item name="phone_number" label="Телефон" rules={phoneRules(false)}>
                <Input placeholder="+7 900 000-00-00" autoComplete="off" />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="job_title" label="Должность">
            <Input placeholder="Например, дизайнер" maxLength={300} />
          </Form.Item>
          <Form.Item
            name="specialization"
            label="Специализация"
            extra="Учитывается при подборе исполнителей этапов"
          >
            <Input.TextArea placeholder="Например, полиграфия, наружная реклама" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};
