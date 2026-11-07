import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getPlans } from '../../shared/api/billing.api';
import { PAYWALL_EVENT, type BillingError } from '../../shared/lib/billingErrors';

/**
 * The one window that tells a person a plan limit stopped what they did and offers the way on.
 * It listens to the event the API client raises on every 402, so no screen has to wire it up.
 */
export const PaywallModalHost = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<BillingError | null>(null);
  // While the plan is sold by seats, the owner of a used-up pool can buy an extra pack of credits
  const [packsSold, setPacksSold] = useState(false);

  useEffect(() => {
    const onPaywall = (event: Event) => setError((event as CustomEvent<BillingError>).detail);
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    return () => window.removeEventListener(PAYWALL_EVENT, onPaywall);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((plans) => {
        if (!cancelled) setPacksSold(plans.seat_pricing_enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => setError(null);
  const canUpgrade = !!error?.upgradeTo;
  const isTokens = error?.limit === 'ai_tokens' || error?.limit === 'ai_member_tokens';
  // Somebody else pays for this pool: nothing to buy here, the owner of the team has to be asked
  const askOwner = !!error?.teamMember;
  const canBuyPack = isTokens && !askOwner && !canUpgrade && packsSold;

  if (askOwner) {
    return (
      <Modal
        open={!!error}
        onCancel={close}
        onOk={close}
        title={error?.limit === 'ai_member_tokens' ? 'Личный лимит исчерпан' : 'Кредиты команды закончились'}
        okText="Понятно"
        cancelButtonProps={{ style: { display: 'none' } }}
        destroyOnHidden
      >
        <p style={{ margin: 0 }}>{error?.message}</p>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Всё, что вы уже сделали, сохранено. Кредиты общие для команды: владелец может докупить пакет кредитов, добавить
          места или поднять ваш личный лимит. Напишите ему.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={!!error}
      onCancel={close}
      title={
        error?.limit === 'feature'
          ? 'Эта возможность на другом тарифе'
          : error?.limit === 'ai_tokens'
            ? 'Кредиты ИИ закончились'
            : 'Лимит тарифа достигнут'
      }
      okText={canUpgrade ? 'Выбрать тариф' : canBuyPack ? 'Докупить кредиты' : 'Открыть подписку'}
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
            ? 'Всё, что вы уже сделали, сохранено. Тариф «Исследователь» даёт больше кредитов каждый месяц, а разовый доступ «Исследование» хватит на одно большое исследование.'
            : canBuyPack
              ? 'Всё, что вы уже сделали, сохранено. Можно докупить пакет кредитов (он общий для команды) или добавить места, это увеличит месячные кредиты.'
              : 'Всё, что вы уже сделали, сохранено. Кредиты обновятся с новым периодом подписки. Если вам нужно больше, напишите нам: подберём условия.'
          : canUpgrade
            ? 'Всё, что вы уже сделали, сохранено. Тариф «Исследователь» поднимает лимиты и открывает остальные возможности.'
            : 'Всё, что вы уже сделали, сохранено. Если вам нужно больше, напишите нам: подберём условия.'}
      </p>
    </Modal>
  );
};
