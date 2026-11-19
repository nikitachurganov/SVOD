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
import { ConfigProvider, theme as antTheme, type ThemeConfig } from 'antd';
import { IS_CLASSIC } from '../config/design';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const STORAGE_KEY = 'app-theme-mode';

/** Mirrors the --app-* tokens in src/brand-tokens.css (antd cannot read CSS variables for its algorithm) */
const LIGHT_PALETTE = {
  primary: '#c2410c',
  onPrimary: '#ffffff',
  primaryContainer: '#ffdbcc',
  onPrimaryContainer: '#7a2605',
  link: '#fd6a12',
  linkHover: '#e85a08',
  info: '#0b57d0',
  success: '#146c2e',
  warning: '#b45309',
  error: '#b3261e',
  text: '#1f1f1f',
  textSecondary: '#444746',
  textHelper: '#5f6368',
  canvas: '#f8f9fa',
  surface: '#ffffff',
  elevated: '#ffffff',
  pill: '#f1f3f4',
  hover: '#f1f3f4',
  border: '#dadce0',
  outline: '#80868b',
  split: '#e8eaed',
};

const DARK_PALETTE: typeof LIGHT_PALETTE = {
  primary: '#ffb595',
  onPrimary: '#561f00',
  primaryContainer: '#4a2412',
  onPrimaryContainer: '#ffdbcc',
  link: '#ff8a3d',
  linkHover: '#ffa66b',
  info: '#a8c7fa',
  success: '#6dd58c',
  warning: '#ffb951',
  error: '#f2b8b5',
  text: '#e3e3e3',
  textSecondary: '#c4c7c5',
  textHelper: '#a8abaa',
  canvas: '#131314',
  surface: '#1e1f20',
  elevated: '#282a2c',
  pill: '#282a2c',
  hover: '#333537',
  border: '#444746',
  outline: '#8e918f',
  split: '#393b3d',
};

const FONT_TEXT = "'Google Sans Text', 'Google Sans', Roboto, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
const ELEVATION_2 = '0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15)';

/** The antd theme of the production design (before the redesign): its colours, antd's own shapes */
const classicThemeConfig = (isDark: boolean): ThemeConfig => ({
  algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: isDark
    ? {
        colorPrimary: '#ff8a4c',
        colorText: '#f5f7fa',
        colorTextSecondary: '#c7cdd6',
        colorBgBase: '#121417',
        colorBgLayout: '#121417',
        colorBgContainer: '#1b1e23',
        colorBorder: '#505762',
        colorSplit: '#3e444d',
      }
    : {
        colorPrimary: '#c2410c',
        colorText: '#171a1f',
        colorTextSecondary: '#4b5563',
        colorBgBase: '#ffffff',
        colorBgLayout: '#f6f7f9',
        colorBgContainer: '#ffffff',
        colorBorder: '#cbd1d8',
        colorSplit: '#e2e5e9',
      },
  cssVar: { prefix: 'ant' },
});

const getInitialTheme = (): ThemePreference => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'system';
};

interface ThemeContextValue {
  themeMode: ThemeMode;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
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
  const [themePreference, setPreference] = useState<ThemePreference>(getInitialTheme);
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const themeMode: ThemeMode = themePreference === 'system' ? systemTheme : themePreference;

