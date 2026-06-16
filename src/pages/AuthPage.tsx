import { useState } from 'react';
import { Alert, Button, Form, Input, Tabs } from 'antd';
import { PhoneInput } from '../shared/ui/PhoneInput';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/auth.hooks';
import {
  emailRules,
  passwordRules,
  phoneRules,
  requiredRule,
  toAntValidator,
} from '../shared/utils/formRules';
import {
  validatePasswordConfirmValue,
  validateShortTextValue,
} from '../shared/utils/fieldValueValidation';

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

const nameRules = (label: string) => [
  requiredRule(`${label} обязательно`),
  {
    validator: toAntValidator((value, required) => {
      const base = validateShortTextValue(value, required, 100);
      if (base) return base;
      const text = typeof value === 'string' ? value.trim() : '';
      if (text.length < 2) return `Минимум 2 символа`;
      return null;
    }, true),
  },
];

const mapAuthError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Неожиданная ошибка аутентификации';
  if (error.message.includes('Invalid login credentials')) {
    return 'Неверный адрес электронной почты или пароль';
  }
  if (error.message.includes('User already registered')) {
    return 'Пользователь с таким адресом электронной почты уже зарегистрирован';
  }
  return error.message;
};

export const AuthPage = () => {
  const [activeTab, setActiveTab] = useState<AuthTabIndex>(0);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [signInForm] = Form.useForm<SignInValues>();
  const [signUpForm] = Form.useForm<SignUpValues>();

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    typeof (location.state as { from?: string } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : '/requests';

  const onSignIn = async (values: SignInValues) => {
    setLoading(true);
    setErrorText(null);
    try {
      await signIn(values);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorText(mapAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (values: SignUpValues) => {
    setLoading(true);
    setErrorText(null);
    try {
      await signUp({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        middleName: values.middleName?.trim() || undefined,
        email: values.email.trim().toLowerCase(),
        phoneNumber: values.phoneNumber.trim(),
        password: values.password,
      });
      setErrorText(null);
      setActiveTab(0);
      signUpForm.resetFields();
    } catch (error) {
      setErrorText(mapAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const signInFormNode = (
    <Form
      form={signInForm}
      layout="vertical"
      onFinish={(values) => void onSignIn(values)}
      style={{ paddingTop: 16 }}
    >
      <Form.Item
        name="email"
        label="Электронная почта"
        rules={[{ required: true, message: 'Электронная почта обязательна' }, ...emailRules()]}
      >
        <Input placeholder="name@example.com" autoComplete="email" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Пароль"
        rules={[{ required: true, message: 'Пароль обязателен' }, ...passwordRules()]}
      >
        <Input.Password placeholder="Введите пароль" autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading} block>
        {loading ? 'Вход…' : 'Войти'}
      </Button>
    </Form>
  );

  const signUpFormNode = (
    <Form
      form={signUpForm}
      layout="vertical"
      onFinish={(values) => void onSignUp(values)}
      style={{ paddingTop: 16 }}
    >
      <Form.Item name="lastName" label="Фамилия" rules={nameRules('Фамилия')}>
        <Input placeholder="Иванов" autoComplete="family-name" />
      </Form.Item>
      <Form.Item name="firstName" label="Имя" rules={nameRules('Имя')}>
        <Input placeholder="Иван" autoComplete="given-name" />
      </Form.Item>
      <Form.Item name="middleName" label="Отчество (необязательно)">
        <Input placeholder="Иванович" autoComplete="additional-name" />
      </Form.Item>
      <Form.Item
        name="email"
        label="Электронная почта"
        rules={[{ required: true, message: 'Электронная почта обязательна' }, ...emailRules()]}
      >
        <Input placeholder="name@example.com" autoComplete="email" />
      </Form.Item>
      <Form.Item
        name="phoneNumber"
        label="Номер телефона"
        rules={[{ required: true, message: 'Номер телефона обязателен' }, ...phoneRules()]}
      >
        <PhoneInput autoComplete="tel" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Пароль"
        rules={[{ required: true, message: 'Пароль обязателен' }, ...passwordRules()]}
      >
        <Input.Password placeholder="Придумайте пароль" autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="confirmPassword"
        label="Подтвердите пароль"
        dependencies={['password']}
        rules={[
          { required: true, message: 'Подтвердите пароль' },
          {
            validator: async (_, value) => {
              const password = signUpForm.getFieldValue('password');
              const error = validatePasswordConfirmValue(password, value);
              if (error) throw new Error(error);
            },
          },
        ]}
      >
        <Input.Password placeholder="Повторите пароль" autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading} block>
        {loading ? 'Регистрация…' : 'Зарегистрироваться'}
      </Button>
    </Form>
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
            setActiveTab(Number(key) as AuthTabIndex);
          }}
          items={[
            { key: '0', label: 'Вход', children: signInFormNode },
            { key: '1', label: 'Регистрация', children: signUpFormNode },
          ]}
        />
      </div>
      <p style={{ marginTop: 16, color: 'var(--app-text-secondary)', fontSize: 13 }}>
        Продолжая, вы соглашаетесь использовать учётные данные корпоративной учётной записи.
      </p>
    </div>
  );
};
