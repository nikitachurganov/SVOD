import { useEffect, useState } from 'react';
import { Button, Result, Spin } from 'antd';

const SHOW_ERROR_AFTER_MS = 3000;

/**
 * Standalone surveys service: shown while the personal workspace is not loaded yet.
 * A spinner first (the workspace is usually there within a moment), then an explanation and a retry.
 */
export const WorkspaceUnavailableState = ({ onRetry }: { onRetry: () => void }) => {
  const [failed, setFailed] = useState(false);

  // Armed again after every retry
  useEffect(() => {
    if (failed) return;
    const id = window.setTimeout(() => setFailed(true), SHOW_ERROR_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [failed]);

  if (!failed) {
    return (
      <div className="app-no-org-state">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="app-no-org-state">
      <Result
        status="warning"
        title="Не удалось открыть ваше пространство"
        subTitle="Проверьте подключение к интернету и повторите попытку."
        extra={
          <Button
            type="primary"
            onClick={() => {
              setFailed(false);
              onRetry();
            }}
          >
            Повторить
          </Button>
        }
      />
    </div>
  );
};
