import { useEffect, useRef, useState } from 'react';
import { Button, Result, Spin } from 'antd';
import axios from 'axios';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { createSurveyFromDemo } from '../shared/api/surveys.api';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { HOME_PATH } from '../shared/config/appMode';

const LANDING_URL = 'https://svodservice.ru';

const FullPageSpin = () => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
    <Spin size="large" />
  </div>
);

/** Where the protected page takes the draft; the sign-up keeps it as the page to come back to */
const demoSurveyPath = (token: string) => `/surveys/from-demo/${encodeURIComponent(token)}`;

/**
 * /demo/:token — the button «continue in the service» on svodservice.ru leads here.
 * A guest is asked to create an account (or sign in) first; the draft waits on the server.
 */
export const DemoDraftEntryPage = () => {
  const { token = '' } = useParams();
  const { user, isAuthLoading } = useAuth();

  if (isAuthLoading) return <FullPageSpin />;
  if (user) return <Navigate to={demoSurveyPath(token)} replace />;
  return (
    <Navigate
      to="/auth"
      replace
      state={{
        from: demoSurveyPath(token),
        mode: 'signUp',
        notice: 'Создайте аккаунт или войдите — опрос с лендинга сразу появится в нём.',
      }}
    />
  );
};

/** /surveys/from-demo/:token — the draft becomes a survey of this account and opens */
export const SurveyFromDemoPage = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!activeOrganization || started.current) return;
    started.current = true;
    createSurveyFromDemo(activeOrganization.id, token)
      .then((survey) => navigate(`/surveys/${survey.id}`, { replace: true }))
      .catch((err: unknown) => {
        const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null;
        setError(typeof detail === 'string' ? detail : 'Не удалось перенести опрос. Попробуйте ещё раз.');
      });
  }, [activeOrganization, navigate, token]);

  if (error) {
    return (
      <Result
        status="warning"
        title="Опрос не перенесён"
        subTitle={error}
        extra={[
          <Button key="new" type="primary" onClick={() => navigate('/surveys/create')}>
            Создать опрос
          </Button>,
          <Button key="landing" href={LANDING_URL}>
            Вернуться на сайт
          </Button>,
          <Button key="home" type="link" onClick={() => navigate(HOME_PATH)}>
            К опросам
          </Button>,
        ]}
      />
    );
  }

  return <FullPageSpin />;
};
