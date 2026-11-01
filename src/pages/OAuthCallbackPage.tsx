import { useEffect, useRef } from 'react';
import { Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { finishOAuthSignIn } from '../shared/api/auth.api';
import { useAuth } from '../shared/hooks/auth.hooks';
import { HOME_PATH } from '../shared/config/appMode';

/**
 * Where the server sends the person after Yandex ID: the token comes in the URL fragment
 * (`#access_token=...`), so it never reaches a server or a log. It is taken out of the address bar
 * at once, kept like the token of a password sign-in, and the person goes on to the page they wanted.
 */
export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    // The effect runs twice in development; the fragment can be used only once
    if (handled.current) return;
    handled.current = true;

    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('access_token');
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) {
      navigate('/auth', { replace: true });
      return;
    }

    const next = finishOAuthSignIn(token);
    void refreshProfile().then(() => navigate(next || HOME_PATH, { replace: true }));
  }, [navigate, refreshProfile]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  );
};
