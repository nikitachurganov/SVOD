import { useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, Divider, Form, Input, Segmented } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useThemeMode } from '../shared/context/theme.context';
import { requestPasswordReset } from '../shared/api/auth.api';
import { HOME_PATH, IS_SURVEYS_APP } from '../shared/config/appMode';
import logoUrl from '../assets/logo.svg';
import yandexLogoUrl from '../assets/logo-yandex.svg';
import vkLogoUrl from '../assets/logo-vk.svg';
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

export const AuthPage = () => {
  const location = useLocation();
  const routeState = location.state as AuthRouteState | null;

  const [mode, setMode] = useState<AuthMode>(routeState?.mode === 'forgot' ? 'forgot' : 'signIn');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(routeState?.notice ?? null);
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
  const redirectTo = typeof routeState?.from === 'string' ? routeState.from : HOME_PATH;

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

  const authSocialBlock = (
    <>
      <Divider plain className="auth-page__divider">Или</Divider>

      <div className="auth-page__social-row">
        <Button disabled block>
          <img src={yandexLogoUrl} alt="" className="auth-page__social-icon" />
          Войти с Яндекс ID
        </Button>
        <Button disabled block>
          <img src={vkLogoUrl} alt="" className="auth-page__social-icon" />
          Войти с VK ID
        </Button>
      </div>
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
        <button type="button" className="auth-page__switch-link" onClick={openForgot}>
          Забыли пароль?
        </button>
      </div>

      <Button type="primary" htmlType="submit" loading={loading} block className="auth-page__submit">
        {loading ? 'Вход…' : 'Войти'}
      </Button>

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
          Принимаю <Link to="/legal#terms" target="_blank">пользовательское соглашение</Link> и{' '}
          <Link to="/legal#offer" target="_blank">публичную оферту</Link>
        </Checkbox>
        {fieldErrors['su-terms'] && <div className="auth-page__consent-error" role="alert">{fieldErrors['su-terms']}</div>}

        <Checkbox
          checked={acceptedData}
          onChange={(e) => { setAcceptedData(e.target.checked); clearError('su-data'); }}
        >
          Даю <Link to="/legal#consent" target="_blank">согласие на обработку персональных данных</Link>, с{' '}
          <Link to="/legal#privacy" target="_blank">политикой конфиденциальности</Link> ознакомлен(а)
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

          <p className="auth-page__switch">
            {mode === 'signIn' ? (
              <>
                У вас еще нет аккаунта?{' '}
                <button type="button" className="auth-page__switch-link" onClick={() => switchMode('signUp')}>
                  Создать аккаунт
                </button>
              </>
            ) : (
              <>
                {mode === 'forgot' ? 'Вспомнили пароль?' : 'Уже есть аккаунт?'}{' '}
                <button type="button" className="auth-page__switch-link" onClick={() => switchMode('signIn')}>
                  Войти
                </button>
              </>
            )}
          </p>

          <p className="auth-page__hint">
            <Link to="/pricing">Тарифы</Link> · <Link to="/legal#offer">Оферта</Link> ·{' '}
            <Link to="/legal#terms">Соглашение</Link> · <Link to="/legal#privacy">Конфиденциальность</Link> ·{' '}
            <Link to="/legal#contacts">Контакты и реквизиты</Link>
          </p>
        </div>
      </section>
    </div>
  );
};
