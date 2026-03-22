import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp } from 'antd';
import 'antd/dist/reset.css';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './shared/context/theme.context.tsx';
import { AuthProvider } from './shared/context/auth.context.tsx';
import { OrganizationProvider } from './shared/context/organization.context.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <AntApp>
            <App />
          </AntApp>
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
