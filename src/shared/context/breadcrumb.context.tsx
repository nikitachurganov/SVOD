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

/** An intermediate crumb between the section and the entity, e.g. the project of a survey */
export type BreadcrumbParent = { title: string; path: string };

type BreadcrumbContextValue = {
  entityTitle: string | null;
  setEntityTitle: (title: string | null) => void;
  entityParent: BreadcrumbParent | null;
  setEntityParent: (parent: BreadcrumbParent | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

type Override = {
  pathname: string;
  title: string | null;
  parent: BreadcrumbParent | null;
};

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [override, setOverride] = useState<Override | null>(null);

  const current = override?.pathname === pathname ? override : null;
  const entityTitle = current?.title ?? null;
  const entityParent = current?.parent ?? null;

  const setEntityTitle = useCallback(
    (title: string | null) => {
      setOverride((prev) => ({
        pathname,
        title,
        parent: prev?.pathname === pathname ? prev.parent : null,
      }));
    },
    [pathname],
  );

  const setEntityParent = useCallback(
    (parent: BreadcrumbParent | null) => {
      setOverride((prev) => ({
        pathname,
        title: prev?.pathname === pathname ? prev.title : null,
        parent,
      }));
    },
    [pathname],
  );

  const value = useMemo(
    () => ({ entityTitle, setEntityTitle, entityParent, setEntityParent }),
    [entityTitle, setEntityTitle, entityParent, setEntityParent],
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
