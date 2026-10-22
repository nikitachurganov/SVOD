import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Result, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import {
  applyToJoin,
  getJoinPage,
  getMyJoinRequests,
  registerAndApply,
} from '../shared/api/organizations.api';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { emailRules, passwordRules, phoneRules, requiredRule } from '../shared/utils/formRules';
import type { JoinPageInfo, JoinRequestResponse } from '../types/organization';
import logoUrl from '../assets/logo.svg';
import heroBgUrl from '../assets/auth-hero-bg.png';
import './AuthPage.css';

interface JoinFormValues {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  passwordConfirm?: string;
  jobTitle?: string;
  specialization?: string;
  message?: string;
}

const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (detail === 'A user with this email already exists') {
    return 'Аккаунт с такой почтой уже есть — войдите, чтобы подать заявку.';
  }
  return typeof detail === 'string' ? detail : fallback;
};

/** Public: join an organization by its link — sign up (or sign in) and apply; the owner moderates */
export const JoinOrganizationPage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isAuthLoading, refreshProfile } = useAuth();
  const { organizations, refreshOrganizations } = useOrganization();
  const [form] = Form.useForm<JoinFormValues>();

  const [info, setInfo] = useState<JoinPageInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<JoinRequestResponse | null>(null);
  const [submitted, setSubmitted] = useState<JoinRequestResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJoinPage(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorDetail(err, 'Не удалось открыть приглашение'));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A signed-in person may already have a pending request to this organization
  useEffect(() => {
    if (!user || !info) return;
    let cancelled = false;
    getMyJoinRequests()
      .then((rows) => {
        if (cancelled) return;
        setExisting(rows.find((r) => r.organization_id === info.organization_id && r.status === 'pending') ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, info]);

  const isMember = Boolean(info && organizations.some((org) => org.id === info.organization_id));

  const handleFinish = async (values: JoinFormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    const profile = {
      job_title: values.jobTitle?.trim() || null,
      specialization: values.specialization?.trim() || null,
      message: values.message?.trim() || null,
    };
    try {
      const request = user
        ? await applyToJoin(token, profile)
        : await registerAndApply(token, {
            ...profile,
            last_name: values.lastName ?? '',
            first_name: values.firstName ?? '',
            middle_name: values.middleName?.trim() || null,
            email: (values.email ?? '').trim().toLowerCase(),
            phone_number: values.phoneNumber?.trim() || '',
            password: values.password ?? '',
          });
      if (!user) {
        await refreshProfile();
        await refreshOrganizations();
      }
      setSubmitted(request);
    } catch (err) {
      setSubmitError(errorDetail(err, 'Не удалось отправить заявку'));
    } finally {
      setSubmitting(false);
    }
  };

  const goToLogin = () => navigate('/auth', { state: { from: `/join/${token}` } });

  const renderBody = () => {
    if (loadError) {
      return (
        <Result
          status="warning"
          title="Ссылка не работает"
          subTitle={loadError}
          extra={<Button onClick={() => navigate('/')}>На главную</Button>}
        />
      );
    }
    if (!info || isAuthLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      );
    }
    if (isMember) {
      return (
        <Result
          status="success"
          title={`Вы уже в «${info.organization_name}»`}
          extra={<Button type="primary" onClick={() => navigate('/requests')}>Открыть СВОД</Button>}
        />
      );
    }
    if (submitted || existing) {
      return (
        <Result
          status="info"
          title="Заявка отправлена"
          subTitle={`Владелец организации «${info.organization_name}» рассмотрит её. Мы сообщим о решении в уведомлениях${user || submitted ? ' и на почту' : ''}.`}
          extra={<Button type="primary" onClick={() => navigate('/requests')}>Перейти в СВОД</Button>}
        />
      );
    }

    return (
      <>
        <p style={{ margin: '0 0 20px', color: 'var(--app-text-secondary)', lineHeight: 1.5 }}>
          Вас пригласили в организацию{' '}
          <strong style={{ color: 'var(--app-text)' }}>«{info.organization_name}»</strong>
          {info.organization_description ? ` — ${info.organization_description}` : ''}.{' '}
          {user
            ? 'Расскажите о себе — владелец рассмотрит заявку.'
            : 'Заполните данные и придумайте пароль: аккаунт заработает сразу, а в организацию вы попадёте после одобрения владельцем.'}
        </p>

        {submitError ? (
          <Alert
            type="error"
            showIcon
            message={submitError}
            closable
            onClose={() => setSubmitError(null)}
            className="auth-page__alert"
          />
        ) : null}

        <Form
          form={form}
          layout="vertical"
          size="large"
          requiredMark={false}
          onFinish={(values) => void handleFinish(values)}
          className="auth-page__form"
        >
          {!user ? (
            <>
              <div className="auth-page__field-row">
                <Form.Item name="lastName" label="Фамилия" rules={[requiredRule('Введите фамилию')]}>
                  <Input autoComplete="family-name" />
                </Form.Item>
                <Form.Item name="firstName" label="Имя" rules={[requiredRule('Введите имя')]}>
                  <Input autoComplete="given-name" />
                </Form.Item>
              </div>
              <Form.Item name="middleName" label="Отчество">
                <Input autoComplete="additional-name" />
              </Form.Item>
              <div className="auth-page__field-row">
                <Form.Item name="email" label="Почта" rules={emailRules()}>
                  <Input autoComplete="email" placeholder="example@mail.ru" />
                </Form.Item>
                <Form.Item name="phoneNumber" label="Телефон" rules={phoneRules(false)}>
                  <Input autoComplete="tel" placeholder="+7 900 000-00-00" />
                </Form.Item>
              </div>
              <div className="auth-page__field-row">
                <Form.Item name="password" label="Пароль" rules={passwordRules()}>
                  <Input.Password autoComplete="new-password" placeholder="Не менее 8 символов" />
                </Form.Item>
                <Form.Item
                  name="passwordConfirm"
                  label="Повторите пароль"
                  dependencies={['password']}
                  rules={[
                    requiredRule('Повторите пароль'),
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('Пароли не совпадают'));
                      },
                    }),
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              </div>
            </>
          ) : null}

          <Form.Item name="jobTitle" label="Должность">
            <Input placeholder="Например, дизайнер" maxLength={300} />
          </Form.Item>
          <Form.Item name="specialization" label="Чем занимаетесь">
            <Input.TextArea placeholder="Направления работ, навыки" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} />
          </Form.Item>
          <Form.Item name="message" label="Сообщение владельцу">
            <Input.TextArea placeholder="Например: я новый менеджер отдела продаж" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={submitting} block className="auth-page__submit">
            {user ? 'Подать заявку' : 'Зарегистрироваться и подать заявку'}
          </Button>
        </Form>

        {!user ? (
          <p className="auth-page__switch">
            Уже есть аккаунт?{' '}
            <button type="button" className="auth-page__switch-link" onClick={goToLogin}>
              Войти
            </button>
          </p>
        ) : null}
      </>
    );
  };

  return (
    <div className="auth-page">
      <div className="auth-page__hero" aria-hidden="true">
        <img src={heroBgUrl} alt="" className="auth-page__hero-bg" />
        <div className="auth-page__hero-overlay" />
        <div className="auth-page__hero-content">
          <img src={logoUrl} alt="СВОД" className="auth-page__hero-logo" />
          <p className="auth-page__hero-tagline">Все заявки в одном управляемом потоке</p>
        </div>
      </div>

      <section className="auth-page__panel" aria-label="Вступление в организацию">
        <h1 className="auth-page__heading">Вступление в организацию</h1>
        <div className="auth-page__panel-body">{renderBody()}</div>
      </section>
    </div>
  );
};
