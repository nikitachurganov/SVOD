import { Button, Result } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';

interface PublicFormSuccessScreenProps {
  organizationName: string;
  requestNumber?: string;
  onSubmitAnother: () => void;
}

export const PublicFormSuccessScreen = ({
  organizationName,
  requestNumber,
  onSubmitAnother,
}: PublicFormSuccessScreenProps) => {
  return (
    <div className="public-form-flow public-form-flow--centered public-form-flow--fade-in">
      <Result
        icon={<CheckCircleFilled style={{ color: 'var(--app-success)', fontSize: 64 }} />}
        title="Заявка отправлена!"
        subTitle={
          <>
            <p style={{ marginBottom: 8 }}>
              Ваша заявка принята и будет обработана сотрудниками {organizationName}.
            </p>
            {requestNumber ? (
              <p style={{ margin: 0, color: 'var(--app-text-secondary)' }}>
                Номер заявки: #{requestNumber}
              </p>
            ) : null}
          </>
        }
        extra={
          <Button type="primary" onClick={onSubmitAnother}>
            Подать ещё одну заявку
          </Button>
        }
      />
    </div>
  );
};
