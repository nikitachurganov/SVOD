import { useState, type FormEvent } from 'react';
import { Alert, Button, Form, Input, Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';

type AuthTabIndex = 0 | 1;

interface SignInValues {
  email: string;
  password: string;
}

interface SignUpValues extends SignInValues {
  firstName: string;
  lastName: string;
  middleName: string;
  phoneNumber: string;
  confirmPassword: string;
}

const mapAuthError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Неожиданная ошибка аутентификации';
  if (error.message.includes('Invalid login credentials')) return 'Неверный адрес электронной почты или пароль';
  if (error.message.includes('User already registered')) return 'Пользователь с таким адресом электронной почты уже зарегистрирован';
  return error.message;
};

export const AuthPage = () => {
  const [activeTab, setActiveTab] = useState<AuthTabIndex>(0);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [signInFields, setSignInFields] = useState<SignInValues>({ email: '', password: '' });
  const [signUpFields, setSignUpFields] = useState<SignUpValues>({
    email: '', password: '', firstName: '', lastName: '',
    middleName: '', phoneNumber: '', confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    typeof (location.state as { from?: string } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : '/requests';

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
    if (!signUpFields.phoneNumber) errors['su-phone'] = 'Номер телефона обязателен';
    if (!signUpFields.password || signUpFields.password.length < 8) errors['su-password'] = 'Пароль должен содержать не менее 8 символов';
    if (signUpFields.password !== signUpFields.confirmPassword) errors['su-confirmPassword'] = 'Пароли не совпадают';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setLoading(true);
    setErrorText(null);
    try {
      await signUp({
        firstName: signUpFields.firstName.trim(),
        lastName: signUpFields.lastName.trim(),
        middleName: signUpFields.middleName?.trim() || undefined,
        email: signUpFields.email.trim().toLowerCase(),
        phoneNumber: signUpFields.phoneNumber.trim(),
        password: signUpFields.password,
      });
      setErrorText(null);
      setActiveTab(0);
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

  const signInForm = (
    <form onSubmit={(e) => void onSignIn(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
      <Form.Item
        label="Электронная почта"
        validateStatus={fieldErrors['si-email'] ? 'error' : undefined}
        help={fieldErrors['si-email'] || undefined}
      >
        <Input
          id="si-email"
          placeholder="name@example.com"
          autoComplete="email"
          value={signInFields.email}
          onChange={(e) => { setSignInFields((p) => ({ ...p, email: e.target.value })); clearError('si-email'); }}
        />
      </Form.Item>
      <Form.Item
        label="Пароль"
        validateStatus={fieldErrors['si-password'] ? 'error' : undefined}
        help={fieldErrors['si-password'] || undefined}
      >
        <Input.Password
          id="si-password"
          placeholder="Введите пароль"
          autoComplete="current-password"
          value={signInFields.password}
          onChange={(e) => { setSignInFields((p) => ({ ...p, password: e.target.value })); clearError('si-password'); }}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading}>
        {loading ? 'Вход…' : 'Войти'}
      </Button>
    </form>
  );

  const signUpForm = (
    <form onSubmit={(e) => void onSignUp(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
      <Form.Item label="Фамилия" validateStatus={fieldErrors['su-lastName'] ? 'error' : undefined} help={fieldErrors['su-lastName'] || undefined}>
        <Input id="su-lastName" placeholder="Иванов" autoComplete="family-name" value={signUpFields.lastName} onChange={(e) => { setSignUpFields((p) => ({ ...p, lastName: e.target.value })); clearError('su-lastName'); }} />
      </Form.Item>
      <Form.Item label="Имя" validateStatus={fieldErrors['su-firstName'] ? 'error' : undefined} help={fieldErrors['su-firstName'] || undefined}>
        <Input id="su-firstName" placeholder="Иван" autoComplete="given-name" value={signUpFields.firstName} onChange={(e) => { setSignUpFields((p) => ({ ...p, firstName: e.target.value })); clearError('su-firstName'); }} />
      </Form.Item>
      <Form.Item label="Отчество (необязательно)">
        <Input id="su-middleName" placeholder="Иванович" autoComplete="additional-name" value={signUpFields.middleName} onChange={(e) => setSignUpFields((p) => ({ ...p, middleName: e.target.value }))} />
      </Form.Item>
      <Form.Item label="Электронная почта" validateStatus={fieldErrors['su-email'] ? 'error' : undefined} help={fieldErrors['su-email'] || undefined}>
        <Input id="su-email" placeholder="name@example.com" autoComplete="email" value={signUpFields.email} onChange={(e) => { setSignUpFields((p) => ({ ...p, email: e.target.value })); clearError('su-email'); }} />
      </Form.Item>
      <Form.Item label="Номер телефона" validateStatus={fieldErrors['su-phone'] ? 'error' : undefined} help={fieldErrors['su-phone'] || undefined}>
        <Input id="su-phone" placeholder="+79001234567" autoComplete="tel" value={signUpFields.phoneNumber} onChange={(e) => { setSignUpFields((p) => ({ ...p, phoneNumber: e.target.value })); clearError('su-phone'); }} />
      </Form.Item>
      <Form.Item label="Пароль" validateStatus={fieldErrors['su-password'] ? 'error' : undefined} help={fieldErrors['su-password'] || undefined}>
        <Input.Password id="su-password" placeholder="Придумайте пароль" autoComplete="new-password" value={signUpFields.password} onChange={(e) => { setSignUpFields((p) => ({ ...p, password: e.target.value })); clearError('su-password'); }} />
      </Form.Item>
      <Form.Item label="Подтвердите пароль" validateStatus={fieldErrors['su-confirmPassword'] ? 'error' : undefined} help={fieldErrors['su-confirmPassword'] || undefined}>
        <Input.Password id="su-confirmPassword" placeholder="Повторите пароль" autoComplete="new-password" value={signUpFields.confirmPassword} onChange={(e) => { setSignUpFields((p) => ({ ...p, confirmPassword: e.target.value })); clearError('su-confirmPassword'); }} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading}>
        {loading ? 'Регистрация…' : 'Зарегистрироваться'}
      </Button>
    </form>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 16,
        background: 'var(--app-bg)',
      }}
    >
      <h2 style={{ marginBottom: 16 }}>СВОД</h2>
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--app-surface)',
          padding: 24,
          border: '1px solid var(--app-border)',
        }}
      >
        {errorText && (
          <Alert
            type="error"
            message={errorText}
            closable
            onClose={() => setErrorText(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Tabs
          activeKey={String(activeTab)}
          onChange={(key) => {
            setErrorText(null);
            setFieldErrors({});
            setActiveTab(Number(key) as AuthTabIndex);
          }}
          items={[
            { key: '0', label: 'Вход', children: signInForm },
            { key: '1', label: 'Регистрация', children: signUpForm },
          ]}
        />
      </div>
      <p style={{ marginTop: 16, color: 'var(--app-text-secondary)', fontSize: 13 }}>
        Продолжая, вы соглашаетесь использовать учётные данные корпоративной учётной записи.
      </p>
    </div>
  );
};
