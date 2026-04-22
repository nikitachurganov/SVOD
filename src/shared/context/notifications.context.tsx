/* eslint-disable react-refresh/only-export-components -- hook is intentionally exported next to provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToastNotification } from '@carbon/react';

type NotificationKind = 'success' | 'error' | 'info' | 'warning';

export interface NotificationOptions {
  kind?: NotificationKind;
  title: string;
  subtitle?: string;
  caption?: string;
  /** Auto-dismiss timeout (ms). 0 disables auto-dismiss. Default per Carbon DS: 6s. */
  timeout?: number;
}

interface ToastItem extends Required<Pick<NotificationOptions, 'title'>> {
  id: string;
  kind: NotificationKind;
  subtitle?: string;
  caption?: string;
  timeout: number;
}

interface NotificationsContextValue {
  notify: (options: NotificationOptions) => void;
  notifySuccess: (title: string, subtitle?: string) => void;
  notifyError: (title: string, subtitle?: string) => void;
  notifyWarning: (title: string, subtitle?: string) => void;
  notifyInfo: (title: string, subtitle?: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const DEFAULT_TIMEOUT = 6000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    ({ kind = 'info', title, subtitle, caption, timeout = DEFAULT_TIMEOUT }: NotificationOptions) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random()}`;
      const toast: ToastItem = { id, kind, title, subtitle, caption, timeout };
      setToasts((prev) => [...prev, toast]);

      if (timeout > 0) {
        const timer = window.setTimeout(() => remove(id), timeout);
        timersRef.current.set(id, timer);
      }
    },
    [remove],
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
      <div className="app-toast-stack" role="region" aria-label="Уведомления">
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            kind={toast.kind}
            title={toast.title}
            subtitle={toast.subtitle}
            caption={toast.caption}
            lowContrast
            onClose={() => {
              remove(toast.id);
              return true;
            }}
          />
        ))}
      </div>
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
