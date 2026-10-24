import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { checkPasswordResetToken, confirmPasswordReset } from '../shared/api/auth.api';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import { passwordRules, requiredRule } from '../shared/utils/formRules';
import logoUrl from '../assets/logo.svg';
import heroBgUrl from '../assets/auth-hero-bg.png';
import './AuthPage.css';

interface ResetFormValues {
  password: string;
  passwordConfirm: string;
}

const INVALID_LINK = 'Ссылка недействительна или устарела. Запросите восстановление пароля заново.';

const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && /[а-яё]/i.test(detail) ? detail : fallback;
};

/** Public page: a person sets a new password by the link from the email */
export const ResetPasswordPage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkPasswordResetToken(token)
      .then(() => {
        if (!cancelled) setLinkState('valid');
      })
      .catch(() => {
        if (!cancelled) setLinkState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFinish = async (values: ResetFormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await confirmPasswordReset(token, values.password);
      navigate('/auth', {
        replace: true,
        state: { notice: 'Пароль изменён. Войдите с новым паролем.' },
      });
    } catch (err) {
      setSubmitError(errorDetail(err, 'Не удалось изменить пароль. Попробуйте ещё раз'));
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
          <p className="auth-page__hero-tagline">
            {IS_SURVEYS_APP ? 'Опросы и анкетирование' : 'Все заявки в одном управляемом потоке'}
          </p>
        </div>
      </div>

      <section className="auth-page__panel" aria-label="Новый пароль">
        <h1 className="auth-page__heading">Новый пароль</h1>

        <div className="auth-page__panel-body">
          {linkState === 'checking' ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          ) : linkState === 'invalid' ? (
            <>
              <Alert type="error" showIcon message={INVALID_LINK} className="auth-page__alert" />
              <Button
                type="primary"
                block
                size="large"
                className="auth-page__submit"
                onClick={() => navigate('/auth', { replace: true, state: { mode: 'forgot' } })}
              >
                Запросить новую ссылку
              </Button>
            </>
          ) : (
            <>
              <p className="auth-page__hint">Придумайте новый пароль — им вы будете входить дальше.</p>

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
                layout="vertical"
                size="large"
                requiredMark={false}
                onFinish={(values) => void handleFinish(values)}
                className="auth-page__form"
              >
                <Form.Item name="password" label="Новый пароль" rules={passwordRules()} hasFeedback>
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
                  Сохранить пароль
                </Button>
              </Form>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