  const setThemePreference = useCallback((preference: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, preference);
    setPreference(preference);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemePreference(themeMode === 'light' ? 'dark' : 'light');
  }, [setThemePreference, themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeMode, themePreference, setThemePreference, toggleTheme }),
    [themeMode, themePreference, setThemePreference, toggleTheme],
  );

  const isDark = themeMode === 'dark';
  // Gemini / Material 3 surfaces with the СВОД orange as the accent (docs/DESIGN_GEMINI_STYLE.md)
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  const newThemeConfig: ThemeConfig = {
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.primary,
      colorLink: palette.link,
      colorLinkHover: palette.linkHover,
      colorLinkActive: palette.linkHover,
      colorInfo: palette.info,
      colorSuccess: palette.success,
      colorWarning: palette.warning,
      colorError: palette.error,
      colorText: palette.text,
      colorTextSecondary: palette.textSecondary,
      colorTextTertiary: palette.textHelper,
      colorTextDescription: palette.textHelper,
      colorBgBase: palette.surface,
      colorBgLayout: palette.canvas,
      colorBgContainer: palette.surface,
      colorBgElevated: palette.elevated,
      colorBorder: palette.border,
      colorBorderSecondary: palette.split,
      colorSplit: palette.split,
      fontFamily: FONT_TEXT,
      fontSize: 14,
      borderRadius: 12,
      borderRadiusLG: 16,
      borderRadiusSM: 8,
      borderRadiusXS: 4,
      controlHeight: 40,
      controlHeightSM: 32,
      controlHeightLG: 48,
      boxShadow: ELEVATION_2,
      boxShadowSecondary: ELEVATION_2,
      wireframe: false,
    },
    components: {
      Button: {
        borderRadius: 999,
        borderRadiusSM: 999,
        borderRadiusLG: 999,
        paddingInline: 24,
        paddingInlineSM: 16,
        paddingInlineLG: 24,
        fontWeight: 500,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        primaryColor: palette.onPrimary,
        defaultBorderColor: palette.outline,
        defaultBg: 'transparent',
      },
      Input: { activeShadow: 'none', paddingInline: 16 },
      InputNumber: { activeShadow: 'none' },
      Select: { optionSelectedBg: palette.primaryContainer, optionSelectedColor: palette.onPrimaryContainer },
      Modal: {
        borderRadiusLG: 28,
        contentBg: palette.elevated,
        headerBg: palette.elevated,
        footerBg: palette.elevated,
        titleFontSize: 22,
        titleLineHeight: 1.28,
      },
      Dropdown: { borderRadiusLG: 16, paddingBlock: 8, controlItemBgHover: palette.hover },
      Menu: {
        itemBorderRadius: 999,
        itemHeight: 40,
        itemSelectedBg: palette.primaryContainer,
        itemSelectedColor: palette.onPrimaryContainer,
        itemHoverBg: palette.hover,
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        activeBarBorderWidth: 0,
      },
      Table: {
        headerBg: 'transparent',
        headerColor: palette.textSecondary,
        headerSplitColor: 'transparent',
        rowHoverBg: palette.hover,
        rowSelectedBg: palette.primaryContainer,
        rowSelectedHoverBg: palette.primaryContainer,
        borderColor: palette.split,
        cellPaddingBlock: 14,
      },
      Tabs: { inkBarColor: palette.primary, itemSelectedColor: palette.primary },
      Segmented: {
        borderRadius: 999,
        borderRadiusSM: 999,
        borderRadiusLG: 999,
        trackBg: palette.pill,
        itemSelectedBg: palette.surface,
        trackPadding: 4,
      },
      Tag: { borderRadiusSM: 8, defaultBg: palette.pill },
      // M3 checkbox: a square with 2px corners, not the 8px of the small controls
      Checkbox: { borderRadiusSM: 4 },
      Card: { borderRadiusLG: 16 },
      Popover: { borderRadiusLG: 16 },
      Tooltip: { borderRadius: 8 },
      Notification: { borderRadiusLG: 16 },
      Alert: { borderRadiusLG: 16 },
      Progress: { remainingColor: palette.pill },
    },
    cssVar: { prefix: 'ant' },
  };
  const themeConfig = IS_CLASSIC ? classicThemeConfig(isDark) : newThemeConfig;

  // Static notification/message/Modal calls render outside this tree;
  // holderRender wraps them so toasts follow the current theme too.
  useEffect(() => {
    ConfigProvider.config({
      holderRender: (node) => <ConfigProvider theme={themeConfig}>{node}</ConfigProvider>,
    });
    // themeConfig is derived from themeMode only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
