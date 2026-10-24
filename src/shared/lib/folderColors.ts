/** Folder palette: keys are stored on the project, the shades per theme live in index.css */
export const FOLDER_COLORS = [
  { key: 'orange', label: 'Оранжевый' },
  { key: 'violet', label: 'Фиолетовый' },
  { key: 'blue', label: 'Синий' },
  { key: 'green', label: 'Зелёный' },
  { key: 'red', label: 'Красный' },
  { key: 'pink', label: 'Розовый' },
  { key: 'indigo', label: 'Индиго' },
  { key: 'gray', label: 'Серый' },
] as const;

export type FolderColorKey = (typeof FOLDER_COLORS)[number]['key'];

/** A project without a saved colour gets a stable one derived from its id */
export const resolveFolderColor = (color: string | null | undefined, id: string): FolderColorKey => {
  const known = FOLDER_COLORS.find((item) => item.key === color);
  if (known) return known.key;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FOLDER_COLORS[hash % FOLDER_COLORS.length].key;
};
