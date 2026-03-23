import { useState, type FormEvent } from 'react';
import { Button, InlineNotification, PasswordInput } from '@carbon/react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut, updatePassword } from '../shared/api/auth.api';

export const ResetPasswordPage = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!password || password.length < 8) errors.password = 'Пароль должен содержать не менее 8 символов';
    if (password !== confirmPassword) errors.confirmPassword = 'Пароли не совпадают';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setIsSubmitting(true);
    setErrorText(null);
    try {
      await updatePassword(password);
      await signOut();
      navigate('/auth', { replace: true });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Неожиданная ошибка. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearError = (key: string) => setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16, background: 'var(--cds-background)' }}>
      <h2 style={{ marginBottom: 16 }}>Сервис Деск</h2>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--cds-layer-01)', padding: 24, border: '1px solid var(--cds-border-subtle)' }}>
        <h3 style={{ marginTop: 0 }}>Сбросить пароль</h3>

        {errorText && (
          <InlineNotification kind="error" title={errorText} lowContrast style={{ marginBottom: 16 }} />
        )}

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PasswordInput id="reset-password" labelText="Новый пароль" placeholder="Введите новый пароль" autoComplete="new-password" value={password} invalid={!!fieldErrors.password} invalidText={fieldErrors.password} onChange={(e) => { setPassword(e.target.value); clearError('password'); }} />
          <PasswordInput id="reset-confirmPassword" labelText="Подтвердите пароль" placeholder="Повторите новый пароль" autoComplete="new-password" value={confirmPassword} invalid={!!fieldErrors.confirmPassword} invalidText={fieldErrors.confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Обновление…' : 'Обновить пароль'}
          </Button>
        </form>
      </div>
      <p style={{ marginTop: 16, color: 'var(--cds-text-secondary)', fontSize: 13 }}>
        <Link to="/auth">Вернуться ко входу</Link>
      </p>
    </div>
  );
};
