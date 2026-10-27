import { useCallback, useEffect, useState } from 'react';
import { Badge } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { AdminRequestsTab } from '../components/admin/AdminRequestsTab';
import { AdminStatsTab } from '../components/admin/AdminStatsTab';
import { AdminUserDrawer } from '../components/admin/AdminUserDrawer';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { listPlanRequests } from '../shared/api/admin.api';
import './AdminPage.css';

type AdminTabKey = 'users' | 'requests' | 'stats';

const TAB_LABELS: Record<AdminTabKey, string> = {
  users: 'Пользователи',
  requests: 'Заявки на тариф',
  stats: 'Сводка',
};

const TAB_KEYS = Object.keys(TAB_LABELS) as AdminTabKey[];

const isTab = (value: string | null): value is AdminTabKey =>
  value !== null && (TAB_KEYS as string[]).includes(value);

export const AdminPage = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const activeTab: AdminTabKey = isTab(requested) ? requested : 'users';

  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  // Bumped when something is saved, so every list behind it loads again
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listPlanRequests({ status: 'pending', page: 1, page_size: 1 })
      .then((page) => {
        if (!cancelled) setPending(page.total);
      })
      .catch(() => {
        // The badge is a convenience: the tab itself explains a failure
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const changed = useCallback(() => setRefreshKey((key) => key + 1), []);

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Администрирование</h1>
        </div>
        <div className="registry-page__tabs" role="tablist" aria-label="Разделы администрирования">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`registry-page__tab${activeTab === key ? ' registry-page__tab--active' : ''}`}
              onClick={() => setParams(key === 'users' ? {} : { tab: key }, { replace: true })}
            >
              {key === 'requests' && pending > 0 ? (
                <Badge count={pending} size="small" offset={[8, -2]}>
                  <span style={{ color: 'inherit' }}>{TAB_LABELS[key]}</span>
                </Badge>
              ) : (
                TAB_LABELS[key]
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="registry-page__content">
        {activeTab === 'users' ? (
          <AdminUsersTab onOpenUser={setOpenUserId} refreshKey={refreshKey} />
        ) : activeTab === 'requests' ? (
          <AdminRequestsTab onOpenUser={setOpenUserId} onDecided={changed} refreshKey={refreshKey} />
        ) : (
          <AdminStatsTab refreshKey={refreshKey} />
        )}
      </div>

      <AdminUserDrawer userId={openUserId} onClose={() => setOpenUserId(null)} onChanged={changed} />
    </div>
  );
};
