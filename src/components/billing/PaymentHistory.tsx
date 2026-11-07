import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { listPayments } from '../../shared/api/billing.api';
import type { PaymentInfo } from '../../types/billing';
import { formatDay, formatPrice } from './billingFormat';
import { describePayment, describeRefund } from './billingText';
import './billing.css';

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ждёт оплаты', color: 'gold' },
  succeeded: { label: 'Оплачен', color: 'success' },
  canceled: { label: 'Не оплачен', color: 'default' },
  mismatch: { label: 'На проверке', color: 'error' },
};

const columns: ColumnsType<PaymentInfo> = [
  {
    title: 'Дата',
    key: 'date',
    render: (_, row) => formatDay(row.paid_at ?? row.created_at),
  },
  {
    title: 'За что',
    key: 'term',
    render: (_, row) => {
      const { title, detail } = describePayment(row);
      return (
        <>
          <div>{title}</div>
          {detail ? <div className="billing-note billing-note--tight">{detail}</div> : null}
        </>
      );
    },
  },
  {
    title: 'Сумма',
    dataIndex: 'amount_kopecks',
    key: 'amount',
    render: (value: number) => formatPrice(value),
  },
  {
    title: 'Статус',
    key: 'status',
    render: (_, row) => {
      const state = STATUS[row.status] ?? { label: row.status, color: 'default' };
      const refund = describeRefund(row);
      return (
        <>
          <Tag color={state.color}>{state.label}</Tag>
          {row.is_test ? <Tag>Тест</Tag> : null}
          {refund ? (
            <div className="billing-note billing-note--tight" style={{ minWidth: 200, maxWidth: 260 }}>
              {refund}
            </div>
          ) : null}
        </>
      );
    },
  },
];

/** The person's payments; nothing is drawn while there are none */
export const PaymentHistory = ({ reloadKey }: { reloadKey: number }) => {
  const [payments, setPayments] = useState<PaymentInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    listPayments()
      .then((next) => {
        if (!cancelled) setPayments(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (payments.length === 0) return null;

  return (
    <>
      <h3 className="profile-page__section-title" style={{ marginTop: 24 }}>
        Платежи
      </h3>
      <Table<PaymentInfo>
        rowKey="id"
        columns={columns}
        dataSource={payments}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </>
  );
};
