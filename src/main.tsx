// The design is chosen before anything renders: it sets <html data-design> that the styles below depend on
import './shared/config/design';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import faviconUrl from './assets/FAV icon.svg';
import 'antd/dist/reset.css';
import './brand-tokens.css';
import './index.css';
import './shadcn.css';
// The production design: the same sheets as before the redesign, active only under data-design="classic"
import './brand-tokens.classic.css';
import './index.classic.css';
import './pages/AuthPage.classic.css';
import './pages/SurveyViewPage.glass.classic.css';
import './components/billing/billing.classic.css';
import './components/billing/upgrade-flow.classic.css';
import './components/billing/upgrade-modal.classic.css';
import './components/organization/team-quota.classic.css';
import App from './App.tsx';
import { ThemeProvider } from './shared/context/theme.context.tsx';
import { AuthProvider } from './shared/context/auth.provider.tsx';
import { OrganizationProvider } from './shared/context/organization.provider.tsx';
import { IS_SURVEYS_APP } from './shared/config/appMode.ts';

if (IS_SURVEYS_APP) {
  document.title = 'Опросы — СВОД';
}

const faviconLink =
  document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
  document.createElement('link');
faviconLink.rel = 'icon';
faviconLink.type = 'image/svg+xml';
faviconLink.href = faviconUrl;
if (!faviconLink.parentElement) {
  document.head.appendChild(faviconLink);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <App />
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
