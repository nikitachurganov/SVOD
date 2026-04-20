import api from '../lib/api';
import type {
  FieldOption,
  FormFieldInstance,
  FormFieldType,
  FormPageInstance,
} from '../types/form-builder.types';
import type { AuthorPreview } from '../../types/author';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a single field stored inside a page (jsonb column) */
export interface CreateFormFieldPayload {
  /** Stable field ID persisted in JSON. Optional for legacy data. */
  id?: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  /**
   * Options for radio / checkbox / dropdown.
   * New shape: array of { id, label } objects to keep option IDs stable.
   * Legacy shape: array of plain label strings.
   */
  options?: Array<string | { id: string; label: string }>;
  /** Child fields — only present for group-type fields */
  children?: CreateFormFieldPayload[];
}

/** Single page (step) stored in JSON column */
export interface CreateFormPagePayload {
  id: string;
  title: string;
  fields: CreateFormFieldPayload[];
}

/** Body used when inserting a new form */
export interface CreateFormPayload {
  name: string;
  description?: string;
  pages: CreateFormPagePayload[];
  organization_id?: string | null;
  is_universal?: boolean;
}

/** Body used when updating an existing form */
export interface UpdateFormPayload {
  name: string;
  description?: string;
  pages: CreateFormPagePayload[];
  is_universal?: boolean;
}

/** Normalized form shape used across the app */
export interface FormResponse {
  id: string;
  name: string;
  description: string;
  pages: CreateFormPagePayload[];
  organization_id: string | null;
  created_by_user_id: string | null;
  author: AuthorPreview | null;
  created_at: string;
  updated_at: string;
  usage_count?: number;
  is_universal?: boolean;
}

// ─── Field converters ─────────────────────────────────────────────────────────

/**
 * Recursively maps a list of FormFieldInstance objects to the flat payload
 * shape the API column expects (used inside pages).
 */
export const mapFieldsToPayload = (
  instances: FormFieldInstance[],
): CreateFormFieldPayload[] =>
  instances.map((inst) => ({
    id: inst.id,
    type: inst.type,
    label: inst.label,
    placeholder: inst.description || undefined,
    required: inst.required,
    options: inst.options?.map((opt) => ({ id: opt.id, label: opt.label })),
    children:
      inst.type === 'group' && inst.children?.length
        ? mapFieldsToPayload(inst.children)
        : undefined,
  }));

/**
 * Reverses mapFieldsToPayload — converts stored payload back to
 * FormFieldInstance so the builder / preview can render it.
 */
export function payloadToInstance(
  payload: CreateFormFieldPayload,
): FormFieldInstance {
  const rawType = payload.type;
  const normalizedType =
    rawType === 'fileUpload' || rawType === 'file'
      ? 'file_document'
      : (rawType as FormFieldType);

  const fieldId =
    typeof payload.id === 'string' && payload.id.trim()
      ? payload.id
      : crypto.randomUUID();

  const options: FieldOption[] | undefined = payload.options
    ? payload.options.map((opt) => {
        if (typeof opt === 'string') {
          return {
            id: crypto.randomUUID(),
            label: opt,
          };
        }
        return {
          id:
            typeof opt.id === 'string' && opt.id.trim()
              ? opt.id
              : crypto.randomUUID(),
          label: opt.label,
        };
      })
    : undefined;

  return {
    id: fieldId,
    type: normalizedType as FormFieldType,
    label: payload.label,
    description: payload.placeholder ?? '',
    required: payload.required,
    options,
    children: payload.children?.map(payloadToInstance),
  };
}

/**
 * Maps the in-app page tree to the API payload structure.
 */
export const mapPagesToPayload = (
  pages: FormPageInstance[],
): CreateFormPagePayload[] =>
  pages.map((page, index) => ({
    id: page.id,
    title: page.title || `Страница ${index + 1}`,
    fields: mapFieldsToPayload(page.fields),
  }));

/**
 * Normalizes raw `fields` JSON from the API into a pages array.
 * Backward compatibility: if `fields` is a flat array of field payloads,
 * wraps them into a single default page.
 */
const normalizePagesFromApi = (rawFields: unknown): CreateFormPagePayload[] => {
  const arr = Array.isArray(rawFields) ? rawFields : [];
  if (arr.length === 0) {
    return [];
  }

  const first = arr[0] as any;

  if (first && typeof first === 'object' && 'fields' in first) {
    return (arr as any[]).map((page, index) => ({
      id: typeof page.id === 'string' ? page.id : crypto.randomUUID(),
      title:
        typeof page.title === 'string' && page.title.trim()
          ? page.title
          : `Страница ${index + 1}`,
      fields: Array.isArray(page.fields) ? page.fields : [],
    }));
  }

  return [
    {
      id: crypto.randomUUID(),
      title: 'Страница 1',
      fields: arr as CreateFormFieldPayload[],
    },
  ];
};

/**
 * Converts stored page payloads back to in-app FormPageInstance objects.
 */
export const pagesPayloadToInstances = (
  pages: CreateFormPagePayload[],
): FormPageInstance[] =>
  pages.map((page, index) => ({
    id: page.id || crypto.randomUUID(),
    title: page.title || `Страница ${index + 1}`,
    fields: (page.fields ?? []).map(payloadToInstance),
  }));

// ─── API ──────────────────────────────────────────────────────────────────────

export const getForms = async (organizationId?: string | null): Promise<FormResponse[]> => {
  const params = organizationId ? { organization_id: organizationId } : {};
  const { data } = await api.get<FormResponse[]>('/forms', { params });
  return data.map((row) => ({
    ...row,
    pages: row.pages ?? normalizePagesFromApi(row.pages),
  }));
};

export const getFormById = async (id: string): Promise<FormResponse> => {
  const { data } = await api.get<FormResponse>(`/forms/${id}`);
  return {
    ...data,
    pages: data.pages ?? normalizePagesFromApi(data.pages),
  };
};

export const createForm = async (
  payload: CreateFormPayload,
): Promise<FormResponse> => {
  const { data } = await api.post<FormResponse>('/forms', {
    name: payload.name,
    description: payload.description ?? null,
    pages: payload.pages,
    organization_id: payload.organization_id ?? null,
    is_universal: payload.is_universal ?? false,
  });
  return data;
};

export const updateForm = async (
  id: string,
  payload: UpdateFormPayload,
): Promise<FormResponse> => {
  const { data } = await api.put<FormResponse>(`/forms/${id}`, {
    name: payload.name,
    description: payload.description ?? null,
    pages: payload.pages,
    is_universal: payload.is_universal ?? false,
  });
  return data;
};

export const deleteForm = async (id: string): Promise<void> => {
  await api.delete(`/forms/${id}`);
};
