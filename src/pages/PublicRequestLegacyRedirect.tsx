import { Navigate, useParams } from 'react-router-dom';

/** Old entry URL `/public/request/:token` → `/form/:token`. */
export const PublicRequestLegacyRedirect = () => {
  const { token } = useParams<{ token: string }>();
  if (!token) return <Navigate to="/" replace />;
  return <Navigate to={`/form/${token}`} replace />;
};
