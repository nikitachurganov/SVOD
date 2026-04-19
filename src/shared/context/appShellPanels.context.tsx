/* eslint-disable react-refresh/only-export-components -- hooks are intentionally exported next to their provider */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

type AppShellPanelsContextValue = {
  closeAuxiliaryPanels: () => void;
  registerAuxiliaryPanelCloser: (fn: () => void) => () => void;
};

const AppShellPanelsContext = createContext<AppShellPanelsContextValue | null>(null);

export function AppShellPanelsProvider({ children }: { children: ReactNode }) {
  const closersRef = useRef(new Set<() => void>());

  const registerAuxiliaryPanelCloser = useCallback((fn: () => void) => {
    closersRef.current.add(fn);
    return () => {
      closersRef.current.delete(fn);
    };
  }, []);

  const closeAuxiliaryPanels = useCallback(() => {
    closersRef.current.forEach((fn) => {
      fn();
    });
  }, []);

  const value = useMemo(
    () => ({ closeAuxiliaryPanels, registerAuxiliaryPanelCloser }),
    [closeAuxiliaryPanels, registerAuxiliaryPanelCloser],
  );

  return (
    <AppShellPanelsContext.Provider value={value}>{children}</AppShellPanelsContext.Provider>
  );
}

export function useAppShellPanels(): AppShellPanelsContextValue {
  const ctx = useContext(AppShellPanelsContext);
  if (!ctx) {
    throw new Error('useAppShellPanels must be used within AppShellPanelsProvider');
  }
  return ctx;
}

/**
 * Registers a callback invoked when the user opens the header profile menu,
 * so page-level side panels can close first. Uses a ref so the callback identity can change without churn.
 */
export function useRegisterAuxiliaryPanelCloser(closeFn: () => void, enabled = true) {
  const { registerAuxiliaryPanelCloser } = useAppShellPanels();
  const closeRef = useRef(closeFn);

  useEffect(() => {
    closeRef.current = closeFn;
  }, [closeFn]);

  useEffect(() => {
    if (!enabled) return;
    const stable = () => closeRef.current();
    return registerAuxiliaryPanelCloser(stable);
  }, [enabled, registerAuxiliaryPanelCloser]);
}
