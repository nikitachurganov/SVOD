import { Dropdown } from '@carbon/react';
import { useOrganization } from '../../shared/context/organization.context';

export const OrganizationSwitcher = () => {
  const { organizations, activeOrganization, isLoading, setActiveOrganizationId } =
    useOrganization();

  if (isLoading || organizations.length === 0) return null;

  const items = organizations.map((o) => ({ id: o.id, text: o.name }));
  const selectedItem = items.find((i) => i.id === activeOrganization?.id) ?? null;

  return (
    <>
      <span
        style={{
          color: 'var(--cds-text-secondary)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          display: 'block',
          marginBottom: 4,
        }}
      >
        Организация
      </span>
      <Dropdown
        id="org-switcher"
        size="sm"
        items={items}
        itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
        selectedItem={selectedItem}
        onChange={({ selectedItem: item }) => {
          if (item) setActiveOrganizationId(item.id);
        }}
        titleText="Выберите организацию"
        label="Выберите организацию"
        hideLabel
        autoAlign
      />
    </>
  );
};
