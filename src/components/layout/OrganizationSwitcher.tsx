import { Button, Select, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOrganization } from '../../shared/context/organization.context';

const { Text } = Typography;

interface Props {
  onCreateClick: () => void;
}

export const OrganizationSwitcher = ({ onCreateClick }: Props) => {
  const { token } = theme.useToken();
  const { organizations, activeOrganization, isLoading, setActiveOrganizationId } =
    useOrganization();

  if (isLoading || organizations.length === 0) return null;

  return (
    <div style={{ padding: '8px 12px' }}>
      <Text
        style={{
          color: token.colorTextLightSolid,
          opacity: 0.6,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          display: 'block',
          marginBottom: 4,
        }}
      >
        Организация
      </Text>
      <Select
        value={activeOrganization?.id}
        onChange={setActiveOrganizationId}
        style={{ width: '100%' }}
        size="small"
        popupMatchSelectWidth={false}
        options={organizations.map((o) => ({ value: o.id, label: o.name }))}
        dropdownRender={(menu) => (
          <>
            {menu}
            <div
              style={{
                padding: '4px 8px',
                borderTop: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Button
                type="text"
                icon={<PlusOutlined />}
                size="small"
                block
                onClick={onCreateClick}
              >
                Создать
              </Button>
            </div>
          </>
        )}
      />
    </div>
  );
};
