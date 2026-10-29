import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import { PAYWALL_EVENT, type BillingError } from '../../shared/lib/billingErrors';

/**
 * The one window that tells a person a plan limit stopped what they did and offers the way on.
 * It listens to the event the API client raises on every 402, so no screen has to wire it up.
 */
export const PaywallModalHost = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<BillingError | null>(null);

  useEffect(() => {
    const onPaywall = (event: Event) => setError((event as CustomEvent<BillingError>).detail);
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    return () => window.removeEventListener(PAYWALL_EVENT, onPaywall);
  }, []);

  const close = () => setError(null);
  const canUpgrade = !!error?.upgradeTo;

  return (
    <Modal
      open={!!error}
      onCancel={close}
      title={
        error?.limit === 'feature'
          ? 'Эта возможность на другом тарифе'
          : error?.limit === 'ai_tokens'
            ? 'Токены ИИ закончились'
            : 'Лимит тарифа достигнут'
      }
      okText={canUpgrade ? 'Выбрать тариф' : 'Открыть подписку'}
      cancelText="Закрыть"
      onOk={() => {
        close();
        navigate(canUpgrade ? '/plans' : '/profile?tab=subscription');
      }}
      destroyOnHidden
    >
      <p style={{ margin: 0 }}>{error?.message}</p>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--app-text-secondary)' }}>
        {error?.limit === 'ai_tokens'
          ? canUpgrade
            ? 'Всё, что вы уже сделали, сохранено. Тариф «Исследователь» даёт больше токенов каждый месяц, а разовый доступ «Исследование» хватит на одно большое исследование.'
            : 'Всё, что вы уже сделали, сохранено. Токены обновятся с новым периодом подписки. Если вам нужно больше, напишите нам: подберём условия.'
          : canUpgrade
            ? 'Всё, что вы уже сделали, сохранено. Тариф «Исследователь» поднимает лимиты и открывает остальные возможности.'
            : 'Всё, что вы уже сделали, сохранено. Если вам нужно больше, напишите нам: подберём условия.'}
      </p>
    </Modal>
  );
};
