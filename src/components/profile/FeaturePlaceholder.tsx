import type { ReactNode } from 'react';
import { Tag } from 'antd';

interface FeaturePlaceholderProps {
  icon: ReactNode;
  title: string;
  description: string;
  /** Disabled control that shows what the feature will look like (switch, button) */
  children?: ReactNode;
}

/** A row of a feature that is not available yet: described, switched off and marked «Скоро» */
export const FeaturePlaceholder = ({ icon, title, description, children }: FeaturePlaceholderProps) => (
  <div className="profile-page__feature">
    <span className="profile-page__feature-icon" aria-hidden="true">
      {icon}
    </span>
    <div className="profile-page__feature-text">
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
    <div className="profile-page__feature-control">
      {children}
      <Tag className="profile-page__soon-tag">Скоро</Tag>
    </div>
  </div>
);
