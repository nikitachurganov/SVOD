import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { Alert, Button, Checkbox, Divider, Form, Input, Segmented, Typography } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useHref, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useThemeMode } from '../shared/context/theme.context';
import {
  getOAuthProviders,
  requestPasswordReset,
  startOAuthSignIn,
  type OAuthProvider,
} from '../shared/api/auth.api';
import { HOME_PATH, IS_SURVEYS_APP } from '../shared/config/appMode';
import logoUrl from '../assets/logo.svg';
import yandexLogoUrl from '../assets/logo-yandex.svg';
import heroBgUrl from '../assets/auth-hero-bg.png';
import './AuthPage.css';

type AuthMode = 'signIn' | 'signUp' | 'forgot';

/** What other pages pass through the router state when they send the user here */
interface AuthRouteState {
  from?: string;
  mode?: AuthMode;
  notice?: string;
}

interface SignInValues {
  email: string;
  password: string;
}

interface SignUpValues extends SignInValues {
  firstName: string;
  lastName: string;
  confirmPassword: string;
}

const HEADINGS: Record<AuthMode, string> = {
  signIn: 'Вход',
  signUp: 'Создать аккаунт',
  forgot: 'Восстановление пароля',
};

/** What the server puts into ?oauth_error= when the return from Yandex ID did not end in a sign-in */
const OAUTH_ERRORS: Record<string, string> = {
  denied: 'Вход отменён. Можно повторить попытку или войти по почте и паролю',
  expired: 'Время входа истекло. Нажмите кнопку входа ещё раз',
  no_email: 'Сервис не передал адрес почты. Разрешите доступ к почте или зарегистрируйтесь по адресу электронной почты',
  inactive: 'Доступ для этой учётной записи закрыт',
  failed: 'Не удалось войти через выбранный сервис. Повторите попытку позже',
};

const readOAuthError = (search: string): string | null => {
  const code = new URLSearchParams(search).get('oauth_error');
  if (!code) return null;
  return OAUTH_ERRORS[code] ?? OAUTH_ERRORS.failed;
};

const mapAuthError = (error: unknown, mode: AuthMode): string => {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку';
    const { status, data } = error.response;
    const detail = typeof data?.detail === 'string' ? data.detail : '';
    if (status === 401) return 'Неверный адрес электронной почты или пароль';
    if (status === 409) return 'Пользователь с таким адресом электронной почты уже зарегистрирован';
    if (status === 422) {
      if (mode === 'forgot') return 'Введите корректный адрес электронной почты';
      return mode === 'signUp'
        ? 'Проверьте заполнение полей: почта должна быть корректной, а пароль — не короче 8 символов'
        : 'Проверьте адрес электронной почты и пароль';
    }
    // The server explains some 403 in Russian already (account not activated yet)
    if (status === 403) return /[а-яё]/i.test(detail) ? detail : 'Доступ для этой учётной записи закрыт';
    if (status === 429) return 'Слишком много попыток. Подождите немного и повторите';
    if (status >= 500) return 'Ошибка на сервере. Попробуйте позже';
  }
  return 'Не удалось выполнить действие. Повторите попытку';
};

/** Ant Design link that still navigates through the router; keeps a real href for "open in new tab" */
const RouteLink = ({ to, newTab, children }: { to: string; newTab?: boolean; children: ReactNode }) => {
  const navigate = useNavigate();
  const href = useHref(to);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (newTab || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };

  return (
    <Typography.Link href={href} onClick={onClick} target={newTab ? '_blank' : undefined}>
      {children}
    </Typography.Link>
  );
};

