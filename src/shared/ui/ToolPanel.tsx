import { useMemo, useState } from 'react';
import { Input } from 'antd';
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
    icon: 'material-symbols:folder-open-rounded',
    iconColor: 'var(--app-text-secondary)',
    iconBg: 'var(--app-surface-hover)',
  },
  'Основные поля': {
    type: 'basic',
    label: 'Основные поля',
    icon: 'material-symbols:text-fields-rounded',
    iconColor: 'var(--app-link)',
    iconBg: 'var(--app-highlight)',
  },
  'Контактная информация': {
    type: 'contact',
    label: 'Контактная информация',
    icon: 'material-symbols:person-rounded',
    iconColor: 'var(--app-success)',
    iconBg: 'color-mix(in srgb, var(--app-success) 15%, transparent)',
  },
  'Дата и время': {
    type: 'datetime',
    label: 'Дата и время',
    icon: 'material-symbols:calendar-today-rounded',
    iconColor: 'var(--app-warning)',
    iconBg: 'color-mix(in srgb, var(--app-warning) 15%, transparent)',
  },
  'Поля загрузки файлов': {
    type: 'file',
    label: 'Поля загрузки файлов',
    icon: 'material-symbols:upload-file-rounded',
    iconColor: 'var(--app-info)',
    iconBg: 'color-mix(in srgb, var(--app-info) 15%, transparent)',
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
  { key: 'group', label: 'Группа полей', iconName: 'material-symbols:folder-open-rounded', category: 'Структура' },
  { key: 'textBlock', label: 'Текст без вопроса', iconName: 'material-symbols:subject-rounded', category: 'Структура' },
  { key: 'input', label: 'Короткий текст', iconName: 'material-symbols:text-fields-rounded', category: 'Основные поля' },
  { key: 'textarea', label: 'Длинный текст', iconName: 'material-symbols:notes-rounded', category: 'Основные поля' },
  { key: 'select', label: 'Выпадающий список', iconName: 'material-symbols:arrow-drop-down-rounded', category: 'Основные поля' },
  { key: 'checkbox', label: 'Несколько вариантов', iconName: 'material-symbols:library-add-check-rounded', category: 'Основные поля' },
  { key: 'radio', label: 'Один вариант', iconName: 'material-symbols:radio-button-checked-rounded', category: 'Основные поля' },
  { key: 'yesNo', label: 'Да / Нет', iconName: 'material-symbols:toggle-on-rounded', category: 'Основные поля' },
  { key: 'number', label: 'Число', iconName: 'material-symbols:pin-rounded', category: 'Основные поля' },
  { key: 'rating', label: 'Оценка по шкале', iconName: 'material-symbols:star-rate-rounded', category: 'Основные поля' },
  { key: 'fullName', label: 'Полное имя', iconName: 'material-symbols:person-rounded', category: 'Контактная информация' },
  { key: 'phone', label: 'Номер телефона', iconName: 'material-symbols:phone-enabled-rounded', category: 'Контактная информация' },
  { key: 'email', label: 'Электронная почта', iconName: 'material-symbols:mail-rounded', category: 'Контактная информация' },
  { key: 'location', label: 'Страна и город', iconName: 'material-symbols:public-rounded', category: 'Контактная информация' },
  { key: 'address', label: 'Адрес', iconName: 'material-symbols:location-on-rounded', category: 'Контактная информация' },
  { key: 'date', label: 'Дата', iconName: 'material-symbols:calendar-today-rounded', category: 'Дата и время' },
  { key: 'dateTime', label: 'Дата и время', iconName: 'material-symbols:event-rounded', category: 'Дата и время' },
  { key: 'time', label: 'Время', iconName: 'material-symbols:schedule-rounded', category: 'Дата и время' },
  { key: 'fileVector', label: 'Векторные файлы', iconName: 'material-symbols:polyline-rounded', category: 'Поля загрузки файлов' },
  { key: 'fileImage', label: 'Изображения', iconName: 'material-symbols:image-rounded', category: 'Поля загрузки файлов' },
  { key: 'fileDocument', label: 'Документы', iconName: 'material-symbols:docs-rounded', category: 'Поля загрузки файлов' },
];

const CATEGORIES = [...new Set(ALL_FIELDS.map((f) => f.category))];

interface ToolPanelProps {
  isCompact?: boolean;
  onFieldAdd?: (fieldKey: string) => void;
  /** Touch layout: tap a field to add it (no drag), tighter padding */
  tapToAdd?: boolean;
  /** «Текст без вопроса» (greeting, instruction) exists in surveys only */
  allowTextBlock?: boolean;
}

export const ToolPanel = ({
  isCompact = false,
  onFieldAdd,
  tapToAdd = false,
  allowTextBlock = false,
}: ToolPanelProps) => {
  const [search, setSearch] = useState('');

  const groupedByCategory = useMemo(() => {
    const query = search.toLowerCase().trim();
    const result: Record<string, FieldTypeItem[]> = {};

    for (const category of CATEGORIES) {
      const fields = ALL_FIELDS.filter(
        (f) =>
          f.category === category &&
          (allowTextBlock || f.key !== 'textBlock') &&
          f.label.toLowerCase().includes(query),
      );
      if (fields.length > 0) {
        result[category] = fields;
      }
    }

    return result;
  }, [search, allowTextBlock]);

  const hasResults = Object.keys(groupedByCategory).length > 0;

  return (
    <div
      style={{
        display: 'flex',
        padding: tapToAdd ? 16 : 20,
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
        <Input.Search
          placeholder="Поиск поля"
          allowClear
          aria-label="Поиск по полям формы"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                  color: 'var(--app-text-placeholder)',
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
                      onDoubleClickAdd={onFieldAdd}
                      tapToAdd={tapToAdd}
                    />
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <span style={{ color: 'var(--app-text-secondary)' }}>Поля не найдены</span>
          </div>
        )}
      </div>
    </div>
  );
};
