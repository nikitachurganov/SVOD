import { useState, type FormEvent } from 'react';
import { Alert, Button, Divider, Form, Input, Segmented } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useThemeMode } from '../shared/context/theme.context';
import logoUrl from '../assets/logo.svg';
import yandexLogoUrl from '../assets/logo-yandex.svg';
import vkLogoUrl from '../assets/logo-vk.svg';
import heroBgUrl from '../assets/auth-hero-bg.png';
import './AuthPage.css';

type AuthMode = 'signIn' | 'signUp';

interface SignInValues {
  email: string;
  password: string;
}

interface SignUpValues extends SignInValues {
  firstName: string;
  lastName: string;
  confirmPassword: string;
}

const mapAuthError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Неожиданная ошибка аутентификации';
  if (error.message.includes('Invalid login credentials')) return 'Неверный адрес электронной почты или пароль';
  if (error.message.includes('User already registered')) return 'Пользователь с таким адресом электронной почты уже зарегистрирован';
  return error.message;
};

export const AuthPage = () => {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [signInFields, setSignInFields] = useState<SignInValues>({ email: '', password: '' });
  const [signUpFields, setSignUpFields] = useState<SignUpValues>({
    email: '', password: '', firstName: '', lastName: '', confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { signIn, signUp } = useAuth();
  const { themeMode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    typeof (location.state as { from?: string } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : '/requests';

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorText(null);
    setFieldErrors({});
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
      setErrorText(mapAuthError(error));
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
      setErrorText(mapAuthError(error));
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

      <Button type="primary" htmlType="submit" loading={loading} block className="auth-page__submit">
        {loading ? 'Вход…' : 'Войти'}
      </Button>

      {authSocialBlock}
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
      <Button type="primary" htmlType="submit" loading={loading} block className="auth-page__submit">
        {loading ? 'Регистрация…' : 'Зарегистрироваться'}
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
          <p className="auth-page__hero-tagline">Все заявки в одном управляемом потоке</p>
        </div>
      </div>

      <section className="auth-page__panel" aria-label="Форма авторизации">
        <h1 className="auth-page__heading">{mode === 'signIn' ? 'Вход' : 'Регистрация'}</h1>

        <div className="auth-page__panel-body">
          {errorText && (
            <Alert
              type="error"
              message={errorText}
              closable
              onClose={() => setErrorText(null)}
              className="auth-page__alert"
            />
          )}

          {mode === 'signIn' ? signInForm : signUpForm}

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
                Уже есть аккаунт?{' '}
                <button type="button" className="auth-page__switch-link" onClick={() => switchMode('signIn')}>
                  Войти
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
};
