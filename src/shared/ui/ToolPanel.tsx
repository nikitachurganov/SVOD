import { useMemo, useState } from 'react';
import { Search } from '@carbon/react';
import { DraggableFieldItem } from './form-builder/DraggableFieldItem';

// ─── Color config for tool-panel field groups ─────────────────────────────────

interface FieldGroupMeta {
  type: string;
  label: string;
  icon: string;
  iconColor: string;
  iconBg: string;
}

const FIELD_GROUP_META: Record<string, FieldGroupMeta> = {
  'Структура': {
    type: 'structure',
    label: 'Структура',
    icon: 'material-symbols:folder-open',
    iconColor: 'var(--cds-text-secondary)',
    iconBg: 'var(--cds-layer-hover)',
  },
  'Основные поля': {
    type: 'basic',
    label: 'Основные поля',
    icon: 'material-symbols:text-fields',
    iconColor: 'var(--cds-link-primary)',
    iconBg: 'var(--cds-highlight)',
  },
  'Контактная информация': {
    type: 'contact',
    label: 'Контактная информация',
    icon: 'material-symbols:person',
    iconColor: 'var(--cds-support-success)',
    iconBg: 'color-mix(in srgb, var(--cds-support-success) 15%, transparent)',
  },
  'Дата и время': {
    type: 'datetime',
    label: 'Дата и время',
    icon: 'material-symbols:calendar-today',
    iconColor: 'var(--cds-support-warning)',
    iconBg: 'color-mix(in srgb, var(--cds-support-warning) 15%, transparent)',
  },
  'Поля загрузки файлов': {
    type: 'file',
    label: 'Поля загрузки файлов',
    icon: 'material-symbols:upload-file',
    iconColor: 'var(--cds-support-info)',
    iconBg: 'color-mix(in srgb, var(--cds-support-info) 15%, transparent)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────

interface FieldTypeItem {
  key: string;
  label: string;
  iconName: string;
  category: string;
}

const ALL_FIELDS: FieldTypeItem[] = [
  { key: 'group', label: 'Группа полей', iconName: 'material-symbols:folder-open', category: 'Структура' },
  { key: 'input', label: 'Короткий текст', iconName: 'material-symbols:text-fields', category: 'Основные поля' },
  { key: 'textarea', label: 'Длинный текст', iconName: 'material-symbols:notes', category: 'Основные поля' },
  { key: 'select', label: 'Выпадающий список', iconName: 'material-symbols-light:arrow-drop-down-rounded', category: 'Основные поля' },
  { key: 'checkbox', label: 'Несколько вариантов', iconName: 'material-symbols-light:library-add-check-rounded', category: 'Основные поля' },
  { key: 'radio', label: 'Один вариант', iconName: 'material-symbols:radio-button-checked', category: 'Основные поля' },
  { key: 'yesNo', label: 'Да / Нет', iconName: 'material-symbols:toggle-on', category: 'Основные поля' },
  { key: 'number', label: 'Число', iconName: 'material-symbols:pin', category: 'Основные поля' },
  { key: 'fullName', label: 'Полное имя', iconName: 'material-symbols:person', category: 'Контактная информация' },
  { key: 'phone', label: 'Номер телефона', iconName: 'material-symbols-light:phone-enabled', category: 'Контактная информация' },
  { key: 'email', label: 'Электронная почта', iconName: 'material-symbols-light:mail-rounded', category: 'Контактная информация' },
  { key: 'date', label: 'Дата', iconName: 'material-symbols:calendar-today', category: 'Дата и время' },
  { key: 'dateTime', label: 'Дата и время', iconName: 'material-symbols:event', category: 'Дата и время' },
  { key: 'time', label: 'Время', iconName: 'material-symbols:schedule', category: 'Дата и время' },
  { key: 'fileVector', label: 'Векторные файлы', iconName: 'material-symbols-light:polyline-rounded', category: 'Поля загрузки файлов' },
  { key: 'fileImage', label: 'Изображения', iconName: 'material-symbols-light:image-rounded', category: 'Поля загрузки файлов' },
  { key: 'fileDocument', label: 'Документы', iconName: 'material-symbols-light:docs-rounded', category: 'Поля загрузки файлов' },
  { key: 'address', label: 'Адрес', iconName: 'material-symbols:location-on', category: 'Контактная информация' },
];

const CATEGORIES = [...new Set(ALL_FIELDS.map((f) => f.category))];

interface ToolPanelProps {
  isCompact?: boolean;
}

export const ToolPanel = ({ isCompact = false }: ToolPanelProps) => {
  const [search, setSearch] = useState('');

  const groupedByCategory = useMemo(() => {
    const query = search.toLowerCase().trim();
    const result: Record<string, FieldTypeItem[]> = {};

    for (const category of CATEGORIES) {
      const fields = ALL_FIELDS.filter(
        (f) => f.category === category && f.label.toLowerCase().includes(query),
      );
      if (fields.length > 0) {
        result[category] = fields;
      }
    }

    return result;
  }, [search]);

  const hasResults = Object.keys(groupedByCategory).length > 0;

  return (
    <div
      style={{
        display: 'flex',
        padding: 20,
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 16,
        alignSelf: 'stretch',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignSelf: 'stretch',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Поля формы</span>
        <Search
          size="md"
          placeholder="Поиск поля"
          labelText="Поиск по полям формы"
          closeButtonLabelText="Очистить"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          alignSelf: 'stretch',
        }}
      >
        {hasResults ? (
          Object.entries(groupedByCategory).map(([category, fields]) => (
            <div key={category}>
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                  color: 'var(--cds-text-placeholder)',
                }}
              >
                {category}
              </span>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCompact
                    ? '1fr'
                    : 'repeat(2, minmax(0, 1fr))',
                  rowGap: 4,
                  columnGap: 8,
                }}
              >
                {fields.map((item) => {
                  const meta = FIELD_GROUP_META[item.category];
                  return (
                    <DraggableFieldItem
                      key={item.key}
                      fieldKey={item.key}
                      label={item.label}
                      iconName={item.iconName}
                      iconColor={meta?.iconColor}
                      iconBackground={meta?.iconBg}
                    />
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <span style={{ color: 'var(--cds-text-secondary)' }}>Поля не найдены</span>
          </div>
        )}
      </div>
    </div>
  );
};
