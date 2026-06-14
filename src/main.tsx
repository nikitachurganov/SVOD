import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import faviconUrl from './assets/FAV icon.svg';
import 'antd/dist/reset.css';
import './brand-tokens.css';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './shared/context/theme.context.tsx';
import { AuthProvider } from './shared/context/auth.provider.tsx';
import { OrganizationProvider } from './shared/context/organization.provider.tsx';

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
