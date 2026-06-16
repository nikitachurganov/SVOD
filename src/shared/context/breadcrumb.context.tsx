/* eslint-disable react-refresh/only-export-components -- hooks are intentionally exported next to their provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

type BreadcrumbContextValue = {
  entityTitle: string | null;
  setEntityTitle: (title: string | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [override, setOverride] = useState<{
    pathname: string;
    title: string | null;
  } | null>(null);

  const entityTitle =
    override?.pathname === pathname ? override.title : null;

  const setEntityTitle = useCallback(
    (title: string | null) => {
      setOverride({ pathname, title });
    },
    [pathname],
  );

  const value = useMemo(
    () => ({ entityTitle, setEntityTitle }),
    [entityTitle, setEntityTitle],
  );

  return (
    <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbEntity(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error('useBreadcrumbEntity must be used within BreadcrumbProvider');
  }
  return ctx;
}
