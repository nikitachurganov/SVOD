import type { ReactNode, RefObject } from 'react';
import { Steps } from 'antd';

export interface FormFillWizardLayoutProps {
  contentRef?: RefObject<HTMLDivElement | null>;
  notification?: ReactNode;
  pageIndex?: number;
  pageCount?: number;
  pageTitle?: string;
  showSteps?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}

export const FormFillWizardLayout = ({
  contentRef,
  notification,
  pageIndex,
  pageCount = 1,
  pageTitle,
  showSteps = false,
  children,
  actions,
}: FormFillWizardLayoutProps) => {
  const showProgress =
    pageCount > 1 && pageIndex !== undefined && pageIndex >= 0;

  return (
    <div className="app-form-fill">
      <div className="app-form-fill__body" ref={contentRef}>
        <div className="app-form-fill__inner">
          {notification}
          {showProgress && (
            <div className="app-form-fill__progress">
              <p className="app-form-fill__progress-label">
                Страница {pageIndex! + 1} из {pageCount}
                {pageTitle ? ` — ${pageTitle}` : ''}
              </p>
              {showSteps && (
                <Steps
                  size="small"
                  current={pageIndex}
                  items={Array.from({ length: pageCount }, (_, i) => ({
                    title: `${i + 1}`,
                  }))}
                  className="app-form-fill__steps"
                />
              )}
            </div>
          )}
          {children}
        </div>
      </div>
      {actions ? (
        <div className="app-form-fill__actions">
          <div className="app-form-fill__actions-inner">{actions}</div>
        </div>
      ) : null}
    </div>
  );
};
