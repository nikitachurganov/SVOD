import { useState, type FormEvent } from 'react';
import {
  Button,
  InlineNotification,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  TextInput,
  PasswordInput,
} from '@carbon/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/context/auth.context';

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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 16,
        background: 'var(--cds-background)',
      }}
    >
      <h2 style={{ marginBottom: 16 }}>Сервис Деск</h2>
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--cds-layer-01)',
          padding: 24,
          border: '1px solid var(--cds-border-subtle)',
        }}
      >
        {errorText && (
          <InlineNotification
            kind="error"
            title={errorText}
            lowContrast
            hideCloseButton={false}
            onCloseButtonClick={() => setErrorText(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Tabs
          selectedIndex={activeTab}
          onChange={({ selectedIndex }: { selectedIndex: number }) => {
            setErrorText(null);
            setFieldErrors({});
            setActiveTab(selectedIndex as AuthTabIndex);
          }}
        >
          <TabList aria-label="Авторизация">
            <Tab>Вход</Tab>
            <Tab>Регистрация</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <form onSubmit={(e) => void onSignIn(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
                <TextInput
                  id="si-email"
                  labelText="Электронная почта"
                  placeholder="name@example.com"
                  autoComplete="email"
                  value={signInFields.email}
                  invalid={!!fieldErrors['si-email']}
                  invalidText={fieldErrors['si-email']}
                  onChange={(e) => { setSignInFields((p) => ({ ...p, email: e.target.value })); clearError('si-email'); }}
                />
                <PasswordInput
                  id="si-password"
                  labelText="Пароль"
                  placeholder="Введите пароль"
                  autoComplete="current-password"
                  value={signInFields.password}
                  invalid={!!fieldErrors['si-password']}
                  invalidText={fieldErrors['si-password']}
                  onChange={(e) => { setSignInFields((p) => ({ ...p, password: e.target.value })); clearError('si-password'); }}
                />
                <div style={{ textAlign: 'right' }}>
                  <Link to="/auth/forgot-password">Забыли пароль?</Link>
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Вход…' : 'Войти'}
                </Button>
              </form>
            </TabPanel>
            <TabPanel>
              <form onSubmit={(e) => void onSignUp(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
                <TextInput id="su-lastName" labelText="Фамилия" placeholder="Иванов" autoComplete="family-name" value={signUpFields.lastName} invalid={!!fieldErrors['su-lastName']} invalidText={fieldErrors['su-lastName']} onChange={(e) => { setSignUpFields((p) => ({ ...p, lastName: e.target.value })); clearError('su-lastName'); }} />
                <TextInput id="su-firstName" labelText="Имя" placeholder="Иван" autoComplete="given-name" value={signUpFields.firstName} invalid={!!fieldErrors['su-firstName']} invalidText={fieldErrors['su-firstName']} onChange={(e) => { setSignUpFields((p) => ({ ...p, firstName: e.target.value })); clearError('su-firstName'); }} />
                <TextInput id="su-middleName" labelText="Отчество (необязательно)" placeholder="Иванович" autoComplete="additional-name" value={signUpFields.middleName} onChange={(e) => setSignUpFields((p) => ({ ...p, middleName: e.target.value }))} />
                <TextInput id="su-email" labelText="Электронная почта" placeholder="name@example.com" autoComplete="email" value={signUpFields.email} invalid={!!fieldErrors['su-email']} invalidText={fieldErrors['su-email']} onChange={(e) => { setSignUpFields((p) => ({ ...p, email: e.target.value })); clearError('su-email'); }} />
                <TextInput id="su-phone" labelText="Номер телефона" placeholder="+79001234567" autoComplete="tel" value={signUpFields.phoneNumber} invalid={!!fieldErrors['su-phone']} invalidText={fieldErrors['su-phone']} onChange={(e) => { setSignUpFields((p) => ({ ...p, phoneNumber: e.target.value })); clearError('su-phone'); }} />
                <PasswordInput id="su-password" labelText="Пароль" placeholder="Придумайте пароль" autoComplete="new-password" value={signUpFields.password} invalid={!!fieldErrors['su-password']} invalidText={fieldErrors['su-password']} onChange={(e) => { setSignUpFields((p) => ({ ...p, password: e.target.value })); clearError('su-password'); }} />
                <PasswordInput id="su-confirmPassword" labelText="Подтвердите пароль" placeholder="Повторите пароль" autoComplete="new-password" value={signUpFields.confirmPassword} invalid={!!fieldErrors['su-confirmPassword']} invalidText={fieldErrors['su-confirmPassword']} onChange={(e) => { setSignUpFields((p) => ({ ...p, confirmPassword: e.target.value })); clearError('su-confirmPassword'); }} />
                <Button type="submit" disabled={loading}>
                  {loading ? 'Регистрация…' : 'Зарегистрироваться'}
                </Button>
              </form>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
      <p style={{ marginTop: 16, color: 'var(--cds-text-secondary)', fontSize: 13 }}>
        Продолжая, вы соглашаетесь использовать учётные данные корпоративной учётной записи.
      </p>
    </div>
  );
};
