export type FormFieldType =
  | 'shortText'
  | 'longText'
  | 'radio'
  | 'checkbox'
  | 'dropdown'
  | 'yesNo'
  | 'number'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'dateTime'
  | 'date'
  | 'time'
  | 'group'
  | 'file_vector'
  | 'file_image'
  | 'file_document'
  | 'address'
  | 'address_country_city'
  | 'location'
  | 'rating';

export interface FieldOption {
  id: string;
  label: string;
  /** When true, respondent can enter a custom text value */
  isOther?: boolean;
}

export interface FormFieldInstance {
  id: string;
  type: FormFieldType;
  label: string;
  description: string;
  required: boolean;
  options?: FieldOption[];    // radio / checkbox / dropdown only
  children?: FormFieldInstance[]; // group only
  /** Type-specific settings persisted in form schema */
  config?: Record<string, unknown>;
  /** Optional runtime value; not persisted in schema */
  value?: string;
}

export interface FormPageInstance {
  id: string;
  title: string;
  fields: FormFieldInstance[];
}

/** Drag data emitted by tool-panel items */
export interface PanelDragData {
  source: 'panel';
  fieldKey: string;
  label: string;
}

/** Drag data emitted by canvas field cards */
export interface CanvasDragData {
  source: 'canvas';
}

export type DragData = PanelDragData | CanvasDragData;

/** Maps tool-panel field keys to their FormFieldType */
export const PANEL_KEY_TO_FIELD_TYPE: Readonly<Partial<Record<string, FormFieldType>>> = {
  input: 'shortText',
  textarea: 'longText',
  radio: 'radio',
  checkbox: 'checkbox',
  select: 'dropdown',
  yesNo: 'yesNo',
  number: 'number',
  fullName: 'fullName',
  phone: 'phone',
  email: 'email',
  dateTime: 'dateTime',
  date: 'date',
  time: 'time',
  group: 'group',
  fileVector: 'file_vector',
  fileImage: 'file_image',
  fileDocument: 'file_document',
  address: 'address',
  countryCity: 'address_country_city',
  location: 'location',
  rating: 'rating',
} as const;

/** Human-readable labels for each field type */
export const FIELD_TYPE_LABELS: Readonly<Record<FormFieldType, string>> = {
  shortText: 'Короткий текст',
  longText: 'Длинный текст',
  radio: 'Один вариант',
  checkbox: 'Несколько вариантов',
  dropdown: 'Выпадающий список',
  yesNo: 'Да / Нет',
  number: 'Число',
  fullName: 'Полное имя',
  phone: 'Номер телефона',
  email: 'Электронная почта',
  dateTime: 'Дата и время',
  date: 'Дата',
  time: 'Время',
  group: 'Группа полей',
  file_vector: 'Загрузка векторных файлов',
  file_image: 'Загрузка изображений',
  file_document: 'Загрузка документов',
  address: 'Адрес',
  address_country_city: 'Страна и город',
  location: 'Города и страны',
  rating: 'Оценка по шкале',
} as const;

/** Field types that carry an options array */
export const FIELD_TYPES_WITH_OPTIONS: ReadonlySet<FormFieldType> = new Set([
  'radio',
  'checkbox',
  'dropdown',
]);

/** Prefix for the droppable ID of each group's inner drop zone */
export const GROUP_CANVAS_PREFIX = 'group-canvas-' as const;

/** Returns true when an over-ID belongs to a group's inner drop zone */
export const isGroupCanvas = (id: string): boolean =>
  id.startsWith(GROUP_CANVAS_PREFIX);

/** Extracts the group field ID from a group canvas droppable ID */
export const groupIdFromCanvas = (id: string): string =>
  id.slice(GROUP_CANVAS_PREFIX.length);