export const AuthPage = () => {
  const location = useLocation();
  const routeState = location.state as AuthRouteState | null;

  // Links from the landing open the sign-up with ?mode=register
  const [mode, setMode] = useState<AuthMode>(() => {
    if (routeState?.mode === 'forgot' || routeState?.mode === 'signUp') return routeState.mode;
    return new URLSearchParams(location.search).get('mode') === 'register' ? 'signUp' : 'signIn';
  });
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(() => readOAuthError(location.search));
  const [notice, setNotice] = useState<string | null>(routeState?.notice ?? null);
  // The outside sign-in services the server has set up; the others stay disabled
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const [signInFields, setSignInFields] = useState<SignInValues>({ email: '', password: '' });
  const [signUpFields, setSignUpFields] = useState<SignUpValues>({
    email: '', password: '', firstName: '', lastName: '', confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Two separate ticks: the terms and the offer, and the consent to personal data processing
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedData, setAcceptedData] = useState(false);

  const { signIn, signUp } = useAuth();
  const { themeMode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const [justRegistered, setJustRegistered] = useState(false);
  const requestedPath = typeof routeState?.from === 'string' ? routeState.from : HOME_PATH;
  // A new account owns nothing yet: the page the previous session came from (someone else's survey)
  // would answer 403, so only the links that are meant for newcomers survive the sign-up
  // (an invitation, the plans, the survey built on the landing)
  const redirectTo =
    justRegistered && !/^\/(join|plans|surveys\/from-demo)(\/|\?|$)/.test(requestedPath)
      ? HOME_PATH
      : requestedPath;

  useEffect(() => {
    let cancelled = false;
    getOAuthProviders()
      .then((providers) => {
        if (!cancelled) setOauthProviders(providers);
      })
      .catch(() => {
        // The buttons simply stay disabled
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The reason for a failed return is shown once; the address is cleaned so a reload does not repeat it
  useEffect(() => {
    if (new URLSearchParams(location.search).has('oauth_error')) {
      navigate(location.pathname, { replace: true, state: location.state });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the first arrival matters
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorText(null);
    setNotice(null);
    setResetSent(false);
    setFieldErrors({});
  };

  const openForgot = () => {
    setForgotEmail(signInFields.email);
    switchMode('forgot');
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setFieldErrors({ 'fp-email': 'Электронная почта обязательна' });
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      await requestPasswordReset(forgotEmail);
      setResetSent(true);
    } catch (error) {
      setErrorText(mapAuthError(error, 'forgot'));
    } finally {
      setLoading(false);
    }
  };

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!signInFields.email) errors['si-email'] = 'Электронная почта обязательна';
    if (!signInFields.password) errors['si-password'] = 'Пароль обязателен';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setLoading(true);
    setErrorText(null);
    try {
      await signIn(signInFields);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorText(mapAuthError(error, 'signIn'));
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!signUpFields.lastName || signUpFields.lastName.length < 2) errors['su-lastName'] = 'Фамилия обязательна (мин. 2 символа)';
    if (!signUpFields.firstName || signUpFields.firstName.length < 2) errors['su-firstName'] = 'Имя обязательно (мин. 2 символа)';
    if (!signUpFields.email) errors['su-email'] = 'Электронная почта обязательна';
    if (!signUpFields.password || signUpFields.password.length < 8) errors['su-password'] = 'Пароль должен содержать не менее 8 символов';
    if (signUpFields.password !== signUpFields.confirmPassword) errors['su-confirmPassword'] = 'Пароли не совпадают';
    if (!acceptedTerms) errors['su-terms'] = 'Нужно принять условия, чтобы создать аккаунт';
    if (!acceptedData) errors['su-data'] = 'Нужно согласие на обработку персональных данных';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setLoading(true);
    setErrorText(null);
    try {
      await signUp({
        firstName: signUpFields.firstName.trim(),
        lastName: signUpFields.lastName.trim(),
        email: signUpFields.email.trim().toLowerCase(),
        password: signUpFields.password,
      });
      setJustRegistered(true);
      switchMode('signIn');
    } catch (error) {
      setErrorText(mapAuthError(error, 'signUp'));
    } finally {
      setLoading(false);
    }
  };

  const clearError = (key: string) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const startOAuth = (provider: OAuthProvider) => {
    // A first sign-in through a provider creates an account, so the same consents are needed as for a form sign-up
    if (mode === 'signUp') {
      const errors: Record<string, string> = {};
      if (!acceptedTerms) errors['su-terms'] = 'Нужно принять условия, чтобы создать аккаунт';
      if (!acceptedData) errors['su-data'] = 'Нужно согласие на обработку персональных данных';
      if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    }
    setLoading(true);
    startOAuthSignIn(provider, redirectTo);
  };

  const switchPrompt = mode === 'signIn' ? (
    <>
      У вас еще нет аккаунта?{' '}
      <Button type="link" className="auth-page__switch-link" onClick={() => switchMode('signUp')}>
        Создать аккаунт
      </Button>
    </>
  ) : (
    <>
      {mode === 'forgot' ? 'Вспомнили пароль?' : 'Уже есть аккаунт?'}{' '}
      <Button type="link" className="auth-page__switch-link" onClick={() => switchMode('signIn')}>
        Войти
      </Button>
    </>
  );

  const authSocialBlock = (
    <>
      <Divider plain className="auth-page__divider">Или</Divider>

      <div className="auth-page__social-row">
        <Button
          block
          className="auth-page__social-btn"
          disabled={loading || !oauthProviders.includes('yandex')}
          onClick={() => startOAuth('yandex')}
        >
          <img src={yandexLogoUrl} alt="" className="auth-page__social-icon" />
          Войти с Яндекс ID
        </Button>
      </div>

      {mode === 'signIn' && oauthProviders.length > 0 && (
        <p className="auth-page__hint auth-page__social-hint">
          Если вы входите через Яндекс ID впервые, мы создадим аккаунт — это значит, что вы принимаете{' '}
          <RouteLink to="/legal#terms" newTab>пользовательское соглашение</RouteLink>,{' '}
          <RouteLink to="/legal#offer" newTab>публичную оферту</RouteLink> и даёте{' '}
          <RouteLink to="/legal#consent" newTab>согласие на обработку персональных данных</RouteLink>.
        </p>
      )}
    </>
  );

  const signInForm = (
    <form onSubmit={(e) => void onSignIn(e)} className="auth-page__form">
      <Form layout="vertical" colon={false} component={false} className="auth-page__form-fields" size="large">
        <div className="auth-page__field-row">
          <Form.Item
            className="auth-page__field"
            label="Почта"
            validateStatus={fieldErrors['si-email'] ? 'error' : undefined}
            help={fieldErrors['si-email'] || undefined}
          >
            <Input
              id="si-email"
              variant="borderless"
              className="auth-page__input"
              placeholder="example@mail.ru"
              autoComplete="email"
              value={signInFields.email}
              onChange={(e) => { setSignInFields((p) => ({ ...p, email: e.target.value })); clearError('si-email'); }}
            />
          </Form.Item>
          <Form.Item
            className="auth-page__field"
            label="Пароль"
            validateStatus={fieldErrors['si-password'] ? 'error' : undefined}
            help={fieldErrors['si-password'] || undefined}
          >
            <Input.Password
              id="si-password"
              variant="borderless"
              className="auth-page__input"
              placeholder="Введите пароль"
              autoComplete="current-password"
              value={signInFields.password}
              onChange={(e) => { setSignInFields((p) => ({ ...p, password: e.target.value })); clearError('si-password'); }}
            />
          </Form.Item>
        </div>
      </Form>

      <div className="auth-page__forgot-row">
        <Button type="link" className="auth-page__switch-link" onClick={openForgot}>
          Забыли пароль?
        </Button>
      </div>

      <Button type="primary" htmlType="submit" loading={loading} block className="auth-page__submit">
        {loading ? 'Вход…' : 'Войти'}
      </Button>

      <p className="auth-page__switch">{switchPrompt}</p>

      {authSocialBlock}
    </form>
  );

  const forgotForm = resetSent ? (
    <div className="auth-page__form">
      <Alert
        type="success"
        showIcon
        message="Проверьте почту"
        description={`Если аккаунт с адресом ${forgotEmail.trim()} существует, мы отправили письмо со ссылкой для смены пароля. Ссылка действует ограниченное время и работает один раз. Если письма нет, загляните в «Спам».`}
        className="auth-page__alert"
      />
      <Button type="primary" block className="auth-page__submit" onClick={() => switchMode('signIn')}>
        Вернуться ко входу
      </Button>
    </div>
  ) : (
    <form onSubmit={(e) => void onForgot(e)} className="auth-page__form">
      <p className="auth-page__hint">
        Укажите почту, с которой вы регистрировались, — мы отправим ссылку для смены пароля.
      </p>
      <Form layout="vertical" colon={false} component={false} className="auth-page__form-fields" size="large">
        <Form.Item
          label="Почта"
          validateStatus={fieldErrors['fp-email'] ? 'error' : undefined}
          help={fieldErrors['fp-email'] || undefined}
        >
          <Input
            id="fp-email"
            variant="borderless"
            className="auth-page__input"
            placeholder="example@mail.ru"
            autoComplete="email"
            value={forgotEmail}
            onChange={(e) => { setForgotEmail(e.target.value); clearError('fp-email'); }}
          />
        </Form.Item>
      </Form>

      <Button type="primary" htmlType="submit" loading={loading} block className="auth-page__submit">
        {loading ? 'Отправка…' : 'Отправить ссылку'}
      </Button>
    </form>
  );

  const signUpForm = (
    <form onSubmit={(e) => void onSignUp(e)} className="auth-page__form">
      <Form layout="vertical" colon={false} component={false} className="auth-page__form-fields" size="large">
        <Form.Item label="Почта" validateStatus={fieldErrors['su-email'] ? 'error' : undefined} help={fieldErrors['su-email'] || undefined}>
          <Input id="su-email" variant="borderless" className="auth-page__input" placeholder="example@mail.ru" autoComplete="email" value={signUpFields.email} onChange={(e) => { setSignUpFields((p) => ({ ...p, email: e.target.value })); clearError('su-email'); }} />
        </Form.Item>
        <div className="auth-page__field-row">
          <Form.Item label="Фамилия" validateStatus={fieldErrors['su-lastName'] ? 'error' : undefined} help={fieldErrors['su-lastName'] || undefined}>
            <Input id="su-lastName" variant="borderless" className="auth-page__input" placeholder="Иванов" autoComplete="family-name" value={signUpFields.lastName} onChange={(e) => { setSignUpFields((p) => ({ ...p, lastName: e.target.value })); clearError('su-lastName'); }} />
          </Form.Item>
          <Form.Item label="Имя" validateStatus={fieldErrors['su-firstName'] ? 'error' : undefined} help={fieldErrors['su-firstName'] || undefined}>
            <Input id="su-firstName" variant="borderless" className="auth-page__input" placeholder="Иван" autoComplete="given-name" value={signUpFields.firstName} onChange={(e) => { setSignUpFields((p) => ({ ...p, firstName: e.target.value })); clearError('su-firstName'); }} />
          </Form.Item>
        </div>
        <div className="auth-page__field-row">
          <Form.Item label="Пароль" validateStatus={fieldErrors['su-password'] ? 'error' : undefined} help={fieldErrors['su-password'] || undefined}>
            <Input.Password id="su-password" variant="borderless" className="auth-page__input" placeholder="Придумайте пароль" autoComplete="new-password" value={signUpFields.password} onChange={(e) => { setSignUpFields((p) => ({ ...p, password: e.target.value })); clearError('su-password'); }} />
          </Form.Item>
          <Form.Item label="Подтвердите пароль" validateStatus={fieldErrors['su-confirmPassword'] ? 'error' : undefined} help={fieldErrors['su-confirmPassword'] || undefined}>
            <Input.Password id="su-confirmPassword" variant="borderless" className="auth-page__input" placeholder="Повторите пароль" autoComplete="new-password" value={signUpFields.confirmPassword} onChange={(e) => { setSignUpFields((p) => ({ ...p, confirmPassword: e.target.value })); clearError('su-confirmPassword'); }} />
          </Form.Item>
        </div>
      </Form>

      <div className="auth-page__consents">
        <Checkbox
          checked={acceptedTerms}
          onChange={(e) => { setAcceptedTerms(e.target.checked); clearError('su-terms'); }}
        >
          Принимаю <RouteLink to="/legal#terms" newTab>пользовательское соглашение</RouteLink> и{' '}
          <RouteLink to="/legal#offer" newTab>публичную оферту</RouteLink>
        </Checkbox>
        {fieldErrors['su-terms'] && <div className="auth-page__consent-error" role="alert">{fieldErrors['su-terms']}</div>}

        <Checkbox
          checked={acceptedData}
          onChange={(e) => { setAcceptedData(e.target.checked); clearError('su-data'); }}
        >
          Даю <RouteLink to="/legal#consent" newTab>согласие на обработку персональных данных</RouteLink>, с{' '}
          <RouteLink to="/legal#privacy" newTab>политикой конфиденциальности</RouteLink> ознакомлен(а)
        </Checkbox>
        {fieldErrors['su-data'] && <div className="auth-page__consent-error" role="alert">{fieldErrors['su-data']}</div>}
      </div>

      <Button type="primary" htmlType="submit" loading={loading} block className="auth-page__submit">
        {loading ? 'Создание аккаунта…' : 'Создать аккаунт'}
      </Button>

      {authSocialBlock}
    </form>
  );

  return (
    <div className="auth-page">
      <Segmented
        className="auth-page__theme-control"
        size="middle"
        value={themeMode}
        aria-label="Переключение темы"
        onChange={(value) => {
          if (value !== themeMode) toggleTheme();
        }}
        options={[
          { label: '', value: 'light', icon: <SunOutlined />, title: 'Светлая тема' },
          { label: '', value: 'dark', icon: <MoonOutlined />, title: 'Темная тема' },
        ]}
      />

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

      <section className="auth-page__panel" aria-label="Форма авторизации">
        <h1 className="auth-page__heading">{HEADINGS[mode]}</h1>

        <div className="auth-page__panel-body">
          {/* On a phone the bottom link is a long scroll away, so the same prompt is repeated under the heading */}
          {mode !== 'signIn' && <p className="auth-page__switch auth-page__switch--top">{switchPrompt}</p>}
          {notice && (
            <Alert
              type="success"
              showIcon
              message={notice}
              closable
              onClose={() => setNotice(null)}
              className="auth-page__alert"
            />
          )}

          {errorText && (
            <Alert
              type="error"
              message={errorText}
              closable
              onClose={() => setErrorText(null)}
              className="auth-page__alert"
            />
          )}

          {mode === 'signIn' ? signInForm : mode === 'signUp' ? signUpForm : forgotForm}

          {mode !== 'signIn' && <p className="auth-page__switch">{switchPrompt}</p>}
        </div>
        <p className="auth-page__hint auth-page__legal">
          <RouteLink to="/pricing">Тарифы</RouteLink> · <RouteLink to="/legal#offer">Оферта</RouteLink> ·{' '}
          <RouteLink to="/legal#terms">Соглашение</RouteLink> · <RouteLink to="/legal#privacy">Конфиденциальность</RouteLink> ·{' '}
          <RouteLink to="/legal#contacts">Контакты и реквизиты</RouteLink>
        </p>
      </section>
    </div>
  );
};
