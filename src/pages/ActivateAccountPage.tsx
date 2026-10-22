import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import {
  activateAccount,
  getAccountActivation,
  type AccountActivationInfo,
} from '../shared/api/auth.api';
import { useAuth } from '../shared/hooks/auth.hooks';
import { passwordRules, phoneRules, requiredRule } from '../shared/utils/formRules';
import logoUrl from '../assets/logo.svg';
import heroBgUrl from '../assets/auth-hero-bg.png';
import './AuthPage.css';

interface ActivationFormValues {
  lastName: string;
  firstName: string;
  middleName?: string;
  phoneNumber?: string;
  password: string;
  passwordConfirm: string;
}

const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

/** Public page: a person confirms an account the organization owner created for them */
export const ActivateAccountPage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [form] = Form.useForm<ActivationFormValues>();
  const [info, setInfo] = useState<AccountActivationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAccountActivation(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        form.setFieldsValue({
          lastName: data.last_name,
          firstName: data.first_name,
          middleName: data.middle_name ?? undefined,
          phoneNumber: data.phone_number || undefined,
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorDetail(err, 'Не удалось открыть приглашение'));
      });
    return () => {
      cancelled = true;
    };
  }, [token, form]);

  const handleFinish = async (values: ActivationFormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await activateAccount(token, {
        lastName: values.lastName,
        firstName: values.firstName,
        middleName: values.middleName,
        phoneNumber: values.phoneNumber,
        password: values.password,
      });
      await refreshProfile();
      navigate('/requests', { replace: true });
    } catch (err) {
      setSubmitError(errorDetail(err, 'Не удалось активировать аккаунт'));
    } finally {
      setSubmitting(false);
    }
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

      <section className="auth-page__panel" aria-label="Активация аккаунта">
        <h1 className="auth-page__heading">Активация аккаунта</h1>

        <div className="auth-page__panel-body">
          {loadError ? (
            <>
              <Alert type="error" showIcon message={loadError} className="auth-page__alert" />
              <p className="auth-page__switch">
                Уже есть пароль?{' '}
                <button type="button" className="auth-page__switch-link" onClick={() => navigate('/auth')}>
                  Войти
                </button>
              </p>
            </>
          ) : !info ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 20px', color: 'var(--app-text-secondary)', lineHeight: 1.5 }}>
                {info.inviter_name ? `${info.inviter_name} добавил(а) вас` : 'Вас добавили'} в организацию{' '}
                <strong style={{ color: 'var(--app-text)' }}>«{info.organization_name}»</strong>
                {info.job_title ? ` как «${info.job_title}»` : ''}. Проверьте данные и придумайте пароль —
                дальше вы будете входить по почте <strong style={{ color: 'var(--app-text)' }}>{info.email}</strong>.
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
                <Form.Item name="phoneNumber" label="Телефон" rules={phoneRules(false)}>
                  <Input autoComplete="tel" placeholder="+7 900 000-00-00" />
                </Form.Item>
                <Form.Item name="password" label="Пароль" rules={passwordRules()} hasFeedback>
                  <Input.Password autoComplete="new-password" placeholder="Не менее 8 символов" />
                </Form.Item>
                <Form.Item
                  name="passwordConfirm"
                  label="Повторите пароль"
                  dependencies={['password']}
                  hasFeedback
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

                <Button type="primary" htmlType="submit" loading={submitting} block className="auth-page__submit">
                  Активировать и войти
                </Button>
              </Form>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
