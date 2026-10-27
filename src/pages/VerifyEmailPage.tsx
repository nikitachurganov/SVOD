import { useEffect, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { confirmEmailVerification } from '../shared/api/auth.api';
import { useAuth } from '../shared/hooks/auth.hooks';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import logoUrl from '../assets/logo.svg';
import heroBgUrl from '../assets/auth-hero-bg.png';
import './AuthPage.css';

const INVALID_LINK = 'Ссылка недействительна или устарела. Запросите новое письмо в профиле.';

/** Public page: the link from the confirmation email lands here and confirms the mailbox */
export const VerifyEmailPage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [state, setState] = useState<'confirming' | 'done' | 'invalid'>('confirming');

  // Confirmed by a POST from the page rather than by opening the link, so mail scanners that
  // fetch links do not use it up. The server treats a repeated call as success.
  useEffect(() => {
    let cancelled = false;
    confirmEmailVerification(token)
      .then(() => {
        if (cancelled) return;
        setState('done');
        // Someone signed in on this device sees the banner go away
        void refreshProfile();
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshProfile is not stable; the link is confirmed once per token
  }, [token]);

  const goOn = () => navigate(user ? '/' : '/auth', { replace: true });

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

      <section className="auth-page__panel" aria-label="Подтверждение почты">
        <h1 className="auth-page__heading">Подтверждение почты</h1>

        <div className="auth-page__panel-body">
          {state === 'confirming' ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          ) : state === 'done' ? (
            <>
              <Alert
                type="success"
                showIcon
                message="Почта подтверждена"
                description="Спасибо! Теперь мы можем присылать вам письма, в том числе для восстановления пароля."
                className="auth-page__alert"
              />
              <Button type="primary" block size="large" className="auth-page__submit" onClick={goOn}>
                {user ? 'Перейти в сервис' : 'Войти'}
              </Button>
            </>
          ) : (
            <>
              <Alert type="error" showIcon message={INVALID_LINK} className="auth-page__alert" />
              <Button type="primary" block size="large" className="auth-page__submit" onClick={goOn}>
                {user ? 'Перейти в сервис' : 'Войти'}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
