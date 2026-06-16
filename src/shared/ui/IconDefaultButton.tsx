import { Button } from 'antd';
import type { ButtonProps } from 'antd';

export type IconDefaultButtonProps = Omit<ButtonProps, 'variant' | 'color' | 'type'>;

/** Icon-only action button: outlined, default color (Ant Design «Icon / Default»). */
export const IconDefaultButton = ({
  size = 'small',
  ...rest
}: IconDefaultButtonProps) => (
  <Button variant="outlined" color="default" size={size} {...rest} />
);
