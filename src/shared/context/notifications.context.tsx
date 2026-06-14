/* eslint-disable react-refresh/only-export-components -- hook is intentionally exported next to provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { notification } from 'antd';

type NotificationKind = 'success' | 'error' | 'info' | 'warning';

export interface NotificationOptions {
  kind?: NotificationKind;
  title: string;
  subtitle?: string;
  caption?: string;
  /** Auto-dismiss timeout (ms). 0 disables auto-dismiss. Default: 6s. */
  timeout?: number;
}

interface NotificationsContextValue {
  notify: (options: NotificationOptions) => void;
  notifySuccess: (title: string, subtitle?: string) => void;
  notifyError: (title: string, subtitle?: string) => void;
  notifyWarning: (title: string, subtitle?: string) => void;
  notifyInfo: (title: string, subtitle?: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const DEFAULT_TIMEOUT = 6;

const kindToType = (kind: NotificationKind): 'success' | 'error' | 'info' | 'warning' => kind;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const notify = useCallback(
    ({ kind = 'info', title, subtitle, caption, timeout = DEFAULT_TIMEOUT }: NotificationOptions) => {
      const description = [subtitle, caption].filter(Boolean).join(' — ') || undefined;
      notification.open({
        type: kindToType(kind),
        message: title,
        description,
        duration: timeout > 0 ? timeout / 1000 : 0,
        placement: 'topRight',
      });
    },
    [],
  );

  const notifySuccess = useCallback(
    (title: string, subtitle?: string) => notify({ kind: 'success', title, subtitle }),
    [notify],
  );
  const notifyError = useCallback(
    (title: string, subtitle?: string) => notify({ kind: 'error', title, subtitle, timeout: 0 }),
    [notify],
  );
  const notifyWarning = useCallback(
    (title: string, subtitle?: string) => notify({ kind: 'warning', title, subtitle }),
    [notify],
  );
  const notifyInfo = useCallback(
    (title: string, subtitle?: string) => notify({ kind: 'info', title, subtitle }),
    [notify],
  );

  const value = useMemo(
    () => ({ notify, notifySuccess, notifyError, notifyWarning, notifyInfo }),
    [notify, notifySuccess, notifyError, notifyWarning, notifyInfo],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
}
