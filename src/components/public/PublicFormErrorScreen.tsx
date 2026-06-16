import { Button, Result } from 'antd';
import { CloseCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getPublicLinkErrorView, type PublicLinkErrorCode } from '../../shared/api/public.api';

interface PublicFormErrorScreenProps {
  code?: PublicLinkErrorCode;
  message?: string;
}

export const PublicFormErrorScreen = ({
  code = 'unknown',
  message,
}: PublicFormErrorScreenProps) => {
  const navigate = useNavigate();
  const view = getPublicLinkErrorView(code);

  return (
    <div className="public-form-flow public-form-flow--centered">
      <Result
        icon={<CloseCircleFilled style={{ color: 'var(--app-text-secondary)' }} />}
        title={view.title}
        subTitle={message ?? view.description}
        extra={
          <Button type="default" onClick={() => navigate('/')}>
            Закрыть
          </Button>
        }
      />
    </div>
  );
};
