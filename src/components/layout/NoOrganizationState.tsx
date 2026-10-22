import { useCallback, useEffect, useState } from 'react';
import { Button, Result, Spin, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getMyJoinRequests, withdrawJoinRequest } from '../../shared/api/organizations.api';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import type { JoinRequestResponse } from '../../types/organization';

const POLL_MS = 30_000;

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Shown when the user belongs to no organization. If they applied by a join link, show the
 * request status (and switch into the organization as soon as the owner approves).
 */
export const NoOrganizationState = ({ onCreateClick }: { onCreateClick: () => void }) => {
  const { refreshOrganizations } = useOrganization();
  const [requests, setRequests] = useState<JoinRequestResponse[] | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getMyJoinRequests();
      setRequests(rows);
      if (rows.some((r) => r.status === 'approved')) {
        // Approved meanwhile: the organization list now has it
        await refreshOrganizations();
      }
    } catch {
      setRequests([]);
    }
  }, [refreshOrganizations]);

  const pending = requests?.find((r) => r.status === 'pending') ?? null;
  const rejected = !pending ? requests?.find((r) => r.status === 'rejected') ?? null : null;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [pending, load]);

  const createButton = (
    <Button icon={<PlusOutlined />} onClick={onCreateClick}>
      Создать свою организацию
    </Button>
  );

  if (requests === null) {
    return (
      <div className="app-no-org-state">
        <Spin />
      </div>
    );
  }

  if (pending) {
    return (
      <div className="app-no-org-state">
        <Result
          status="info"
          title={`Заявка в «${pending.organization_name}» на рассмотрении`}
          subTitle={`Отправлена ${formatDate(pending.created_at)}. Как только владелец одобрит её, организация откроется здесь автоматически.`}
          extra={[
            <Button
              key="withdraw"
              danger
              loading={withdrawing}
              onClick={async () => {
                setWithdrawing(true);
                try {
                  await withdrawJoinRequest(pending.id);
                  message.success('Заявка отозвана');
                  await load();
                } catch {
                  message.error('Не удалось отозвать заявку');
                } finally {
                  setWithdrawing(false);
                }
              }}
            >
              Отозвать заявку
            </Button>,
            <span key="create">{createButton}</span>,
          ]}
        />
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="app-no-org-state">
        <Result
          status="warning"
          title={`Заявку в «${rejected.organization_name}» отклонили`}
          subTitle={
            <>
              {rejected.reject_reason ? <>Причина: {rejected.reject_reason}. </> : null}
              Подать заявку снова можно по той же ссылке-приглашению.
            </>
          }
          extra={createButton}
        />
      </div>
    );
  }

  return (
    <div className="app-no-org-state">
      <p>Для начала работы необходимо создать организацию или вступить в существующую по ссылке-приглашению</p>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick}>
        Создать организацию
      </Button>
    </div>
  );
};
