import type { FormFieldInstance } from '../types/form-builder.types';

export interface FieldSiblingPosition {
  id: string;
  label: string;
  index: number;
}

export interface FieldPlacement {
  parentGroupId: string | null;
  index: number;
}

export const findFieldPlacement = (
  fields: FormFieldInstance[],
  fieldId: string,
): FieldPlacement | null => {
  const topIndex = fields.findIndex((field) => field.id === fieldId);
  if (topIndex !== -1) {
    return { parentGroupId: null, index: topIndex };
  }

  for (const field of fields) {
    if (field.type !== 'group' || !field.children) continue;
    const childIndex = field.children.findIndex((child) => child.id === fieldId);
    if (childIndex !== -1) {
      return { parentGroupId: field.id, index: childIndex };
    }
  }

  return null;
};

export const getSiblingList = (
  fields: FormFieldInstance[],
  parentGroupId: string | null,
): FormFieldInstance[] => {
  if (parentGroupId === null) return fields;
  const group = fields.find((field) => field.id === parentGroupId);
  return group?.children ?? [];
};

export const getSiblingPositions = (
  fields: FormFieldInstance[],
  parentGroupId: string | null,
  currentFieldId: string,
): FieldSiblingPosition[] =>
  getSiblingList(fields, parentGroupId)
    .map((field, index) => ({
      id: field.id,
      label: field.label.trim() || `Поле ${index + 1}`,
      index,
    }))
    .filter((item) => item.id !== currentFieldId);

const removeFieldById = (
  fields: FormFieldInstance[],
  fieldId: string,
): { fields: FormFieldInstance[]; removed: FormFieldInstance | null } => {
  const topIndex = fields.findIndex((field) => field.id === fieldId);
  if (topIndex !== -1) {
    const removed = fields[topIndex];
    return {
      fields: [...fields.slice(0, topIndex), ...fields.slice(topIndex + 1)],
      removed,
    };
  }

  let removed: FormFieldInstance | null = null;
  const nextFields = fields.map((field) => {
    if (field.type !== 'group' || !field.children) return field;
    const childIndex = field.children.findIndex((child) => child.id === fieldId);
    if (childIndex === -1) return field;
    removed = field.children[childIndex];
    return {
      ...field,
      children: [
        ...field.children.slice(0, childIndex),
        ...field.children.slice(childIndex + 1),
      ],
    };
  });

  return { fields: nextFields, removed };
};

const insertField = (
  fields: FormFieldInstance[],
  field: FormFieldInstance,
  parentGroupId: string | null,
  index: number,
): FormFieldInstance[] => {
  if (parentGroupId === null) {
    const next = [...fields];
    const targetIndex = Math.min(Math.max(index, 0), next.length);
    next.splice(targetIndex, 0, field);
    return next;
  }

  return fields.map((item) => {
    if (item.id !== parentGroupId || !item.children) return item;
    const nextChildren = [...item.children];
    const targetIndex = Math.min(Math.max(index, 0), nextChildren.length);
    nextChildren.splice(targetIndex, 0, field);
    return { ...item, children: nextChildren };
  });
};

export const moveFieldToIndex = (
  fields: FormFieldInstance[],
  fieldId: string,
  targetParentGroupId: string | null,
  targetIndex: number,
): FormFieldInstance[] => {
  const { fields: withoutField, removed } = removeFieldById(fields, fieldId);
  if (!removed) return fields;

  if (removed.type === 'group' && targetParentGroupId !== null) {
    return fields;
  }

  return insertField(withoutField, removed, targetParentGroupId, targetIndex);
};

export const moveFieldByOffset = (
  fields: FormFieldInstance[],
  fieldId: string,
  offset: -1 | 1,
): FormFieldInstance[] => {
  const placement = findFieldPlacement(fields, fieldId);
  if (!placement) return fields;

  const siblings = getSiblingList(fields, placement.parentGroupId);
  const nextIndex = placement.index + offset;
  if (nextIndex < 0 || nextIndex >= siblings.length) return fields;

  const targetId = siblings[nextIndex]?.id;
  if (!targetId) return fields;

  return moveFieldBeforeTarget(fields, fieldId, targetId);
};

export const moveFieldBeforeTarget = (
  fields: FormFieldInstance[],
  fieldId: string,
  beforeFieldId: string | null,
): FormFieldInstance[] => {
  const placement = findFieldPlacement(fields, fieldId);
  if (!placement) return fields;

  const siblings = getSiblingList(fields, placement.parentGroupId);
  let targetIndex = beforeFieldId
    ? siblings.findIndex((item) => item.id === beforeFieldId)
    : siblings.length;

  if (targetIndex === -1) return fields;

  if (placement.index < targetIndex) {
    targetIndex -= 1;
  }

  return moveFieldToIndex(fields, fieldId, placement.parentGroupId, targetIndex);
};
