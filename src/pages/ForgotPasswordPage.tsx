import { useState, type FormEvent } from 'react';
import { Button, InlineNotification, TextInput } from '@carbon/react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../shared/api/auth.api';

export const ForgotPasswordPage = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [successText, setSuccessText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setEmailError('Электронная почта обязательна'); return; }

    setIsSubmitting(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSuccessText('Если аккаунт с этим адресом существует, ссылка для сброса пароля отправлена.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Неожиданная ошибка. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16, background: 'var(--cds-background)' }}>
      <h2 style={{ marginBottom: 16 }}>СВОД</h2>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--cds-layer-01)', padding: 24, border: '1px solid var(--cds-border-subtle)' }}>
        <h3 style={{ marginTop: 0 }}>Забыли пароль</h3>
        <p style={{ color: 'var(--cds-text-secondary)', marginBottom: 16 }}>
          Введите адрес электронной почты, и мы отправим ссылку для сброса пароля.
        </p>

        {successText && (
          <InlineNotification kind="success" title={successText} lowContrast hideCloseButton={false} onCloseButtonClick={() => setSuccessText(null)} style={{ marginBottom: 16 }} />
        )}
        {errorText && (
          <InlineNotification kind="error" title={errorText} lowContrast hideCloseButton={false} onCloseButtonClick={() => setErrorText(null)} style={{ marginBottom: 16 }} />
        )}

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TextInput
            id="forgot-email"
            labelText="Электронная почта"
            placeholder="name@example.com"
            autoComplete="email"
            value={email}
            invalid={!!emailError}
            invalidText={emailError}
            onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Отправка…' : 'Отправить ссылку для сброса'}
          </Button>
        </form>
      </div>
      <p style={{ marginTop: 16, color: 'var(--cds-text-secondary)', fontSize: 13 }}>
        Вспомнили пароль? <Link to="/auth">Вернуться ко входу</Link>
      </p>
    </div>
  );
};
