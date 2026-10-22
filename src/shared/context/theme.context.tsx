/* eslint-disable react-refresh/only-export-components -- hook is intentionally exported next to provider */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'app-theme-mode';
const BRAND_PRIMARY = '#c2410c';
const DARK_PRIMARY = '#ff8a4c';

const getInitialTheme = (): ThemeMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

interface ThemeContextValue {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useThemeMode = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside <ThemeProvider>');
  return ctx;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeMode, toggleTheme }),
    [themeMode, toggleTheme],
  );

  const themeToken = themeMode === 'dark'
    ? {
        colorPrimary: DARK_PRIMARY,
        colorText: '#f5f7fa',
        colorTextSecondary: '#c7cdd6',
        colorBgBase: '#121417',
        colorBgLayout: '#121417',
        colorBgContainer: '#1b1e23',
        colorBorder: '#505762',
        colorSplit: '#3e444d',
      }
    : {
        colorPrimary: BRAND_PRIMARY,
        colorText: '#171a1f',
        colorTextSecondary: '#4b5563',
        colorBgBase: '#ffffff',
        colorBgLayout: '#f6f7f9',
        colorBgContainer: '#ffffff',
        colorBorder: '#cbd1d8',
        colorSplit: '#e2e5e9',
      };

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm:
            themeMode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          token: themeToken,
          cssVar: { prefix: 'ant' },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
