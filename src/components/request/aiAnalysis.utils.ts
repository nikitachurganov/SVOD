import type { Field } from '../../types/form';

export const fieldLabelForId = (fields: Field[], fieldId: string): string | null => {
  if (!fieldId || fieldId === 'general') return null;
  const f = fields.find((x) => x.id === fieldId);
  return f?.label?.trim() || fieldId;
};
