import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { PaymentReturnNotice } from './PaymentReturnNotice';

interface Props {
  /** The payment changed the plan: the page reads its numbers (seats, credits) again */
  onSettled?: () => void;
}

const noop = () => {};

/**
 * The payment page sends the person back with ?payment=<id>; this shows how the payment went on any page
 * it comes back to (the team's people, the plans) and removes the mark from the address when closed.
 */
export const ReturnedPaymentNotice = ({ onSettled = noop }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const paymentId = searchParams.get('payment');

  const dismiss = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('payment');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  if (!paymentId) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <PaymentReturnNotice
        paymentId={paymentId}
        onDismiss={dismiss}
        onSettled={onSettled}
        currentPath={pathname}
      />
    </div>
  );
};
