import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { resendEmailVerification } from '../../shared/api/auth.api';
import { useAuth } from '../../shared/hooks/auth.hooks';

/** The server explains a refusal (asked too often) in Russian; anything else is generic */
const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && /[а-яё]/i.test(detail) ? detail : fallback;
};

/** A strip above the page for people who signed up and have not confirmed the mailbox yet */
export const EmailVerificationBanner = () => {
  const { profile, refreshProfile } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = Boolean(profile && !profile.emailVerified && profile.emailVerificationAvailable);

  // The link is usually opened in another tab or on a phone: pick the confirmation up on return
  useEffect(() => {
    if (!pending) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pending, refreshProfile]);

  if (!pending || !profile) return null;

  const handleResend = async () => {
    setSending(true);
    setError(null);
    try {
      await resendEmailVerification();
      setSent(true);
    } catch (err) {
      setError(errorDetail(err, 'Не удалось отправить письмо. Попробуйте ещё раз'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Alert
      banner
      type={error ? 'error' : 'warning'}
      showIcon
      message={
        error ??
        (sent
          ? `Письмо отправлено на ${profile.email}. Проверьте почту и папку «Спам».`
          : `Подтвердите адрес ${profile.email}: мы отправили письмо со ссылкой. Это нужно, чтобы вы могли восстановить доступ к аккаунту.`)
      }
      action={
        <Button size="small" loading={sending} onClick={() => void handleResend()}>
          {sent ? 'Отправить ещё раз' : 'Отправить письмо ещё раз'}
        </Button>
      }
    />
  );
};
